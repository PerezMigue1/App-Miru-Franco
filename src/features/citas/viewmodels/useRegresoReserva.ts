import { useRouter, type Href } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useAuth } from '@/features/auth/viewmodels/useAuth';

import { servicioPorRetomar } from '../models/reservaPendiente';

/**
 * Regreso a la reserva tras una sesión vencida (GP-07.6): si la sesión terminó al confirmar una cita,
 * lo elegido quedó en memoria (reservaPendiente) y la app quedó en Inicio. En cuanto la MISMA clienta
 * vuelve a iniciar sesión, la app abre sola la reserva de ese servicio, donde se recupera lo elegido.
 * Si entra otra cuenta, lo pendiente se olvida. Solo cuenta el paso de sin sesión a con sesión (no la
 * sesión restaurada al abrir la app). Se monta una sola vez, en la raíz.
 */
export function useRegresoReserva(): void {
  const { estado, usuario } = useAuth();
  const { navigate } = useRouter();
  const anterior = useRef(estado);
  const usuarioId = usuario ? String(usuario.id) : null;

  useEffect(() => {
    const antes = anterior.current;
    anterior.current = estado;
    if (estado !== 'autenticado' || antes !== 'anonimo' || !usuarioId) {
      return;
    }
    const servicioId = servicioPorRetomar(usuarioId);
    if (servicioId) {
      // navigate y no push: si la clienta ya iba a esa reserva (por ejemplo, tocó Reservar antes de
      // iniciar sesión), no se abre dos veces.
      navigate(`/reservar/${encodeURIComponent(servicioId)}` as Href);
    }
  }, [estado, usuarioId, navigate]);
}
