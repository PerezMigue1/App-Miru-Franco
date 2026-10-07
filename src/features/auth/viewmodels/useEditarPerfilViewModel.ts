import { useFocusEffect, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { generacionActual } from '@/shared/api/tokenStorage';
import { telefonoSinLada } from '@/shared/ui/digitos';
import { useCandado } from '@/shared/ui/useCandado';

import {
  ERROR_CONSENTIMIENTO_SALUD,
  ERROR_TELEFONO,
  MENSAJE_SIN_CONEXION,
  convertirFechaNacimiento,
  esErrorDeRed,
  esTelefonoValido,
  mensajeDelServidor,
  problemaDeAlergias,
  problemaDeNombre,
  problemaDeTratamientos,
  urlAvisoPrivacidad,
} from '../models/AuthModel';
import { actualizarPerfil, obtenerPerfilCompleto } from '../models/authService';
import {
  cambiosDelPerfil,
  formularioDesdePerfil,
  normalizarPerfil,
  requiereConsentimientoPerfil,
  type FormularioPerfil,
  type PerfilCuenta,
} from '../models/PerfilModel';
import { useAuth } from './useAuth';

export type CampoPerfil = keyof FormularioPerfil | 'consiente';
export type ErroresPerfil = Partial<Record<CampoPerfil, string | null>>;
export type EstadoEdicion = 'cargando' | 'listo' | 'error';

/** Pedido a la vista de llevar el foco a un campo (cambia en cada envío con errores). */
export interface EnfoquePerfil {
  campo: CampoPerfil;
  vez: number;
}

export interface EditarPerfilViewModel {
  estado: EstadoEdicion;
  reintentar: () => void;
  correo: string;
  formulario: FormularioPerfil;
  cambiar: <K extends keyof FormularioPerfil>(campo: K, valor: FormularioPerfil[K]) => void;
  salirDe: (campo: keyof FormularioPerfil) => void;
  /** Las alergias cambiaron y traen texto: hace falta el consentimiento de datos de salud. */
  pideConsentimiento: boolean;
  consiente: boolean;
  setConsiente: (valor: boolean) => void;
  errores: ErroresPerfil;
  errorGeneral: string | null;
  guardando: boolean;
  guardar: () => void;
  enfoque: EnfoquePerfil | null;
  abrirAviso: () => void;
  /** Volver: si hay cambios sin guardar, primero se pregunta. */
  volver: () => void;
  confirmarSalida: boolean;
  descartar: () => void;
  seguirEditando: () => void;
}

const ORDEN: CampoPerfil[] = [
  'nombre',
  'telefono',
  'nacimiento',
  'alergias',
  'consiente',
  'tratamientos',
];

const FORMULARIO_VACIO: FormularioPerfil = {
  nombre: '',
  telefono: '',
  nacimiento: '',
  tipoCabello: null,
  colorNatural: '',
  colorActual: '',
  productosUsados: '',
  alergias: '',
  tratamientos: '',
  recibePromociones: false,
};

/** Fecha del formulario en AAAA-MM-DD, null si está vacía, o el problema si no es válida. */
function fechaDe(nacimiento: string): { iso: string | null } | { problema: string } {
  if (!nacimiento.trim()) {
    return { iso: null };
  }
  const fecha = convertirFechaNacimiento(nacimiento);
  return 'fecha' in fecha ? { iso: fecha.fecha } : fecha;
}

/** Reglas existentes de AuthModel; los datos opcionales vacíos son válidos (como en la web). */
function validarCampo(
  campo: CampoPerfil,
  f: FormularioPerfil,
  perfil: PerfilCuenta | null,
  consiente: boolean,
): string | null {
  switch (campo) {
    case 'nombre':
      return problemaDeNombre(f.nombre);
    case 'telefono':
      return !f.telefono.trim() || esTelefonoValido(telefonoSinLada(f.telefono)) ? null : ERROR_TELEFONO;
    case 'nacimiento': {
      const fecha = fechaDe(f.nacimiento);
      return 'problema' in fecha ? fecha.problema : null;
    }
    case 'alergias':
      return f.alergias.trim() ? problemaDeAlergias(true, f.alergias) : null;
    case 'consiente':
      return perfil && requiereConsentimientoPerfil(perfil, f.alergias) && !consiente
        ? ERROR_CONSENTIMIENTO_SALUD
        : null;
    case 'tratamientos':
      return f.tratamientos.trim() ? problemaDeTratamientos(true, f.tratamientos) : null;
    default:
      return null;
  }
}

function mensajeDeGuardado(error: unknown): string {
  if (esErrorDeRed(error)) {
    return MENSAJE_SIN_CONEXION;
  }
  return mensajeDelServidor(error, 'No pudimos guardar tus cambios. Intenta de nuevo.');
}

/**
 * Editar perfil: datos y perfil capilar de GET /me, con las reglas del registro. Solo se envía lo
 * que cambió. Las alergias (datos de salud) viven solo en el estado de esta pantalla.
 */
export function useEditarPerfilViewModel(): EditarPerfilViewModel {
  const { back, dismissTo } = useRouter();
  const { actualizarNombre } = useAuth();
  const [estado, setEstado] = useState<EstadoEdicion>('cargando');
  const [perfil, setPerfil] = useState<PerfilCuenta | null>(null);
  const [formulario, setFormulario] = useState<FormularioPerfil>(FORMULARIO_VACIO);
  const [consiente, setConsienteCrudo] = useState(false);
  const [errores, setErrores] = useState<ErroresPerfil>({});
  const [enVivo, setEnVivo] = useState<Partial<Record<CampoPerfil, boolean>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [enfoque, setEnfoque] = useState<EnfoquePerfil | null>(null);
  const solicitud = useRef(0);
  const vecesEnfoque = useRef(0);
  const montado = useRef(true);
  const candado = useCandado();

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

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
        if (!leido) {
          setEstado('error');
          return;
        }
        setPerfil(leido);
        setFormulario(formularioDesdePerfil(leido));
        setEstado('listo');
      })
      .catch(() => {
        if (id === solicitud.current) {
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

  const fecha = fechaDe(formulario.nacimiento);
  const cambios = perfil ? cambiosDelPerfil(perfil, formulario, 'iso' in fecha ? fecha.iso : perfil.fechaNacimiento || null) : {};
  // Una fecha a medio escribir también cuenta como cambio sin guardar.
  const fechaEditada = perfil ? formulario.nacimiento !== formularioDesdePerfil(perfil).nacimiento : false;
  const hayCambios = Object.keys(cambios).length > 0 || fechaEditada;
  const pideConsentimiento = perfil ? requiereConsentimientoPerfil(perfil, formulario.alergias) : false;

  const cambiar = <K extends keyof FormularioPerfil>(campo: K, valor: FormularioPerfil[K]) => {
    const nuevo = { ...formulario, [campo]: valor };
    setFormulario(nuevo);
    if (enVivo[campo]) {
      setErrores((previos) => ({ ...previos, [campo]: validarCampo(campo, nuevo, perfil, consiente) }));
    }
    if (campo === 'alergias' && enVivo.consiente) {
      setErrores((previos) => ({ ...previos, consiente: validarCampo('consiente', nuevo, perfil, consiente) }));
    }
  };

  const salirDe = (campo: keyof FormularioPerfil) => {
    const problema = validarCampo(campo, formulario, perfil, consiente);
    setErrores((previos) => ({ ...previos, [campo]: problema }));
    if (problema) {
      setEnVivo((previos) => ({ ...previos, [campo]: true }));
    }
  };

  const setConsiente = (valor: boolean) => {
    setConsienteCrudo(valor);
    if (enVivo.consiente) {
      setErrores((previos) => ({ ...previos, consiente: validarCampo('consiente', formulario, perfil, valor) }));
    }
  };

  const pedirEnfoque = (campo: CampoPerfil) => {
    vecesEnfoque.current += 1;
    setEnfoque({ campo, vez: vecesEnfoque.current });
  };

  const enviar = async () => {
    if (!perfil) {
      return;
    }
    const nuevos: ErroresPerfil = {};
    for (const campo of ORDEN) {
      nuevos[campo] = validarCampo(campo, formulario, perfil, consiente);
    }
    setErrores(nuevos);
    setEnVivo(Object.fromEntries(ORDEN.map((campo) => [campo, Boolean(nuevos[campo])])));
    const primero = ORDEN.find((campo) => nuevos[campo]);
    if (primero || 'problema' in fecha) {
      setErrorGeneral('Revisa los campos marcados.');
      pedirEnfoque(primero ?? 'nacimiento');
      return;
    }
    setErrorGeneral(null);
    if (Object.keys(cambios).length === 0) {
      back();
      return;
    }
    // La sesión con la que se guarda: si cambia mientras tanto, no se toca la nueva.
    const generacion = generacionActual();
    setGuardando(true);
    try {
      await actualizarPerfil(cambios);
      if (cambios.nombre) {
        actualizarNombre(cambios.nombre, generacion);
      }
      if (montado.current && generacion === generacionActual()) {
        dismissTo({ pathname: '/perfil', params: { guardado: 'perfil' } });
      }
    } catch (error) {
      setErrorGeneral(mensajeDeGuardado(error));
    } finally {
      setGuardando(false);
    }
  };

  const volver = () => {
    // Mientras se guarda no se sale: al terminar, la pantalla regresa sola a Perfil.
    if (guardando) {
      return;
    }
    if (hayCambios) {
      setConfirmarSalida(true);
      return;
    }
    back();
  };

  // El botón Atrás de Android también pregunta antes de descartar cambios.
  const refVolver = useRef(volver);
  useEffect(() => {
    refVolver.current = volver;
  });
  useFocusEffect(
    useCallback(() => {
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        refVolver.current();
        return true;
      });
      return () => suscripcion.remove();
    }, []),
  );

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

  return {
    estado,
    reintentar: cargar,
    correo: perfil?.email ?? '',
    formulario,
    cambiar,
    salirDe,
    pideConsentimiento,
    consiente,
    setConsiente,
    errores,
    errorGeneral,
    guardando,
    guardar: () => {
      if (!guardando) {
        candado(enviar);
      }
    },
    enfoque,
    abrirAviso,
    volver,
    confirmarSalida,
    descartar: () => {
      setConfirmarSalida(false);
      back();
    },
    seguirEditando: () => setConfirmarSalida(false),
  };
}
