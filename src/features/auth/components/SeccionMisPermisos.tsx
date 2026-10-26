import { Camera, HeartPulse, Megaphone, type LucideIcon } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import { FilaInterruptor, SeccionFilas } from '@/shared/ui/TarjetaFilas';
import { espacio, pantalla, toqueMinimo } from '@/shared/ui/tokens';

import type { PermisoPrivacidad, PermisosPrivacidadViewModel } from '../viewmodels/usePermisosPrivacidad';
import { HojaConfirmacion } from './HojaConfirmacion';
import { HojaDatosSensibles } from './HojaDatosSensibles';
import { MiCuentaAviso } from './MiCuentaAviso';

const ICONOS: Record<PermisoPrivacidad, LucideIcon> = {
  salud: HeartPulse,
  promociones: Megaphone,
  fotos: Camera,
};

/**
 * Mis permisos (vista: solo pinta): un interruptor por permiso con el estado que confirmó el
 * backend (FilaInterruptor: role switch, checked y 3:1 o más en claro y oscuro), la confirmación
 * antes de retirar o de volver a autorizar las fotos y la hoja de la autorización de datos de salud.
 */
export function SeccionMisPermisos({ vm }: { vm: PermisosPrivacidadViewModel }) {
  return (
    <View style={styles.seccion}>
      {vm.estado === 'cargando' ? (
        <SeccionFilas titulo={vm.titulo}>
          <View
            key="cargando"
            accessible
            accessibilityLabel={vm.textoCargando}
            accessibilityState={{ busy: true }}
            style={styles.cargando}
          >
            <Skeleton estilo={styles.esqueleto} />
            <Skeleton estilo={styles.esqueleto} />
          </View>
        </SeccionFilas>
      ) : null}
      {vm.estado === 'error' ? (
        <SeccionFilas titulo={vm.titulo}>
          <View key="error" style={styles.cargando}>
            <MiCuentaAviso tono="peligro" texto={vm.error} />
            <Button titulo={vm.textoReintentar} variante="secundario" onPress={vm.reintentar} />
          </View>
        </SeccionFilas>
      ) : null}
      {vm.estado === 'lista' ? (
        <SeccionFilas titulo={vm.titulo}>
          {vm.interruptores.map((interruptor) => (
            <FilaInterruptor
              key={interruptor.permiso}
              icono={ICONOS[interruptor.permiso]}
              titulo={interruptor.titulo}
              descripcion={interruptor.descripcion}
              encendido={interruptor.encendido}
              onCambiar={interruptor.cambiar}
              deshabilitada={interruptor.deshabilitado}
            />
          ))}
        </SeccionFilas>
      ) : null}
      <View style={styles.aviso}>
        <MiCuentaAviso tono={vm.aviso?.tono ?? 'exito'} texto={vm.aviso?.texto ?? null} />
      </View>
      <HojaConfirmacion
        visible={vm.confirmacion.visible}
        titulo={vm.confirmacion.titulo}
        texto={vm.confirmacion.texto}
        accion={vm.confirmacion.accion}
        destructiva={vm.confirmacion.destructiva}
        cancelar={vm.confirmacion.cancelar}
        onConfirmar={vm.confirmacion.confirmar}
        onCancelar={vm.confirmacion.cerrar}
      />
      <HojaDatosSensibles vm={vm.hojaSalud} />
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: {
    gap: espacio.m,
  },
  cargando: {
    gap: espacio.m,
    padding: espacio.xl,
  },
  esqueleto: {
    height: toqueMinimo,
  },
  aviso: {
    marginHorizontal: pantalla.margen,
  },
});
