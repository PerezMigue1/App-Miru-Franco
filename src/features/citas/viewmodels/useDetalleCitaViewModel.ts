import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { precioParaMostrar } from '@/features/inicio/models/FluidoModel';
import { ApiError } from '@/shared/api/apiClient';
import { useCandado } from '@/shared/ui/useCandado';

import {
  cancelarCita,
  estadoAnticipo,
  mensajeCancelacion,
  montoPagadoAnticipo,
  obtenerCita,
  type Cita,
} from '../models/citaModel';

export type EstadoDetalleCita = 'cargando' | 'listo' | 'error' | 'noEncontrado';

export interface DetalleCitaViewModel {
  estado: EstadoDetalleCita;
  cita: Cita | null;
  /** Vuelve a cargar con skeleton (botón Reintentar). */
  recargar: () => void;
  regresar: () => void;
  verMisCitas: () => void;
  /** Abre el pago del anticipo de la cita. */
  pagarAnticipo: () => void;
  /** Abre la reprogramación de la cita (cierra la hoja de cancelar si está abierta). */
  reprogramar: () => void;
  /** Hoja para cancelar la cita. */
  hojaCancelarVisible: boolean;
  abrirCancelar: () => void;
  /** Cierra la hoja; mientras se cancela no hace nada para no perder el resultado. */
  cerrarCancelar: () => void;
  /** Cancela con el motivo ya elegido y recarga la cita. */
  cancelar: (motivo: string) => void;
  cancelando: boolean;
  /** Aviso de la hoja de cancelar: qué pasa con el anticipo pagado o la recomendación de reprogramar. */
  avisoCancelacion: string;
  /** Mensaje para la clienta si la cancelación falla, o null. */
  errorCancelacion: string | null;
  /** La cita se acaba de cancelar en esta pantalla (aviso de confirmación). */
  recienCancelada: boolean;
}

const RECOMENDACION_REPROGRAMAR = 'Te recomendamos reprogramar tu cita en lugar de cancelarla.';

/**
 * Aviso antes de cancelar. Con anticipo pagado (estado 'pagado', o algo pagado que no se retuvo ni
 * se reembolsó) dice que no se devuelve; si no, recomienda reprogramar.
 */
export function avisoCancelacionDe(cita: Cita): string {
  const estadoPago = estadoAnticipo(cita);
  const pagado = montoPagadoAnticipo(cita);
  const conPago =
    estadoPago === 'pagado' ||
    (pagado > 0 && estadoPago !== 'retenido' && estadoPago !== 'reembolsado');
  if (!conPago) {
    return RECOMENDACION_REPROGRAMAR;
  }
  const monto = precioParaMostrar(String(pagado)) ?? cita.anticipoMonto;
  const delAnticipo = monto ? `El anticipo de ${monto} que pagaste` : 'El anticipo que pagaste';
  return `${delAnticipo} no se devuelve si cancelas. Si reprogramas tu cita con aviso, tu anticipo se respeta.`;
}

/**
 * Detalle de una cita de la clienta y su cancelación (GP-06.3). Recarga en silencio cada vez que la
 * pantalla vuelve a estar enfocada (al regresar de reprogramar o de pagar el anticipo).
 */
export function useDetalleCitaViewModel(citaId: string | undefined): DetalleCitaViewModel {
  const router = useRouter();
  const candado = useCandado();
  const [estado, setEstado] = useState<EstadoDetalleCita>('cargando');
  const [cita, setCita] = useState<Cita | null>(null);
  const [hojaCancelarVisible, setHojaCancelarVisible] = useState(false);
  const [cancelando, setCancelando] = useState(false);
  const [errorCancelacion, setErrorCancelacion] = useState<string | null>(null);
  const [recienCancelada, setRecienCancelada] = useState(false);
  // Solo la última solicitud escribe el estado (recargas al enfocar, reintentos o pantalla desmontada).
  const solicitud = useRef(0);
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

  const idCita = cita && cita.id !== '' ? encodeURIComponent(String(cita.id)) : null;

  const pagarAnticipo = useCallback(() => {
    if (!idCita || navegando.current) {
      return;
    }
    navegando.current = true;
    router.push(`/anticipo/${idCita}` as Href);
  }, [idCita, router]);

  const reprogramar = useCallback(() => {
    if (!idCita || navegando.current || cancelando) {
      return;
    }
    navegando.current = true;
    setHojaCancelarVisible(false);
    // La ruta cita/[id]/reprogramar llega con su propia pantalla; el cast evita depender de los
    // tipos generados de Expo Router mientras tanto.
    router.push(`/cita/${idCita}/reprogramar` as Href);
  }, [idCita, cancelando, router]);

  const abrirCancelar = useCallback(() => {
    setErrorCancelacion(null);
    setHojaCancelarVisible(true);
  }, []);

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
      if (!actualCita || actualCita.id === '' || limpio === '') {
        return;
      }
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
        setRecienCancelada(true);
        setCancelando(false);
        setHojaCancelarVisible(false);
      });
    },
    [cita, candado],
  );

  return {
    estado,
    cita,
    recargar,
    regresar,
    verMisCitas,
    pagarAnticipo,
    reprogramar,
    hojaCancelarVisible,
    abrirCancelar,
    cerrarCancelar,
    cancelar,
    cancelando,
    avisoCancelacion: cita ? avisoCancelacionDe(cita) : RECOMENDACION_REPROGRAMAR,
    errorCancelacion,
    recienCancelada,
  };
}
