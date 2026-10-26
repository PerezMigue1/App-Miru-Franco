import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { generacionActual, leerSesion } from '@/shared/api/tokenStorage';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos } from '@/shared/api/useTextos';
import { soloDigitos } from '@/shared/ui/digitos';
import { useCandado } from '@/shared/ui/useCandado';

import { ROL_CLIENTE, esBloqueoTemporal, esCodigoValido } from '../models/AuthModel';
import {
  bloqueosDelError,
  desactivarCuenta,
  eliminarCuenta,
  esCuentaCambio,
  esCuentaConPassword,
  esCuentaConPendientes,
  esCuentaDePersonal,
  esErrorDeConfirmacion,
  esErrorDePassword,
  mensajeDeCuenta,
  pedirCodigoCuenta,
  revisarCuenta,
  type DatoConfirmacion,
  type EntidadPendiente,
  type MetodoConfirmacion,
  type PendienteCuenta,
  type ResultadoBaja,
  type RevisionCuenta,
} from '../models/cuentaPropia';
import { useAuth } from './useAuth';
import { textoAvisoBaja } from './useRetornoActivacion';

export type AccionCuenta = 'desactivar' | 'eliminar';
export type PasoMiCuenta = 'elegir' | 'revision' | 'confirmar';
export type EstadoRevision = 'cargando' | 'lista' | 'error';

/** Una opción del paso 1: desactivar o eliminar, con su explicación del catálogo. */
export interface OpcionCuenta {
  accion: AccionCuenta;
  titulo: string;
  explicacion: string;
  elegir: () => void;
}

/** Un pendiente listo para pintar: su texto y, si se puede, a dónde lleva al tocarlo. */
export interface PendienteVista {
  clave: string;
  mensaje: string;
  entidad: EntidadPendiente | null;
  /** A dónde lleva (pista visible y accessibilityHint) y cómo abrirlo; null si no abre nada. */
  destino: { pista: string; abrir: () => void } | null;
}

export interface RevisionVista {
  estado: EstadoRevision;
  textoRevisando: string;
  /** Por qué no se pudo revisar (sin red, servidor...). */
  error: string | null;
  /** Aviso que trae a la clienta de vuelta a la revisión (por ejemplo, algo cambió). */
  aviso: string | null;
  bloqueos: PendienteVista[];
  seResuelveSolo: PendienteVista[];
  encabezadoBloqueos: string;
  encabezadoSeResuelve: string;
  sinPendientes: string;
  /** Solo con la revisión lista, sin bloqueos y con el permiso del servidor. */
  puedeContinuar: boolean;
  textoContinuar: string;
  continuar: () => void;
  textoRevisarDeNuevo: string;
  revisarDeNuevo: () => void;
  textoVolver: string;
  volverAElegir: () => void;
}

export interface ConfirmacionVista {
  accion: AccionCuenta;
  esEliminar: boolean;
  /** Qué pasa al confirmar; al eliminar, que no se puede deshacer. */
  avisoIrreversible: string;
  metodo: MetodoConfirmacion;
  instruccion: string;
  etiquetaPassword: string;
  password: string;
  setPassword: (texto: string) => void;
  /** Contraseña incorrecta o requerida, o el bloqueo temporal por varios intentos. */
  errorPassword: string | null;
  etiquetaCodigo: string;
  codigo: string;
  setCodigo: (texto: string) => void;
  errorCodigo: string | null;
  tituloEnviarCodigo: string;
  enviandoCodigo: boolean;
  /** Tras un 429 al pedir el código: el botón espera los segundos del servidor. */
  codigoEnEspera: boolean;
  /** El código se envió (su mensaje o el de la app). */
  avisoCodigo: string | null;
  enviarCodigo: () => void;
  textoCasilla: string;
  casilla: boolean;
  setCasilla: (marcada: boolean) => void;
  /** La casilla está marcada y el dato completo: el botón final se puede tocar. */
  listo: boolean;
  tituloConfirmar: string;
  enviando: boolean;
  /** Tras un 429 al confirmar: desactivar y eliminar comparten la espera. */
  confirmarEnEspera: boolean;
  /** Error general de la confirmación (sin red, servidor, límite...). */
  aviso: string | null;
  confirmar: () => void;
  textoVolver: string;
  volverAElegir: () => void;
}

