import type { SesionCabecera } from '@/shared/ui/AccionesCabecera';

import { useAuth } from './useAuth';
import { useFotoClienta } from './useFotoClienta';
import { useRequiereSesion } from './useRequiereSesion';

/**
 * Sesión real para la cabecera compartida (AccionesCabecera). src/app/_layout.tsx la inyecta con
 * SesionCabeceraProvider; así src/shared no importa nada de src/features. Es una constante de
 * módulo: el valor del contexto no cambia y no provoca renders extra.
 */
export const sesionCabecera: SesionCabecera = {
  useSesion() {
    const { estado, usuario } = useAuth();
    return { conSesion: estado === 'autenticado', nombre: usuario?.nombre ?? '' };
  },
  useFoto: useFotoClienta,
  useRequiereSesion,
};
