import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { ApiError } from '@/shared/api/apiClient';
import { obtenerConfiguracion, suscribir } from '@/shared/api/configuracionPublica';
import { rutaVisorDocumento } from '@/shared/api/documentosLegales';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useCandado } from '@/shared/ui/useCandado';

import {
  admiteCambios,
  cambiarAnticipoASalon,
  cancelarCita,
  esCanceladaPorAnticipo,
  esVigente,
  estadoAnticipo,
  etiquetaEstadoAnticipo,
  etiquetaEstadoCita,
  mensajeAnticipoEnSalon,
  mensajeCancelacion,
  motivoCancelacionParaClienta,
  obtenerCita,
  obtenerPoliticaCancelacion,
  type Cita,
  type EtiquetaEstado,
} from '../models/citaModel';
import {
  anticipoPagadoAlCancelar,
  avisoCancelacion,
  avisoCitaCancelada,
  dentroDelAviso,
  formaPagoDeCita,
  opcionesPagoDeCita,
  type FormaPagoCita,
  type OpcionesPagoCita,
  type PoliticaConsultada,
} from '../models/gestionCitaModel';
import { duracionParaMostrar } from '../models/servicioModel';
import { useAceptacionAnticipos, type AceptacionAnticipos } from './useAceptacionAnticipos';

// La vista no importa de models/: recibe estos tipos del viewmodel.
export type { Cita, EtiquetaEstado } from '../models/citaModel';
export type { FormaPagoCita, OpcionesPagoCita } from '../models/gestionCitaModel';
export type { AceptacionAnticipos } from './useAceptacionAnticipos';

export type EstadoDetalleCita = 'cargando' | 'listo' | 'error' | 'noEncontrado';

/** Ruta de la app que se guarda con el consentimiento de la política en el detalle. */
export const RUTA_ORIGEN_DETALLE = 'app/cita';

/** Todo lo que pinta el detalle de una cita ya cargada. */
export interface PresentacionDetalle {
  insigniaCita: EtiquetaEstado;
  insigniaAnticipo: EtiquetaEstado;
  /** "2 h 30 min", o null. */
  duracion: string | null;
  formaPago: FormaPagoCita;
  /** Motivo de la cancelación para la clienta, o null. */
  motivoCancelacion: string | null;
  /** Se puede reprogramar o cancelar. */
  cambios: boolean;
  /** Formas de pagar el anticipo pendiente que se ofrecen. */
  opcionesPago: OpcionesPagoCita;
  /** Aviso de recordatorios (citas.recordatorio) para una cita vigente, o null. */
  recordatorio: string | null;
  /** Texto del enlace a la Política de anticipos y cancelación. */
  enlacePolitica: string;
  /** Títulos de los botones de pago (catálogo). */
  botonLinea: string;
  botonSalon: string;
}

/** Aviso de la última acción de pago en el detalle. */
export interface AvisoPago {
  tipo: 'exito' | 'error';
  texto: string;
}

export interface DetalleCitaViewModel {
  estado: EstadoDetalleCita;
  cita: Cita | null;
  /** Lo que pinta la vista con la cita cargada, o null. */
  presentacion: PresentacionDetalle | null;
  /** Vuelve a cargar con skeleton (botón Reintentar). */
  recargar: () => void;
  regresar: () => void;
  verMisCitas: () => void;
  /** Abre el visor de la Política de anticipos y cancelación. */
  abrirPolitica: () => void;

  /** Casilla de la política: obligatoria antes de pagar en línea o de cambiar a pago en el salón. */
  casilla: AceptacionAnticipos;
  /**
   * Pagar el anticipo en línea: revisa la casilla, registra el consentimiento y abre el pago (que
   * lanza Mercado Pago al llegar). No hace nada mientras se cancela la cita.
   */
  pagarAnticipo: () => void;
  /** Cambiar a pago en el salón: casilla, consentimiento, PATCH y recarga de la cita. */
  pagarEnSalon: () => void;
  /** Qué pago está en curso, o null. */
  pagando: 'linea' | 'salon' | null;
  /** Resultado del último intento de pago, o null. */
  avisoPago: AvisoPago | null;

