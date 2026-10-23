import {
  Ban,
  Package,
  PackageCheck,
  PackageMinus,
  PackageX,
  Repeat2,
  RotateCcw,
  Shuffle,
  ShoppingBag,
  type LucideIcon,
} from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { Casilla } from '@/shared/ui/Casilla';
import { Hoja } from '@/shared/ui/Hoja';
import { Input } from '@/shared/ui/Input';
import { espacio, fuente, tipo } from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { OpcionSolicitud, SolicitudDevolucionViewModel } from '../viewmodels/useDetallePedidoViewModel';
import { ErrorHoja } from './ErrorHoja';
import { OpcionPago } from './OpcionPago';

interface HojaSolicitarDevolucionProps {
  solicitud: SolicitudDevolucionViewModel;
}

const ICONO_TIPO: Record<string, LucideIcon> = { cambio: Repeat2, reembolso: RotateCcw };

const ICONO_CAUSA: Record<string, LucideIcon> = {
  sellado_sin_abrir: PackageCheck,
  defecto_fabrica: PackageX,
  producto_distinto: Shuffle,
  sin_existencias: PackageMinus,
  cancelacion_antes_listo: Ban,
};

/**
 * Hoja para pedir un cambio o un reembolso del pedido (la página de devoluciones de la web): la
 * política, qué necesita, qué pasó, el producto, la confirmación de que está sellado y un detalle
 * opcional. Solo ofrece lo que procede con el estado del pedido; mientras envía no responde.
 */
export function HojaSolicitarDevolucion({ solicitud }: HojaSolicitarDevolucionProps) {
  const { colores } = useTheme();
  const { textos } = solicitud;
  const bloqueada = solicitud.enviando;

  return (
    <Hoja visible={solicitud.hojaVisible} onCerrar={solicitud.cerrar} titulo={textos.titulo}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.contenido}>
        <Text style={[styles.parrafo, { color: colores.textoCuerpo }]}>{textos.politica}</Text>

        <Grupo
          pregunta={textos.tipoPregunta}
          opciones={solicitud.tipos}
          elegida={solicitud.tipo}
          iconoDe={(valor) => ICONO_TIPO[valor]}
          onElegir={solicitud.elegirTipo}
          deshabilitada={bloqueada}
        />

        <Grupo
          pregunta={textos.causaPregunta}
          opciones={solicitud.causas}
          elegida={solicitud.causa}
          iconoDe={(valor) => ICONO_CAUSA[valor]}
          onElegir={solicitud.elegirCausa}
          deshabilitada={bloqueada}
        />

        {/* Con la hoja abierta siempre hay un artículo libre o el pedido completo (opcionesDevolucion). */}
        <Grupo
          pregunta={textos.articuloPregunta}
          opciones={solicitud.articulos}
          elegida={solicitud.articulo}
          iconoDe={(valor) => (valor === null ? ShoppingBag : Package)}
          onElegir={solicitud.elegirArticulo}
          deshabilitada={bloqueada}
        />

        {solicitud.pideSellado ? (
          <Casilla
            marcada={solicitud.sellado}
            onCambiar={solicitud.cambiarSellado}
            etiquetaAccesible={textos.sellado}
            deshabilitada={bloqueada}
          >
            {textos.sellado}
          </Casilla>
        ) : null}

        <Input
          etiqueta={textos.motivo}
          valor={solicitud.motivo}
          onCambiar={solicitud.cambiarMotivo}
          ayuda={textos.motivoAyuda}
          multilinea
          largoMaximo={solicitud.largoMotivo}
        />

        <ErrorHoja mensaje={solicitud.error} />

        <View style={styles.acciones}>
          <Button
            titulo={bloqueada ? textos.enviando : textos.enviar}
            onPress={solicitud.enviar}
            cargando={bloqueada}
          />
          <Button titulo={textos.volver} variante="secundario" onPress={solicitud.cerrar} deshabilitado={bloqueada} />
        </View>
      </ScrollView>
    </Hoja>
  );
}

interface GrupoProps<T> {
  pregunta: string;
  opciones: OpcionSolicitud<T>[];
  elegida: T | null;
  iconoDe: (valor: T) => LucideIcon;
  onElegir: (valor: T) => void;
  deshabilitada: boolean;
}

/** Una pregunta con sus opciones como radios (las mismas tarjetas que la forma de pago). */
function Grupo<T extends string | number | null>({ pregunta, opciones, elegida, iconoDe, onElegir, deshabilitada }: GrupoProps<T>) {
  const { colores } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={pregunta} style={styles.grupo}>
      <Text style={[styles.pregunta, { color: colores.texto }]}>{pregunta}</Text>
      {opciones.map((opcion) => (
        <OpcionPago
          key={String(opcion.valor)}
          titulo={opcion.titulo}
          descripcion={opcion.descripcion}
          Icono={iconoDe(opcion.valor)}
          elegida={opcion.valor === elegida}
          onPress={() => onElegir(opcion.valor)}
          deshabilitada={deshabilitada}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  contenido: {
    gap: espacio.l,
  },
  parrafo: {
    fontFamily: fuente.texto,
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
    fontVariant: ['tabular-nums'],
  },
  grupo: {
    gap: espacio.m,
  },
  pregunta: {
    fontFamily: fuente.textoFuerte,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  acciones: {
    gap: espacio.m,
  },
});
