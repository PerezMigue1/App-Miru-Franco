import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';

interface HojaConfirmacionProps {
  visible: boolean;
  titulo: string;
  texto: string;
  /** Texto de la acción destructiva (por ejemplo, "Quitar foto"). */
  accion: string;
  /** Texto de la opción que deja todo como estaba (por omisión, "Cancelar"). */
  cancelar?: string;
  /**
   * true (por omisión): la acción es destructiva y va en el color de peligro. false: es dar un permiso
   * y va como la acción principal.
   */
  destructiva?: boolean;
  onConfirmar: () => void;
  onCancelar: () => void;
}

/**
 * Confirmación antes de una acción destructiva (la acción va en el color de peligro) o de dar un
 * permiso (la acción principal); "Cancelar" deja todo como estaba. Las dos se hunden al presionar,
 * como todos los botones.
 */
export function HojaConfirmacion({
  visible,
  titulo,
  texto,
  accion,
  cancelar = 'Cancelar',
  destructiva = true,
  onConfirmar,
  onCancelar,
}: HojaConfirmacionProps) {
  return (
    <Hoja visible={visible} onCerrar={onCancelar} titulo={titulo} texto={texto}>
      <Button titulo={accion} variante={destructiva ? 'peligro' : 'primario'} onPress={onConfirmar} />
      <Button titulo={cancelar} variante="secundario" onPress={onCancelar} />
    </Hoja>
  );
}