  /** Abre la reprogramación de la cita (cierra la hoja de cancelar si está abierta). */
  reprogramar: () => void;
  /** Hoja para cancelar la cita. */
  hojaCancelarVisible: boolean;
  /** Abre la hoja y, con anticipo pagado, consulta qué pasa con él si cancela. */
  abrirCancelar: () => void;
  /** Cierra la hoja; mientras se cancela no hace nada para no perder el resultado. */
  cerrarCancelar: () => void;
  /** Cancela con el motivo ya elegido y recarga la cita. */
  cancelar: (motivo: string) => void;
  cancelando: boolean;
  /** Aviso de la hoja de cancelar: qué pasa con el anticipo y con reagendar. */
  avisoCancelacion: string;
  /** Con anticipo pagado: la hoja ofrece el enlace a la política. */
  avisoConPolitica: boolean;
  /** El botón de confirmar se desactiva mientras carga la política del anticipo pagado. */
  puedeConfirmarCancelacion: boolean;
  /** "Prefiero reprogramar" solo fuera de las horas de aviso de la cita. */
  puedeReprogramar: boolean;
  /** Mensaje para la clienta si la cancelación falla, o null. */
  errorCancelacion: string | null;
  /** Aviso de la cita recién cancelada en esta pantalla (con o sin reembolso), o null. */
  avisoCancelada: string | null;
}

/** Arma lo que pinta el detalle con la regla guardada en la cita. */
function presentacionDe(cita: Cita, ahora: Date, config: ReturnType<typeof obtenerConfiguracion>): PresentacionDetalle {
  const cambios = admiteCambios(cita, ahora);
  return {
    insigniaCita: etiquetaEstadoCita(cita.estado),
    insigniaAnticipo: etiquetaEstadoAnticipo(estadoAnticipo(cita)),
    duracion: duracionParaMostrar(cita.servicioDuracionMinutos),
    formaPago: formaPagoDeCita(cita, ahora, config),
    // La cancelación por anticipo no pagado ya la explica la forma de pago: no se repite.
    motivoCancelacion: esCanceladaPorAnticipo(cita) ? null : motivoCancelacionParaClienta(cita),
    cambios,
    opcionesPago: opcionesPagoDeCita(cita, ahora, config),
    recordatorio: cambios && esVigente(cita) ? obtenerTexto('citas.recordatorio', {}, config) : null,
    enlacePolitica: obtenerTexto('anticipos.enlacePolitica', {}, config),
    botonLinea: obtenerTexto('anticipos.botonMercadoPago', {}, config),
    botonSalon: obtenerTexto('anticipos.botonSalon', {}, config),
  };
}

/**
 * Detalle de una cita de la clienta (GP-06.3), su forma de pago y su cancelación (GP-07.4). Recarga
 * en silencio cada vez que la pantalla vuelve a estar enfocada (al regresar de reprogramar o de pagar
 * el anticipo).
 */
