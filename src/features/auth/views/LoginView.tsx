import { useLocalSearchParams, useRouter } from 'expo-router';

import { AuthContainer } from '../components/AuthContainer';
import { useLoginViewModel } from '../viewmodels/useLoginViewModel';
import { useRegistroViewModel } from '../viewmodels/useRegistroViewModel';

export default function LoginView() {
  const login = useLoginViewModel();
  const registro = useRegistroViewModel();
  const { push } = useRouter();
  const { activada } = useLocalSearchParams<{ activada?: string }>();
  const recuperar = () => push('/recuperar');
  const aviso = activada === '1' ? 'Tu cuenta quedó activada. Ya puedes iniciar sesión.' : null;

  return (
    <AuthContainer vistaInicial="acceso" login={login} registro={registro} onRecuperar={recuperar} aviso={aviso} />
  );
}
