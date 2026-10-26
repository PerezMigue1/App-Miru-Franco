import { StyleSheet, Text } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { fuente, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { Enlace } from './AuthContainer';

interface AccionesCodigoProps {
  /** Texto del botón principal ("Verificar código", "Reactivar mi cuenta" o el de su espera). */
  tituloAccion: string;
  onAccion: () => void;
  cargandoAccion: boolean;
  /** Tras un 429 de la acción principal: deshabilitado hasta que pase la espera. */
  accionDeshabilitada: boolean;
  /** Segundos que faltan para poder pedir otro código (0 = ya se puede). */
  esperaOtroCodigo: number;
  /** "Podrás pedir otro código en N s" o "Pide otro código en N s", mientras dura la espera. */
  textoEspera: string;
  /** Texto del enlace para pedir otro código. */
  textoOtroCodigo: string;
  onOtroCodigo: () => void;
  otroCodigoDeshabilitado: boolean;
}

/**
 * Parte común de Activar y Reactivar debajo del campo del código: el botón principal y, debajo, la
 * espera para pedir otro código (región en vivo, con cifras tabulares) o el enlace para pedirlo.
 */
export function AccionesCodigo({
  tituloAccion,
  onAccion,
  cargandoAccion,
  accionDeshabilitada,
  esperaOtroCodigo,
  textoEspera,
  textoOtroCodigo,
  onOtroCodigo,
  otroCodigoDeshabilitado,
}: AccionesCodigoProps) {
  const { colores } = useTheme();
  return (
    <>
      <Button titulo={tituloAccion} onPress={onAccion} cargando={cargandoAccion} deshabilitado={accionDeshabilitada} />
      {esperaOtroCodigo > 0 ? (
        <Text accessibilityLiveRegion="polite" style={[styles.espera, { color: colores.textoSuave }]}>
          {textoEspera}
        </Text>
      ) : (
        <Enlace
          texto={textoOtroCodigo}
          onPress={onOtroCodigo}
          alinear="centro"
          deshabilitado={otroCodigoDeshabilitado}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  espera: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    textAlign: 'center',
    fontVariant: ['tabular-nums'],
  },
});
