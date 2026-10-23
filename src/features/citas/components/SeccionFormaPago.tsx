import { CreditCard, Landmark, Store, Wallet, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OpcionPago } from '@/features/tienda/components/OpcionPago';
import { DatosTransferencia } from '@/shared/ui/DatosTransferencia';
import { espacio, fuente, icono, radio, sombra, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { FormaPagoReserva, OpcionAnticipo } from '../viewmodels/formaPagoReserva';

interface SeccionFormaPagoProps {
  formaPago: FormaPagoReserva;
  opcion: OpcionAnticipo;
  onElegir: (opcion: OpcionAnticipo) => void;
  /** La casilla de la Política de anticipos (solo con anticipo), al final de la sección. */
  casilla?: ReactNode;
  /** Mientras se envía, las opciones no cambian. */
  deshabilitada: boolean;
}

const ICONO_OPCION: Record<OpcionAnticipo, LucideIcon> = {
  linea: CreditCard,
  salon: Store,
};

/**
 * "Forma de pago" del paso Confirmar (FormaPagoCita de la web), siempre visible. Con anticipo: el
 * monto y el saldo, la pregunta con las opciones activas como radios (cada una con su plazo), qué
 * pasa si no llega, el aviso para reagendar, los métodos del salón (con los datos de transferencia si
 * se paga en el salón) y la casilla de la política. Sin anticipo: cuánto se paga en el salón, con qué
 * métodos y los datos de transferencia. Solo pinta lo que arma el viewmodel.
 */
export function SeccionFormaPago({ formaPago, opcion, onElegir, casilla, deshabilitada }: SeccionFormaPagoProps) {
  const { colores } = useTheme();
  const tarjeta = [styles.tarjeta, { backgroundColor: colores.superficie, shadowColor: colores.sombraTarjeta }];

  return (
    <View style={styles.seccion}>
      <View style={styles.encabezado}>
        <View importantForAccessibility="no-hide-descendants">
          <Wallet color={colores.oro} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </View>
        <Text accessibilityRole="header" style={[styles.titulo, { color: colores.texto }]}>
          Forma de pago
        </Text>
      </View>

      {formaPago.conAnticipo ? (
        <>
          <View style={tarjeta}>
            <Monto {...formaPago.anticipo} />
            {formaPago.saldo ? <Monto {...formaPago.saldo} /> : null}
            {formaPago.descuento ? (
              <Text style={[styles.nota, { color: colores.textoSuave }]}>{formaPago.descuento}</Text>
            ) : null}
          </View>

          <View accessibilityRole="radiogroup" accessibilityLabel={formaPago.pregunta} style={styles.opciones}>
            <Text style={[styles.pregunta, { color: colores.texto }]}>{formaPago.pregunta}</Text>
            {formaPago.opciones.map((item) => (
              <OpcionPago
                key={item.opcion}
                titulo={item.etiqueta}
                descripcion={item.plazo}
                Icono={ICONO_OPCION[item.opcion]}
                elegida={item.opcion === opcion}
                onPress={() => onElegir(item.opcion)}
                deshabilitada={deshabilitada}
              />
            ))}
          </View>

          <View style={styles.avisos}>
            {formaPago.avisos.map((aviso) => (
              <Text key={aviso} style={[styles.nota, { color: colores.textoSuave }]}>
                {aviso}
              </Text>
            ))}
            {formaPago.metodos ? <Metodos texto={formaPago.metodos} /> : null}
            <DatosTransferencia datos={formaPago.transferencia} />
          </View>
          {casilla}
        </>
      ) : (
        <View style={tarjeta}>
          <Text style={[styles.sinAnticipo, { color: colores.texto }]}>{formaPago.sinAnticipo}</Text>
          {formaPago.metodos ? <Metodos texto={formaPago.metodos} /> : null}
          <DatosTransferencia datos={formaPago.transferencia} />
        </View>
      )}
    </View>
  );
}

/** Etiqueta y monto con cifras tabulares, leídos juntos. */
function Monto({ etiqueta, monto }: { etiqueta: string; monto: string }) {
  const { colores } = useTheme();
  return (
    <View accessible accessibilityLabel={`${etiqueta}: ${monto}`} style={styles.monto}>
      <Text style={[styles.etiquetaMonto, { color: colores.textoSuave }]}>{etiqueta}</Text>
      <Text style={[styles.cifra, { color: colores.texto }]}>{monto}</Text>
    </View>
  );
}

/** Métodos de pago del salón con su ícono. */
function Metodos({ texto }: { texto: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.metodos}>
      <View importantForAccessibility="no-hide-descendants">
        <Landmark color={colores.textoSuave} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <Text style={[styles.nota, styles.flexible, { color: colores.textoSuave }]}>{texto}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  seccion: {
    gap: espacio.l,
  },
  encabezado: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
  },
  titulo: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
  },
  tarjeta: {
    gap: espacio.m,
    padding: espacio.l,
    borderRadius: radio.tarjeta,
    shadowOpacity: sombra.tarjeta.opacidad,
    shadowRadius: sombra.tarjeta.radio,
    shadowOffset: { width: 0, height: sombra.tarjeta.desplazamientoY },
    elevation: sombra.tarjeta.elevacion,
  },
  monto: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: espacio.l,
  },
  etiquetaMonto: {
    flex: 1,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  cifra: {
    fontFamily: fuente.textoNegrita,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    fontVariant: ['tabular-nums'],
  },
  opciones: {
    gap: espacio.m,
  },
  pregunta: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  avisos: {
    gap: espacio.s,
  },
  nota: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  flexible: {
    flex: 1,
  },
  metodos: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
  },
  sinAnticipo: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
});
