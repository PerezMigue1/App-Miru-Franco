import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';

interface HojaAccesoProps {
  visible: boolean;
  onCerrar: () => void;
  onIniciarSesion: () => void;
  onCrearCuenta: () => void;
}

/** "Inicia sesión para continuar": aparece cuando una acción necesita una cuenta. */
export function HojaAcceso({ visible, onCerrar, onIniciarSesion, onCrearCuenta }: HojaAccesoProps) {
  return (
    <Hoja
      visible={visible}
      onCerrar={onCerrar}
      titulo="Inicia sesión para continuar"
      texto="Con tu cuenta puedes reservar citas, comprar en la tienda y recibir tus avisos."
    >
      <Button titulo="Iniciar sesión" onPress={onIniciarSesion} />
      <Button titulo="Crear cuenta" variante="secundario" onPress={onCrearCuenta} />
      <Button titulo="Ahora no" variante="secundario" onPress={onCerrar} />
    </Hoja>
  );
}
