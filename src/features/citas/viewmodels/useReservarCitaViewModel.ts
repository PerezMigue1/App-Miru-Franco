import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { BackHandler } from 'react-native';

import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { ApiError } from '@/shared/api/apiClient';
import { obtenerConfiguracion, suscribir as suscribirConfiguracion } from '@/shared/api/configuracionPublica';
import { obtenerDocumentoVigente } from '@/shared/api/documentosLegales';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useCandado } from '@/shared/ui/useCandado';

import {
  compararMeses,
  crearCitaVerificada,
  esHorarioOcupado,
  fechaLocal,
  mensajeAnticipoParaClienta,
  mesDe,
  mesDeFecha,
  obtenerDisponibilidad,
  obtenerEspecialistas,
  pideAnticipo,
  ReservaSinConfirmar,
  sumarMeses,
  type Disponibilidad,
  type Especialista,
  type MesCalendario,
  type PagoAnticipo,
  type Slot,
} from '../models/citaModel';
import {
  ErrorConsentimiento,
  esSesionTerminada,
  esVersionNoPublicada,
  MENSAJE_SESION_RESERVA,
  mensajeConsentimiento,
  registrarConsentimientosReserva,
} from '../models/consentimientosReserva';
import { textoFaltaPolitica, textoPoliticaActualizada } from '../models/formaPagoModel';
import { guardarReservaPendiente, tomarReservaPendiente, type ReservaPendiente } from '../models/reservaPendiente';
import { anticipoVigente, obtenerServicio, type Servicio } from '../models/servicioModel';
import {
  botonConfirmar,
  formaPagoReserva,
  opcionVigente,
  type FormaPagoReserva,
  type OpcionAnticipo,
} from './formaPagoReserva';
import { usePoliticaVista } from './useAceptacionAnticipos';
import { useCalendarioCitas, type BloqueosCalendario } from './useCalendarioCitas';

// La vista no importa de models/: recibe esta función del viewmodel.
export { fechaLegible } from '../models/citaModel';
export type { FormaPagoReserva, OpcionFormaPago } from './formaPagoReserva';

export type PasoReserva = 1 | 2 | 3;
export type EstadoReserva = 'cargando' | 'listo' | 'error' | 'noEncontrado';
export type EstadoHorarios = 'inactivo' | 'cargando' | 'listo' | 'error';
/**
 * Cómo se aparta la cita: 'linea' abre el pago del anticipo con Mercado Pago al reservar;
 * 'salon' solo aparta y lleva a la confirmación (también es el envío sin anticipo).
 * Solo si el servicio pide anticipo se manda al backend como pagoAnticipo.
 */
export type ModoReserva = PagoAnticipo;

/** Aviso al recuperar lo elegido después de que la sesión terminó. */
export const AVISO_RESERVA_RECUPERADA =
  'Conservamos lo que elegiste antes de que terminara tu sesión. Revisa los datos y confirma tu cita.';

/** Nombres de los pasos, en orden, para el indicador. */
export const PASOS_RESERVA = ['Especialista', 'Día y hora', 'Confirmar'] as const;


export interface ReservarCitaViewModel {
  /** Con estado 'error': por qué no se pudo preparar la reserva (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
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
  /**
   * Al regresar a la reserva tras una sesión vencida, el horario que había elegido ya no está libre
   * (o su día ya no tiene citas): el aviso que lo dice y pide elegir otro; null si no aplica.
   */
  avisoRegresoOcupado: string | null;

  slot: Slot | null;
  elegirHorario: (slot: Slot) => void;

  notas: string;
  setNotas: (texto: string) => void;

  /** "Confirma tu cita" del catálogo de textos. */
  tituloConfirmar: string;
  /** El anticipo que hoy se pide ("$360"), o null (sin monto, anticipoAplica o anticiposActivos en false). */
  anticipo: string | null;
  /** Textos de la sección "Forma de pago". */
  formaPago: FormaPagoReserva;
  /** Cómo se pagará el anticipo: la elegida si sigue activa o la primera activa. */
  opcionPago: OpcionAnticipo;
  elegirOpcion: (opcion: OpcionAnticipo) => void;
  /** Casilla obligatoria de la Política de anticipos (solo con anticipo); empieza sin marcar. */
  aceptaPolitica: boolean;
  cambiarAceptaPolitica: (marcada: boolean) => void;
  /** Mensaje en la casilla de la política si se intentó confirmar sin marcarla, o null. */
  errorPolitica: string | null;
  /** Casilla opcional de fotos del resultado; empieza sin marcar. */
  autorizaFotos: boolean;
  cambiarAutorizaFotos: (marcada: boolean) => void;
  /** Texto de la casilla de fotos del resultado. */
  textoFotos: string;
  /** Texto del botón final según el anticipo y la opción (con su texto de espera). */
  textoBoton: string;
  /** Lo elegido se recuperó después de que la sesión terminó. */
  recuperada: boolean;

