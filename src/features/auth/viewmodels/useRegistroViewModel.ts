import { useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useState } from 'react';

import {
  AYUDA_TELEFONO,
  ERROR_TELEFONO,
  MENSAJE_DEMASIADOS_INTENTOS,
  MENSAJE_SIN_CONEXION,
  convertirFechaNacimiento,
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
  urlAvisoPrivacidad,
  type PreguntaSeguridad,
  type TipoCabello,
} from '../models/AuthModel';
import { obtenerPreguntasSeguridad, registrarUsuario } from '../models/authService';

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

export type ErroresRegistro = Partial<Record<keyof CamposRegistro, string | null>>;

export type EstadoPreguntas = 'inactivo' | 'cargando' | 'listo' | 'error';

export interface RegistroViewModel {
  campos: CamposRegistro;
  cambiar: <K extends keyof CamposRegistro>(campo: K, valor: CamposRegistro[K]) => void;
  errores: ErroresRegistro;
  errorGeneral: string | null;
  cargando: boolean;
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
  return confirmacion === clave ? null : 'Las contraseñas no coinciden';
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
 * Registro: validaciones y mensajes de la web; la pregunta de seguridad se carga del API al abrir
 * el selector. Con éxito, la cuenta queda sin activar y se pasa a la activación por código.
 */
export function useRegistroViewModel(): RegistroViewModel {
  const { push } = useRouter();
  const [campos, setCampos] = useState<CamposRegistro>(CAMPOS_INICIALES);
  const [errores, setErrores] = useState<ErroresRegistro>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [estadoPreguntas, setEstadoPreguntas] = useState<EstadoPreguntas>('inactivo');
  const [listaPreguntas, setListaPreguntas] = useState<PreguntaSeguridad[]>([]);

  const cambiar = <K extends keyof CamposRegistro>(campo: K, valor: CamposRegistro[K]) => {
    setCampos((previos) => ({ ...previos, [campo]: valor }));
    setErrores((previos) => (previos[campo] ? { ...previos, [campo]: null } : previos));
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
    const fecha = convertirFechaNacimiento(campos.nacimiento);
    const fechaIso = 'fecha' in fecha ? fecha.fecha : '';
    const nuevos: ErroresRegistro = {
      nombre: problemaDeNombre(campos.nombre),
      correo: problemaDeCorreo(campos.correo),
      telefono: problemaDeTelefono(campos.telefono),
      clave: campos.clave
        ? problemaDeClave(campos.clave, {
            nombre: campos.nombre,
            email: campos.correo,
            telefono: campos.telefono,
            fechaNacimiento: fechaIso,
            respuesta: campos.respuesta,
          })
        : 'La contraseña es requerida',
      confirmacion: problemaDeConfirmacion(campos.clave, campos.confirmacion),
      nacimiento: 'problema' in fecha ? fecha.problema : null,
      tipoCabello: campos.tipoCabello ? null : 'Selecciona tu tipo de cabello',
      pregunta: campos.pregunta ? null : 'Debes seleccionar una pregunta de seguridad',
      respuesta: problemaDeRespuesta(campos.respuesta),
      aceptaAviso: campos.aceptaAviso ? null : 'Debes aceptar el Aviso de Privacidad',
    };
    setErrores(nuevos);
    setErrorGeneral(null);
    if (Object.values(nuevos).some(Boolean) || !campos.tipoCabello || !campos.pregunta) {
      setErrorGeneral('Revisa los campos marcados.');
      return;
    }
    const email = normalizarCorreo(campos.correo);
    setCargando(true);
    try {
      const respuesta = await registrarUsuario({
        nombre: campos.nombre.trim(),
        email,
        telefono: normalizarTelefono(campos.telefono),
        password: campos.clave,
        fechaNacimiento: fechaIso,
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
      setErrorGeneral(mensajeDeRegistro(error));
    } finally {
      setCargando(false);
    }
  };

  const crearCuenta = () => {
    if (cargando) {
      return;
    }
    enviar().catch(() => {
      // enviar() ya muestra cualquier error en pantalla.
    });
  };

  return {
    campos,
    cambiar,
    errores,
    errorGeneral,
    cargando,
    ayudaTelefono: AYUDA_TELEFONO,
    preguntas: { estado: estadoPreguntas, lista: listaPreguntas, cargar: cargarPreguntas },
    abrirAviso,
    crearCuenta,
  };
}
