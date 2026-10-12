import { ScrollView, StyleSheet } from 'react-native';

import { OpcionesFiltro, PieFiltros, RangoFiltro, SeccionFiltro } from '@/shared/ui/Filtros';
import { Hoja } from '@/shared/ui/Hoja';
import { espacio, filtrosTienda } from '@/shared/ui/tokens';

import type {
  FiltrosTienda,
  GrupoFiltroTienda,
  GrupoFiltroVisible,
} from '../viewmodels/useCatalogoViewModel';

interface HojaFiltrosTiendaProps {
  visible: boolean;
  /** Cerrar sin aplicar (velo, botón Atrás): el borrador se descarta. */
  onCerrar: () => void;
  /** Categoría elegida: se nombra bajo el título, como "Filtros (Maquillaje)" de la web. */
  categoria: string | null;
  borrador: FiltrosTienda;
  borradorActivos: number;
  grupos: GrupoFiltroVisible[];
  onCambiarPrecioMinimo: (valor: string) => void;
  onCambiarPrecioMaximo: (valor: string) => void;
  onAlternar: (grupo: GrupoFiltroTienda, opcion: string) => void;
  onLimpiar: () => void;
  onAplicar: () => void;
}

/**
 * Panel de filtros de la Tienda en una hoja inferior, con los grupos del panel de la web: Precio,
 * Descuentos, Marca, los de la categoría (maquillaje o piel) y Otras características. Lo elegido
 * es un borrador: solo cuenta al tocar "Aplicar". Si los grupos no caben, se desplazan dentro de la
 * hoja y el pie queda siempre a la vista.
 */
export function HojaFiltrosTienda({
  visible,
  onCerrar,
  categoria,
  borrador,
  borradorActivos,
  grupos,
  onCambiarPrecioMinimo,
  onCambiarPrecioMaximo,
  onAlternar,
  onLimpiar,
  onAplicar,
}: HojaFiltrosTiendaProps) {
  return (
    <Hoja
      visible={visible}
      onCerrar={onCerrar}
      titulo="Filtros"
      texto={categoria ? `Categoría: ${categoria}` : undefined}
    >
      <ScrollView
        style={styles.lista}
        contentContainerStyle={styles.contenido}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator
      >
        <SeccionFiltro titulo="Precio">
          <RangoFiltro
            etiquetaMinimo="Mínimo"
            etiquetaMaximo="Máximo"
            minimo={borrador.precioMinimo}
            maximo={borrador.precioMaximo}
            onCambiarMinimo={onCambiarPrecioMinimo}
            onCambiarMaximo={onCambiarPrecioMaximo}
          />
        </SeccionFiltro>
        {grupos.map((grupo) => (
          <SeccionFiltro key={grupo.clave} titulo={grupo.titulo}>
            <OpcionesFiltro
              opciones={grupo.opciones}
              seleccionadas={borrador.opciones[grupo.clave]}
              onAlternar={(opcion) => onAlternar(grupo.clave, opcion)}
              vacio={grupo.vacio}
            />
          </SeccionFiltro>
        ))}
      </ScrollView>
      <PieFiltros activos={borradorActivos} onLimpiar={onLimpiar} onAplicar={onAplicar} />
    </Hoja>
  );
}

const styles = StyleSheet.create({
  // Se encoge con la hoja cuando no cabe (la hoja tiene alto máximo bajo la barra de estado).
  lista: {
    flexGrow: 0,
    flexShrink: 1,
  },
  contenido: {
    gap: filtrosTienda.separacionSecciones,
    paddingBottom: espacio.s,
  },
});
