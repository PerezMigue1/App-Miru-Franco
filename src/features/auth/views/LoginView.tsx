import { useRouter } from 'expo-router';

import { AuthContainer } from '../components/AuthContainer';
import { useLoginViewModel } from '../viewmodels/useLoginViewModel';
import { useRegistroViewModel } from '../viewmodels/useRegistroViewModel';
import { useRetornoActivacion } from '../viewmodels/useRetornoActivacion';

export default function LoginView() {
  const login = useLoginViewModel();
  const registro = useRegistroViewModel();
  const { aviso, retorno } = useRetornoActivacion();
  const { push } = useRouter();
  const recuperar = () => push('/recuperar');

  return (
    <AuthContainer
      vistaInicial="acceso"
      login={login}
      registro={registro}
      onRecuperar={recuperar}
      aviso={aviso}
      retorno={retorno}
    />
  );
}