  enviando: boolean;
  /** Lo que se está enviando ('linea' o 'salon'; 'salon' sin anticipo), o null si no se envía nada. */
  modoEnvio: ModoReserva | null;
  /** Mensaje propio del último intento de reservar, o null. */
  errorEnvio: string | null;
  /**
   * No se supo si la cita quedó registrada (sin respuesta y sin poder revisarlo): en lugar de
   * confirmar otra vez, la clienta revisa Mis citas.
   */
  revisarMisCitas: boolean;
  /** Botón de revisarMisCitas ('' si no aplica). */
  textoVerMisCitas: string;
  verMisCitas: () => void;
  /** Registra los consentimientos marcados y, solo si se guardaron, crea la cita. */
  confirmar: () => void;

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
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
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
  const [regresoOcupado, setRegresoOcupado] = useState(false);
  const [slot, setSlot] = useState<Slot | null>(null);

  const [notas, setNotas] = useState('');
  const [modoEnvio, setModoEnvio] = useState<ModoReserva | null>(null);
  const enviando = modoEnvio !== null;
  const [errorEnvio, setErrorEnvio] = useState<string | null>(null);
  const [revisarMisCitas, setRevisarMisCitas] = useState(false);

  // Forma de pago y consentimientos: las casillas empiezan sin marcar.
  const configuracion = useSyncExternalStore(suscribirConfiguracion, obtenerConfiguracion, obtenerConfiguracion);
  const [opcionElegida, setOpcionElegida] = useState<OpcionAnticipo | null>(null);
  const [aceptaPolitica, setAceptaPolitica] = useState(false);
  const [errorPolitica, setErrorPolitica] = useState<string | null>(null);
  const [autorizaFotos, setAutorizaFotos] = useState(false);
  const [recuperada, setRecuperada] = useState(false);
  const anticipo = anticipoVigente(servicio, configuracion);
  const opcionPago = opcionVigente(opcionElegida, configuracion);
  // La versión de la política que se registra es la que la casilla mostraba al marcarla; si cambia
  // con la casilla marcada, se desmarca y se avisa.
  const alCambiarPolitica = useCallback(() => {
    setAceptaPolitica(false);
    setErrorPolitica(textoPoliticaActualizada(obtenerConfiguracion()));
  }, []);
  const politicaVista = usePoliticaVista(aceptaPolitica, alCambiarPolitica);

