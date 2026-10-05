import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/viewmodels/useAuth';

export default function Index() {
  const { estado } = useAuth();
  return <Redirect href={estado === 'autenticado' ? '/inicio' : '/login'} />;
}
