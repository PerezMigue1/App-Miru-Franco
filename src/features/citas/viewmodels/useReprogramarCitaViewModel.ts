import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { esErrorDeRed, MENSAJE_SIN_CONEXION } from '@/features/auth/models/AuthModel';
import { ApiError } from '@/shared/api/apiClient';
import { useCandado } from '@/shared/ui/useCandado';

import {
  admiteCambios,
  compararMeses,
  esHorarioOcupado,
  fechaLocal,
  mensajeReprogramacion,
  mesDe,
  obtenerCita,
  obtenerDisponibilidad,
  reprogramarCita,
  sumarMeses,
  type Cita,
  type Disponibilidad,
  type MesCalendario,
  type Slot,
} from '../models/citaModel';

/** 'sinCambios': la cita ya no se puede reprogramar (terminó, se canceló o está en curso). */
export type EstadoReprogramar = 'cargando' | 'listo' | 'error' | 'noEncontrado' | 'sinCambios';
export type EstadoHorariosReprogramar = 'inactivo' | 'cargando' | 'listo' | 'error';

const ERROR_HORARIOS = 'No pudimos cargar los horarios de este día.';

export interface ReprogramarCitaViewModel {
  estado: EstadoReprogramar;
  cita: Cita | null;
  /** Vuelve a cargar la cita con skeleton (botón Reintentar). */
  recargar: () => void;
  /** Regresa al detalle de la cita; no hace nada mientras se guarda el cambio. */
  regresar: () => void;

  /** Mes que muestra el calendario; cambiarlo no cambia el día elegido. */
  mesVisible: MesCalendario;
  /** Mes anterior (-1) o siguiente (1); nunca antes del mes actual. */
  cambiarMes: (delta: 1 | -1) => void;
  /** 'YYYY-MM-DD' local del día elegido, o null. */
  fecha: string | null;
  elegirDia: (fecha: string) => void;
  estadoHorarios: EstadoHorariosReprogramar;
  /** Disponibilidad del día sin el horario que la cita ya tiene. */
  disponibilidad: Disponibilidad | null;
  /** Mensaje propio cuando fallan los horarios ('' si no hay error). */
  errorHorarios: string;
  recargarHorarios: () => void;

  /** Nuevo horario elegido, o null. */
  slot: Slot | null;
  elegirHorario: (slot: Slot) => void;

  enviando: boolean;
  /** Mensaje para la clienta del último intento de reprogramar, o null. */
  errorEnvio: string | null;
  /** Mueve la cita al horario elegido y regresa al detalle. */
  confirmar: () => void;
}

/** Milisegundos de un ISO; NaN si no se puede leer. */
function enMs(iso: string): number {
  return new Date(iso).getTime();
}

/**
 * Primer día que muestra el calendario: el de la cita si es hoy o después; si no, hoy. Las fechas
 * 'YYYY-MM-DD' locales se comparan como texto.
 */
function diaInicial(cita: Cita, ahora: Date): string {
  const hoy = fechaLocal(ahora);
  const inicio = new Date(cita.fechaHoraInicio);
  if (Number.isNaN(inicio.getTime())) {
    return hoy;
  }
  const dia = fechaLocal(inicio);
  return dia >= hoy ? dia : hoy;
}

/**
 * Reprogramar una cita de la clienta (GP-06.3): misma especialista y mismo servicio, otro día u otra
 * hora. El calendario y la carga de horarios siguen las mismas reglas que la reserva.
 */
