import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Appearance } from 'react-native';

import { guardarApariencia, leerApariencia, type PreferenciaApariencia } from './preferencias';

interface ContextoApariencia {
  preferencia: PreferenciaApariencia;
  /** Ya se leyó la preferencia guardada (la app espera para no parpadear de tema). */
  lista: boolean;
  cambiar: (preferencia: PreferenciaApariencia) => void;
}

const Contexto = createContext<ContextoApariencia>({
  preferencia: 'sistema',
  lista: true,
  cambiar: () => undefined,
});

/**
 * Valor de Appearance.setColorScheme para cada preferencia. 'unspecified' devuelve el control al
 * sistema: en react-native 0.86 ColorSchemeName es 'light' | 'dark' | 'unspecified' y null no es
 * válido (Libraries/Utilities/Appearance.d.ts, líneas 12 y 37).
 */
const ESQUEMA = { sistema: 'unspecified', claro: 'light', oscuro: 'dark' } as const;

/** Apariencia elegida por la clienta: se guarda en el teléfono y se aplica al instante. */
export function AparienciaProvider({ children }: { children: ReactNode }) {
  const [preferencia, setPreferencia] = useState<PreferenciaApariencia>('sistema');
  const [lista, setLista] = useState(false);

  useEffect(() => {
    let activo = true;
    leerApariencia()
      .then((guardada) => {
        if (!activo) {
          return;
        }
        Appearance.setColorScheme(ESQUEMA[guardada]);
        setPreferencia(guardada);
        setLista(true);
      })
      .catch(() => {
        if (activo) {
          setLista(true);
        }
      });
    return () => {
      activo = false;
    };
  }, []);

  const cambiar = useCallback((nueva: PreferenciaApariencia) => {
    Appearance.setColorScheme(ESQUEMA[nueva]);
    setPreferencia(nueva);
    guardarApariencia(nueva).catch(() => {
      // guardarApariencia ya absorbe sus errores.
    });
  }, []);

  const valor = useMemo(() => ({ preferencia, lista, cambiar }), [preferencia, lista, cambiar]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useApariencia(): ContextoApariencia {
  return useContext(Contexto);
}
