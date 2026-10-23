import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';

import { useTextosAuth } from '../viewmodels/textosAuth';

interface HojaAccesoProps {
  visible: boolean;
  onCerrar: () => void;
  onIniciarSesion: () => void;
  onCrearCuenta: () => void;
}

/** "Inicia sesión para continuar": aparece cuando una acción necesita una cuenta. */
export function HojaAcceso({ visible, onCerrar, onIniciarSesion, onCrearCuenta }: HojaAccesoProps) {
  const { acceso } = useTextosAuth();
  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo={acceso.hojaTitulo} texto={acceso.hojaTexto}>
      <Button titulo={acceso.iniciarSesion} onPress={onIniciarSesion} />
      <Button titulo={acceso.crearCuenta} variante="secundario" onPress={onCrearCuenta} />
      <Button titulo={acceso.ahoraNo} variante="secundario" onPress={onCerrar} />
    </Hoja>
  );
}
