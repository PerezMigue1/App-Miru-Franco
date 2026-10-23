import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { ApiError } from '@/shared/api/apiClient';
import { obtenerConfiguracion, suscribir, type ConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { anticipoVigente, obtenerServicio, type Servicio } from '../models/servicioModel';

// La vista no importa de models/: recibe estos tipos del viewmodel.
export type { Especialista, Servicio } from '../models/servicioModel';

export type EstadoDetalleServicio = 'cargando' | 'listo' | 'error' | 'noEncontrado';

/** "Este servicio pide un anticipo de $360 al reservar." partido alrededor del monto (cifra aparte). */
export interface AvisoAnticipo {
  antes: string;
  monto: string;
  despues: string;
}

/**
 * El aviso del anticipo que hoy se pide (anticipoVigente: sin anticiposActivos no hay), o null. Si
 * el texto del catálogo no trae el monto, todo va en `antes` y el monto queda vacío.
 */
export function avisoAnticipo(servicio: Servicio | null, config: ConfiguracionPublica): AvisoAnticipo | null {
  const anticipo = anticipoVigente(servicio, config);
  if (!anticipo) {
    return null;
  }
  const texto = obtenerTexto('citas.servicios.anticipo', { anticipo }, config);
  const indice = texto.indexOf(anticipo);
  if (indice < 0) {
    return { antes: texto, monto: '', despues: '' };
  }
  return { antes: texto.slice(0, indice), monto: anticipo, despues: texto.slice(indice + anticipo.length) };
}

export interface DetalleServicioViewModel {
  /** Con estado 'error': por qué no se cargó el servicio (sin red, servidor...); null si no hay error. */
  mensajeError: string | null;
  estado: EstadoDetalleServicio;
  servicio: Servicio | null;
  recargar: () => void;
  /** Hay una clienta con sesión iniciada. */
  sesion: boolean;
  /** Sin sesión, la clienta tocó Reservar: se le invita a entrar. */
  invitacionVisible: boolean;
  /** Con sesión abre la reserva del servicio; sin sesión muestra la invitación. */
  reservar: () => void;
  /** Aviso del anticipo que hoy se pide al reservar, o null. */
  anticipo: AvisoAnticipo | null;
  /** Beneficio de la invitación a iniciar sesión (sin anticipo vigente, no lo promete). */
  beneficioInvitacion: string;
}

/** Detalle público de un servicio (GP-06.1). Un servicio inactivo o inexistente no se muestra. */
export function useDetalleServicioViewModel(id: string | undefined): DetalleServicioViewModel {
  const router = useRouter();
  const { estado: estadoSesion } = useAuth();
  const sesion = estadoSesion === 'autenticado';
  const configuracion = useSyncExternalStore(suscribir, obtenerConfiguracion, obtenerConfiguracion);
  const [estado, setEstado] = useState<EstadoDetalleServicio>('cargando');
  const [errorCarga, setErrorCarga] = useState<unknown>(null);
  const [servicio, setServicio] = useState<Servicio | null>(null);
  const [invitacionVisible, setInvitacionVisible] = useState(false);
  // Solo la última solicitud escribe el estado (reintentos rápidos o pantalla desmontada).
  const solicitud = useRef(0);

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    const idLimpio = id?.trim() ?? '';
    if (idLimpio === '') {
      setServicio(null);
      setEstado('noEncontrado');
      return;
    }
    setEstado('cargando');
    obtenerServicio(idLimpio)
      .then((respuesta) => {
        if (actual !== solicitud.current) {
          return;
        }
        if (respuesta.activo === false) {
          setServicio(null);
          setEstado('noEncontrado');
          return;
        }
        setServicio(respuesta);
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (actual !== solicitud.current) {
          return;
        }
        setServicio(null);
        setErrorCarga(error);
        setEstado(error instanceof ApiError && error.status === 404 ? 'noEncontrado' : 'error');
      });
  }, [id]);

  useEffect(() => {
    recargar();
    return () => {
      solicitud.current += 1;
    };
  }, [recargar]);

  // Si la clienta inicia sesión, la invitación ya no aplica.
  useEffect(() => {
    if (sesion) {
      setInvitacionVisible(false);
    }
  }, [sesion]);

  const reservar = useCallback(() => {
    if (!sesion) {
      setInvitacionVisible(true);
      return;
    }
    const servicioId = servicio ? String(servicio.id) : (id?.trim() ?? '');
    if (servicioId === '') {
      return;
    }
    router.push(`/reservar/${encodeURIComponent(servicioId)}` as Href);
  }, [sesion, servicio, id, router]);

  const anticipo = avisoAnticipo(servicio, configuracion);
  return {
    mensajeError: estado === 'error' ? mensajeParaClienta(errorCarga) : null,
    estado,
    servicio,
    recargar,
    sesion,
    invitacionVisible,
    reservar,
    anticipo,
    beneficioInvitacion: obtenerTexto(
      anticipo ? 'citas.servicios.invitacion' : 'citas.servicios.invitacionSinAnticipo',
      {},
      configuracion,
    ),
  };
}
