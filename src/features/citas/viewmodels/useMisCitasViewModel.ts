import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { MENSAJE_SIN_CONEXION, esErrorDeRed } from '@/features/auth/models/AuthModel';
import { useAuth } from '@/features/auth/viewmodels/useAuth';

import { listarMisCitas, separarMisCitas, type Cita } from '../models/citaModel';
import { obtenerServicios } from '../models/servicioModel';

export type EstadoMisCitas = 'cargando' | 'listo' | 'error';

export interface MisCitasViewModel {
  /** 'cargando' solo en la primera carga (o al reintentar sin datos): con datos, recarga en silencio. */
  estado: EstadoMisCitas;
  /** Vigentes de hoy en adelante, de la más cercana a la más lejana. */
  proximas: Cita[];
  /** Las demás, de la más reciente a la más antigua. */
  historial: Cita[];
  /** Mensaje para la clienta con estado 'error' (sin red o genérico); null si no hay error. */
  mensajeError: string | null;
  /** Falló un pull to refresh con la lista ya cargada: la lista se conserva y se avisa aquí. */
  avisoRefresco: string | null;
  /** Pull to refresh en curso. */
  refrescando: boolean;
  /** Reintentar tras un error: muestra el skeleton si aún no hay citas. */
  recargar: () => void;
  /** Pull to refresh: conserva la lista mientras carga. */
  refrescar: () => void;
  /** Abre el detalle de la cita. */
  abrirCita: (cita: Cita) => void;
  /**
   * El servicio de la cita sigue en el catálogo público (solo trae servicios activos). Sin catálogo
   * (aún no carga o falló) es false: el botón no se muestra.
   */
  puedeReservarIgual: (cita: Cita) => boolean;
  /** Abre la reserva del mismo servicio con la misma especialista ya elegida. */
  reservarIgual: (cita: Cita) => void;
}

/** Cómo se pide la lista: con skeleton, en silencio (al volver a la pantalla) o con pull to refresh. */
type ModoCarga = 'completo' | 'silencioso' | 'refresco';

const MENSAJE_GENERICO = 'Algo salió mal al traer tus citas. Intenta de nuevo en un momento.';
const MENSAJE_REFRESCO = 'No pudimos actualizar tus citas. Desliza hacia abajo para intentar de nuevo.';

function mensajeDeError(error: unknown): string {
  return esErrorDeRed(error) ? MENSAJE_SIN_CONEXION : MENSAJE_GENERICO;
}

/**
 * Mis citas (GP-06.3): lista de la clienta en sesión separada en próximas e historial. Carga al
 * enfocar la pantalla (la primera vez con skeleton; después en silencio) y solo con sesión.
 */
export function useMisCitasViewModel(): MisCitasViewModel {
  const router = useRouter();
  const { estado: sesion } = useAuth();
  const [estado, setEstado] = useState<EstadoMisCitas>('cargando');
  const [proximas, setProximas] = useState<Cita[]>([]);
  const [historial, setHistorial] = useState<Cita[]>([]);
  const [mensajeError, setMensajeError] = useState<string | null>(null);
  const [avisoRefresco, setAvisoRefresco] = useState<string | null>(null);
  const [refrescando, setRefrescando] = useState(false);
  // Ids (en texto) de los servicios activos del catálogo público; vacío si no ha cargado o falló.
  const [serviciosActivos, setServiciosActivos] = useState<ReadonlySet<string>>(() => new Set());
  // Solo la última solicitud escribe el estado: una respuesta vieja no pisa a una nueva y nada se
  // escribe con la pantalla desmontada.
  const solicitud = useRef(0);
  // Ya hay una lista mostrada: las recargas siguientes no vuelven al skeleton.
  const hayDatos = useRef(false);

  const cargar = useCallback((modo: ModoCarga) => {
    solicitud.current += 1;
    const id = solicitud.current;
    if (modo === 'refresco') {
      setRefrescando(true);
    }
    if (modo === 'completo' && !hayDatos.current) {
      setEstado('cargando');
      setMensajeError(null);
    }
    // El catálogo va aparte: si falla, la lista se muestra igual y solo falta "Reservar lo mismo".
    // Si ya había un catálogo cargado, un fallo lo conserva.
    obtenerServicios()
      .then((servicios) => {
        if (id !== solicitud.current) {
          return;
        }
        setServiciosActivos(
          new Set(
            servicios
              .filter((servicio) => servicio.activo !== false && String(servicio.id) !== '')
              .map((servicio) => String(servicio.id)),
          ),
        );
      })
      .catch(() => {
        // Sin catálogo no se ofrece reservar de nuevo; la lista no se bloquea.
      });
    listarMisCitas()
      .then((citas) => {
        if (id !== solicitud.current) {
          return;
        }
        const separadas = separarMisCitas(citas);
        hayDatos.current = true;
        setProximas(separadas.proximas);
        setHistorial(separadas.historial);
        setMensajeError(null);
        setAvisoRefresco(null);
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (id !== solicitud.current) {
          return;
        }
        if (hayDatos.current) {
          // Con la lista ya mostrada, una recarga silenciosa que falla no la quita.
          if (modo === 'refresco') {
            setAvisoRefresco(esErrorDeRed(error) ? MENSAJE_SIN_CONEXION : MENSAJE_REFRESCO);
          }
          return;
        }
        setMensajeError(mensajeDeError(error));
        setEstado('error');
      })
      .finally(() => {
        if (id === solicitud.current) {
          setRefrescando(false);
        }
      });
  }, []);

  // Al enfocar (y cuando cambia la sesión con la pantalla enfocada): primera carga con skeleton,
  // las siguientes en silencio. Sin sesión se descarta lo cargado y cualquier respuesta pendiente.
  useFocusEffect(
    useCallback(() => {
      if (sesion !== 'autenticado') {
        solicitud.current += 1;
        hayDatos.current = false;
        setProximas([]);
        setHistorial([]);
        setServiciosActivos(new Set());
        setMensajeError(null);
        setAvisoRefresco(null);
        setRefrescando(false);
        setEstado('cargando');
        return;
      }
      cargar(hayDatos.current ? 'silencioso' : 'completo');
    }, [sesion, cargar]),
  );

  useEffect(
    () => () => {
      solicitud.current += 1;
    },
    [],
  );

  const recargar = useCallback(() => {
    if (sesion === 'autenticado') {
      cargar('completo');
    }
  }, [sesion, cargar]);

  const refrescar = useCallback(() => {
    if (sesion === 'autenticado') {
      cargar('refresco');
    }
  }, [sesion, cargar]);

  const abrirCita = useCallback(
    (cita: Cita) => {
      router.push(`/cita/${encodeURIComponent(String(cita.id))}` as Href);
    },
    [router],
  );

  const puedeReservarIgual = useCallback(
    (cita: Cita) => String(cita.servicioId) !== '' && serviciosActivos.has(String(cita.servicioId)),
    [serviciosActivos],
  );

  const reservarIgual = useCallback(
    (cita: Cita) => {
      const servicioId = String(cita.servicioId);
      if (servicioId === '') {
        return;
      }
      const especialistaId = String(cita.especialistaId);
      const consulta = especialistaId ? `?especialistaId=${encodeURIComponent(especialistaId)}` : '';
      router.push(`/reservar/${encodeURIComponent(servicioId)}${consulta}` as Href);
    },
    [router],
  );

  return {
    estado,
    proximas,
    historial,
    mensajeError,
    avisoRefresco,
    refrescando,
    recargar,
    refrescar,
    abrirCita,
    puedeReservarIgual,
    reservarIgual,
  };
}
