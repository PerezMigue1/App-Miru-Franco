import { Redirect } from 'expo-router';

/** La app abre en Inicio con o sin sesión: se explora libremente y Acceso se abre encima. */
export default function Index() {
  return <Redirect href="/inicio" />;
}
