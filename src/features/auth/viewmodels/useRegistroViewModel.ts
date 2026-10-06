import { usePathname, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';

import { soloDigitos, telefonoSinLada } from '@/shared/ui/digitos';
import { duracion, reintentosCorreo } from '@/shared/ui/tokens';
import { useCandado } from '@/shared/ui/useCandado';

import {
  AVISO_DATOS_PERSONALES_CLAVE,
  AYUDA_TELEFONO,
  ERROR_TELEFONO,
  MENSAJE_DEMASIADOS_INTENTOS,
  MENSAJE_SIN_CONEXION,
  convertirFechaNacimiento,
  esCorreoValido,
  esErrorDeRed,
  esTelefonoValido,
  estadoHttp,
  mensajeDelServidor,
  normalizarCorreo,
  normalizarTelefono,
  problemaDeAlergias,
  problemaDeClave,
  problemaDeConsentimiento,
  problemaDeCorreo,
  problemaDeNombre,
  problemaDeRespuesta,
  problemaDeTieneAlergias,
  problemaDeTieneTratamientos,
  problemaDeTratamientos,
  requiereConsentimiento,
  requisitosDeClave,
  urlAvisoPrivacidad,
  urlTerminos,
  type DatosRegistro,
  type PreguntaSeguridad,
  type RequisitoClave,
  type TipoCabello,
} from '../models/AuthModel';
import { obtenerPreguntasSeguridad, registrarUsuario, verificarCorreo } from '../models/authService';
import { rutaAcceso } from './useRetornoActivacion';

export interface CamposRegistro {
  nombre: string;
  correo: string;
  telefono: string;
  clave: string;
  confirmacion: string;
  nacimiento: string;
  pregunta: PreguntaSeguridad | null;
  respuesta: string;
  tipoCabello: TipoCabello | null;
  colorNatural: string;
  colorActual: string;
  productosUsados: string;
  /** null: todavía sin responder. */
  tieneAlergias: boolean | null;
  /** Dato de salud: solo en memoria y solo se envía en el registro. */
  alergias: string;
  consienteDatosSensibles: boolean;
  tratamientosQuimicos: boolean | null;
  tratamientos: string;
  aceptaAviso: boolean;
  recibePromociones: boolean;
}

export type CampoRegistro = keyof CamposRegistro;

export type ErroresRegistro = Partial<Record<CampoRegistro, string | null>>;

export type EstadoPreguntas = 'inactivo' | 'cargando' | 'listo' | 'error';

export type PasoRegistro = 1 | 2;

/**
 * Verificación del correo: solo lo que dice el endpoint (existe o no).
 * - 'revisando': sin respuesta a los 6 s; se reintenta.
 * - 'sinConexion': falló la red; se reintenta.
 * - 'sinVerificar': se agotaron los reintentos; el registro lo revisará con su 409.
 * Ninguno de los tres bloquea: la app no puede afirmar que un correo existe sin el servidor.
 */
export type EstadoCorreo =
  | 'inactivo'
  | 'verificando'
  | 'disponible'
  | 'registrado'
  | 'revisando'
  | 'sinConexion'
  | 'sinVerificar';

/** Pedido a la vista de llevar el foco a un campo (cambia en cada envío con errores). */
export interface PedidoEnfoque {
  campo: CampoRegistro;
  vez: number;
}

export interface RegistroViewModel {
  campos: CamposRegistro;
  cambiar: <K extends CampoRegistro>(campo: K, valor: CamposRegistro[K]) => void;
  /** Al salir de un campo: lo valida y, desde su primer error, se revalida en cada cambio. */
  salir: (campo: CampoRegistro) => void;
  errores: ErroresRegistro;
  errorGeneral: string | null;
  paso: PasoRegistro;
  /** Hacia dónde se movió el último cambio de paso: 1 avanzar, -1 volver. */
  direccionPaso: 1 | -1;
  /** Paso 1: valida sus campos y el correo; si todo está bien, pasa al paso 2. */
  continuar: () => void;
  /** Paso 2: regresa al paso 1 sin perder nada de lo escrito (no mientras se envía). */
  atras: () => void;
  /** "Continuar" espera la verificación del correo. */
  verificandoCorreo: boolean;
  cargando: boolean;
  estadoCorreo: EstadoCorreo;
  requisitosClave: RequisitoClave[];
  avisoDatosPersonales: string;
  enfoque: PedidoEnfoque | null;
  ayudaTelefono: string;
  preguntas: { estado: EstadoPreguntas; lista: PreguntaSeguridad[]; cargar: () => void };
  abrirAviso: () => void;
  /** Abre los Términos y Condiciones del sitio en el navegador. */
  abrirTerminos: () => void;
  /** Paso 2: "Finalizar registro". */
  crearCuenta: () => void;
  /**
   * Registro desde cero (al regresar de la activación): paso 1, campos vacíos, datos de salud y
   * consentimiento borrados, y la verificación del correo cancelada.
   */
  reiniciar: () => void;
}

const CAMPOS_INICIALES: CamposRegistro = {
  nombre: '',
  correo: '',
  telefono: '',
  clave: '',
  confirmacion: '',
  nacimiento: '',
  pregunta: null,
  respuesta: '',
  tipoCabello: null,
  colorNatural: '',
  colorActual: '',
  productosUsados: '',
  tieneAlergias: null,
  alergias: '',
  consienteDatosSensibles: false,
  tratamientosQuimicos: null,
  tratamientos: '',
  aceptaAviso: false,
  recibePromociones: false,
};

/**
 * Orden visual de cada paso: el foco va al primero con error. La contraseña va al final del paso 1
 * porque se compara con los datos anteriores.
 */
const PASO_1: CampoRegistro[] = [
  'nombre',
  'correo',
  'telefono',
  'nacimiento',
  'pregunta',
  'respuesta',
  'clave',
  'confirmacion',
];

const PASO_2: CampoRegistro[] = [
  'tipoCabello',
  'colorNatural',
  'colorActual',
  'productosUsados',
  'tieneAlergias',
  'alergias',
  'consienteDatosSensibles',
  'tratamientosQuimicos',
  'tratamientos',
  'aceptaAviso',
  'recibePromociones',
];

/** Campos que la regla de contraseña compara: si cambian, la contraseña se revalida. */
const DATOS_DE_LA_CLAVE: CampoRegistro[] = ['nombre', 'correo', 'telefono', 'nacimiento', 'respuesta'];

const NO_COINCIDEN = 'Las contraseñas no coinciden';
const REVISA_CAMPOS = 'Revisa los campos marcados.';
const NO_PUDIMOS_CREAR = 'No pudimos crear tu cuenta. Intenta de nuevo.';

function problemaDeTelefono(telefono: string): string | null {
  if (!telefono) {
    return 'El teléfono es requerido';
  }
  return esTelefonoValido(telefono) ? null : ERROR_TELEFONO;
}

function problemaDeConfirmacion(clave: string, confirmacion: string): string | null {
  if (!confirmacion) {
    return 'Confirma tu contraseña';
  }
  return confirmacion === clave ? null : NO_COINCIDEN;
}

function fechaIsoDe(nacimiento: string): string {
  const fecha = convertirFechaNacimiento(nacimiento);
  return 'fecha' in fecha ? fecha.fecha : '';
}

/** Valida un campo con las reglas existentes y las del perfil capilar copiadas de la web. */
function validarCampo(campo: CampoRegistro, c: CamposRegistro): string | null {
  switch (campo) {
    case 'nombre':
      return problemaDeNombre(c.nombre);
    case 'correo':
      return problemaDeCorreo(c.correo);
    case 'telefono':
      // Se valida sin la lada (52 o 521), que se quita al salir del campo y al enviar.
      return problemaDeTelefono(telefonoSinLada(c.telefono));
    case 'clave':
      return c.clave
        ? problemaDeClave(c.clave, {
            nombre: c.nombre,
            email: c.correo,
            telefono: telefonoSinLada(c.telefono),
            fechaNacimiento: fechaIsoDe(c.nacimiento),
            respuesta: c.respuesta,
          })
        : 'La contraseña es requerida';
    case 'confirmacion':
      return problemaDeConfirmacion(c.clave, c.confirmacion);
    case 'nacimiento': {
      const fecha = convertirFechaNacimiento(c.nacimiento);
      return 'problema' in fecha ? fecha.problema : null;
    }
    case 'pregunta':
      return c.pregunta ? null : 'Debes seleccionar una pregunta de seguridad';
    case 'respuesta':
      return problemaDeRespuesta(c.respuesta);
    case 'tipoCabello':
      return c.tipoCabello ? null : 'Selecciona tu tipo de cabello';
    case 'tieneAlergias':
      return problemaDeTieneAlergias(c.tieneAlergias);
    case 'alergias':
      return problemaDeAlergias(c.tieneAlergias, c.alergias);
    case 'consienteDatosSensibles':
      return problemaDeConsentimiento(c.tieneAlergias, c.alergias, c.consienteDatosSensibles);
    case 'tratamientosQuimicos':
      return problemaDeTieneTratamientos(c.tratamientosQuimicos);
    case 'tratamientos':
      return problemaDeTratamientos(c.tratamientosQuimicos, c.tratamientos);
    case 'aceptaAviso':
      return c.aceptaAviso ? null : 'Debes aceptar el Aviso de Privacidad';
    default:
      // Color natural, color actual, productos y promociones: opcionales, sin reglas (como la web).
      return null;
  }
}

function validar(campos: CampoRegistro[], c: CamposRegistro): ErroresRegistro {
  return Object.fromEntries(campos.map((campo) => [campo, validarCampo(campo, c)]));
}

/** Texto opcional: recortado, y omitido si queda vacío. */
function opcional(texto: string): string | undefined {
  const recortado = texto.trim();
  return recortado || undefined;
}

/**
 * Cuerpo de POST /api/usuarios/registro como lo arma la web: perfil capilar completo, alergias y
 * tratamientos solo si respondió Sí, consentimiento solo si hay texto de alergias.
 */
function cuerpoDeRegistro(
  c: CamposRegistro,
  email: string,
  tipoCabello: TipoCabello,
  pregunta: PreguntaSeguridad,
): DatosRegistro {
  const tieneAlergias = c.tieneAlergias === true;
  const tratamientosQuimicos = c.tratamientosQuimicos === true;
  return {
    nombre: c.nombre.trim(),
    email,
    telefono: normalizarTelefono(c.telefono),
    password: c.clave,
    fechaNacimiento: fechaIsoDe(c.nacimiento),
    preguntaSeguridad: { pregunta: pregunta.pregunta, respuesta: c.respuesta.trim() },
    perfilCapilar: {
      tipoCabello,
      colorNatural: opcional(c.colorNatural),
      colorActual: opcional(c.colorActual),
      productosUsados: opcional(c.productosUsados),
      tieneAlergias,
      alergias: tieneAlergias ? c.alergias.trim() : undefined,
      tratamientosQuimicos,
      tratamientos: tratamientosQuimicos ? c.tratamientos.trim() : undefined,
    },
    aceptaAvisoPrivacidad: true,
    recibePromociones: c.recibePromociones,
    ...(requiereConsentimiento(c.tieneAlergias, c.alergias) ? { consienteDatosSensibles: true } : {}),
  };
}

function mensajeDeRegistro(error: unknown): string {
  if (esErrorDeRed(error)) {
    return MENSAJE_SIN_CONEXION;
  }
  if (estadoHttp(error) === 429) {
    return MENSAJE_DEMASIADOS_INTENTOS;
  }
  return mensajeDelServidor(error, NO_PUDIMOS_CREAR);
}

/** Espera la promesa o el límite, lo que pase primero. Nunca rechaza. */
function conLimite(promesa: Promise<void>, ms: number): Promise<void> {
  return new Promise((resolver) => {
    const temporizador = setTimeout(resolver, ms);
    const terminar = () => {
      clearTimeout(temporizador);
      resolver();
    };
    promesa.then(terminar).catch(terminar);
  });
}

type Temporizador = ReturnType<typeof setTimeout>;

/**
 * Registro en dos pasos, como la web: "Tu cuenta" y "Tu cabello". Cada campo se valida al salir de
 * él y, desde su primer error, en cada cambio. El correo se verifica 600 ms después de dejar de
 * escribir y al salir del campo; sin respuesta o sin red se reintenta (5, 10 y 20 s) mientras no
 * cambie. Con éxito, se pasa a la activación por código.
 */
export function useRegistroViewModel(): RegistroViewModel {
  const { push } = useRouter();
  const ruta = usePathname();
  const [campos, setCampos] = useState<CamposRegistro>(CAMPOS_INICIALES);
  const [errores, setErrores] = useState<ErroresRegistro>({});
  const [enVivo, setEnVivo] = useState<Partial<Record<CampoRegistro, boolean>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [navegacion, setNavegacion] = useState<{ paso: PasoRegistro; direccion: 1 | -1 }>({
    paso: 1,
    direccion: 1,
  });
  const paso = navegacion.paso;
  const irAPaso = (destino: PasoRegistro) => {
    setNavegacion((actual) =>
      actual.paso === destino ? actual : { paso: destino, direccion: destino > actual.paso ? 1 : -1 },
    );
  };
  const [verificandoCorreo, setVerificandoCorreo] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [estadoCorreo, setEstadoCorreo] = useState<EstadoCorreo>('inactivo');
  const [enfoque, setEnfoque] = useState<PedidoEnfoque | null>(null);
  const [estadoPreguntas, setEstadoPreguntas] = useState<EstadoPreguntas>('inactivo');
  const [listaPreguntas, setListaPreguntas] = useState<PreguntaSeguridad[]>([]);

  // Verificación del correo por rondas: una ronda es un correo; cambia al escribir otro (o con el
  // 409) y descarta todo lo que siga en curso de la anterior. En refs: no provocan renders.
  const ronda = useRef(0);
  const correoRonda = useRef<string | null>(null);
  const resuelta = useRef(false);
  const resultado = useRef<'registrado' | 'disponible' | null>(null);
  const reintentosHechos = useRef(0);
  const espera = useRef<Temporizador | null>(null);
  const reintento = useRef<Temporizador | null>(null);
  const limites = useRef(new Set<Temporizador>());
  const montado = useRef(true);
  const vecesEnfoque = useRef(0);
  // Cambios en los campos (para descartar un "Continuar" si se editó mientras esperaba) y el
  // último correo escrito (para que un 409 tardío solo marque el correo que se envió).
  const cambios = useRef(0);
  const ultimoCorreo = useRef('');

  const limpiarEspera = () => {
    if (espera.current) {
      clearTimeout(espera.current);
      espera.current = null;
    }
  };

  const limpiarReintento = () => {
    if (reintento.current) {
      clearTimeout(reintento.current);
      reintento.current = null;
    }
  };

  const limpiarLimites = () => {
    limites.current.forEach(clearTimeout);
    limites.current.clear();
  };

  const limpiarTodo = () => {
    limpiarEspera();
    limpiarReintento();
    limpiarLimites();
  };

  useEffect(() => {
    montado.current = true;
    const pendientes = limites.current;
    return () => {
      // Al cerrar la pantalla se cancela todo sin actualizar nada.
      montado.current = false;
      ronda.current += 1;
      if (espera.current) {
        clearTimeout(espera.current);
      }
      if (reintento.current) {
        clearTimeout(reintento.current);
      }
      pendientes.forEach(clearTimeout);
      pendientes.clear();
    };
  }, []);

  /** La ronda sigue abierta: el correo no cambió, no hay respuesta aún y la pantalla sigue montada. */
  const vigente = (r: number) => montado.current && r === ronda.current && !resuelta.current;

  const abrirRonda = (email: string | null): number => {
    limpiarTodo();
    ronda.current += 1;
    correoRonda.current = email;
    resuelta.current = false;
    resultado.current = null;
    reintentosHechos.current = 0;
    return ronda.current;
  };

  const resolver = (r: number, existe: boolean) => {
    if (!vigente(r)) {
      return;
    }
    resuelta.current = true;
    resultado.current = existe ? 'registrado' : 'disponible';
    limpiarReintento();
    limpiarLimites();
    setEstadoCorreo(resultado.current);
  };

  /** Sin respuesta (o sin red): programa el siguiente reintento; al agotarse, decide el 409. */
  const sinRespuesta = (email: string, r: number, estado: 'revisando' | 'sinConexion') => {
    if (!vigente(r) || reintento.current) {
      return;
    }
    if (reintentosHechos.current >= reintentosCorreo.length) {
      // Se agotaron: decide el 409. Una respuesta tardía de esta ronda se aplica igual, y
      // "Continuar" todavía hace un intento más.
      setEstadoCorreo('sinVerificar');
      return;
    }
    setEstadoCorreo(estado);
    reintento.current = setTimeout(() => {
      reintento.current = null;
      if (!vigente(r)) {
        return;
      }
      reintentosHechos.current += 1;
      intentar(email, r).catch(() => {
        // intentar() ya maneja sus errores.
      });
    }, reintentosCorreo[reintentosHechos.current]);
  };

  /**
   * Un intento con su propio límite de 6 s. Un error de red antes del límite es "sin conexión"
   * (sin red, la petición falla de inmediato); después del límite es el corte de 15 s del cliente
   * y ya hay un reintento programado.
   */
  const intentar = (email: string, r: number): Promise<void> => {
    let vencido = false;
    const limite = setTimeout(() => {
      limites.current.delete(limite);
      vencido = true;
      sinRespuesta(email, r, 'revisando');
    }, duracion.limiteVerificacionCorreo);
    limites.current.add(limite);
    const terminar = () => {
      clearTimeout(limite);
      limites.current.delete(limite);
    };
    return verificarCorreo(email)
      .then((respuesta) => {
        terminar();
        if (typeof respuesta?.existe === 'boolean') {
          resolver(r, respuesta.existe);
        } else if (!vencido) {
          sinRespuesta(email, r, 'revisando');
        }
      })
      .catch((error: unknown) => {
        terminar();
        if (vencido) {
          return;
        }
        const estado = estadoHttp(error);
        if (estado !== null && estado < 500) {
          // Un 4xx (por ejemplo, 429) no se arregla reintentando: decide el 409 del registro.
          if (vigente(r)) {
            // La ronda queda agotada: ningún otro intento en vuelo reinicia la cadena.
            reintentosHechos.current = reintentosCorreo.length;
            limpiarReintento();
            setEstadoCorreo('sinVerificar');
          }
          return;
        }
        sinRespuesta(email, r, esErrorDeRed(error) ? 'sinConexion' : 'revisando');
      });
  };

  const verificarAhora = (valor: string) => {
    const email = normalizarCorreo(valor);
    if (!esCorreoValido(email) || correoRonda.current === email) {
      return;
    }
    const r = abrirRonda(email);
    setEstadoCorreo('verificando');
    intentar(email, r).catch(() => {
      // intentar() ya maneja sus errores.
    });
  };

  const programarVerificacion = (valor: string) => {
    // Otro correo: se cancelan los reintentos de la ronda anterior sin actualizar nada.
    abrirRonda(null);
    setEstadoCorreo('inactivo');
    if (esCorreoValido(valor)) {
      espera.current = setTimeout(() => verificarAhora(valor), duracion.verificarCorreo);
    }
  };

  /** "Continuar" sin respuesta del correo: un intento más con el límite de 6 s. ¿Está registrado? */
  const verificarAntesDeContinuar = async (valor: string): Promise<boolean> => {
    const email = normalizarCorreo(valor);
    let r = ronda.current;
    if (correoRonda.current !== email) {
      r = abrirRonda(email);
      setEstadoCorreo('verificando');
    }
    // Este intento ocupa el lugar del reintento que estuviera programado.
    limpiarReintento();
    await conLimite(intentar(email, r), duracion.limiteVerificacionCorreo);
    return r === ronda.current && resultado.current === 'registrado';
  };

  /** El servidor dijo que el correo ya tiene cuenta (409 del registro). */
  const marcarRegistrado = (email: string) => {
    abrirRonda(email);
    resuelta.current = true;
    resultado.current = 'registrado';
    setEstadoCorreo('registrado');
  };

  const cambiar = <K extends CampoRegistro>(campo: K, valor: CamposRegistro[K]) => {
    cambios.current += 1;
    const nuevos: CamposRegistro = { ...campos, [campo]: valor };
    if (campo === 'correo') {
      ultimoCorreo.current = nuevos.correo;
    }
    if (campo === 'tieneAlergias' && valor !== true) {
      // Sin alergias, el detalle y el consentimiento desaparecen y no se envían.
      nuevos.alergias = '';
      nuevos.consienteDatosSensibles = false;
    }
    if (campo === 'tratamientosQuimicos' && valor !== true) {
      nuevos.tratamientos = '';
    }
    setCampos(nuevos);
    const siguientes: ErroresRegistro = { ...errores };
    if (enVivo[campo]) {
      siguientes[campo] = validarCampo(campo, nuevos);
    }
    // Pegar en el teléfono (varios dígitos de golpe) se valida al momento: si no quedan 10
    // dígitos, el error aparece sin esperar a salir del campo.
    const pegado =
      campo === 'telefono' && soloDigitos(nuevos.telefono).length - soloDigitos(campos.telefono).length > 1;
    if (pegado) {
      siguientes.telefono = validarCampo('telefono', nuevos);
    }
    if (campo === 'tieneAlergias' || campo === 'alergias') {
      siguientes.alergias = enVivo.alergias ? validarCampo('alergias', nuevos) : null;
      siguientes.consienteDatosSensibles = enVivo.consienteDatosSensibles
        ? validarCampo('consienteDatosSensibles', nuevos)
        : null;
    }
    if (campo === 'tratamientosQuimicos') {
      siguientes.tratamientos = enVivo.tratamientos ? validarCampo('tratamientos', nuevos) : null;
    }
    if (campo === 'confirmacion') {
      // Avisa en cuanto lo escrito deja de coincidir con la contraseña.
      const texto = nuevos.confirmacion;
      const noCoincide = texto.length > 0 && !nuevos.clave.startsWith(texto);
      siguientes.confirmacion = noCoincide ? NO_COINCIDEN : null;
    }
    if (campo === 'clave' && nuevos.confirmacion) {
      // Si la contraseña cambia después de confirmarla, se avisa en ese momento.
      siguientes.confirmacion = validarCampo('confirmacion', nuevos);
    }
    if (errores.clave && DATOS_DE_LA_CLAVE.includes(campo) && !validarCampo('clave', nuevos)) {
      // Otro campo solo puede limpiar el error de la contraseña, nunca hacer aparecer uno nuevo.
      siguientes.clave = null;
    }
    setErrores(siguientes);
    if (errorGeneral === REVISA_CAMPOS && !Object.values(siguientes).some(Boolean)) {
      setErrorGeneral(null);
    }
    const activarEnVivo: Partial<Record<CampoRegistro, boolean>> = {};
    if (campo === 'confirmacion' && siguientes.confirmacion) {
      activarEnVivo.confirmacion = true;
    }
    if (pegado && siguientes.telefono) {
      activarEnVivo.telefono = true;
    }
    if (Object.keys(activarEnVivo).length > 0) {
      setEnVivo((previos) => ({ ...previos, ...activarEnVivo }));
    }
    if (campo === 'correo') {
      programarVerificacion(nuevos.correo);
    }
  };

  /** Teléfono sin la lada; si cambió, se guarda así en el campo. */
  const limpiarTelefono = (actuales: CamposRegistro): CamposRegistro => {
    const telefono = telefonoSinLada(actuales.telefono);
    if (telefono === actuales.telefono) {
      return actuales;
    }
    setCampos((previos) => ({ ...previos, telefono: telefonoSinLada(previos.telefono) }));
    return { ...actuales, telefono };
  };

  const salir = (campo: CampoRegistro) => {
    const valores = campo === 'telefono' ? limpiarTelefono(campos) : campos;
    const problema = validarCampo(campo, valores);
    setErrores((previos) => ({ ...previos, [campo]: problema }));
    if (problema) {
      setEnVivo((previos) => ({ ...previos, [campo]: true }));
    }
    if (campo === 'correo' && !problema) {
      verificarAhora(campos.correo);
    }
  };

  const pedirEnfoque = (campo: CampoRegistro) => {
    vecesEnfoque.current += 1;
    setEnfoque({ campo, vez: vecesEnfoque.current });
  };

  /** Valida los campos indicados, los deja en vivo y devuelve el primero con error. */
  const revisar = (lista: CampoRegistro[], valores: CamposRegistro): CampoRegistro | undefined => {
    const nuevos = validar(lista, valores);
    setErrores((previos) => ({ ...previos, ...nuevos }));
    setEnVivo((previos) => ({
      ...previos,
      ...Object.fromEntries(lista.map((campo) => [campo, Boolean(nuevos[campo])])),
    }));
    return lista.find((campo) => nuevos[campo]);
  };

  const cargarPreguntas = () => {
    if (estadoPreguntas === 'cargando' || estadoPreguntas === 'listo') {
      return;
    }
    setEstadoPreguntas('cargando');
    obtenerPreguntasSeguridad()
      .then((lista) => {
        setListaPreguntas(lista);
        setEstadoPreguntas('listo');
      })
      .catch(() => {
        setEstadoPreguntas('error');
      });
  };

  /** Abre una página del sitio en el navegador; si no se puede, lo dice en el aviso general. */
  const abrirPagina = (url: string | null, error: string) => {
    if (!url) {
      setErrorGeneral(error);
      return;
    }
    openBrowserAsync(url).catch(() => {
      setErrorGeneral(error);
    });
  };

  const abrirAviso = () => {
    abrirPagina(urlAvisoPrivacidad(), 'No pudimos abrir el aviso de privacidad.');
  };

  const abrirTerminos = () => {
    abrirPagina(urlTerminos(), 'No pudimos abrir los términos y condiciones.');
  };

  const avanzar = async () => {
    const valores = limpiarTelefono(campos);
    const primero = revisar(PASO_1, valores);
    if (primero) {
      setErrorGeneral(REVISA_CAMPOS);
      pedirEnfoque(primero);
      return;
    }
    setErrorGeneral(null);
    let registrado = estadoCorreo === 'registrado';
    if (!registrado && estadoCorreo !== 'disponible') {
      const version = cambios.current;
      setVerificandoCorreo(true);
      try {
        registrado = await verificarAntesDeContinuar(valores.correo);
      } finally {
        if (montado.current) {
          setVerificandoCorreo(false);
        }
      }
      // Si editó algo mientras esperaba, lo validado ya no vale: no avanza bajo sus dedos.
      if (!montado.current || version !== cambios.current) {
        return;
      }
    }
    if (registrado) {
      // El campo ya muestra "Este correo ya está registrado" con "Iniciar sesión".
      pedirEnfoque('correo');
      return;
    }
    irAPaso(2);
  };

  const enviar = async () => {
    const valores = limpiarTelefono(campos);
    const primeroCuenta =
      revisar(PASO_1, valores) ?? (estadoCorreo === 'registrado' ? 'correo' : undefined);
    if (primeroCuenta) {
      irAPaso(1);
      setErrorGeneral(REVISA_CAMPOS);
      pedirEnfoque(primeroCuenta);
      return;
    }
    const primeroCabello = revisar(PASO_2, valores);
    if (primeroCabello || !valores.tipoCabello || !valores.pregunta) {
      setErrorGeneral(REVISA_CAMPOS);
      if (primeroCabello) {
        pedirEnfoque(primeroCabello);
      }
      return;
    }
    setErrorGeneral(null);
    const email = normalizarCorreo(valores.correo);
    setCargando(true);
    try {
      const respuesta = await registrarUsuario(
        cuerpoDeRegistro(valores, email, valores.tipoCabello, valores.pregunta),
      );
      if (respuesta?.success === false) {
        setErrorGeneral(respuesta.message ?? NO_PUDIMOS_CREAR);
        return;
      }
      // Los datos de salud ya viajaron: no se conservan ni en memoria.
      setCampos((previos) => ({ ...previos, alergias: '', consienteDatosSensibles: false }));
      // La activación regresa a esta misma pantalla de acceso.
      push({ pathname: '/activar', params: { email, enviado: '1', volverA: rutaAcceso(ruta) } });
    } catch (error) {
      if (estadoHttp(error) === 409) {
        // El correo ya tiene cuenta: se muestra en el propio campo, en el paso 1 (solo si el
        // campo sigue teniendo el correo que se envió).
        if (montado.current) {
          if (normalizarCorreo(ultimoCorreo.current) === email) {
            marcarRegistrado(email);
          }
          irAPaso(1);
          setErrorGeneral(REVISA_CAMPOS);
          pedirEnfoque('correo');
        }
      } else {
        setErrorGeneral(mensajeDeRegistro(error));
      }
    } finally {
      setCargando(false);
    }
  };

  const candadoPaso = useCandado();
  const continuar = () => {
    if (verificandoCorreo) {
      return;
    }
    // Candado inmediato además del estado: avanzar() ya muestra cualquier error en pantalla.
    candadoPaso(avanzar);
  };

  const atras = () => {
    if (cargando) {
      return;
    }
    setErrorGeneral(null);
    irAPaso(1);
  };

  const reiniciar = () => {
    // Cancela la espera, los reintentos y los límites del correo, y descarta respuestas en vuelo.
    abrirRonda(null);
    // Un "Continuar" que siguiera esperando ya no avanza.
    cambios.current += 1;
    ultimoCorreo.current = '';
    setCampos(CAMPOS_INICIALES);
    setErrores({});
    setEnVivo({});
    setErrorGeneral(null);
    setNavegacion({ paso: 1, direccion: 1 });
    setVerificandoCorreo(false);
    setEstadoCorreo('inactivo');
    setEnfoque(null);
  };

  const candado = useCandado();
  const crearCuenta = () => {
    if (cargando) {
      return;
    }
    // Candado inmediato además de cargando: enviar() ya muestra cualquier error en pantalla.
    candado(enviar);
  };

  return {
    campos,
    cambiar,
    salir,
    errores,
    errorGeneral,
    paso,
    direccionPaso: navegacion.direccion,
    continuar,
    atras,
    verificandoCorreo,
    cargando,
    estadoCorreo,
    requisitosClave: requisitosDeClave(campos.clave),
    avisoDatosPersonales: AVISO_DATOS_PERSONALES_CLAVE,
    enfoque,
    ayudaTelefono: AYUDA_TELEFONO,
    preguntas: { estado: estadoPreguntas, lista: listaPreguntas, cargar: cargarPreguntas },
    abrirAviso,
    abrirTerminos,
    crearCuenta,
    reiniciar,
  };
}
