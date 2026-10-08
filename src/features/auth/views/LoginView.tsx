import { useNavigation, useRouter } from 'expo-router';

import { AuthContainer } from '../components/AuthContainer';
import { useLoginViewModel } from '../viewmodels/useLoginViewModel';
import { useRegistroViewModel } from '../viewmodels/useRegistroViewModel';
import { useDescartarPendiente } from '../viewmodels/useRequiereSesion';
import { useRetornoActivacion } from '../viewmodels/useRetornoActivacion';

export default function LoginView() {
  const login = useLoginViewModel();
  const registro = useRegistroViewModel();
  const { aviso, retorno } = useRetornoActivacion();
  const { push, replace } = useRouter();
  const navegacion = useNavigation();
  const descartarPendiente = useDescartarPendiente();
  const recuperar = () => push('/recuperar');
  // Cierra todo Acceso (aunque haya varias pantallas suyas en la pila) y vuelve a la pestaña
  // donde estaba; abierto desde un enlace, lleva a Inicio.
  const cerrar = () => {
    descartarPendiente();
    const pilaPrincipal = navegacion.getParent();
    if (pilaPrincipal?.canGoBack()) {
      pilaPrincipal.goBack();
      return;
    }
    replace('/inicio');
  };

  return (
    <AuthContainer
      vistaInicial="acceso"
      login={login}
      registro={registro}
      onRecuperar={recuperar}
      aviso={aviso}
      retorno={retorno}
      onCerrar={cerrar}
    />
  );
}
