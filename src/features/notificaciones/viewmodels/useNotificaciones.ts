import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/viewmodels/useAuth';

import { mensajeErrorAvisos, type Aviso } from '../models/avisoModel';

import { borrar, cargarAvisos, leerEstadoAvisos, marcarLeido, marcarTodos, useAvisos } from './avisosEstado';
import { avisosApagados } from './preferenciaAvisosEstado';

// La vista y los componentes no importan de models/: reciben el tipo y la hora relativa de aquí.
export type { Aviso } from '../models/avisoModel';
export { horaRelativa } from '../models/horaRelativa';

/**
 * Qué pinta la bandeja con sesión: skeleton en la primera carga, error con Reintentar si no hay
 * avisos que mostrar, vacío o la lista.
 */
export type VistaNotificaciones = 'cargando' | 'error' | 'vacio' | 'lista';

export interface NotificacionesViewModel {
  conSesion: boolean;
  vista: VistaNotificaciones;
  /** Del más reciente al más viejo. */
  avisos: Aviso[];
  noLeidos: number;
  /** Mensaje amable de la carga que falló (vista 'error'); nunca el texto del servidor. */
  mensajeError: string | null;
  /**
   * Línea de error arriba de la lista: falló marcar, marcar todas o borrar, o falló una recarga
   * con la lista ya a la vista (la lista se conserva).
   */
  avisoError: string | null;
  refrescando: boolean;
  /** Momento con el que se calcula la hora relativa ("Hace 5 min"); cambia al enfocar y al refrescar. */
  ahora: number;
  /** Reintentar tras un error de carga (vuelve al skeleton). */
  recargar: () => void;
  /** Deslizar para actualizar: conserva la lista mientras carga. */
  refrescar: () => void;
  /** Marca el aviso como leído (al instante) y, si tiene destino, lo abre. Referencia estable. */
  abrirAviso: (aviso: Aviso) => void;
  /** Borra el aviso (al instante; vuelve a su lugar si el servidor falla). Referencia estable. */
  borrarAviso: (id: string) => void;
  /** Deshabilitada si no hay avisos sin leer. */
  marcarTodas: () => void;
  regresar: () => void;
}

/**
 * Bandeja de avisos internos (GP-07.2). La lista vive en el estado compartido de avisosEstado: la
 * llena useAvisosEnVivo al iniciar sesión y la mantiene al día la conexión en vivo, así que aquí
 * solo se pide si aún no se cargó o la última carga falló. Los avisos llegan solo con la app abierta
 * y en primer plano; no hay notificaciones push.
 */
export function useNotificaciones(): NotificacionesViewModel {
  const router = useRouter();
  const { estado: sesion } = useAuth();
  const conSesion = sesion === 'autenticado';
  const { avisos, noLeidos, estado, error } = useAvisos();
  const [refrescando, setRefrescando] = useState(false);
  const [errorAccion, setErrorAccion] = useState<string | null>(null);
  const [ahora, setAhora] = useState(() => Date.now());
  // Nada se escribe con la pantalla desmontada.
  const montada = useRef(true);
  // Un doble toque no abre dos pantallas; se libera al volver a enfocar.
  const navegando = useRef(false);

  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
    };
  }, []);

  /** Guarda el mensaje amable de una acción que falló (solo con la pantalla montada). */
  const avisarFallo = useCallback((causa: unknown, accion: 'marcar' | 'marcarTodas' | 'borrar') => {
    if (montada.current) {
      setErrorAccion(mensajeErrorAvisos(causa, accion));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      navegando.current = false;
      setAhora(Date.now());
      if (!conSesion) {
        setErrorAccion(null);
        return;
      }
      // Ya cargada (o cargando) no se vuelve a pedir: la conexión en vivo la mantiene al día. Con
      // "Avisos en la app" apagado no hay conexión: se pide cada vez que se abre.
      const actual = leerEstadoAvisos().estado;
      if (actual === 'inicial' || actual === 'error' || avisosApagados()) {
        void cargarAvisos();
      }
    }, [conSesion]),
  );

  const recargar = useCallback(() => {
    if (conSesion) {
      setErrorAccion(null);
      void cargarAvisos();
    }
  }, [conSesion]);

  const refrescar = useCallback(() => {
    if (!conSesion) {
      return;
    }
    setErrorAccion(null);
    setRefrescando(true);
    // cargarAvisos nunca rechaza: un error queda en el estado compartido.
    void cargarAvisos().finally(() => {
      if (montada.current) {
        setRefrescando(false);
        setAhora(Date.now());
      }
    });
  }, [conSesion]);

  const abrirAviso = useCallback(
    (aviso: Aviso) => {
      setErrorAccion(null);
      if (!aviso.leida) {
        marcarLeido(aviso.id).catch((causa: unknown) => avisarFallo(causa, 'marcar'));
      }
      if (aviso.destino && !navegando.current) {
        navegando.current = true;
        router.push(aviso.destino as Href);
      }
    },
    [router, avisarFallo],
  );

  const borrarAviso = useCallback(
    (id: string) => {
      setErrorAccion(null);
      borrar(id).catch((causa: unknown) => avisarFallo(causa, 'borrar'));
    },
    [avisarFallo],
  );

  const marcarTodas = useCallback(() => {
    if (leerEstadoAvisos().noLeidos === 0) {
      return;
    }
    setErrorAccion(null);
    marcarTodos().catch((causa: unknown) => avisarFallo(causa, 'marcarTodas'));
  }, [avisarFallo]);

  const regresar = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      // Abierta sin nada debajo (por ejemplo, desde un enlace): lleva a Inicio.
      router.dismissTo('/inicio');
    }
  }, [router]);

  let vista: VistaNotificaciones = 'cargando';
  if (avisos.length > 0) {
    vista = 'lista';
  } else if (estado === 'listo' || refrescando) {
    // Al deslizar sobre la bandeja vacía se queda el vacío con su indicador, sin volver al skeleton.
    vista = 'vacio';
  } else if (estado === 'error') {
    vista = 'error';
  }

  // Con la lista a la vista, una recarga que falla no la quita: se avisa en la línea de error.
  const avisoError = errorAccion ?? (vista !== 'error' && estado === 'error' ? error : null);

  return {
    conSesion,
    vista,
    avisos,
    noLeidos,
    mensajeError: error,
    avisoError,
    refrescando,
    ahora,
    recargar,
    refrescar,
    abrirAviso,
    borrarAviso,
    marcarTodas,
    regresar,
  };
}
