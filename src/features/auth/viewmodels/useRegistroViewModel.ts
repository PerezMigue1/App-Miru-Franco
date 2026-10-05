import { useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';

import { telefonoSinLada } from '@/shared/ui/digitos';
import { duracion } from '@/shared/ui/tokens';
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
  problemaDeClave,
  problemaDeCorreo,
  problemaDeNombre,
  problemaDeRespuesta,
  requisitosDeClave,
  urlAvisoPrivacidad,
  type PreguntaSeguridad,
  type RequisitoClave,
  type TipoCabello,
} from '../models/AuthModel';
import { obtenerPreguntasSeguridad, registrarUsuario, verificarCorreo } from '../models/authService';

export interface CamposRegistro {
  nombre: string;
  correo: string;
  telefono: string;
  clave: string;
  confirmacion: string;
  nacimiento: string;
  tipoCabello: TipoCabello | null;
  pregunta: PreguntaSeguridad | null;
  respuesta: string;
  aceptaAviso: boolean;
}

export type CampoRegistro = keyof CamposRegistro;

export type ErroresRegistro = Partial<Record<CampoRegistro, string | null>>;

export type EstadoPreguntas = 'inactivo' | 'cargando' | 'listo' | 'error';

/**
 * Verificación del correo: solo lo que dice el endpoint (existe o no). 'sinVerificar': no respondió
 * a tiempo o falló la red; no bloquea, el registro lo revisará con su 409.
 */
export type EstadoCorreo = 'inactivo' | 'verificando' | 'disponible' | 'registrado' | 'sinVerificar';

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
  cargando: boolean;
  estadoCorreo: EstadoCorreo;
  requisitosClave: RequisitoClave[];
  avisoDatosPersonales: string;
  enfoque: PedidoEnfoque | null;
  ayudaTelefono: string;
  preguntas: { estado: EstadoPreguntas; lista: PreguntaSeguridad[]; cargar: () => void };
  abrirAviso: () => void;
  crearCuenta: () => void;
}

const CAMPOS_INICIALES: CamposRegistro = {
  nombre: '',
  correo: '',
  telefono: '',
  clave: '',
  confirmacion: '',
  nacimiento: '',
  tipoCabello: null,
  pregunta: null,
  respuesta: '',
  aceptaAviso: false,
};

/**
 * Orden visual del formulario: el foco va al primero de esta lista que tenga error. La contraseña
 * va después de los datos con los que la regla del backend la compara.
 */
const ORDEN: CampoRegistro[] = [
  'nombre',
  'correo',
  'telefono',
  'nacimiento',
  'tipoCabello',
  'pregunta',
  'respuesta',
  'clave',
  'confirmacion',
  'aceptaAviso',
];

/** Campos que la regla de contraseña compara: si cambian, la contraseña se revalida. */
const DATOS_DE_LA_CLAVE: CampoRegistro[] = ['nombre', 'correo', 'telefono', 'nacimiento', 'respuesta'];

const NO_COINCIDEN = 'Las contraseñas no coinciden';
const REVISA_CAMPOS = 'Revisa los campos marcados.';
const ESPERA_VERIFICACION = 'Espera un momento: estamos verificando tu correo.';

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

/** Valida un campo con las reglas existentes (no agrega reglas nuevas). */
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
    case 'tipoCabello':
      return c.tipoCabello ? null : 'Selecciona tu tipo de cabello';
    case 'pregunta':
      return c.pregunta ? null : 'Debes seleccionar una pregunta de seguridad';
    case 'respuesta':
      return problemaDeRespuesta(c.respuesta);
    case 'aceptaAviso':
      return c.aceptaAviso ? null : 'Debes aceptar el Aviso de Privacidad';
    default:
      return null;
  }
}

function mensajeDeRegistro(error: unknown): string {
  if (esErrorDeRed(error)) {
    return MENSAJE_SIN_CONEXION;
  }
  if (estadoHttp(error) === 429) {
    return MENSAJE_DEMASIADOS_INTENTOS;
  }
  return mensajeDelServidor(error, 'No pudimos crear tu cuenta. Intenta de nuevo.');
}

