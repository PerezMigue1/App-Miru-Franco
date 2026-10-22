import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { esErrorDeRed, MENSAJE_SIN_CONEXION } from '@/features/auth/models/AuthModel';
import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { ApiError } from '@/shared/api/apiClient';
import { useCandado } from '@/shared/ui/useCandado';

import {
  compararMeses,
  crearCita,
  esHorarioOcupado,
  fechaLocal,
  mensajeAnticipoParaClienta,
  mesDe,
  mesDeFecha,
  obtenerDisponibilidad,
  obtenerEspecialistas,
  pideAnticipo,
  sumarMeses,
  type Disponibilidad,
  type Especialista,
  type MesCalendario,
  type PagoAnticipo,
  type Slot,
} from '../models/citaModel';
import { obtenerServicio, type Servicio } from '../models/servicioModel';
import { useCalendarioCitas, type BloqueosCalendario } from './useCalendarioCitas';

// La vista no importa de models/: recibe esta función del viewmodel.
export { fechaLegible } from '../models/citaModel';

export type PasoReserva = 1 | 2 | 3;
export type EstadoReserva = 'cargando' | 'listo' | 'error' | 'noEncontrado';
export type EstadoHorarios = 'inactivo' | 'cargando' | 'listo' | 'error';
/**
 * Cómo se aparta la cita: 'linea' abre el pago del anticipo con Mercado Pago al reservar;
 * 'salon' solo aparta y lleva a la confirmación (también es el botón único sin anticipo).
 * Solo si el servicio pide anticipo se manda al backend como pagoAnticipo.
 */
export type ModoReserva = PagoAnticipo;

/** Nombres de los pasos, en orden, para el indicador. */
export const PASOS_RESERVA = ['Especialista', 'Día y hora', 'Confirmar'] as const;

const ERROR_RESERVA = 'No pudimos reservar tu cita. Intenta de nuevo.';
const ERROR_HORARIOS = 'No pudimos cargar los horarios de este día.';

export interface ReservarCitaViewModel {
  estado: EstadoReserva;
  recargar: () => void;
  /** Servicio inexistente o retirado: lleva al catálogo. */
  verServicios: () => void;
  servicio: Servicio | null;
  especialistas: Especialista[];

  paso: PasoReserva;
  /** 1 al avanzar y -1 al regresar: de qué lado entra el paso nuevo. */
  direccion: 1 | -1;

  especialista: Especialista | null;
  elegirEspecialista: (especialista: Especialista) => void;

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
  estadoHorarios: EstadoHorarios;
  disponibilidad: Disponibilidad | null;
  /** Respaldo del catálogo cuando el backend dice que no abre y no manda su motivo. */
  motivoCerrado: string;
  /** Mensaje propio cuando fallan los horarios ('' si no hay error). */
  errorHorarios: string;
  recargarHorarios: () => void;
  /** El horario elegido se ocupó al confirmar: se pide elegir otro. */
  horarioOcupado: boolean;

  slot: Slot | null;
  elegirHorario: (slot: Slot) => void;

  notas: string;
  setNotas: (texto: string) => void;
  enviando: boolean;
  /** Botón que se está enviando ('linea' o 'salon'), o null si no se envía nada. */
  modoEnvio: ModoReserva | null;
  /** Mensaje propio del último intento de reservar, o null. */
  errorEnvio: string | null;
  confirmar: (modo: ModoReserva) => void;

  /** Paso anterior; en el primero sale al detalle. No hace nada mientras se envía. */
  atras: () => void;
}

/**
 * Las especialistas que puede elegir la clienta: las del servicio (cruzadas con las de la agenda
 * para tener puesto y foto) o, si el servicio no trae ninguna, todas las de la agenda.
 */
function especialistasDelServicio(servicio: Servicio, agenda: Especialista[]): Especialista[] {
  const propias = servicio.especialistas.filter((especialista) => String(especialista.id) !== '');
  if (propias.length === 0) {
    return agenda;
  }
  return propias.map((propia) => {
    const completa = agenda.find((item) => String(item.id) === String(propia.id));
    if (!completa) {
      return { ...propia, especialidades: [] };
    }
    return { ...completa, foto: completa.foto ?? propia.foto };
  });
}