export interface MiCuentaViewModel {
  titulo: string;
  /** Flecha de volver y Atrás de Android: un paso hacia atrás; en el paso 1 sale de la pantalla. */
  volver: () => void;
  /** Cuenta del personal (por rol o por el 403 CUENTA_DE_PERSONAL): solo se muestra esta nota. */
  mensajePersonal: string | null;
  paso: PasoMiCuenta;
  /** "Paso N de 3: ...", título accesible del paso. */
  encabezadoPaso: string;
  opciones: OpcionCuenta[];
  revision: RevisionVista;
  confirmacion: ConfirmacionVista;
}

const TOTAL_PASOS = 3;
const LARGO_CODIGO = 6;
const NUMERO_PASO: Record<PasoMiCuenta, number> = { elegir: 1, revision: 2, confirmar: 3 };
const CLAVE_PASO = {
  elegir: 'cuenta.app.pasoElegir',
  revision: 'cuenta.app.pasoRevision',
  confirmar: 'cuenta.app.pasoConfirmar',
} as const;

/** Textos de cada acción, del catálogo. */
const TEXTOS_ACCION = {
  desactivar: {
    titulo: 'cuenta.desactivar.titulo',
    explicacion: 'cuenta.desactivar.explicacion',
    confirmar: 'cuenta.confirmar.desactivar',
    casilla: 'cuenta.confirmar.casillaDesactivar',
    enviando: 'cuenta.app.desactivando',
  },
  eliminar: {
    titulo: 'cuenta.eliminar.titulo',
    explicacion: 'cuenta.eliminar.explicacion',
    confirmar: 'cuenta.confirmar.eliminar',
    casilla: 'cuenta.confirmar.casillaEliminar',
    enviando: 'cuenta.app.eliminando',
  },
} as const;

const ACCIONES: AccionCuenta[] = ['desactivar', 'eliminar'];

/** "Enviando…", "Enviarme otro código" (ya se pidió uno) o "Enviarme el código". */
function claveEnvioCodigo(enviandoCodigo: boolean, codigoPedido: boolean) {
  if (enviandoCodigo) {
    return 'cuenta.app.enviandoCodigo';
  }
  return codigoPedido ? 'cuenta.app.otroCodigo' : 'cuenta.app.enviarCodigo';
}

/**
 * Tras el 200 la sesión se cierra solo si sigue siendo la misma con que se confirmó, o si ya no
 * queda ninguna (por ejemplo, otra petición recibió el 401 de los tokens que el servidor acaba de
 * revocar): así la clienta siempre ve su folio y nunca se cierra la sesión de otra persona.
 */
async function sesionDeLaBaja(generacion: number): Promise<boolean> {
  if (generacion === generacionActual()) {
    return true;
  }
  // leerSesion nunca rechaza: una entrada ilegible cuenta como sin sesión.
  return (await leerSesion()) === null;
}

/**
 * Perfil > Mi cuenta (GP-09): desactivar o eliminar la cuenta propia en tres pasos (elegir,
 * revisar pendientes y confirmar con la contraseña o con un código del correo), según
 * CONTRATO_APP_CUENTA.md. Los errores se deciden por code; ninguno cierra la sesión, solo el éxito
 * (cerrarTrasBajaDeCuenta deja el aviso con el folio para Acceso). La contraseña y el código viven
 * solo en este estado y se borran al salir del paso 3.
 */
