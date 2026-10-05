import { useRouter } from 'expo-router';

import { AuthContainer } from '../components/AuthContainer';

export default function LoginView() {
  const { replace } = useRouter();

  // TODO(GP-05): se reemplaza por el inicio de sesión real; por ahora "Entrar" solo navega a las pestañas.
  const entrar = () => replace('/inicio');

  return <AuthContainer vistaInicial="acceso" onEntrar={entrar} />;
}
