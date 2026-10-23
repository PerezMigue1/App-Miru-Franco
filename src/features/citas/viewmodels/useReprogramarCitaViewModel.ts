import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Linking } from 'react-native';

import { ApiError } from '@/shared/api/apiClient';
import { obtenerConfiguracion, suscribir } from '@/shared/api/configuracionPublica';
import { rutaVisorDocumento } from '@/shared/api/documentosLegales';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useCandado } from '@/shared/ui/useCandado';

import {
  admiteCambios,
  compararMeses,
  esAvisoReagendar,
  esHorarioOcupado,
  esHorarioPasado,
  estadoAnticipo,
  fechaHoraLegible,
  fechaLocal,
  mensajeReprogramacion,
  mesDe,
  mesDeFecha,
  obtenerCita,
  obtenerDisponibilidad,
  reprogramarCita,
  sumarMeses,
  type Cita,
  type Disponibilidad,
  type MesCalendario,
  type Slot,
} from '../models/citaModel';
import {
  avisoAnticipoAlReprogramar,
  avisoFueraDePlazo,
  avisoSinAgenda,
  contactoSalon,
  dentroDelAviso,
  type ContactoSalon,
} from '../models/gestionCitaModel';
import { useCalendarioCitas, type BloqueosCalendario } from './useCalendarioCitas';

// La vista no importa de models/: recibe este tipo del viewmodel.
export type { ContactoSalon } from '../models/gestionCitaModel';

/**
 * 'sinCambios': la cita ya no se puede reprogramar (terminó, se canceló o está en curso).
 * 'fueraDeAviso': faltan menos horas que las de aviso de la regla de la cita; se reagenda con el salón.
 */
export type EstadoReprogramar = 'cargando' | 'listo' | 'error' | 'noEncontrado' | 'sinCambios' | 'fueraDeAviso';
/**
 * 'sinAgenda': la especialista ya no atiende o el servicio ya no se ofrece (404 de la disponibilidad);
 * se reagenda con el salón.
 */
export type EstadoHorariosReprogramar = 'inactivo' | 'cargando' | 'listo' | 'error' | 'sinAgenda';

/** "De" y "A" del cambio, con el mismo formato y la misma zona horaria. */
export interface ResumenCambio {
  de: string;
  a: string;
}


export interface ReprogramarCitaViewModel {
  /** Con estado 'error': por qué no se cargó la cita (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
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
  /**
   * 'YYYY-MM-DD' local del día elegido, o null (sin día libre, o el elegido quedó bloqueado por una
   * configuración nueva y se limpió).
   */
  fecha: string | null;
  /** Días del mes visible sin citas por la configuración del salón, para CalendarioMensual. */
  bloqueos: BloqueosCalendario;
  /** No hace nada con un día pasado o bloqueado. */
  elegirDia: (fecha: string) => void;
  estadoHorarios: EstadoHorariosReprogramar;
  /** Disponibilidad del día sin el horario que la cita ya tiene. */
  disponibilidad: Disponibilidad | null;
  /** Respaldo del catálogo cuando el backend dice que no abre y no manda su motivo. */
  motivoCerrado: string;
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

