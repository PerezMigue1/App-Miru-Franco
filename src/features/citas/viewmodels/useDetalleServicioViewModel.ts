import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/viewmodels/useAuth';
import { ApiError } from '@/shared/api/apiClient';

import { obtenerServicio, type Servicio } from '../models/servicioModel';

export type EstadoDetalleServicio = 'cargando' | 'listo' | 'error' | 'noEncontrado';

export interface DetalleServicioViewModel {
  estado: EstadoDetalleServicio;
  servicio: Servicio | null;
  recargar: () => void;
  /** Hay una clienta con sesión iniciada. */
  sesion: boolean;
  /** Sin sesión, la clienta tocó Reservar: se le invita a entrar. */
  invitacionVisible: boolean;
  reservar: () => void;
}

/** Detalle público de un servicio (GP-06.1). Un servicio inactivo o inexistente no se muestra. */
export function useDetalleServicioViewModel(id: string | undefined): DetalleServicioViewModel {
  const { estado: estadoSesion } = useAuth();
  const sesion = estadoSesion === 'autenticado';
  const [estado, setEstado] = useState<EstadoDetalleServicio>('cargando');
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
    }
    // Con sesión el botón está deshabilitado hasta GP-06.2.
  }, [sesion]);

  return { estado, servicio, recargar, sesion, invitacionVisible, reservar };
}
