import { Bell } from 'lucide-react-native';

import { FilaInterruptor } from '@/shared/ui/TarjetaFilas';

import { useInterruptorAvisos } from '../viewmodels/preferenciaAvisosEstado';

/**
 * Fila "Avisos en la app" de Perfil (GP-07.6): enciende o apaga los avisos internos en vivo (la
 * conexión, la consulta de respaldo y el aviso en pantalla). Apagados, la bandeja sigue en la
 * campana y se pide al abrirla. Solo con sesión: la preferencia es de cada clienta.
 */
export function FilaAvisosEnApp() {
  const interruptor = useInterruptorAvisos();
  return (
    <FilaInterruptor
      icono={Bell}
      titulo={interruptor.titulo}
      descripcion={interruptor.descripcion}
      encendido={interruptor.encendido}
      onCambiar={interruptor.cambiar}
      deshabilitada={interruptor.cargando}
    />
  );
}
