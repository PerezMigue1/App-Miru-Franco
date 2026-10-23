import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EmptyState } from '@/shared/ui/EmptyState';
import { espacio, pantalla } from '@/shared/ui/tokens';

interface Accion {
  titulo: string;
  onPress: () => void;
}

interface EstadoCitaProps {
  titulo: string;
  mensaje: string;
  accion?: Accion;
  /** Lo que va debajo del estado (por ejemplo, el contacto del salón). */
  children?: ReactNode;
}

/** Estado a pantalla completa de una cita (no se pudo cargar, no se encontró...), sobre el área segura de abajo. */
export function EstadoCita({ titulo, mensaje, accion, children }: EstadoCitaProps) {
  const { bottom } = useSafeAreaInsets();
  return (
    <ScrollView contentContainerStyle={[styles.estado, { paddingBottom: bottom + espacio.x3 }]}>
      <EmptyState titulo={titulo} mensaje={mensaje} accion={accion} />
      {children}
    </ScrollView>
  );
}

interface EstadoCargaCitaProps {
  estado: string;
  mensajeError: string | null;
  onReintentar: () => void;
  /** Acción cuando la cita no se encontró: ver Mis citas o volver. */
  accionNoEncontrada: Accion;
}

/**
 * La cita no se pudo cargar (con el mensaje del tipo de error y Reintentar) o no se encontró. Fuera de
 * esos dos estados no pinta nada. Lo comparten el anticipo, el detalle y reprogramar.
 */
export function EstadoCargaCita({ estado, mensajeError, onReintentar, accionNoEncontrada }: EstadoCargaCitaProps) {
  if (estado === 'error') {
    return (
      <EstadoCita
        titulo="No pudimos cargar tu cita"
        mensaje={mensajeError ?? ''}
        accion={{ titulo: 'Reintentar', onPress: onReintentar }}
      />
    );
  }
  if (estado === 'noEncontrado') {
    return (
      <EstadoCita
        titulo="No encontramos esta cita"
        mensaje="Puede que ya no esté disponible. Revisa tus citas para ver su estado."
        accion={accionNoEncontrada}
      />
    );
  }
  return null;
}

const styles = StyleSheet.create({
  estado: {
    flexGrow: 1,
    paddingHorizontal: pantalla.margen,
  },
});
