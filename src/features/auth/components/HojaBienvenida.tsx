import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';

import { useTextosAuth } from '../viewmodels/textosAuth';
import { useBienvenida } from '../viewmodels/useBienvenida';

/** Primera apertura: invita a crear cuenta o a iniciar sesión, sin obligar a hacerlo. */
export function HojaBienvenida({ introTerminada }: { introTerminada: boolean }) {
  const { visible, crearCuenta, iniciarSesion, explorar } = useBienvenida(introTerminada);
  const { acceso, bienvenida } = useTextosAuth();
  return (
    <Hoja visible={visible} onCerrar={explorar} titulo={bienvenida.titulo} texto={bienvenida.texto}>
      <Button titulo={acceso.crearCuenta} onPress={crearCuenta} />
      <Button titulo={acceso.iniciarSesion} variante="secundario" onPress={iniciarSesion} />
      <Button titulo={bienvenida.explorar} variante="secundario" onPress={explorar} />
    </Hoja>
  );
}