  /** "De" el horario actual "A" el elegido, o null sin horario elegido. */
  resumenCambio: ResumenCambio | null;
  /** Qué pasa con el anticipo al reprogramar (regla de la cita), o null si no aplica. */
  avisoAnticipo: string | null;
  /** Texto del enlace a la Política de anticipos y cancelación si la cita pide anticipo, o null. */
  enlacePolitica: string | null;
  abrirPolitica: () => void;
  /** "Para reagendar con menos de N horas de anticipación, comunícate con el salón." (regla de la cita). */
  avisoFueraDePlazo: string;
  /** Teléfono y WhatsApp del salón para reagendar con el salón. */
  contacto: ContactoSalon[];
  abrirContacto: (url: string) => void;
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
 * hora. El calendario y la carga de horarios siguen las mismas reglas que la reserva, también los
 * días sin citas de la configuración (GP-07.3). La especialista nunca se cambia por otra: si ya no
 * atiende, el backend responde con error a los horarios y la pantalla lo dice con Reintentar.
 */
export function useReprogramarCitaViewModel(citaId: string | undefined): ReprogramarCitaViewModel {
  const router = useRouter();
  const candado = useCandado();
  const configuracion = useSyncExternalStore(suscribir, obtenerConfiguracion, obtenerConfiguracion);

  const [estado, setEstado] = useState<EstadoReprogramar>('cargando');
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [cita, setCita] = useState<Cita | null>(null);

  const [mesVisible, setMesVisible] = useState<MesCalendario>(() => mesDe());
  const [fecha, setFecha] = useState<string | null>(null);
  const [estadoHorarios, setEstadoHorarios] = useState<EstadoHorariosReprogramar>('inactivo');
  const [disponibilidadDia, setDisponibilidadDia] = useState<Disponibilidad | null>(null);
  const [errorHorarios, setErrorHorarios] = useState('');
  const [slot, setSlot] = useState<Slot | null>(null);

  const [enviando, setEnviando] = useState(false);
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  // Aviso mínimo que mandó el backend al confirmar (con sus horas), si el teléfono no lo vio venir.
  const [avisoDelServidor, setAvisoDelServidor] = useState<string | null>(null);

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

  /** Sin día elegido: se olvidan los horarios (y la respuesta pendiente) y el horario elegido. */
  const sinDia = useCallback(() => {
    solicitudHorarios.current += 1;
    setFecha(null);
    setSlot(null);
    setDisponibilidadDia(null);
    setErrorHorarios('');
    setEstadoHorarios('inactivo');
  }, []);

  const calendario = useCalendarioCitas(mesVisible, fecha, sinDia);
  const { estaBloqueado, primerDiaLibre } = calendario;

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
          // La especialista ya no atiende o el servicio ya no se ofrece: no sirve reintentar, se
          // cancela o se habla con el salón.
          const sinAgenda = avisoSinAgenda(error);
          if (sinAgenda) {
            setErrorHorarios(sinAgenda);
            setEstadoHorarios('sinAgenda');
            return;
          }
          setErrorHorarios(mensajeParaClienta(error, { respaldo: obtenerTexto('citas.errores.horarios') }));
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
        // Con menos aviso del que pide la regla de la cita no se elige horario (el backend lo rechaza).
        if (dentroDelAviso(respuesta)) {
          setEstado('fueraDeAviso');
          return;
        }
        // Si el día de la cita (o hoy) ya no tiene citas por la configuración, el siguiente libre.
        const inicial = diaInicial(respuesta, new Date());
        const dia = primerDiaLibre(inicial);
        setMesVisible(mesDeFecha(dia ?? inicial));
        setEstado('listo');
        if (!dia) {
          sinDia();
          return;
        }
        setFecha(dia);
        cargarHorarios(respuesta.especialistaId, dia, respuesta.servicioId);
      })
      .catch((error: unknown) => {
        if (actual !== solicitudCita.current) {
          return;
        }
        setCita(null);
        setErrorCarga(error);
        setEstado(error instanceof ApiError && error.status === 404 ? 'noEncontrado' : 'error');
      });
  }, [idLimpio, cargarHorarios, primerDiaLibre, sinDia]);

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
      const pasado = dia < fechaLocal(new Date());
      if (!cita || enviando || dia === fecha || pasado || estaBloqueado(dia)) {
        return;
      }
      setFecha(dia);
      setSlot(null);
      setErrorEnvio(null);
      cargarHorarios(cita.especialistaId, dia, cita.servicioId);
    },
    [cita, enviando, fecha, cargarHorarios, estaBloqueado],
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
        // El backend contó menos horas de aviso que el teléfono: se explica y se ofrece el salón.
        if (esAvisoReagendar(error)) {
          setAvisoDelServidor(mensajeReprogramacion(error));
          setSlot(null);
          setEstado('fueraDeAviso');
          return;
        }
        setErrorEnvio(mensajeReprogramacion(error));
        if (esHorarioOcupado(error) || esHorarioPasado(error)) {
          // Alguien más tomó ese horario o ya empezó: se limpia y se recarga la disponibilidad del día.
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

  const abrirPolitica = useCallback(() => {
    router.push(rutaVisorDocumento('anticipos'));
  }, [router]);

  const abrirContacto = useCallback((url: string) => {
    Linking.openURL(url).catch(() => {
      // Sin una app que abra el enlace no hay nada más que hacer aquí.
    });
  }, []);

  return {
    mensajeError: estado === 'error' ? mensajeParaClienta(errorCarga) : null,
    estado,
    cita,
    recargar,
    regresar,
    mesVisible,
    cambiarMes,
    fecha,
    bloqueos: calendario.bloqueos,
    elegirDia,
    estadoHorarios,
    disponibilidad,
    motivoCerrado: calendario.motivoCerrado,
    errorHorarios,
    recargarHorarios,
    slot,
    elegirHorario,
    enviando,
    errorEnvio,
    confirmar,
    // Una sola función de formato para los dos: componentes locales de la fecha ISO, nunca la
    // horaLocal del servidor (podría venir en otra zona que la del teléfono).
    resumenCambio: cita && slot ? { de: fechaHoraLegible(cita.fechaHoraInicio), a: fechaHoraLegible(slot.inicio) } : null,
    avisoAnticipo: cita ? avisoAnticipoAlReprogramar(cita, new Date(), configuracion) : null,
    enlacePolitica:
      cita && estadoAnticipo(cita) !== 'no_requiere' ? obtenerTexto('anticipos.enlacePolitica', {}, configuracion) : null,
    abrirPolitica,
    avisoFueraDePlazo: avisoDelServidor ?? (cita ? avisoFueraDePlazo(cita) : ''),
    contacto: contactoSalon(configuracion),
    abrirContacto,
  };
}
