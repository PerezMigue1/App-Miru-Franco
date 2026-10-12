import { ScrollView, StyleSheet, View } from 'react-native';

import { CasillaFiltro, PieFiltros, RangoFiltro, SeccionFiltro } from '@/shared/ui/Filtros';
import { Hoja } from '@/shared/ui/Hoja';
import { espacio } from '@/shared/ui/tokens';

import type { FiltrosServicios } from '../viewmodels/useCatalogoServiciosViewModel';

interface HojaFiltrosServiciosProps {
  visible: boolean;
  /** Lo que la clienta va eligiendo; no filtra la lista hasta "Aplicar". */
  borrador: FiltrosServicios;
  /** Filtros con valor en el borrador: con 0, "Limpiar filtros" se deshabilita. */
  activos: number;
  onCambiar: (cambios: Partial<FiltrosServicios>) => void;
  onCerrar: () => void;
  onAplicar: () => void;
  onLimpiar: () => void;
}

/**
 * Filtros avanzados del catálogo con los campos y textos del panel de la web: precio en pesos,
 * duración en minutos y solo servicios con evaluación previa. Los campos van en un ScrollView para
 * que, con el teclado abierto, el pie con "Aplicar" siga a la vista.
 */
export function HojaFiltrosServicios({
  visible,
  borrador,
  activos,
  onCambiar,
  onCerrar,
  onAplicar,
  onLimpiar,
}: HojaFiltrosServiciosProps) {
  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo="Filtros">
      <ScrollView
        style={styles.campos}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <SeccionFiltro titulo="Precio (MXN)">
          <RangoFiltro
            etiquetaMinimo="Mínimo"
            etiquetaMaximo="Máximo"
            minimo={borrador.precioMinimo}
            maximo={borrador.precioMaximo}
            onCambiarMinimo={(precioMinimo) => onCambiar({ precioMinimo })}
            onCambiarMaximo={(precioMaximo) => onCambiar({ precioMaximo })}
          />
        </SeccionFiltro>
        <SeccionFiltro titulo="Duración (minutos)">
          <RangoFiltro
            etiquetaMinimo="Mínima"
            etiquetaMaximo="Máxima"
            minimo={borrador.duracionMinima}
            maximo={borrador.duracionMaxima}
            onCambiarMinimo={(duracionMinima) => onCambiar({ duracionMinima })}
            onCambiarMaximo={(duracionMaxima) => onCambiar({ duracionMaxima })}
          />
        </SeccionFiltro>
        <CasillaFiltro
          texto="Solo servicios que requieren evaluación previa"
          activo={borrador.soloEvaluacion}
          onCambiar={(soloEvaluacion) => onCambiar({ soloEvaluacion })}
        />
      </ScrollView>
      <View style={styles.pie}>
        <PieFiltros activos={activos} onLimpiar={onLimpiar} onAplicar={onAplicar} />
      </View>
    </Hoja>
  );
}

const styles = StyleSheet.create({
  // Se encoge dentro de la hoja cuando el teclado le quita alto; sin teclado mide su contenido.
  campos: {
    flexGrow: 0,
    flexShrink: 1,
  },
  contenido: {
    gap: espacio.l,
  },
  pie: {
    paddingTop: espacio.s,
  },
});
