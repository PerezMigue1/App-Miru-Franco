import { StyleSheet, Text, View } from 'react-native';

import { estilosDetalle } from '@/shared/ui/estilosDetalle';
import { borde, espacio, fuente, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { DatoTicket, LineaVisible, TicketVisible } from '../viewmodels/useComprobanteViewModel';

/**
 * Pesos de las columnas de la tabla (concepto, cantidad, precio unitario e importe): proporciones del
 * ancho del ticket, iguales en el encabezado y en cada fila, para que las cifras queden alineadas y
 * nada se salga a 360 dp ni con la fuente del sistema grande. El concepto se parte en varias líneas;
 * las cifras van en una sola línea y se ajustan al ancho de su columna.
 */
const COLUMNA = { concepto: 5, cantidad: 2, precio: 4, importe: 4 } as const;

/**
 * El ticket del comprobante (GP-09), con el diseño del ticket del punto de venta de la web: encabezado
 * vino con el nombre del salón, tabla con encabezado dorado, TOTAL en dorado y la despedida en el
 * color del texto principal (vino en claro). Va sobre la superficie elevada (blanca en claro, carbón
 * claro en oscuro). Contrastes (WCAG): crema sobre vino 10.85:1 y blanco sobre vino 12.26:1; el
 * encabezado de la tabla es el oro grande con el color de la superficie encima (blanco sobre el oro
 * grande claro 6.02:1, carbón claro sobre el oro oscuro 5.30:1); el TOTAL en el oro grande sobre la
 * superficie da lo mismo. El oro de marca no se usa como fondo de texto: blanco encima da 4.49:1.
 */
export function TicketComprobante({ ticket }: Readonly<{ ticket: TicketVisible }>) {
  const { colores } = useTheme();
  const textoCuerpo = { color: colores.textoCuerpo };
  const textoSuave = { color: colores.textoSuave };

  return (
    <View style={[styles.ticket, { backgroundColor: colores.superficieElevada, shadowColor: colores.sombraTarjeta }]}>
      <View style={[styles.encabezado, { backgroundColor: colores.accion }]}>
        <Text style={[styles.salon, { color: colores.textoSobreAccion }]}>{ticket.salon}</Text>
        <Text style={[styles.tituloTicket, { color: colores.textoSobreAccion }]}>{ticket.titulo}</Text>
      </View>

      <View style={styles.bloque}>
        {ticket.datosSalon.map((linea) => (
          <Text key={linea} style={[styles.pequeno, textoSuave]}>
            {linea}
          </Text>
        ))}
      </View>

      <View style={styles.bloque}>
        <Text style={[styles.pequeno, textoCuerpo]}>
          {`${ticket.folio.etiqueta}: `}
          <Text style={[styles.folio, { color: colores.texto }]}>{ticket.folio.valor}</Text>
          {ticket.compra ? <Text style={textoSuave}>{` ${ticket.compra}`}</Text> : null}
        </Text>
        <Dato dato={ticket.fecha} />
        {ticket.atendio ? <Dato dato={ticket.atendio} /> : null}
        <Dato dato={ticket.clienta} />
      </View>

      <Tabla ticket={ticket} />

      <View style={styles.bloque}>
        {ticket.montos.map((monto) => (
          <View key={monto.clave} style={styles.filaMonto}>
            <Text style={[styles.pequeno, styles.etiquetaMonto, textoCuerpo]}>{monto.etiqueta}</Text>
            <Text style={[styles.pequeno, styles.cifra, textoCuerpo]}>{monto.valor}</Text>
          </View>
        ))}
        <View style={styles.filaMonto} accessible accessibilityLabel={ticket.total.etiquetaAccesible}>
          <Text style={[styles.total, styles.etiquetaMonto, { color: colores.oroGrande }]}>
            {ticket.total.etiqueta}
            <Text style={[styles.pequeno, textoSuave]}>{` ${ticket.total.nota}`}</Text>
          </Text>
          <Text style={[styles.total, styles.cifra, { color: colores.oroGrande }]}>{ticket.total.valor}</Text>
        </View>
        <View style={styles.pago}>
          <Dato dato={ticket.metodoPago} />
          {ticket.referencia ? <Dato dato={ticket.referencia} /> : null}
        </View>
      </View>

      <View style={[styles.bloque, styles.leyendas]}>
        {ticket.leyendas.iva ? <Text style={[styles.pequeno, textoSuave]}>{ticket.leyendas.iva}</Text> : null}
        {ticket.leyendas.cambios ? <Text style={[styles.pequeno, textoSuave]}>{ticket.leyendas.cambios}</Text> : null}
        {ticket.leyendas.noEsFactura || ticket.leyendas.factura ? (
          <Text style={[styles.pequeno, textoSuave]}>
            {ticket.leyendas.noEsFactura ? <Text style={styles.negrita}>{ticket.leyendas.noEsFactura}</Text> : null}
            {ticket.leyendas.noEsFactura && ticket.leyendas.factura ? ' ' : null}
            {ticket.leyendas.factura}
          </Text>
        ) : null}
      </View>

      <View style={[styles.bloque, styles.ultimo]}>
        <Text style={[styles.gracias, { color: colores.texto }]}>{ticket.gracias}</Text>
      </View>
    </View>
  );
}

/** "Etiqueta: valor" en una línea que se parte si no cabe. */
function Dato({ dato }: Readonly<{ dato: DatoTicket }>) {
  const { colores } = useTheme();
  return (
    <Text style={[styles.pequeno, { color: colores.textoCuerpo }]}>
      {`${dato.etiqueta}: `}
      <Text style={styles.valorDato}>{dato.valor}</Text>
    </Text>
  );
}

/**
 * Tabla de conceptos. TalkBack la anuncia como lista con el número de conceptos; cada fila se lee
 * completa (concepto, cantidad, precio, importe y su descuento) y el encabezado visual se le oculta.
 */
function Tabla({ ticket }: Readonly<{ ticket: TicketVisible }>) {
  const { colores } = useTheme();
  const { columnas } = ticket;
  const encabezado = [styles.encabezadoColumna, { color: colores.superficieElevada }];
  return (
    <View accessibilityRole="list" accessibilityLabel={ticket.etiquetaTabla}>
      <View
        style={[styles.fila, styles.filaEncabezado, { backgroundColor: colores.oroGrande }]}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Text style={[encabezado, styles.concepto]}>{columnas.concepto}</Text>
        <Text style={[encabezado, styles.columnaCantidad, styles.derecha]}>{columnas.cantidad}</Text>
        <Text style={[encabezado, styles.columnaPrecio, styles.derecha]}>{columnas.precio}</Text>
        <Text style={[encabezado, styles.columnaImporte, styles.derecha]}>{columnas.importe}</Text>
      </View>
      {ticket.lineas.map((linea, indice) => (
        <Fila key={linea.clave} linea={linea} primera={indice === 0} />
      ))}
    </View>
  );
}

function Fila({ linea, primera }: Readonly<{ linea: LineaVisible; primera: boolean }>) {
  const { colores } = useTheme();
  const cifra = [styles.pequeno, styles.cifra, styles.derecha, { color: colores.textoCuerpo }];
  return (
    <View
      accessible
      accessibilityLabel={linea.etiquetaAccesible}
      style={[styles.fila, primera ? null : { borderTopWidth: borde.hairline, borderTopColor: colores.hairline }]}
    >
      <View style={styles.concepto}>
        <Text style={[styles.pequeno, { color: colores.textoCuerpo }]}>{linea.descripcion}</Text>
        {linea.descuento ? <Text style={[styles.etiqueta, { color: colores.textoSuave }]}>{linea.descuento}</Text> : null}
      </View>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[cifra, styles.columnaCantidad]}>
        {linea.cantidad}
      </Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[cifra, styles.columnaPrecio]}>
        {linea.precio}
      </Text>
      <Text numberOfLines={1} adjustsFontSizeToFit style={[cifra, styles.columnaImporte]}>
        {linea.importe}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  ticket: {
    ...estilosDetalle.tarjeta,
    padding: 0,
    gap: 0,
    overflow: 'hidden',
  },
  encabezado: {
    paddingHorizontal: espacio.l,
    paddingVertical: espacio.m,
    gap: espacio.xxs,
  },
  salon: {
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
  },
  tituloTicket: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  bloque: {
    paddingHorizontal: espacio.l,
    paddingTop: espacio.m,
    gap: espacio.xxs,
  },
  leyendas: {
    gap: espacio.s,
  },
  ultimo: {
    paddingBottom: espacio.l,
  },
  pago: {
    marginTop: espacio.s,
    gap: espacio.xxs,
  },
  pequeno: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  etiqueta: {
    fontFamily: fuente.texto,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
    fontVariant: ['tabular-nums'],
  },
  valorDato: {
    fontFamily: fuente.textoMedio,
  },
  folio: {
    fontFamily: fuente.textoNegrita,
    fontVariant: ['tabular-nums'],
  },
  negrita: {
    fontFamily: fuente.textoNegrita,
  },
  fila: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: espacio.s,
    paddingHorizontal: espacio.l,
    paddingVertical: espacio.s,
  },
  filaEncabezado: {
    marginTop: espacio.m,
  },
  encabezadoColumna: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.etiqueta.tamano,
    lineHeight: tipo.etiqueta.linea,
  },
  concepto: {
    flex: COLUMNA.concepto,
    minWidth: 0,
    gap: espacio.xxs,
  },
  columnaCantidad: {
    flex: COLUMNA.cantidad,
    minWidth: 0,
  },
  columnaPrecio: {
    flex: COLUMNA.precio,
    minWidth: 0,
  },
  columnaImporte: {
    flex: COLUMNA.importe,
    minWidth: 0,
  },
  derecha: {
    textAlign: 'right',
  },
  cifra: {
    fontVariant: ['tabular-nums'],
  },
  filaMonto: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    columnGap: espacio.m,
  },
  etiquetaMonto: {
    flexShrink: 1,
  },
  total: {
    marginTop: espacio.xs,
    fontFamily: fuente.textoNegrita,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
  },
  gracias: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
});
