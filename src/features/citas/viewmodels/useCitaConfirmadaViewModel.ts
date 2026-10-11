import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BackHandler } from 'react-native';

import { ApiError } from '@/shared/api/apiClient';

import {
  limiteAnticipo,
  obtenerCita,
  obtenerEstadoAnticipo,
  pideAnticipo,
  type Cita,
} from '../models/citaModel';

export type EstadoCitaConfirmada = 'cargando' | 'listo' | 'error' | 'noEncontrado';

/**
 * Anticipo de la cita para mostrar: pagado, pendiente de pago, en revisión (Mercado Pago ya lo
 * recibió pero falta aprobarlo) o sin anticipo.
 */
export type AnticipoConfirmacion = 'pagado' | 'pendiente' | 'enRevision' | 'noAplica';

export interface CitaConfirmadaViewModel {
  estado: EstadoCitaConfirmada;
  cita: Cita | null;
  anticipo: AnticipoConfirmacion;
  /** "Paga antes de las 6:30 p. m." (con el día si no es hoy) del anticipo pendiente, o null. */
  limite: string | null;
  recargar: () => void;
  /** Anticipo pendiente: abre la pantalla del anticipo, que lanza Mercado Pago al llegar. */
  pagarAnticipo: () => void;
  verMisCitas: () => void;
  volverAlInicio: () => void;
}

/** Confirmación de una cita recién reservada (GP-06.2; también desde Mis citas en GP-06.3). */
export function useCitaConfirmadaViewModel(citaId: string | undefined): CitaConfirmadaViewModel {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoCitaConfirmada>('cargando');
  const [cita, setCita] = useState<Cita | null>(null);
  const [anticipo, setAnticipo] = useState<AnticipoConfirmacion>('noAplica');
  // Solo la última solicitud escribe el estado (reintentos rápidos o pantalla desmontada).
  const solicitud = useRef(0);

  const idLimpio = citaId?.trim() ?? '';

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    if (idLimpio === '') {
      setCita(null);
      setEstado('noEncontrado');
      return;
    }
    setEstado('cargando');
    const cargar = async () => {
      const respuesta = await obtenerCita(idLimpio);
      let estadoAnticipo: AnticipoConfirmacion;
      if (respuesta.anticipoRequerido <= 0) {
        estadoAnticipo = 'noAplica';
      } else if (!pideAnticipo(respuesta)) {
        estadoAnticipo = 'pagado';
      } else {
        // El webhook de Mercado Pago puede ir atrasado: se pregunta el estado real.
        try {
          const real = await obtenerEstadoAnticipo(respuesta.id);
          estadoAnticipo =
            real === 'aprobado' ? 'pagado' : real === 'pendiente' ? 'enRevision' : 'pendiente';
        } catch {
          // Sin el estado real se muestra lo que dice la cita.
          estadoAnticipo = 'pendiente';
        }
      }
      return { respuesta, estadoAnticipo };
    };
    cargar()
      .then(({ respuesta, estadoAnticipo }) => {
        if (actual !== solicitud.current) {
          return;
        }
        setCita(respuesta);
        setAnticipo(estadoAnticipo);
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (actual !== solicitud.current) {
          return;
        }
        setCita(null);
        setEstado(error instanceof ApiError && error.status === 404 ? 'noEncontrado' : 'error');
      });
  }, [idLimpio]);

  useEffect(() => {
    recargar();
    return () => {
      solicitud.current += 1;
    };
  }, [recargar]);

  // Un doble toque no abre dos pantallas de pago.
  const yendoAPagar = useRef(false);
  const pagarAnticipo = useCallback(() => {
    if (!cita || cita.id === '' || yendoAPagar.current) {
      return;
    }
    yendoAPagar.current = true;
    router.replace(`/anticipo/${encodeURIComponent(String(cita.id))}?pagar=1` as Href);
  }, [router, cita]);

  const verMisCitas = useCallback(() => {
    router.replace('/mis-citas');
  }, [router]);

  // Regresa a las pestañas sacando de la pila la reserva y el pago; si no estaban, reemplaza.
  const volverAlInicio = useCallback(() => {
    router.dismissTo('/inicio');
  }, [router]);

  // Atrás de Android no vuelve al flujo de reserva: lleva al inicio.
  useFocusEffect(
    useCallback(() => {
      const suscripcion = BackHandler.addEventListener('hardwareBackPress', () => {
        volverAlInicio();
        return true;
      });
      return () => suscripcion.remove();
    }, [volverAlInicio]),
  );

  return {
    estado,
    cita,
    anticipo,
    limite: cita && anticipo === 'pendiente' ? limiteAnticipo(cita.anticipoVenceEn) : null,
    recargar,
    pagarAnticipo,
    verMisCitas,
    volverAlInicio,
  };
}
