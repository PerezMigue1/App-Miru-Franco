import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';

import { useBienvenida } from '../viewmodels/useBienvenida';

/** Primera apertura: invita a crear cuenta o a iniciar sesión, sin obligar a hacerlo. */
export function HojaBienvenida({ introTerminada }: { introTerminada: boolean }) {
  const { visible, crearCuenta, iniciarSesion, explorar } = useBienvenida(introTerminada);
  return (
    <Hoja
      visible={visible}
      onCerrar={explorar}
      titulo="Te damos la bienvenida a Mirú Franco"
      texto="Crea tu cuenta para reservar citas y comprar, o conoce el salón primero."
    >
      <Button titulo="Crear cuenta" onPress={crearCuenta} />
      <Button titulo="Iniciar sesión" variante="secundario" onPress={iniciarSesion} />
      <Button titulo="Explorar primero" variante="secundario" onPress={explorar} />
    </Hoja>
  );
}