export function useDetalleCitaViewModel(citaId: string | undefined): DetalleCitaViewModel {
  const router = useRouter();
  const candado = useCandado();
  const configuracion = useSyncExternalStore(suscribir, obtenerConfiguracion, obtenerConfiguracion);
  const casilla = useAceptacionAnticipos(RUTA_ORIGEN_DETALLE);
  const [estado, setEstado] = useState<EstadoDetalleCita>('cargando');
  const [cita, setCita] = useState<Cita | null>(null);
  const [hojaCancelarVisible, setHojaCancelarVisible] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState<string | null>(null);
  const [avisoCancelada, setAvisoCancelada] = useState<string | null>(null);
  const [politica, setPolitica] = useState<PoliticaConsultada>(null);
  const [pagando, setPagando] = useState<'linea' | 'salon' | null>(null);
  const [avisoPago, setAvisoPago] = useState<AvisoPago | null>(null);
  // Solo la última solicitud escribe el estado (recargas al enfocar, reintentos o pantalla desmontada).
  const solicitud = useRef(0);
  const solicitudPolitica = useRef(0);
  const montada = useRef(true);
  // Ya hay una cita en pantalla: las recargas al enfocar son silenciosas.
  const hayDatos = useRef(false);
  // Un doble toque no abre dos pantallas; se libera al volver a enfocar.
  const navegando = useRef(false);

  const idLimpio = citaId?.trim() ?? '';

  const cargar = useCallback(
    (silenciosa: boolean) => {
      solicitud.current += 1;
      const actual = solicitud.current;
      if (idLimpio === '') {
        hayDatos.current = false;
        setCita(null);
        setEstado('noEncontrado');
        return;
      }
      if (!silenciosa) {
        setEstado('cargando');
      }
      obtenerCita(idLimpio)
        .then((respuesta) => {
          if (actual !== solicitud.current) {
            return;
          }
          hayDatos.current = true;
          setCita(respuesta);
          setEstado('listo');
        })
        .catch((error: unknown) => {
          if (actual !== solicitud.current) {
            return;
          }
          const noEncontrada = error instanceof ApiError && error.status === 404;
          // En silencio, un fallo de red deja la cita que ya se ve; un 404 sí la quita.
          if (silenciosa && !noEncontrada) {
            return;
          }
          hayDatos.current = false;
          setCita(null);
          setEstado(noEncontrada ? 'noEncontrado' : 'error');
        });
    },
    [idLimpio],
  );

  const recargar = useCallback(() => cargar(false), [cargar]);

  useEffect(() => {
    montada.current = true;
    return () => {
      montada.current = false;
      solicitud.current += 1;
      solicitudPolitica.current += 1;
    };
  }, []);

  // La primera vez carga con skeleton; al volver a la pantalla, en silencio.
  useFocusEffect(
    useCallback(() => {
      navegando.current = false;
      cargar(hayDatos.current);
    }, [cargar]),
  );

  const regresar = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/mis-citas');
    }
  }, [router]);

  const verMisCitas = useCallback(() => {
    router.replace('/mis-citas');
  }, [router]);

  const abrirPolitica = useCallback(() => {
    router.push(rutaVisorDocumento('anticipos'));
  }, [router]);

  const idCita = cita && cita.id !== '' ? encodeURIComponent(String(cita.id)) : null;

  const pagarAnticipo = useCallback(() => {
    // Mientras se cancela (o se cambia a pago en el salón) no se abre otro pago.
    if (!idCita || navegando.current || cancelando || pagando) {
      return;
    }
    candado(async () => {
      setPagando('linea');
      setAvisoPago(null);
      const aceptada = await casilla.aceptar();
      if (!montada.current) {
        return;
      }
      setPagando(null);
      if (!aceptada.ok) {
        setAvisoPago(aceptada.mensaje ? { tipo: 'error', texto: aceptada.mensaje } : null);
        return;
      }
      navegando.current = true;
      // El consentimiento ya quedó registrado: la pantalla del anticipo abre Mercado Pago sola.
      router.push(`/anticipo/${idCita}?pagar=1` as Href);
    });
  }, [idCita, cancelando, pagando, candado, casilla, router]);

  /** Relee la cita en silencio después de cambiar el anticipo (200 o 409). */
  const releer = useCallback(async (id: string | number) => {
    solicitud.current += 1;
    const actual = solicitud.current;
    try {
      const nueva = await obtenerCita(id);
      if (actual === solicitud.current && montada.current) {
        setCita(nueva);
      }
    } catch {
      // La próxima recarga al enfocar trae el cambio.
    }
  }, []);

  const pagarEnSalon = useCallback(() => {
    const actualCita = cita;
    if (!actualCita || actualCita.id === '' || cancelando || pagando) {
      return;
    }
    candado(async () => {
      setPagando('salon');
      setAvisoPago(null);
      const aceptada = await casilla.aceptar();
      if (!montada.current) {
        return;
      }
      if (!aceptada.ok) {
        setPagando(null);
        setAvisoPago(aceptada.mensaje ? { tipo: 'error', texto: aceptada.mensaje } : null);
        return;
      }
      let aviso: AvisoPago;
      let releerCita = true;
      try {
        await cambiarAnticipoASalon(actualCita.id);
        aviso = { tipo: 'exito', texto: obtenerTexto('citas.anticipoSalon.listo') };
      } catch (error) {
        aviso = { tipo: 'error', texto: mensajeAnticipoEnSalon(error) };
        // Un 409 dice que la cita cambió (pagada, en proceso o ya no se puede): se relee.
        releerCita = error instanceof ApiError && error.status === 409;
      }
      if (releerCita) {
        await releer(actualCita.id);
      }
      if (montada.current) {
        setAvisoPago(aviso);
        setPagando(null);
      }
    });
  }, [cita, cancelando, pagando, candado, casilla, releer]);

  const reprogramar = useCallback(() => {
    if (!idCita || navegando.current || cancelando) {
      return;
    }
    navegando.current = true;
    setHojaCancelarVisible(false);
    router.push(`/cita/${idCita}/reprogramar` as Href);
  }, [idCita, cancelando, router]);

  const abrirCancelar = useCallback(() => {
    setErrorCancelacion(null);
    setHojaCancelarVisible(true);
    solicitudPolitica.current += 1;
    const actual = solicitudPolitica.current;
    if (!cita || anticipoPagadoAlCancelar(cita) <= 0) {
      setPolitica(null);
      return;
    }
    // Con anticipo pagado, el aviso dice si se devuelve: se pregunta al backend con cada apertura.
    setPolitica('cargando');
    // Nunca rechaza: el catch convierte cualquier error en "sin datos" antes del then.
    void obtenerPoliticaCancelacion(cita.id)
      .catch(() => null)
      .then((respuesta) => {
        if (actual === solicitudPolitica.current) {
          setPolitica(respuesta);
        }
      });
  }, [cita]);

  const cerrarCancelar = useCallback(() => {
    if (cancelando) {
      return;
    }
    setHojaCancelarVisible(false);
    setErrorCancelacion(null);
  }, [cancelando]);

  const cancelar = useCallback(
    (motivo: string) => {
      const actualCita = cita;
      const limpio = motivo.trim();
      if (!actualCita || actualCita.id === '' || limpio === '' || politica === 'cargando') {
        return;
      }
      // El aviso final se decide con la política que la clienta vio al confirmar.
      const politicaVista = politica;
      candado(async () => {
        setCancelando(true);
        setErrorCancelacion(null);
        try {
          await cancelarCita(actualCita.id, limpio);
        } catch (error) {
          if (montada.current) {
            setErrorCancelacion(mensajeCancelacion(error));
            setCancelando(false);
          }
          return;
        }
        // Ninguna recarga anterior pisa la cita ya cancelada.
        solicitud.current += 1;
        const actual = solicitud.current;
        let nueva: Cita;
        try {
          // La respuesta de cancelar no trae si el anticipo quedó retenido: se lee de nuevo.
          nueva = await obtenerCita(actualCita.id);
        } catch {
          // El servidor ya confirmó la cancelación: se muestra así y la próxima recarga trae el resto.
          nueva = { ...actualCita, estado: 'cancelada', motivoCancelacion: limpio };
        }
        if (!montada.current) {
          return;
        }
        if (actual === solicitud.current) {
          hayDatos.current = true;
          setCita(nueva);
          setEstado('listo');
        }
        setAvisoCancelada(avisoCitaCancelada(politicaVista));
        setCancelando(false);
        setHojaCancelarVisible(false);
      });
    },
    [cita, politica, candado],
  );

  const ahora = new Date();
  const conAnticipoPagado = cita != null && anticipoPagadoAlCancelar(cita) > 0;

  return {
    estado,
    cita,
    presentacion: cita ? presentacionDe(cita, ahora, configuracion) : null,
    recargar,
    regresar,
    verMisCitas,
    abrirPolitica,
    casilla,
    pagarAnticipo,
    pagarEnSalon,
    pagando,
    avisoPago,
    reprogramar,
    hojaCancelarVisible,
    abrirCancelar,
    cerrarCancelar,
    cancelar,
    cancelando,
    avisoCancelacion: cita ? avisoCancelacion(cita, politica, ahora, configuracion) : '',
    avisoConPolitica: conAnticipoPagado,
    puedeConfirmarCancelacion: !cancelando && !(conAnticipoPagado && politica === 'cargando'),
    puedeReprogramar: cita != null && !dentroDelAviso(cita, ahora),
    errorCancelacion,
    avisoCancelada,
  };
}