/**
 * Reservar una cita en tres pasos: especialista, día y hora, y confirmar (GP-06.2). Con
 * `especialistaIdInicial` válida para el servicio ("Reservar lo mismo"), arranca en Día y hora.
 */
export function useReservarCitaViewModel(
  servicioId: string | undefined,
  especialistaIdInicial?: string,
): ReservarCitaViewModel {
  const router = useRouter();
  const { usuario } = useAuth();
  const candado = useCandado();

  const [estado, setEstado] = useState<EstadoReserva>('cargando');
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [especialistas, setEspecialistas] = useState<Especialista[]>([]);

  const [paso, setPaso] = useState<PasoReserva>(1);
  const [direccion, setDireccion] = useState<1 | -1>(1);
  const [especialista, setEspecialista] = useState<Especialista | null>(null);

  const [mesVisible, setMesVisible] = useState<MesCalendario>(() => mesDe());
  const [fecha, setFecha] = useState<string | null>(null);
  const [estadoHorarios, setEstadoHorarios] = useState<EstadoHorarios>('inactivo');
  const [disponibilidad, setDisponibilidad] = useState<Disponibilidad | null>(null);
  const [errorHorarios, setErrorHorarios] = useState('');
  const [horarioOcupado, setHorarioOcupado] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [notas, setNotas] = useState('');
  const [modoEnvio, setModoEnvio] = useState<ModoReserva | null>(null);
  const enviando = modoEnvio !== null;
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);

  // Solo la última solicitud escribe el estado (reintentos rápidos, cambio de día o pantalla desmontada).
  const solicitudServicio = useRef(0);
  const solicitudHorarios = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      solicitudServicio.current += 1;
      solicitudHorarios.current += 1;
    };
  }, []);

  const cargarHorarios = useCallback(
    (especialistaId: string | number, dia: string, idServicio: string | number) => {
      solicitudHorarios.current += 1;
      const actual = solicitudHorarios.current;
      setEstadoHorarios('cargando');
      setDisponibilidad(null);
      setErrorHorarios('');
      obtenerDisponibilidad({ especialistaId, fecha: dia, servicioId: idServicio })
        .then((respuesta) => {
          if (actual !== solicitudHorarios.current) {
            return;
          }
          setDisponibilidad(respuesta);
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

  /** Sin día elegido: se olvidan los horarios (y la respuesta pendiente) y el horario elegido. */
  const sinDia = useCallback(() => {
    solicitudHorarios.current += 1;
    setFecha(null);
    setSlot(null);
    setHorarioOcupado(false);
    setDisponibilidad(null);
    setErrorHorarios('');
    setEstadoHorarios('inactivo');
  }, []);

  /** Con una configuración nueva el día elegido quedó sin citas: se limpia y, si estaba en Confirmar, regresa. */
  const alBloquearseDia = useCallback(() => {
    sinDia();
    if (paso === 3) {
      setDireccion(-1);
      setPaso(2);
    }
  }, [sinDia, paso]);

  const calendario = useCalendarioCitas(mesVisible, fecha, alBloquearseDia);
  const { estaBloqueado, primerDiaLibre } = calendario;

  /**
   * Fija a la especialista y empieza día y hora por hoy o, si hoy no hay citas por la configuración,
   * por el siguiente día libre, en su mes (día y hora anteriores se limpian). Lo usan elegir
   * especialista y la especialista que llega en la ruta.
   */
  const empezarDiaHora = useCallback(
    (elegida: Especialista, idServicio: string | number) => {
      const ahora = new Date();
      const dia = primerDiaLibre(fechaLocal(ahora));
      setEspecialista(elegida);
      setMesVisible(dia ? mesDeFecha(dia) : mesDe(ahora));
      if (!dia) {
        sinDia();
        return;
      }
      setSlot(null);
      setHorarioOcupado(false);
      setFecha(dia);
      cargarHorarios(elegida.id, dia, idServicio);
    },
    [cargarHorarios, primerDiaLibre, sinDia],
  );

  // La especialista de la ruta se aplica una sola vez, en la primera carga que sale bien.
  const especialistaInicialAplicada = useRef(false);

  const recargar = useCallback(() => {
    solicitudServicio.current += 1;
    const actual = solicitudServicio.current;
    const idLimpio = servicioId?.trim() ?? '';
    if (idLimpio === '') {
      setServicio(null);
      setEstado('noEncontrado');
      return;
    }
    setEstado('cargando');
    // La agenda se pide en paralelo; si falla y el servicio trae sus especialistas, bastan esas.
    Promise.all([
      obtenerServicio(idLimpio),
      obtenerEspecialistas().then(
        (lista) => ({ lista, error: null as unknown }),
        (error: unknown) => ({ lista: [] as Especialista[], error }),
      ),
    ])
      .then(([respuesta, agenda]) => {
        if (actual !== solicitudServicio.current) {
          return;
        }
        if (respuesta.activo === false) {
          setServicio(null);
          setEstado('noEncontrado');
          return;
        }
        const sinPropias = respuesta.especialistas.every((item) => String(item.id) === '');
        if (agenda.error != null && sinPropias) {
          setServicio(null);
          setEstado('error');
          return;
        }
        const disponibles = especialistasDelServicio(respuesta, agenda.lista);
        setServicio(respuesta);
        setEspecialistas(disponibles);
        if (!especialistaInicialAplicada.current) {
          especialistaInicialAplicada.current = true;
          // "Reservar lo mismo": si la especialista sigue entre las del servicio, se empieza en Día y
          // hora con ella elegida; atrás regresa al paso de especialista para cambiarla.
          const idInicial = especialistaIdInicial?.trim() ?? '';
          const inicial = idInicial
            ? disponibles.find((item) => String(item.id) === idInicial)
            : undefined;
          if (inicial) {
            empezarDiaHora(inicial, respuesta.id);
            setDireccion(1);
            setPaso(2);
          }
        }
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (actual !== solicitudServicio.current) {
          return;
        }
        setServicio(null);
        setEstado(error instanceof ApiError && error.status === 404 ? 'noEncontrado' : 'error');
      });
  }, [servicioId, especialistaIdInicial, empezarDiaHora]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  const irAPaso = useCallback((nuevo: PasoReserva, sentido: 1 | -1) => {
    setDireccion(sentido);
    setPaso(nuevo);
  }, []);

  const elegirEspecialista = useCallback(
    (elegida: Especialista) => {
      if (!servicio || enviando) {
        return;
      }
      const misma = especialista != null && String(especialista.id) === String(elegida.id);
      setErrorEnvio(null);
      if (!misma || fecha == null) {
        // Otra especialista: día y hora se limpian y se empieza por hoy, en el mes actual.
        empezarDiaHora(elegida, servicio.id);
      } else if (estadoHorarios === 'error') {
        cargarHorarios(elegida.id, fecha, servicio.id);
      }
      irAPaso(2, 1);
    },
    [servicio, enviando, especialista, fecha, estadoHorarios, cargarHorarios, empezarDiaHora, irAPaso],
  );

  const elegirDia = useCallback(
    (dia: string) => {
      // Un día pasado no tiene horarios; las fechas 'YYYY-MM-DD' locales se comparan como texto.
      const pasado = dia < fechaLocal(new Date());
      if (!servicio || !especialista || enviando || dia === fecha || pasado || estaBloqueado(dia)) {
        return;
      }
      setFecha(dia);
      setSlot(null);
      setHorarioOcupado(false);
      cargarHorarios(especialista.id, dia, servicio.id);
    },
    [servicio, especialista, enviando, fecha, cargarHorarios, estaBloqueado],
  );

  const cambiarMes = useCallback((delta: 1 | -1) => {
    setMesVisible((actual) => {
      const nuevo = sumarMeses(actual, delta);
      return compararMeses(nuevo, mesDe()) < 0 ? actual : nuevo;
    });
  }, []);

  const recargarHorarios = useCallback(() => {
    if (!servicio || !especialista || !fecha) {
      return;
    }
    cargarHorarios(especialista.id, fecha, servicio.id);
  }, [servicio, especialista, fecha, cargarHorarios]);

  const elegirHorario = useCallback(
    (elegido: Slot) => {
      if (enviando) {
        return;
      }
      setSlot(elegido);
      setHorarioOcupado(false);
      setErrorEnvio(null);
      irAPaso(3, 1);
    },
    [enviando, irAPaso],
  );

  const salir = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    const id = servicioId?.trim() ?? '';
    router.replace((id ? `/servicio/${encodeURIComponent(id)}` : '/citas') as Href);
  }, [router, servicioId]);

  const verServicios = useCallback(() => {
    router.replace('/citas');
  }, [router]);

  const atras = useCallback(() => {
    if (enviando) {
      return;
    }
    if (paso === 3) {
      setErrorEnvio(null);
      irAPaso(2, -1);
    } else if (paso === 2) {
      irAPaso(1, -1);
    } else {
      salir();
    }
  }, [enviando, paso, irAPaso, salir]);

  // El botón Atrás de Android regresa un paso; la pulsación se consume siempre (también al enviar).
  const refAtras = useRef(atras);
  useEffect(() => {
    refAtras.current = atras;
  });
  useFocusEffect(
    useCallback(() => {
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        refAtras.current();
        return true;
      });
      return () => suscripcion.remove();
    }, []),
  );

  const confirmar = useCallback(
    (modo: ModoReserva) => {
      // Un solo candado para los dos botones: el segundo toque se ignora mientras se envía.
      candado(async () => {
        // Sin sesión la ruta no existe; aun así, sin clienta no se envía nada.
        if (!usuario || !servicio || !especialista || !slot || !fecha) {
          return;
        }
        setModoEnvio(modo);
        setErrorEnvio(null);
        try {
          const cita = await crearCita({
            clienteId: usuario.id,
            especialistaId: especialista.id,
            servicioId: servicio.id,
            fechaHoraInicio: slot.inicio,
            fechaHoraFin: slot.fin,
            notas,
            // Sin anticipo en el servicio no se manda: el botón único no debe dejar una cita por pagar
            // en el salón si el backend sí lo pidiera (usa 'linea' por omisión).
            pagoAnticipo: servicio.anticipo ? modo : undefined,
          });
          if (!montado.current) {
            return;
          }
          const citaId = encodeURIComponent(String(cita.id));
          // Pagar en línea abre Mercado Pago al llegar (pagar=1); si la cita ya no pide anticipo, o se
          // paga en el salón, va directo a la confirmación.
          // Las rutas de anticipo y confirmación aún no están en los tipos generados de Expo Router.
          router.replace(
            (modo === 'linea' && pideAnticipo(cita)
              ? `/anticipo/${citaId}?pagar=1`
              : `/cita-confirmada/${citaId}`) as Href,
          );
        } catch (error: unknown) {
          if (!montado.current) {
            return;
          }
          setModoEnvio(null);
          if (esHorarioOcupado(error)) {
            // Alguien más tomó ese horario: de vuelta a elegir hora con la disponibilidad al día.
            setSlot(null);
            setHorarioOcupado(true);
            irAPaso(2, -1);
            cargarHorarios(especialista.id, fecha, servicio.id);
            return;
          }
          // Los 400 del anticipo traen un texto ya escrito para la clienta; cualquier otro, el genérico.
          const mensajeAnticipo = mensajeAnticipoParaClienta(error);
          if (mensajeAnticipo) {
            setErrorEnvio(mensajeAnticipo);
            return;
          }
          setErrorEnvio(esErrorDeRed(error) ? MENSAJE_SIN_CONEXION : ERROR_RESERVA);
        }
      });
    },
    [candado, usuario, servicio, especialista, slot, fecha, notas, router, irAPaso, cargarHorarios],
  );

  return {
    estado,
    recargar,
    verServicios,
    servicio,
    especialistas,
    paso,
    direccion,
    especialista,
    elegirEspecialista,
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
    horarioOcupado,
    slot,
    elegirHorario,
    notas,
    setNotas,
    enviando,
    modoEnvio,
    errorEnvio,
    confirmar,
    atras,
  };
}
