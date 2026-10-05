import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { checkHealth } from '@/shared/api/apiClient';

export default function HomeScreen() {
  // Temporal para verificar la conexión; se reemplaza en GP-04.
  const [backendOk, setBackendOk] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    checkHealth()
      .then((ok) => {
        if (active) {
          setBackendOk(ok);
        }
      })
      .catch(() => {
        if (active) {
          setBackendOk(false);
        }
      });
    return () => {
      active = false;
    };
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Miru Franco</Text>
      {backendOk !== null && (
        <Text>{backendOk ? 'Backend: conectado' : 'Backend: sin conexión'}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  title: {
    color: '#710014',
    fontSize: 24,
    fontWeight: '600',
  },
});
