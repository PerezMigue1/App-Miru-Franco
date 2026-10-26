import { useFocusEffect, useRouter } from 'expo-router';
import { openBrowserAsync } from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { generacionActual } from '@/shared/api/tokenStorage';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { telefonoSinLada } from '@/shared/ui/digitos';
import { useCandado } from '@/shared/ui/useCandado';

import {
  AYUDA_TELEFONO,
  ERROR_CONSENTIMIENTO_SALUD,
  ERROR_TELEFONO,
  TIPOS_CABELLO,
  convertirFechaNacimiento,
  esConsentimientoSaludRequerido,
  esTelefonoValido,
  problemaDeAlergias,
  problemaDeNombre,
  problemaDeTieneTratamientos,
  problemaDeTratamientos,
  urlAvisoPrivacidad,
  type TipoCabello,
} from '../models/AuthModel';
import { actualizarPerfil, obtenerPerfilCompleto, releerPerfilCompleto } from '../models/authService';
import {
  alergiasPendientesDelGuardado,
  cambiosDeTratamientos,
  cambiosDelPerfil,
  formularioDesdePerfil,
  normalizarPerfil,
  requiereConsentimientoPerfil,
  type FormularioPerfil,
  type PerfilCuenta,
} from '../models/PerfilModel';
import { useAuth } from './useAuth';
import {
  useAutorizacionDatosSensibles,
  type AutorizacionDatosSensiblesViewModel,
} from './useAutorizacionDatosSensibles';

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
  /** Con estado 'error': por qué no se cargó el perfil (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
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
  /** "Guardar cambios", "Guardando…" o, tras un 429, "Intenta de nuevo en N s". */
  textoGuardar: string;
  /** Durante la espera de un 429 el botón no responde. */
  guardarEnEspera: boolean;
  /**
   * Ronda 5: con la autorización de datos sensibles vigente se muestra el campo de alergias; sin ella
   * no se muestran ni se mandan y en su lugar se ofrece autorizar.
   */
  alergiasAutorizadas: boolean;
  /** Sin autorización: por qué no se ven (guardadas y ocultas, o aún sin registrar). */
  textoSinAutorizacion: string;
  /** "Leer y autorizar". */
  textoAutorizar: string;
  /** Hoja de la autorización (con sesión: la registra en el backend). */
  autorizacion: AutorizacionDatosSensiblesViewModel;
  /** Ya autorizó pero no se pudieron leer sus alergias: el botón reintenta solo la lectura. */
  errorAlergias: string | null;
  recargandoAlergias: boolean;
  reintentarAlergias: () => void;
  textoReintentar: string;
  /** El guardado no incluyó las alergias por falta de autorización (alergiasPendientesDeAutorizacion). */
  avisoAlergias: string | null;
  enfoque: EnfoquePerfil | null;
  ayudaTelefono: string;
  /** Opciones de tipo de cabello de "Tu cabello", en el orden en que se muestran. */
  tiposCabello: { valor: TipoCabello; etiqueta: string }[];
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
  'tratamientosQuimicos',
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
  tratamientosQuimicos: null,
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
    // Solo se valida lo que se va a enviar: sin respuesta en /me y sin tocar, no bloquea el guardado.
    case 'tratamientosQuimicos':
      return perfil && cambiosDeTratamientos(perfil, f).tratamientosQuimicos !== undefined
        ? problemaDeTieneTratamientos(f.tratamientosQuimicos)
        : null;
    case 'tratamientos':
      return perfil && cambiosDeTratamientos(perfil, f).tratamientos !== undefined
        ? problemaDeTratamientos(f.tratamientosQuimicos, f.tratamientos)
        : null;
    default:
      return null;
  }
}

function mensajeDeGuardado(error: unknown): string {
  return mensajeParaClienta(error, { respaldo: obtenerTexto('perfil.editar.noSeGuardo') });
}

