import { useEffect, useState } from 'react';
import { Keyboard } from 'react-native';

/**
 * true mientras el teclado está abierto. Las cabeceras lo usan para guardar el título de la pantalla
 * y dejarle el espacio al formulario (en un teléfono chico, cabecera, título y teclado no caben).
 */
export function useTecladoVisible(): boolean {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const mostrar = Keyboard.addListener('keyboardDidShow', () => setVisible(true));
    const ocultar = Keyboard.addListener('keyboardDidHide', () => setVisible(false));
    return () => {
      mostrar.remove();
      ocultar.remove();
    };
  }, []);
  return visible;
}