export function useReprogramarCitaViewModel(citaId: string | undefined): ReprogramarCitaViewModel {
  const router = useRouter();
  const candado = useCandado();

  const [estado, setEstado] = useState<EstadoReprogramar>('cargando');
  const [cita, setCita] = useState<Cita | null>(null);

  const [mesVisible, setMesVisible] = useState<MesCalendario>(() => mesDe());
  const [fecha, setFecha] = useState<string | null>(null);
  const [estadoHorarios, setEstadoHorarios] = useState<EstadoHorariosReprogramar>('inactivo');
  const [disponibilidadDia, setDisponibilidadDia] = useState<Disponibilidad | null>(null);
  const [errorHorarios, setErrorHorarios] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Solo la última solicitud escribe el estado (reintentos rápidos, cambio de día o pantalla desmontada).
  const solicitudCita = useRef(0);
  const solicitudHorarios = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      solicitudCita.current += 1;
      solicitudHorarios.current += 1;
    };
  }, []);

  const idLimpio = citaId?.trim() ?? '';

  const cargarHorarios = useCallback(
    (especialistaId: string | number, dia: string, servicioId: string | number) => {
      solicitudHorarios.current += 1;
      const actual = solicitudHorarios.current;
      setEstadoHorarios('cargando');
      setDisponibilidadDia(null);
      setErrorHorarios('');
      obtenerDisponibilidad({ especialistaId, fecha: dia, servicioId })
        .then((respuesta) => {
          if (actual !== solicitudHorarios.current) {
            return;
          }
          setDisponibilidadDia(respuesta);
          setEstadoHorarios('listo');
        })
        .catch((error: unknown) => {
          if (actual !== solicitudHorarios.current) {
            return;
          }
          setErrorHorarios(esErrorDeRed(error) ? MENSAJE_SIN_CONEXION : ERROR_HORARIOS);
          setEstadoHorarios('error');
        });
    },
    [],
  );

  const recargar = useCallback(() => {
    solicitudCita.current += 1;
    const actual = solicitudCita.current;
    // Una respuesta de horarios pendiente de una carga anterior ya no aplica.
    solicitudHorarios.current += 1;
    setSlot(null);
    setErrorEnvio(null);
    setEstadoHorarios('inactivo');
    setDisponibilidadDia(null);
    if (idLimpio === '') {
      setCita(null);
      setEstado('noEncontrado');
      return;
    }
    setEstado('cargando');
    obtenerCita(idLimpio)
      .then((respuesta) => {
        if (actual !== solicitudCita.current) {
          return;
        }
        setCita(respuesta);
        // Sin especialista o sin servicio no hay horarios que pedir.
        const sinDatos = String(respuesta.especialistaId) === '' || String(respuesta.servicioId) === '';
        if (!admiteCambios(respuesta) || sinDatos) {
          setEstado('sinCambios');
          return;
        }
        const ahora = new Date();
        const dia = diaInicial(respuesta, ahora);
        const [anio, mes] = dia.split('-').map(Number);
        setMesVisible({ anio, mes: mes - 1 });
        setFecha(dia);
        setEstado('listo');
        cargarHorarios(respuesta.especialistaId, dia, respuesta.servicioId);
      })
      .catch((error: unknown) => {
        if (actual !== solicitudCita.current) {
          return;
        }
        setCita(null);
        setEstado(error instanceof ApiError && error.status === 404 ? 'noEncontrado' : 'error');
      });
  }, [idLimpio, cargarHorarios]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const salir = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    // Sin pantalla anterior (enlace directo): al detalle de la cita o a Mis citas.
    router.replace(
      (idLimpio ? `/cita/${encodeURIComponent(idLimpio)}` : '/mis-citas') as Href,
    );
  }, [router, idLimpio]);

  // Mientras se guarda el cambio no se sale: el resultado se perdería.
  const regresar = useCallback(() => {
    if (!enviando) {
      salir();
    }
  }, [enviando, salir]);

  const elegirDia = useCallback(
    (dia: string) => {
      // Un día pasado no tiene horarios; las fechas 'YYYY-MM-DD' locales se comparan como texto.
      if (!cita || enviando || dia === fecha || dia < fechaLocal(new Date())) {
        return;
      }
      setFecha(dia);
      setSlot(null);
      setErrorEnvio(null);
      cargarHorarios(cita.especialistaId, dia, cita.servicioId);
    },
    [cita, enviando, fecha, cargarHorarios],
  );

  const cambiarMes = useCallback((delta: 1 | -1) => {
    setMesVisible((actual) => {
      const nuevo = sumarMeses(actual, delta);
      return compararMeses(nuevo, mesDe()) < 0 ? actual : nuevo;
    });
  }, []);

  const recargarHorarios = useCallback(() => {
    if (!cita || !fecha) {
      return;
    }
    cargarHorarios(cita.especialistaId, fecha, cita.servicioId);
  }, [cita, fecha, cargarHorarios]);

  // El horario que la cita ya tiene no se ofrece: reprogramar al mismo horario no cambia nada.
  const inicioActual = cita ? enMs(cita.fechaHoraInicio) : Number.NaN;
  const disponibilidad = useMemo<Disponibilidad | null>(() => {
    if (!disponibilidadDia || Number.isNaN(inicioActual)) {
      return disponibilidadDia;
    }
    return {
      ...disponibilidadDia,
      slots: disponibilidadDia.slots.filter((item) => enMs(item.inicio) !== inicioActual),
    };
  }, [disponibilidadDia, inicioActual]);

  const elegirHorario = useCallback(
    (elegido: Slot) => {
      if (enviando || enMs(elegido.inicio) === inicioActual) {
        return;
      }
      setSlot(elegido);
      setErrorEnvio(null);
    },
    [enviando, inicioActual],
  );

  const confirmar = useCallback(() => {
    candado(async () => {
      if (!cita || !slot || !fecha) {
        return;
      }
      setEnviando(true);
      setErrorEnvio(null);
      try {
        await reprogramarCita(cita.id, slot);
      } catch (error: unknown) {
        if (!montado.current) {
          return;
        }
        setEnviando(false);
        setErrorEnvio(mensajeReprogramacion(error));
        if (esHorarioOcupado(error)) {
          // Alguien más tomó ese horario: se limpia y se recarga la disponibilidad del día.
          setSlot(null);
          cargarHorarios(cita.especialistaId, fecha, cita.servicioId);
        }
        return;
      }
      if (!montado.current) {
        return;
      }
      // El detalle recarga la cita solo al volver a enfocarse.
      salir();
    });
  }, [candado, cita, slot, fecha, cargarHorarios, salir]);

  return {
    estado,
    cita,
    recargar,
    regresar,
    mesVisible,
    cambiarMes,
    fecha,
    elegirDia,
    estadoHorarios,
    disponibilidad,
    errorHorarios,
    recargarHorarios,
    slot,
    elegirHorario,
    enviando,
    errorEnvio,
    confirmar,
  };
}
