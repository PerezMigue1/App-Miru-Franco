import { useFocusEffect, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { ApiError } from '@/shared/api/apiClient';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { generacionActual } from '@/shared/api/tokenStorage';
import { soloDigitos, telefonoSinLada } from '@/shared/ui/digitos';
import { duracion } from '@/shared/ui/tokens';
import { useCandado } from '@/shared/ui/useCandado';

import {
  AVISO_DATOS_PERSONALES_CLAVE,
  esCodigoValido,
  estadoHttp,
  problemaDeClave,
  requisitosDeClave,
  urlOlvidoContrasena,
  type RequisitoClave,
} from '../models/AuthModel';
import {
  cambiarContrasenaConCodigo,
  obtenerPerfilCompleto,
  pedirCodigoContrasena,
} from '../models/authService';
import { normalizarPerfil } from '../models/PerfilModel';
import { useAuth } from './useAuth';

export type CampoDato = 'actual' | 'nueva' | 'confirmacion';
export type CampoContrasena = CampoDato | 'codigo';
export type ErroresContrasena = Partial<Record<CampoContrasena, string | null>>;
export type EstadoContrasena = 'cargando' | 'listo' | 'error';
export type PasoContrasena = 1 | 2;

export interface CambiarContrasenaViewModel {
  estado: EstadoContrasena;
  /** Con estado 'error': por qué no se cargó la cuenta (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
  reintentar: () => void;
  paso: PasoContrasena;
  valores: Record<CampoDato, string>;
  cambiar: (campo: CampoDato, valor: string) => void;
  salirDe: (campo: CampoDato) => void;
  codigo: string;
  setCodigo: (texto: string) => void;
  errores: ErroresContrasena;
  /** Aviso general (429, 409, 502, sin conexión). */
  aviso: string | null;
  /** Confirmación de un código reenviado. */
  avisoExito: string | null;
  requisitos: RequisitoClave[];
  avisoDatosPersonales: string;
  vigenciaMinutos: number;
  /** Ya hay un código vigente para esta contraseña actual: el paso 1 continúa sin pedir otro. */
  codigoVigente: boolean;
  enviando: boolean;
  /** Texto del botón del paso 1: "Enviar código", "Continuar", "Enviando código…" o la espera del 429. */
  tituloEnvio: string;
  enviarCodigo: () => void;
  cambiando: boolean;
  /** Tras un 429 al cambiar con el código: "Cambiar contraseña" queda deshabilitado hasta que pase la espera. */
  cambioEnEspera: boolean;
  /** Texto de "Cambiar contraseña": "Cambiando…" o, tras un 429, "Intenta de nuevo en N s". */
  tituloCambiar: string;
  cambiarContrasena: () => void;
  reenviando: boolean;
  /** Segundos que faltan para poder pedir otro código (0 = ya se puede). */
  espera: number;
  /**
   * Tras un 429 al pedir el código: "Enviar código" y "Reenviar código" quedan deshabilitados hasta
   * que pasen los segundos del servidor.
   */
  enEspera: boolean;
  /** Texto de "Reenviar código": "Reenviando…" o, tras un 429, "Intenta de nuevo en N s". */
  tituloReenviar: string;
  reenviar: () => void;
  /** Paso 2 → paso 1 sin perder lo escrito. */
  volverAlPaso1: () => void;
  enfoque: { campo: CampoContrasena; vez: number } | null;
  abrirOlvido: () => void;
  /** Flecha de volver: en el paso 2 regresa al paso 1; en el paso 1 sale de la pantalla. */
  volver: () => void;
}

const DATOS: CampoDato[] = ['actual', 'nueva', 'confirmacion'];
const LARGO_CODIGO = 6;
const VIGENCIA_PREDETERMINADA = 10;
const NO_COINCIDEN = 'Las contraseñas no coinciden';
// Mensajes propios, del catálogo de textos (se leen al usarse: siguen a la configuración).
const actualIncorrecta = () => obtenerTexto('errores.passwordActualIncorrecta');
const correoNoEnviado = () => obtenerTexto('errores.correoNoEnviado');
const errorGenerico = () => obtenerTexto('perfil.contrasena.noSePudo');
const recuperacionNoAbre = () => obtenerTexto('perfil.contrasena.recuperacionNoAbre');
const ESPERA_SEGUNDOS = duracion.esperaReenvioCodigo / duracion.cuentaRegresiva;

/** Solo lo que compara la regla de la contraseña (nada de datos capilares ni de salud). */
interface DatosCuenta {
  nombre: string;
  email: string;
  telefono: string;
  fechaNacimiento: string;
}

function validarCampo(campo: CampoDato, v: Record<CampoDato, string>, perfil: DatosCuenta | null): string | null {
  switch (campo) {
    case 'actual':
      return v.actual ? null : 'Ingresa tu contraseña actual';
    case 'nueva':
      // La misma regla del registro, comparada con los datos de la cuenta.
      return v.nueva
        ? problemaDeClave(v.nueva, {
            nombre: perfil?.nombre,
            email: perfil?.email,
            telefono: perfil ? telefonoSinLada(perfil.telefono) : undefined,
            fechaNacimiento: perfil?.fechaNacimiento,
          })
        : 'La contraseña es requerida';
    case 'confirmacion':
      if (!v.confirmacion) {
        return 'Confirma tu contraseña';
      }
      return v.confirmacion === v.nueva ? null : NO_COINCIDEN;
    default:
      return null;
  }
}

/** Dónde va cada error del servidor. null: la sesión se cerró (la pantalla ya no existe). */
type DestinoError =
  | { tipo: 'campo'; campo: CampoContrasena; mensaje: string }
  | { tipo: 'aviso'; mensaje: string }
  | null;

/** `code` estables del backend para pedir el código y cambiar la contraseña. */
const CODIGOS = {
  actualIncorrecta: 'PASSWORD_ACTUAL_INCORRECTA',
  codigoInvalido: 'CODIGO_INVALIDO',
  correoNoEnviado: 'CORREO_NO_ENVIADO',
  cuentaSinPassword: 'CUENTA_SIN_PASSWORD',
  cuentaNoConfirmada: 'CUENTA_NO_CONFIRMADA',
  codigoEnCurso: 'CODIGO_EN_CURSO',
  demasiadosCodigos: 'DEMASIADOS_CODIGOS',
} as const;

/** Destino de un `code` conocido; undefined si no se conoce (se decide por el estado HTTP). */
function destinoDelCode(code: string | undefined, error: unknown): DestinoError | undefined {
  switch (code) {
    case CODIGOS.actualIncorrecta:
      return { tipo: 'campo', campo: 'actual', mensaje: actualIncorrecta() };
    case CODIGOS.codigoInvalido:
      return { tipo: 'campo', campo: 'codigo', mensaje: obtenerTexto('perfil.contrasena.codigoInvalido') };
    case CODIGOS.correoNoEnviado:
      return { tipo: 'aviso', mensaje: correoNoEnviado() };
    case CODIGOS.cuentaSinPassword:
    case CODIGOS.cuentaNoConfirmada:
    case CODIGOS.codigoEnCurso:
    case CODIGOS.demasiadosCodigos:
      return { tipo: 'aviso', mensaje: mensajeParaClienta(error, { respaldo: errorGenerico() }) };
    default:
      return undefined;
  }
}

/**
 * Se clasifica por el `code` del backend; nunca por el texto del mensaje. Un 401 va primero (es
 * de la sesión, traiga o no `code`). Sin `code` conocido se usa el estado HTTP y la ruta: en
 * /codigo un 400 es la contraseña actual; en /me/password, una regla de la nueva.
 */
function destinoDelError(error: unknown, ruta: 'codigo' | 'cambio', sesionVigente: boolean): DestinoError {
  const estado = estadoHttp(error);
  if (estado === 401) {
    // Si apiClient cerró la sesión, la pantalla desaparece; si no (renovación sin red), se avisa.
    return sesionVigente ? { tipo: 'aviso', mensaje: obtenerTexto('perfil.contrasena.sesionNoConfirmada') } : null;
  }
  const porCode = destinoDelCode(error instanceof ApiError ? error.code : undefined, error);
  if (porCode !== undefined) {
    return porCode;
  }
  if (estado === 502 && ruta === 'codigo') {
    return { tipo: 'aviso', mensaje: correoNoEnviado() };
  }
  if (estado === 400) {
    if (ruta === 'codigo') {
      return { tipo: 'campo', campo: 'actual', mensaje: actualIncorrecta() };
    }
    // La regla que incumple ya se ve en la lista de requisitos; el texto del servidor no se muestra.
    // 400 de /me/password sin code: la nueva no pasó una regla del servidor (o es igual a la actual).
    return { tipo: 'campo', campo: 'nueva', mensaje: obtenerTexto('perfil.contrasena.nuevaRechazada') };
  }
  // Sin red, tiempo agotado, 409, 429 y 5xx sin `code` conocido: el texto de mensajeParaClienta.
  return { tipo: 'aviso', mensaje: mensajeParaClienta(error, { respaldo: errorGenerico() }) };
}

/** "Continuar" si ya hay un código vigente para la contraseña actual; si no, se pide uno. */
function tituloDelEnvio(enviando: boolean, codigoVigente: boolean): string {
  if (enviando) {
    return 'Enviando código…';
  }
  return codigoVigente ? 'Continuar' : 'Enviar código';
}

/**
 * Cambiar contraseña en dos pasos: datos (actual, nueva y confirmación) y código del correo. Las
 * contraseñas y el código viven solo en este estado; al cambiarla, la sesión se cierra. Un 429 al
 * pedir el código muestra el message del servidor y deja los botones del código en espera con sus
 * segundos (useEsperaLimite); la espera propia de 60 s tras un envío correcto no cambia.
 */
export function useCambiarContrasenaViewModel(): CambiarContrasenaViewModel {
  const { back } = useRouter();
  const { cerrarTrasCambioDeContrasena } = useAuth();
  const [estado, setEstado] = useState<EstadoContrasena>('cargando');
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [perfil, setPerfil] = useState<DatosCuenta | null>(null);
  const [paso, setPaso] = useState<PasoContrasena>(1);
  const [valores, setValores] = useState<Record<CampoDato, string>>({
    actual: '',
    nueva: '',
    confirmacion: '',
  });
  const [codigo, setCodigoCrudo] = useState('');
  const [codigoVigente, setCodigoVigente] = useState(false);
  const [errores, setErrores] = useState<ErroresContrasena>({});
  const [enVivo, setEnVivo] = useState<Partial<Record<CampoContrasena, boolean>>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoExito, setAvisoExito] = useState<string | null>(null);
  const [vigenciaMinutos, setVigenciaMinutos] = useState(VIGENCIA_PREDETERMINADA);
  const [enviando, setEnviando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const [reenviando, setReenviando] = useState(false);
  const [espera, setEspera] = useState(0);
  const limite = useEsperaLimite();
  // El cambio con el código (POST /api/auth/me/password) tiene su propio límite y su propia espera.
  const limiteCambio = useEsperaLimite();
  const [enfoque, setEnfoque] = useState<{ campo: CampoContrasena; vez: number } | null>(null);
  const solicitud = useRef(0);
  const vecesEnfoque = useRef(0);
  const montado = useRef(true);
  // Momento en que se puede volver a pedir código: la cuenta regresiva sigue el reloj aunque la app
  // pase a segundo plano (los temporizadores se pausan).
  const reenvioDesde = useRef(0);
  const candadoEnvio = useCandado();
  const candadoCambio = useCandado();
  const candadoReenvio = useCandado();

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  // Los datos de la cuenta hacen falta para la regla de datos personales.
  const cargar = useCallback(() => {
    solicitud.current += 1;
    const id = solicitud.current;
    setEstado('cargando');
    obtenerPerfilCompleto()
      .then((respuesta) => {
        if (id !== solicitud.current) {
          return;
        }
        const leido = normalizarPerfil(respuesta);
        setPerfil(
          leido
            ? {
                nombre: leido.nombre,
                email: leido.email,
                telefono: leido.telefono,
                fechaNacimiento: leido.fechaNacimiento,
              }
            : null,
        );
        setErrorCarga(null);
        setEstado(leido ? 'listo' : 'error');
      })
      .catch((error: unknown) => {
        if (id === solicitud.current) {
          setErrorCarga(error);
          setEstado('error');
        }
      });
  }, []);

  useEffect(() => {
    cargar();
    return () => {
      solicitud.current += 1;
    };
  }, [cargar]);

  // Cuenta regresiva para "Reenviar código".
  useEffect(() => {
    if (espera <= 0) {
      return undefined;
    }
    const temporizador = setTimeout(() => {
      const restante = Math.ceil((reenvioDesde.current - Date.now()) / duracion.cuentaRegresiva);
      setEspera(Math.max(0, Math.min(espera - 1, restante)));
    }, duracion.cuentaRegresiva);
    return () => clearTimeout(temporizador);
  }, [espera]);

  const pedirEnfoque = (campo: CampoContrasena) => {
    vecesEnfoque.current += 1;
    setEnfoque({ campo, vez: vecesEnfoque.current });
  };

  const marcarError = (campo: CampoContrasena, mensaje: string) => {
    setErrores((previos) => ({ ...previos, [campo]: mensaje }));
    setEnVivo((previos) => ({ ...previos, [campo]: true }));
    pedirEnfoque(campo);
  };

  /** Aplica un error del servidor: en su campo (volviendo al paso de ese campo) o como aviso. */
  const aplicarError = (error: unknown, ruta: 'codigo' | 'cambio', generacion: number) => {
    if (!montado.current) {
      return;
    }
    const destino = destinoDelError(error, ruta, generacion === generacionActual());
    if (!destino) {
      return;
    }
    if (destino.tipo === 'aviso') {
      setAviso(destino.mensaje);
      return;
    }
    if (destino.campo === 'codigo') {
      // El código se limpia y queda enfocado para escribir otro.
      setCodigoCrudo('');
    } else {
      setPaso(1);
    }
    if (destino.campo === 'actual') {
      setCodigoVigente(false);
    }
    marcarError(destino.campo, destino.mensaje);
  };

  const cambiar = (campo: CampoDato, valor: string) => {
    const nuevos = { ...valores, [campo]: valor };
    setValores(nuevos);
    if (campo === 'actual') {
      // El código se pidió con la contraseña actual anterior: hace falta uno nuevo.
      setCodigoVigente(false);
    }
    const siguientes: ErroresContrasena = { ...errores };
    if (enVivo[campo]) {
      siguientes[campo] = validarCampo(campo, nuevos, perfil);
    }
    if (campo === 'nueva' && nuevos.confirmacion) {
      siguientes.confirmacion = validarCampo('confirmacion', nuevos, perfil);
    }
    setErrores(siguientes);
  };

  const salirDe = (campo: CampoDato) => {
    const problema = validarCampo(campo, valores, perfil);
    setErrores((previos) => ({ ...previos, [campo]: problema }));
    if (problema) {
      setEnVivo((previos) => ({ ...previos, [campo]: true }));
    }
  };

  const setCodigo = (texto: string) => {
    setCodigoCrudo(soloDigitos(texto).slice(0, LARGO_CODIGO));
    setErrores((previos) => ({ ...previos, codigo: null }));
  };

  /** Pide el código (paso 1 o reenvío). Devuelve si se envió. */
  const solicitarCodigo = async (): Promise<boolean> => {
    setAviso(null);
    setAvisoExito(null);
    const generacion = generacionActual();
    try {
      const respuesta = await pedirCodigoContrasena(valores.actual);
      if (!montado.current) {
        return false;
      }
      const vigencia = respuesta?.vigenciaMinutos;
      if (typeof vigencia === 'number' && Number.isFinite(vigencia) && vigencia > 0) {
        setVigenciaMinutos(vigencia);
      }
      setCodigoCrudo('');
      setErrores((previos) => ({ ...previos, codigo: null }));
      setCodigoVigente(true);
      reenvioDesde.current = Date.now() + duracion.esperaReenvioCodigo;
      setEspera(ESPERA_SEGUNDOS);
      return true;
    } catch (error) {
      if (montado.current) {
        limite.esperarSiLimite(error);
      }
      aplicarError(error, 'codigo', generacion);
      return false;
    }
  };

  const enviar = async () => {
    const nuevos: ErroresContrasena = {};
    for (const campo of DATOS) {
      nuevos[campo] = validarCampo(campo, valores, perfil);
    }
    setErrores(nuevos);
    setEnVivo(Object.fromEntries(DATOS.map((campo) => [campo, Boolean(nuevos[campo])])));
    const primero = DATOS.find((campo) => nuevos[campo]);
    if (primero) {
      pedirEnfoque(primero);
      return;
    }
    // Si ya hay un código vigente para esta contraseña actual (se volvió a corregir la nueva), se
    // continúa sin pedir otro: no se gasta uno de los 5 por hora ni se salta la espera.
    if (codigoVigente && espera > 0) {
      setAviso(null);
      setErrores((previos) => ({ ...previos, codigo: null }));
      setPaso(2);
      pedirEnfoque('codigo');
      return;
    }
    setEnviando(true);
    try {
      if (await solicitarCodigo()) {
        setPaso(2);
        pedirEnfoque('codigo');
      }
    } finally {
      if (montado.current) {
        setEnviando(false);
      }
    }
  };

  const reenviarCodigo = async () => {
    setReenviando(true);
    try {
      if (await solicitarCodigo()) {
        setAvisoExito(obtenerTexto('auth.codigo.reenviado'));
        pedirEnfoque('codigo');
      }
    } finally {
      if (montado.current) {
        setReenviando(false);
      }
    }
  };

  const confirmar = async () => {
    if (!esCodigoValido(codigo)) {
      marcarError('codigo', 'El código debe tener 6 dígitos');
      return;
    }
    setAviso(null);
    setAvisoExito(null);
    setCambiando(true);
    // La sesión con la que se cambia: si terminó o cambió mientras tanto, no se cierra otra.
    const generacion = generacionActual();
    try {
      await cambiarContrasenaConCodigo(valores.actual, valores.nueva, codigo);
      // Las contraseñas y el código no se quedan en memoria.
      setValores({ actual: '', nueva: '', confirmacion: '' });
      setCodigoCrudo('');
      if (generacion === generacionActual()) {
        // El servidor ya cerró todas las sesiones: se borra la local y se abre Acceso con su aviso.
        await cerrarTrasCambioDeContrasena();
      }
    } catch (error) {
      if (montado.current) {
        limiteCambio.esperarSiLimite(error);
      }
      aplicarError(error, 'cambio', generacion);
    } finally {
      if (montado.current) {
        setCambiando(false);
      }
    }
  };

  const volverAlPaso1 = () => {
    if (cambiando || reenviando) {
      return;
    }
    setAviso(null);
    setAvisoExito(null);
    setPaso(1);
  };

  // En el paso 2, el botón Atrás de Android regresa al paso 1 (sin perder lo escrito).
  const refVolverPaso = useRef(volverAlPaso1);
  useEffect(() => {
    refVolverPaso.current = volverAlPaso1;
  });
  useFocusEffect(
    useCallback(() => {
      if (paso !== 2) {
        return undefined;
      }
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        refVolverPaso.current();
        return true;
      });
      return () => suscripcion.remove();
    }, [paso]),
  );

  const abrirOlvido = () => {
    const url = urlOlvidoContrasena();
    if (!url) {
      setAviso(recuperacionNoAbre());
      return;
    }
    openBrowserAsync(url).catch(() => {
      setAviso(recuperacionNoAbre());
    });
  };

  return {
    estado,
    mensajeError: estado === 'error' ? mensajeParaClienta(errorCarga) : null,
    reintentar: cargar,
    paso,
    valores,
    cambiar,
    salirDe,
    codigo,
    setCodigo,
    errores,
    aviso,
    avisoExito,
    requisitos: requisitosDeClave(valores.nueva),
    avisoDatosPersonales: AVISO_DATOS_PERSONALES_CLAVE,
    vigenciaMinutos,
    codigoVigente: codigoVigente && espera > 0,
    enviando,
    tituloEnvio: limite.texto ?? tituloDelEnvio(enviando, codigoVigente && espera > 0),
    enviarCodigo: () => {
      if (!enviando && !limite.activa) {
        candadoEnvio(enviar);
      }
    },
    cambiando,
    cambioEnEspera: limiteCambio.activa,
    tituloCambiar: limiteCambio.texto ?? (cambiando ? 'Cambiando…' : 'Cambiar contraseña'),
    cambiarContrasena: () => {
      if (!cambiando && !reenviando && !limiteCambio.activa) {
        candadoCambio(confirmar);
      }
    },
    reenviando,
    espera,
    enEspera: limite.activa,
    tituloReenviar: limite.texto ?? (reenviando ? 'Reenviando…' : 'Reenviar código'),
    reenviar: () => {
      if (!reenviando && !cambiando && espera <= 0 && !limite.activa) {
        candadoReenvio(reenviarCodigo);
      }
    },
    volverAlPaso1,
    enfoque,
    abrirOlvido,
    volver: paso === 2 ? volverAlPaso1 : back,
  };
}