/**
 * Editar perfil: datos y perfil capilar de GET /me, con las reglas del registro. Solo se envía lo
 * que cambió. Las alergias (datos de salud) viven solo en el estado de esta pantalla y solo con la
 * autorización expresa de datos sensibles vigente (Ronda 5): sin ella no se muestran ni se mandan y
 * se ofrece autorizarlas con el texto del backend; al autorizar se vuelven a leer. Un 429 al guardar
 * deja el botón en espera con el message del backend.
 */
export function useEditarPerfilViewModel(): EditarPerfilViewModel {
  const { back, dismissTo } = useRouter();
  const { actualizarNombre } = useAuth();
  const [estado, setEstado] = useState<EstadoEdicion>('cargando');
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [perfil, setPerfil] = useState<PerfilCuenta | null>(null);
  const [formulario, setFormulario] = useState<FormularioPerfil>(FORMULARIO_VACIO);
  const [consiente, setConsienteCrudo] = useState(false);
  const [errores, setErrores] = useState<ErroresPerfil>({});
  const [enVivo, setEnVivo] = useState<Partial<Record<CampoPerfil, boolean>>>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [confirmarSalida, setConfirmarSalida] = useState(false);
  const [enfoque, setEnfoque] = useState<EnfoquePerfil | null>(null);
  const [errorAlergias, setErrorAlergias] = useState<string | null>(null);
  const [recargandoAlergias, setRecargandoAlergias] = useState(false);
  const [avisoAlergias, setAvisoAlergias] = useState<string | null>(null);
  const espera = useEsperaLimite();
  const solicitud = useRef(0);
  const lecturaAlergias = useRef(0);
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
        setErrorCarga(null);
        if (!leido) {
          setEstado('error');
          return;
        }
        setPerfil(leido);
        setFormulario(formularioDesdePerfil(leido));
        setEstado('listo');
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
      lecturaAlergias.current += 1;
    };
  }, [cargar]);

  /**
   * Tras autorizar: se vuelve a leer /me y solo se toman las alergias y la autorización, así no se
   * pierde nada de lo que la clienta ya había cambiado en el formulario.
   */
  const recargarAlergias = useCallback(() => {
    lecturaAlergias.current += 1;
    const id = lecturaAlergias.current;
    setRecargandoAlergias(true);
    setErrorAlergias(null);
    setAvisoAlergias(null);
    releerPerfilCompleto()
      .then((respuesta) => {
        if (id !== lecturaAlergias.current) {
          return;
        }
        const leido = normalizarPerfil(respuesta);
        if (!leido) {
          setErrorAlergias(obtenerTexto('auth.perfil.alergiasNoCargaron'));
          return;
        }
        const alergias = {
          alergias: leido.alergias,
          datosSensiblesAutorizados: leido.datosSensiblesAutorizados,
          alergiasOcultas: leido.alergiasOcultas,
        };
        setPerfil((previo) => (previo ? { ...previo, ...alergias } : leido));
        setFormulario((previo) => ({ ...previo, alergias: leido.alergias }));
      })
      .catch((error: unknown) => {
        if (id === lecturaAlergias.current) {
          setErrorAlergias(mensajeParaClienta(error, { respaldo: obtenerTexto('auth.perfil.alergiasNoCargaron') }));
        }
      })
      .finally(() => {
        if (id === lecturaAlergias.current) {
          setRecargandoAlergias(false);
        }
      });
  }, []);

  const autorizacion = useAutorizacionDatosSensibles({
    ruta: '/editar-perfil',
    registrarEnServidor: true,
    onAutorizada: recargarAlergias,
  });

  const fecha = fechaDe(formulario.nacimiento);
  const cambios = perfil ? cambiosDelPerfil(perfil, formulario, 'iso' in fecha ? fecha.iso : perfil.fechaNacimiento || null) : {};
  // Una fecha a medio escribir también cuenta como cambio sin guardar.
  const fechaEditada = perfil ? formulario.nacimiento !== formularioDesdePerfil(perfil).nacimiento : false;
  const hayCambios = Object.keys(cambios).length > 0 || fechaEditada;
  const pideConsentimiento = perfil ? requiereConsentimientoPerfil(perfil, formulario.alergias) : false;

  const cambiar = <K extends keyof FormularioPerfil>(campo: K, valor: FormularioPerfil[K]) => {
    // Con No, el detalle se oculta y no se envía, pero se conserva: si vuelve a Sí, reaparece.
    const nuevo: FormularioPerfil = { ...formulario, [campo]: valor };
    setFormulario(nuevo);
    if (enVivo[campo]) {
      setErrores((previos) => ({ ...previos, [campo]: validarCampo(campo, nuevo, perfil, consiente) }));
    }
    if (campo === 'alergias' && enVivo.consiente) {
      setErrores((previos) => ({ ...previos, consiente: validarCampo('consiente', nuevo, perfil, consiente) }));
    }
    if (campo === 'tratamientosQuimicos') {
      const tratamientos = enVivo.tratamientos ? validarCampo('tratamientos', nuevo, perfil, consiente) : null;
      setErrores((previos) => ({ ...previos, tratamientos }));
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
      setErrorGeneral(obtenerTexto('auth.revisaCampos'));
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
      const respuesta = await actualizarPerfil(cambios);
      if (cambios.nombre) {
        actualizarNombre(cambios.nombre, generacion);
      }
      if (!montado.current || generacion !== generacionActual()) {
        return;
      }
      if (alergiasPendientesDelGuardado(respuesta)) {
        // Lo demás se guardó, pero las alergias no (la autorización ya no está vigente): se queda
        // aquí, lo explica y vuelve a leer el perfil, que ahora ofrece autorizar.
        setAvisoAlergias(obtenerTexto('auth.perfil.alergiasPendientes'));
        setConsienteCrudo(false);
        cargar();
        return;
      }
      dismissTo({ pathname: '/perfil', params: { guardado: 'perfil' } });
    } catch (error) {
      // Un 429 deja "Guardar cambios" en espera; el mensaje es el del backend (mensajeParaClienta).
      espera.esperarSiLimite(error);
      if (esConsentimientoSaludRequerido(error)) {
        setErrores((previos) => ({ ...previos, consiente: ERROR_CONSENTIMIENTO_SALUD }));
        setEnVivo((previos) => ({ ...previos, consiente: true }));
        pedirEnfoque('consiente');
      }
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
      setErrorGeneral(obtenerTexto('auth.avisoPrivacidad.noAbre'));
      return;
    }
    openBrowserAsync(url).catch(() => {
      setErrorGeneral(obtenerTexto('auth.avisoPrivacidad.noAbre'));
    });
  };

  return {
    estado,
    mensajeError: estado === 'error' ? mensajeParaClienta(errorCarga) : null,
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
      if (!guardando && !espera.activa) {
        candado(enviar);
      }
    },
    textoGuardar: espera.texto ?? (guardando ? 'Guardando…' : 'Guardar cambios'),
    guardarEnEspera: espera.activa,
    alergiasAutorizadas: perfil?.datosSensiblesAutorizados === true,
    textoSinAutorizacion: obtenerTexto(
      perfil?.alergiasOcultas ? 'auth.perfil.alergiasOcultas' : 'auth.perfil.alergiasSinAutorizar',
    ),
    textoAutorizar: obtenerTexto('auth.perfil.alergiasAutorizar'),
    autorizacion,
    errorAlergias,
    recargandoAlergias,
    reintentarAlergias: recargarAlergias,
    textoReintentar: obtenerTexto('datosSensibles.app.reintentar'),
    avisoAlergias,
    enfoque,
    ayudaTelefono: AYUDA_TELEFONO,
    tiposCabello: TIPOS_CABELLO,
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