export function useMiCuentaViewModel(): MiCuentaViewModel {
  const { back, push } = useRouter();
  const { usuario, cerrarTrasBajaDeCuenta } = useAuth();
  const texto = useTextos();
  // Sin folio válido no se usa la plantilla con {folio}: quedaría "con el folio  a tu correo".
  const textoEliminada = (folio: string | null) =>
    folio ? texto('cuenta.listo.eliminada', { folio }) : texto('cuenta.app.eliminadaSinFolio');
  const rolPersonal = usuario !== null && usuario.rol !== ROL_CLIENTE;

  const [paso, setPaso] = useState<PasoMiCuenta>('elegir');
  const [accion, setAccion] = useState<AccionCuenta>('desactivar');
  const [estadoRevision, setEstadoRevision] = useState<EstadoRevision>('cargando');
  const [revision, setRevision] = useState<RevisionCuenta | null>(null);
  const [errorRevision, setErrorRevision] = useState<string | null>(null);
  const [avisoRevision, setAvisoRevision] = useState<string | null>(null);
  const [personal, setPersonal] = useState<string | null>(null);
  const [password, setPasswordCrudo] = useState('');
  const [codigo, setCodigoCrudo] = useState('');
  const [casilla, setCasilla] = useState(false);
  const [errorPassword, setErrorPassword] = useState<string | null>(null);
  const [errorCodigo, setErrorCodigo] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [avisoCodigo, setAvisoCodigo] = useState<string | null>(null);
  const [codigoPedido, setCodigoPedido] = useState(false);
  const [enviandoCodigo, setEnviandoCodigo] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Desactivar y eliminar comparten un límite de 5 por minuto; pedir el código tiene el suyo.
  const limiteBaja = useEsperaLimite();
  const limiteCodigo = useEsperaLimite();
  const candadoBaja = useCandado();
  const candadoCodigo = useCandado();
  const solicitud = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      solicitud.current += 1;
    };
  }, []);

  const marcarPersonal = (error: unknown) => {
    setPersonal(mensajeDeCuenta(error, texto('cuenta.personal')));
  };

  const cargarRevision = () => {
    solicitud.current += 1;
    const id = solicitud.current;
    setEstadoRevision('cargando');
    setErrorRevision(null);
    revisarCuenta()
      .then((leida) => {
        if (id === solicitud.current) {
          setRevision(leida);
          setEstadoRevision('lista');
        }
      })
      .catch((error: unknown) => {
        if (id !== solicitud.current) {
          return;
        }
        if (esCuentaDePersonal(error)) {
          marcarPersonal(error);
        }
        setErrorRevision(mensajeDeCuenta(error, texto('cuenta.app.errorRevision')));
        setEstadoRevision('error');
      });
  };

  /** Lo escrito en el paso 3 no se queda en memoria; la casilla vuelve a empezar sin marcar. */
  const limpiarConfirmacion = () => {
    setPasswordCrudo('');
    setCodigoCrudo('');
    setCasilla(false);
    setErrorPassword(null);
    setErrorCodigo(null);
    setAviso(null);
    setAvisoCodigo(null);
  };

  const elegir = (nueva: AccionCuenta) => {
    if (rolPersonal || personal) {
      return;
    }
    setAccion(nueva);
    setAvisoRevision(null);
    setPaso('revision');
    cargarRevision();
  };

  const volverAElegir = () => {
    if (enviando) {
      return;
    }
    solicitud.current += 1;
    limpiarConfirmacion();
    setAvisoRevision(null);
    setPaso('elegir');
  };

  const volverARevision = () => {
    if (enviando) {
      return;
    }
    limpiarConfirmacion();
    setPaso('revision');
  };

  const puedeContinuar = estadoRevision === 'lista' && revision !== null && revision.puedeContinuar;

  const continuar = () => {
    if (!puedeContinuar) {
      return;
    }
    limpiarConfirmacion();
    setPaso('confirmar');
  };

  const revisarDeNuevo = () => {
    setAvisoRevision(null);
    cargarRevision();
  };

  const metodo: MetodoConfirmacion = revision?.metodoConfirmacion ?? 'password';
  const datoCompleto = metodo === 'password' ? password.length > 0 : esCodigoValido(codigo);
  const listo = casilla && datoCompleto;

  /** Regresa a la revisión: con los bloqueos que trajo el 409, o pidiéndola otra vez. */
  const regresarARevision = (bloqueos: PendienteCuenta[]) => {
    limpiarConfirmacion();
    setPaso('revision');
    if (bloqueos.length > 0 && revision) {
      solicitud.current += 1;
      setRevision({ ...revision, bloqueos, puedeContinuar: false });
      setErrorRevision(null);
      setEstadoRevision('lista');
      return;
    }
    cargarRevision();
  };

  const aplicarErrorBaja = (error: unknown, metodoUsado: MetodoConfirmacion) => {
    limiteBaja.esperarSiLimite(error);
    if (esCuentaConPendientes(error)) {
      regresarARevision(bloqueosDelError(error));
      return;
    }
    if (esCuentaCambio(error)) {
      regresarARevision([]);
      setAvisoRevision(mensajeDeCuenta(error, texto('cuenta.app.cambio')));
      return;
    }
    if (esCuentaDePersonal(error)) {
      marcarPersonal(error);
      return;
    }
    const mensaje = mensajeDeCuenta(error, texto('cuenta.app.errorBaja'));
    if (metodoUsado === 'password' && (esErrorDePassword(error) || esBloqueoTemporal(error))) {
      setErrorPassword(mensaje);
      return;
    }
    if (metodoUsado === 'codigo' && esErrorDeConfirmacion(error) && !esErrorDePassword(error)) {
      // El código se limpia para escribir otro.
      setCodigoCrudo('');
      setErrorCodigo(mensaje);
      return;
    }
    setAviso(mensaje);
  };

  const confirmarBaja = async () => {
    const dato: DatoConfirmacion = metodo === 'password' ? { metodo, password } : { metodo, codigo };
    const eliminar = accion === 'eliminar';
    setAviso(null);
    setErrorPassword(null);
    setErrorCodigo(null);
    setEnviando(true);
    const generacion = generacionActual();
    let resultado: ResultadoBaja;
    try {
      resultado = eliminar ? await eliminarCuenta(dato) : await desactivarCuenta(dato);
    } catch (error) {
      if (montado.current) {
        aplicarErrorBaja(error, metodo);
        setEnviando(false);
      }
      return;
    }
    // La baja ya ocurrió: lo que sigue nunca se presenta como "tu cuenta sigue como estaba".
    if (montado.current) {
      setPasswordCrudo('');
      setCodigoCrudo('');
    }
    const mensaje =
      resultado.mensaje ?? (eliminar ? textoEliminada(resultado.folio) : texto('cuenta.listo.desactivada'));
    try {
      if (await sesionDeLaBaja(generacion)) {
        // Borra la sesión local, corta los avisos en vivo y deja el aviso con el folio para Acceso.
        await cerrarTrasBajaDeCuenta({ mensaje, folio: resultado.folio });
      } else if (montado.current) {
        // Ya hay otra sesión guardada: no se toca, pero la clienta ve el resultado (y el folio).
        setAviso(textoAvisoBaja({ mensaje, folio: resultado.folio }, (folio) => texto('cuenta.app.folio', { folio })));
      }
    } finally {
      if (montado.current) {
        setEnviando(false);
      }
    }
  };

  const solicitarCodigo = async () => {
    setEnviandoCodigo(true);
    setAvisoCodigo(null);
    setErrorCodigo(null);
    try {
      const enviado = await pedirCodigoCuenta();
      if (!montado.current) {
        return;
      }
      setCodigoCrudo('');
      setCodigoPedido(true);
      setAvisoCodigo(enviado.mensaje ?? texto('cuenta.app.codigoEnviado'));
    } catch (error) {
      if (!montado.current) {
        return;
      }
      limiteCodigo.esperarSiLimite(error);
      if (esCuentaDePersonal(error)) {
        marcarPersonal(error);
        return;
      }
      if (esCuentaConPassword(error)) {
        // La cuenta ya tiene contraseña: la revisión nueva trae el método con que se confirma.
        regresarARevision([]);
        setAvisoRevision(mensajeDeCuenta(error, texto('cuenta.app.error.cuentaConPassword')));
        return;
      }
      setErrorCodigo(mensajeDeCuenta(error, texto('cuenta.app.errorCodigo')));
    } finally {
      if (montado.current) {
        setEnviandoCodigo(false);
      }
    }
  };

  const volver = () => {
    if (paso === 'confirmar') {
      volverARevision();
    } else if (paso === 'revision') {
      volverAElegir();
    } else {
      back();
    }
  };

  // En los pasos 2 y 3, el botón Atrás de Android regresa un paso en lugar de salir.
  const refVolver = useRef(volver);
  useEffect(() => {
    refVolver.current = volver;
  });
  useFocusEffect(
    useCallback(() => {
      if (paso === 'elegir') {
        return undefined;
      }
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        refVolver.current();
        return true;
      });
      return () => suscripcion.remove();
    }, [paso]),
  );

  const pendienteVista = (pendiente: PendienteCuenta, indice: number, tocable: boolean): PendienteVista => {
    const { entidad, id } = pendiente;
    const clave = `${pendiente.tipo}-${entidad ?? 'x'}-${id ?? 'x'}-${indice}`;
    const mensaje = pendiente.mensaje || texto('cuenta.app.pendienteSinTexto');
    if (!tocable || entidad === null || id === null) {
      return { clave, mensaje, entidad, destino: null };
    }
    const ruta = `/${entidad}/${encodeURIComponent(id)}` as Href;
    return {
      clave,
      mensaje,
      entidad,
      destino: {
        pista: texto(entidad === 'cita' ? 'cuenta.app.pistaCita' : 'cuenta.app.pistaPedido'),
        abrir: () => push(ruta),
      },
    };
  };

  const textos = TEXTOS_ACCION[accion];
  const eliminar = accion === 'eliminar';

  return {
    titulo: texto('cuenta.app.titulo'),
    volver,
    mensajePersonal: rolPersonal ? texto('cuenta.personal') : personal,
    paso,
    encabezadoPaso: texto('cuenta.app.paso', {
      numero: NUMERO_PASO[paso],
      total: TOTAL_PASOS,
      paso: texto(CLAVE_PASO[paso]),
    }),
    opciones: ACCIONES.map((opcion) => ({
      accion: opcion,
      titulo: texto(TEXTOS_ACCION[opcion].titulo),
      explicacion: texto(TEXTOS_ACCION[opcion].explicacion),
      elegir: () => elegir(opcion),
    })),
    revision: {
      estado: estadoRevision,
      textoRevisando: texto('cuenta.app.revisando'),
      error: errorRevision,
      aviso: avisoRevision,
      bloqueos: (revision?.bloqueos ?? []).map((pendiente, indice) => pendienteVista(pendiente, indice, true)),
      seResuelveSolo: (revision?.seResuelveSolo ?? []).map((pendiente, indice) =>
        pendienteVista(pendiente, indice, false),
      ),
      encabezadoBloqueos: texto('cuenta.revision.bloquea'),
      encabezadoSeResuelve: texto('cuenta.revision.seResuelve'),
      sinPendientes: texto('cuenta.revision.sinPendientes'),
      puedeContinuar,
      textoContinuar: texto('cuenta.app.continuar'),
      continuar,
      textoRevisarDeNuevo: texto('cuenta.app.revisarDeNuevo'),
      revisarDeNuevo,
      textoVolver: texto('cuenta.app.volver'),
      volverAElegir,
    },
    confirmacion: {
      accion,
      esEliminar: eliminar,
      avisoIrreversible: texto(textos.confirmar),
      metodo,
      instruccion: texto(metodo === 'password' ? 'cuenta.confirmar.password' : 'cuenta.confirmar.codigo'),
      etiquetaPassword: texto('cuenta.app.etiquetaPassword'),
      password,
      setPassword: (valor) => {
        setPasswordCrudo(valor);
        setErrorPassword(null);
      },
      errorPassword,
      etiquetaCodigo: texto('cuenta.app.etiquetaCodigo'),
      codigo,
      setCodigo: (valor) => {
        setCodigoCrudo(soloDigitos(valor).slice(0, LARGO_CODIGO));
        setErrorCodigo(null);
      },
      errorCodigo,
      tituloEnviarCodigo: limiteCodigo.texto ?? texto(claveEnvioCodigo(enviandoCodigo, codigoPedido)),
      enviandoCodigo,
      codigoEnEspera: limiteCodigo.activa,
      avisoCodigo,
      enviarCodigo: () => {
        if (!enviandoCodigo && !enviando && !limiteCodigo.activa) {
          candadoCodigo(solicitarCodigo);
        }
      },
      textoCasilla: texto(textos.casilla),
      casilla,
      setCasilla,
      listo,
      tituloConfirmar: limiteBaja.texto ?? texto(enviando ? textos.enviando : textos.titulo),
      enviando,
      confirmarEnEspera: limiteBaja.activa,
      aviso,
      confirmar: () => {
        if (listo && !enviando && !enviandoCodigo && !limiteBaja.activa) {
          candadoBaja(confirmarBaja);
        }
      },
      textoVolver: texto('cuenta.app.volver'),
      volverAElegir,
    },
  };
}