/**
 * Registro: validaciones y mensajes de la web; cada campo se valida al salir de él y, desde su
 * primer error, en cada cambio. El correo se verifica contra el servidor 600 ms después de dejar
 * de escribir y al salir del campo. Con éxito, se pasa a la activación por código.
 */
export function useRegistroViewModel(): RegistroViewModel {
  const { push } = useRouter();
  const [campos, setCampos] = useState<CamposRegistro>(CAMPOS_INICIALES);
  const [errores, setErrores] = useState<ErroresRegistro>({});
  const [enVivo, setEnVivo] = useState<Partial<Record<CampoRegistro, boolean>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [estadoCorreo, setEstadoCorreo] = useState<EstadoCorreo>('inactivo');
  const [enfoque, setEnfoque] = useState<PedidoEnfoque | null>(null);
  const [estadoPreguntas, setEstadoPreguntas] = useState<EstadoPreguntas>('inactivo');
  const [listaPreguntas, setListaPreguntas] = useState<PreguntaSeguridad[]>([]);

  // Verificación del correo: temporizador, número de solicitud (descarta respuestas viejas),
  // correo ya consultado y si la pantalla sigue montada. En refs: no provocan renders.
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Límite de espera de la verificación: si vence, el registro deja de estar bloqueado.
  const limite = useRef<ReturnType<typeof setTimeout> | null>(null);
  const solicitudCorreo = useRef(0);
  const correoConsultado = useRef<string | null>(null);
  const montado = useRef(true);
  const vecesEnfoque = useRef(0);

  const limpiarTemporizador = () => {
    if (temporizador.current) {
      clearTimeout(temporizador.current);
      temporizador.current = null;
    }
  };

  const limpiarLimite = () => {
    if (limite.current) {
      clearTimeout(limite.current);
      limite.current = null;
    }
  };

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      if (temporizador.current) {
        clearTimeout(temporizador.current);
      }
      if (limite.current) {
        clearTimeout(limite.current);
      }
    };
  }, []);

  const verificarAhora = (valor: string) => {
    const email = normalizarCorreo(valor);
    if (!esCorreoValido(email) || correoConsultado.current === email) {
      return;
    }
    limpiarTemporizador();
    correoConsultado.current = email;
    solicitudCorreo.current += 1;
    const solicitud = solicitudCorreo.current;
    setEstadoCorreo('verificando');
    // Si no responde a tiempo, deja de bloquear. No se incrementa la solicitud ni se libera el correo
    // consultado: si la respuesta llega tarde y el correo no cambió, se aplica igual.
    limpiarLimite();
    limite.current = setTimeout(() => {
      limite.current = null;
      if (!montado.current || solicitud !== solicitudCorreo.current) {
        return;
      }
      setErrorGeneral((previo) => (previo === ESPERA_VERIFICACION ? null : previo));
      setEstadoCorreo('sinVerificar');
    }, duracion.limiteVerificacionCorreo);
    verificarCorreo(email)
      .then((respuesta) => {
        if (!montado.current || solicitud !== solicitudCorreo.current) {
          return;
        }
        limpiarLimite();
        setErrorGeneral((previo) => (previo === ESPERA_VERIFICACION ? null : previo));
        if (respuesta?.existe === true) {
          setEstadoCorreo('registrado');
        } else if (respuesta?.existe === false) {
          setEstadoCorreo('disponible');
        } else {
          correoConsultado.current = null;
          setEstadoCorreo('inactivo');
        }
      })
      .catch(() => {
        // Sin red no se bloquea: si el correo existe, el registro responderá 409.
        if (!montado.current || solicitud !== solicitudCorreo.current) {
          return;
        }
        limpiarLimite();
        setErrorGeneral((previo) => (previo === ESPERA_VERIFICACION ? null : previo));
        // Se puede volver a intentar al salir del campo; mientras, no se bloquea el registro.
        correoConsultado.current = null;
        setEstadoCorreo('sinVerificar');
      });
  };

  const programarVerificacion = (valor: string) => {
    limpiarTemporizador();
    limpiarLimite();
    solicitudCorreo.current += 1;
    correoConsultado.current = null;
    setEstadoCorreo('inactivo');
    if (esCorreoValido(valor)) {
      temporizador.current = setTimeout(() => verificarAhora(valor), duracion.verificarCorreo);
    }
  };

  const cambiar = <K extends CampoRegistro>(campo: K, valor: CamposRegistro[K]) => {
    const nuevos: CamposRegistro = { ...campos, [campo]: valor };
    setCampos(nuevos);
    const siguientes: ErroresRegistro = { ...errores };
    if (enVivo[campo]) {
      siguientes[campo] = validarCampo(campo, nuevos);
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
    if (campo === 'confirmacion' && siguientes.confirmacion) {
      setEnVivo((previos) => ({ ...previos, confirmacion: true }));
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

  const abrirAviso = () => {
    const url = urlAvisoPrivacidad();
    if (!url) {
      setErrorGeneral('No pudimos abrir el aviso de privacidad.');
      return;
    }
    openBrowserAsync(url).catch(() => {
      setErrorGeneral('No pudimos abrir el aviso de privacidad.');
    });
  };

  const enviar = async () => {
    if (estadoCorreo === 'verificando') {
      setErrorGeneral(ESPERA_VERIFICACION);
      return;
    }
    const valores = limpiarTelefono(campos);
    const nuevos: ErroresRegistro = {};
    for (const campo of ORDEN) {
      nuevos[campo] = validarCampo(campo, valores);
    }
    setErrores(nuevos);
    setEnVivo(Object.fromEntries(ORDEN.map((campo) => [campo, Boolean(nuevos[campo])])));
    setErrorGeneral(null);
    const correoRegistrado = estadoCorreo === 'registrado';
    const primero = ORDEN.find((campo) => nuevos[campo] || (campo === 'correo' && correoRegistrado));
    if (primero || !campos.tipoCabello || !campos.pregunta) {
      setErrorGeneral(REVISA_CAMPOS);
      if (primero) {
        pedirEnfoque(primero);
      }
      return;
    }
    const email = normalizarCorreo(campos.correo);
    setCargando(true);
    try {
      const respuesta = await registrarUsuario({
        nombre: campos.nombre.trim(),
        email,
        telefono: normalizarTelefono(valores.telefono),
        password: campos.clave,
        fechaNacimiento: fechaIsoDe(campos.nacimiento),
        preguntaSeguridad: { pregunta: campos.pregunta.pregunta, respuesta: campos.respuesta.trim() },
        perfilCapilar: { tipoCabello: campos.tipoCabello },
        aceptaAvisoPrivacidad: true,
      });
      if (respuesta?.success === false) {
        setErrorGeneral(respuesta.message ?? 'No pudimos crear tu cuenta. Intenta de nuevo.');
        return;
      }
      push({ pathname: '/activar', params: { email, enviado: '1' } });
    } catch (error) {
      if (estadoHttp(error) === 409) {
        // El correo ya tiene cuenta: se muestra en el propio campo, como la verificación.
        if (montado.current) {
          limpiarTemporizador();
          limpiarLimite();
          solicitudCorreo.current += 1;
          correoConsultado.current = email;
          setEstadoCorreo('registrado');
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
    cargando,
    estadoCorreo,
    requisitosClave: requisitosDeClave(campos.clave),
    avisoDatosPersonales: AVISO_DATOS_PERSONALES_CLAVE,
    enfoque,
    ayudaTelefono: AYUDA_TELEFONO,
    preguntas: { estado: estadoPreguntas, lista: listaPreguntas, cargar: cargarPreguntas },
    abrirAviso,
    crearCuenta,
  };
}
