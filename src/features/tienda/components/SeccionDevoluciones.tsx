import { StyleSheet, Text, View } from 'react-native';

import { BadgeEstado } from '@/features/citas/components/BadgeEstado';
import { Button } from '@/shared/ui/Button';
import { Skeleton } from '@/shared/ui/Skeleton';
import { borde, espacio, esqueleto, fuente, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { DevolucionVisible, PagoVisible } from '../viewmodels/detallePedido';
import type { EstadoDevoluciones, TextosDevoluciones } from '../viewmodels/useDetallePedidoViewModel';

interface SeccionDevolucionesProps {
  estado: EstadoDevoluciones;
  devoluciones: DevolucionVisible[];
  pagos: PagoVisible[];
  textos: TextosDevoluciones;
  onReintentar: () => void;
  /** Texto del botón para retirar una solicitud pendiente. */
  textoRetirar: string;
  /** Abre la confirmación para retirar esa solicitud. */
  onRetirar: (id: number) => void;
}

/**
 * Devoluciones y reembolsos del pedido (GP-07.5): cada solicitud o revocación con su estado, tipo,
 * monto, motivo y respuesta del salón (las pendientes con su botón para retirarlas), y los pagos con
 * el estado de su reembolso. Va dentro de una tarjeta del detalle: si no se pudo cargar lo dice con
 * Reintentar, sin bloquear el resto.
 */
export function SeccionDevoluciones({
  estado,
  devoluciones,
  pagos,
  textos,
  onReintentar,
  textoRetirar,
  onRetirar,
}: SeccionDevolucionesProps) {
  const { colores } = useTheme();

  if (estado === 'cargando') {
    return (
      <View accessible accessibilityRole="progressbar" accessibilityLabel={textos.cargando} style={styles.lista}>
        <Skeleton estilo={styles.lineaMedia} />
        <Skeleton estilo={styles.lineaCorta} />
      </View>
    );
  }

  if (estado === 'error') {
    return (
      <View style={styles.lista}>
        <Text style={[styles.texto, { color: colores.texto }]}>{textos.error}</Text>
        <Button titulo={textos.reintentar} variante="secundario" onPress={onReintentar} />
      </View>
    );
  }

  return (
    <View style={styles.lista}>
      {devoluciones.length === 0 ? (
        <Text style={[styles.texto, { color: colores.textoSuave }]}>{textos.vacia}</Text>
      ) : (
        devoluciones.map((devolucion, indice) => (
          <View key={devolucion.id} style={styles.lista}>
            {indice > 0 ? <View style={[styles.linea, { backgroundColor: colores.hairline }]} /> : null}
            <FilaDevolucion devolucion={devolucion} notaTitulo={textos.notaTitulo} />
            {devolucion.puedeRetirar ? (
              <Button
                titulo={textoRetirar}
                variante="contorno"
                accessibilityLabel={devolucion.tipo ? `${textoRetirar}: ${devolucion.tipo}` : textoRetirar}
                onPress={() => onRetirar(devolucion.id)}
              />
            ) : null}
          </View>
        ))
      )}

      {pagos.length > 0 ? (
        <View style={styles.lista}>
          <View style={[styles.linea, { backgroundColor: colores.hairline }]} />
          <Text accessibilityRole="header" style={[styles.subtitulo, { color: colores.texto }]}>
            {textos.pagosTitulo}
          </Text>
          {pagos.map((pago) => (
            <View key={pago.id} style={styles.fila}>
              <View style={styles.encabezado}>
                <BadgeEstado texto={pago.insignia.texto} tono={pago.insignia.tono} />
                <Text style={[styles.cifra, { color: colores.texto }]}>{pago.monto}</Text>
              </View>
              {pago.detalle ? (
                <Text style={[styles.texto, { color: colores.textoSuave }]}>{pago.detalle}</Text>
              ) : null}
            </View>
          ))}
        </View>
      ) : null}
    </View>
  );
}

function FilaDevolucion({ devolucion, notaTitulo }: { devolucion: DevolucionVisible; notaTitulo: string }) {
  const { colores } = useTheme();
  return (
    <View style={styles.fila}>
      <View style={styles.encabezado}>
        <View style={styles.insignias}>
          <BadgeEstado texto={devolucion.insignia.texto} tono={devolucion.insignia.tono} />
          {devolucion.tipo ? (
            <Text style={[styles.tipo, { color: colores.texto }]}>{devolucion.tipo}</Text>
          ) : null}
        </View>
        {devolucion.monto ? (
          <Text style={[styles.cifra, { color: colores.texto }]}>{devolucion.monto}</Text>
        ) : null}
      </View>
      {devolucion.motivo ? (
        <Text style={[styles.texto, { color: colores.texto }]}>{devolucion.motivo}</Text>
      ) : null}
      {devolucion.metodo ? (
        <Text style={[styles.texto, { color: colores.texto }]}>{devolucion.metodo}</Text>
      ) : null}
      {devolucion.nota ? (
        <View style={styles.nota}>
          <Text style={[styles.subtitulo, { color: colores.texto }]}>{notaTitulo}</Text>
          <Text style={[styles.texto, { color: colores.texto }]}>{devolucion.nota}</Text>
        </View>
      ) : null}
      {devolucion.fecha ? (
        <Text style={[styles.detalle, { color: colores.textoSuave }]}>{devolucion.fecha}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  lista: {
    gap: espacio.m,
  },
  fila: {
    gap: espacio.s,
  },
  encabezado: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: espacio.s,
  },
  insignias: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: espacio.s,
  },
  linea: {
    height: borde.hairline,
  },
  subtitulo: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  tipo: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  texto: {
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  detalle: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
    fontVariant: ['tabular-nums'],
  },
  cifra: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
    fontVariant: ['tabular-nums'],
  },
  nota: {
    gap: espacio.xxs,
  },
  lineaMedia: {
    width: esqueleto.anchoMedio,
    height: esqueleto.linea,
  },
  lineaCorta: {
    width: esqueleto.anchoCorto,
    height: esqueleto.linea,
  },
});