  // Solo la última solicitud escribe el estado (reintentos rápidos, cambio de día o pantalla desmontada).
  const solicitudServicio = useRef(0);
  const solicitudHorarios = useRef(0);
  const montado = useRef(true);
  // Horario que se recupera (inicio ISO) cuando llegan los horarios del día recuperado.
  const horarioPorRecuperar = useRef<string | null>(null);
  const usuarioId = useRef<string | null>(null);
  usuarioId.current = usuario ? String(usuario.id) : null;

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
          // Horario recuperado tras volver a iniciar sesión: si sigue libre, de vuelta a Confirmar.
          const inicioRecuperado = horarioPorRecuperar.current;
          horarioPorRecuperar.current = null;
          const libre = inicioRecuperado ? respuesta.slots.find((item) => item.inicio === inicioRecuperado) : undefined;
          if (libre) {
            setSlot(libre);
            setDireccion(1);
            setPaso(3);
          } else if (inicioRecuperado) {
            // Ya no está libre: se queda en Día y hora con los horarios al día y el aviso.
            setRegresoOcupado(true);
          }
        })
        .catch((error: unknown) => {
          if (actual !== solicitudHorarios.current) {
            return;
          }
          setErrorHorarios(mensajeParaClienta(error, { respaldo: obtenerTexto('citas.errores.horarios') }));
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

  /**
   * Lo que la clienta eligió antes de que terminara su sesión: la especialista, el día (si todavía
   * tiene citas; si no, el primer día libre), el horario (si sigue libre al llegar los horarios) y
   * las notas. false si la especialista ya no está entre las del servicio.
   */
  const recuperarReserva = useCallback(
    (pendiente: ReservaPendiente, disponibles: Especialista[], idServicio: string | number): boolean => {
      const elegida = disponibles.find((item) => String(item.id) === pendiente.especialistaId);
      if (!elegida) {
        return false;
      }
      if (pendiente.fecha < fechaLocal(new Date()) || estaBloqueado(pendiente.fecha)) {
        // El día ya pasó o ya no tiene citas: su horario tampoco está libre.
        empezarDiaHora(elegida, idServicio);
        setRegresoOcupado(true);
      } else {
        setEspecialista(elegida);
        setMesVisible(mesDeFecha(pendiente.fecha));
        setSlot(null);
        setHorarioOcupado(false);
        setFecha(pendiente.fecha);
        horarioPorRecuperar.current = pendiente.inicio;
        cargarHorarios(elegida.id, pendiente.fecha, idServicio);
      }
      setNotas(pendiente.notas);
      // La forma de pago elegida vuelve si sigue activa (opcionVigente); las casillas, sin marcar.
      if (pendiente.opcionPago) {
        setOpcionElegida(pendiente.opcionPago);
      }
      setRecuperada(true);
      setDireccion(1);
      setPaso(2);
      return true;
    },
    [cargarHorarios, empezarDiaHora, estaBloqueado],
  );

  // La especialista de la ruta (o lo recuperado) se aplica una sola vez, en la primera carga que sale bien.
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
          setErrorCarga(agenda.error);
          setEstado('error');
          return;
        }
        const disponibles = especialistasDelServicio(respuesta, agenda.lista);
        setServicio(respuesta);
        setEspecialistas(disponibles);
        if (!especialistaInicialAplicada.current) {
          especialistaInicialAplicada.current = true;
          // La sesión terminó al confirmar: se recupera lo elegido (solo la misma clienta).
          const pendiente = usuarioId.current ? tomarReservaPendiente(usuarioId.current, idLimpio) : null;
          // "Reservar lo mismo": si la especialista sigue entre las del servicio, se empieza en Día y
          // hora con ella elegida; atrás regresa al paso de especialista para cambiarla.
          const idInicial = especialistaIdInicial?.trim() ?? '';
          const inicial = idInicial
            ? disponibles.find((item) => String(item.id) === idInicial)
            : undefined;
          // Lo recuperado manda sobre la especialista de la ruta.
          const seRecupero = pendiente ? recuperarReserva(pendiente, disponibles, respuesta.id) : false;
          if (!seRecupero && inicial) {
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
        setErrorCarga(error);
        setEstado(error instanceof ApiError && error.status === 404 ? 'noEncontrado' : 'error');
      });
  }, [servicioId, especialistaIdInicial, empezarDiaHora, recuperarReserva]);

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
      setRegresoOcupado(false);
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
      setRegresoOcupado(false);
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
      setRegresoOcupado(false);
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

  const elegirOpcion = useCallback(
    (opcion: OpcionAnticipo) => {
      if (!enviando) {
        setOpcionElegida(opcion);
      }
    },
    [enviando],
  );

  const cambiarAceptaPolitica = useCallback(
    (marcada: boolean) => {
      if (enviando) {
        return;
      }
      setAceptaPolitica(marcada);
      if (marcada) {
        setErrorPolitica(null);
      }
    },
    [enviando],
  );

  const cambiarAutorizaFotos = useCallback(
    (marcada: boolean) => {
      if (!enviando) {
        setAutorizaFotos(marcada);
      }
    },
    [enviando],
  );

  const confirmar = useCallback(() => {
    // Candado inmediato: un segundo toque se ignora mientras se envía.
    candado(async () => {
      // Sin sesión la ruta no existe; aun así, sin clienta no se envía nada.
      // Sin saber si la cita anterior quedó registrada no se envía otra: primero se revisa Mis citas.
      if (!usuario || !servicio || !especialista || !slot || !fecha || revisarMisCitas) {
        return;
      }
      const conAnticipo = anticipo !== null;
      // Pagar en línea y apartar para pagar en el salón piden la misma casilla: sin ella no hay red.
      if (conAnticipo && !aceptaPolitica) {
        setErrorPolitica(textoFaltaPolitica(configuracion));
        return;
      }
      const modo: ModoReserva = conAnticipo ? opcionPago : 'salon';
      setModoEnvio(modo);
      setErrorEnvio(null);
      setErrorPolitica(null);
      setRecuperada(false);
      try {
        // Las casillas se registran antes de apartar el horario: si un registro falla, la cita no se crea.
        await registrarConsentimientosReserva({ conAnticipo, autorizaFotos, politicaVista: politicaVista() });
        // Si la respuesta se pierde, antes de dejar reintentar se busca la cita entre las de la clienta.
        const cita = await crearCitaVerificada({
          clienteId: usuario.id,
          especialistaId: especialista.id,
          servicioId: servicio.id,
          fechaHoraInicio: slot.inicio,
          fechaHoraFin: slot.fin,
          notas,
          // Sin anticipo no se manda: no debe quedar una cita por pagar en el salón si el backend sí
          // lo pidiera (usa 'linea' por omisión).
          pagoAnticipo: conAnticipo ? modo : undefined,
        });
        if (!montado.current) {
          return;
        }
        const citaId = encodeURIComponent(String(cita.id));
        // Pagar en línea abre Mercado Pago al llegar (pagar=1): la política ya se aceptó aquí. Si la
        // cita pide un anticipo que la app no anunció (sin casilla ni consentimiento), va a la
        // pantalla del anticipo sin pagar=1, que pide la casilla antes de abrir el pago. Sin anticipo o
        // en el salón, a la confirmación. Las rutas de anticipo y confirmación aún no están en los
        // tipos generados de Expo Router.
        let destino = `/cita-confirmada/${citaId}`;
        if (pideAnticipo(cita) && !conAnticipo) {
          destino = `/anticipo/${citaId}`;
        } else if (pideAnticipo(cita) && modo === 'linea') {
          destino = `/anticipo/${citaId}?pagar=1`;
        }
        router.replace(destino as Href);
      } catch (error: unknown) {
        const causa = error instanceof ErrorConsentimiento ? error.causa : error;
        if (esSesionTerminada(causa)) {
          // apiClient ya cerró la sesión: lo elegido se guarda en memoria (aunque la pantalla ya se
          // haya desmontado) para recuperarlo al volver a iniciar sesión.
          guardarReservaPendiente({
            usuarioId: String(usuario.id),
            servicioId: String(servicio.id),
            especialistaId: String(especialista.id),
            fecha,
            inicio: slot.inicio,
            notas,
            opcionPago: conAnticipo ? modo : undefined,
          });
        }
        if (!montado.current) {
          return;
        }
        setModoEnvio(null);
        if (esSesionTerminada(causa)) {
          setErrorEnvio(MENSAJE_SESION_RESERVA);
          return;
        }
        if (error instanceof ReservaSinConfirmar) {
          setErrorEnvio(obtenerTexto('citas.reserva.sinConfirmar', {}, configuracion));
          setRevisarMisCitas(true);
          return;
        }
        if (error instanceof ErrorConsentimiento) {
          if (esVersionNoPublicada(error)) {
            // La versión que vio ya no es la publicada: se pide la vigente y se vuelve a marcar.
            setAceptaPolitica(false);
            void obtenerDocumentoVigente('anticipos', { forzarRed: true });
          }
          setErrorEnvio(mensajeConsentimiento(error));
          return;
        }
        if (esHorarioOcupado(error)) {
          // Alguien más tomó ese horario: de vuelta a elegir hora con la disponibilidad al día.
          setSlot(null);
          setHorarioOcupado(true);
          setRegresoOcupado(false);
          irAPaso(2, -1);
          cargarHorarios(especialista.id, fecha, servicio.id);
          return;
        }
        // Los 400 del anticipo tienen su texto propio; cualquier otro error, el de mensajeParaClienta.
        const mensajeAnticipo = mensajeAnticipoParaClienta(error);
        if (mensajeAnticipo) {
          setErrorEnvio(mensajeAnticipo);
          return;
        }
        setErrorEnvio(mensajeParaClienta(error, { respaldo: obtenerTexto('citas.errores.reservar', {}, configuracion) }));
      }
    });
  }, [
    candado,
    usuario,
    servicio,
    especialista,
    slot,
    fecha,
    notas,
    anticipo,
    aceptaPolitica,
    autorizaFotos,
    politicaVista,
    opcionPago,
    configuracion,
    router,
    irAPaso,
    cargarHorarios,
    revisarMisCitas,
  ]);

  const verMisCitas = useCallback(() => {
    // Mis citas queda en lugar de la reserva: atrás no regresa a confirmar otra vez.
    router.replace('/mis-citas' as Href);
  }, [router]);

  const formaPago = useMemo(
    () => formaPagoReserva({ precio: servicio?.precio ?? null }, anticipo, configuracion, opcionPago),
    [servicio?.precio, anticipo, configuracion, opcionPago],
  );

  return {
    mensajeError: estado === 'error' ? mensajeParaClienta(errorCarga) : null,
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
    avisoRegresoOcupado: regresoOcupado ? obtenerTexto('citas.reserva.regresoOcupado', {}, configuracion) : null,
    slot,
    elegirHorario,
    notas,
    setNotas,
    tituloConfirmar: obtenerTexto('citas.crear.tituloConfirmar', {}, configuracion),
    anticipo,
    formaPago,
    opcionPago,
    elegirOpcion,
    aceptaPolitica,
    cambiarAceptaPolitica,
    errorPolitica,
    autorizaFotos,
    cambiarAutorizaFotos,
    textoFotos: obtenerTexto('citas.reserva.fotosResultado', {}, configuracion),
    textoBoton: botonConfirmar(anticipo, opcionPago, enviando, configuracion),
    recuperada,
    enviando,
    modoEnvio,
    errorEnvio,
    revisarMisCitas,
    textoVerMisCitas: revisarMisCitas ? obtenerTexto('citas.reserva.verMisCitas', {}, configuracion) : '',
    verMisCitas,
    confirmar,
    atras,
  };
}
