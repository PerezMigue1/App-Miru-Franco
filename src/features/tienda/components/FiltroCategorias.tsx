import { memo, useCallback } from 'react';

import { FilaPastillas } from '@/shared/ui/FilaPastillas';
import { PastillaFiltro } from '@/shared/ui/PastillaFiltro';

interface FiltroCategoriasProps {
  categorias: string[];
  /** Categoría elegida; null es "Todas". */
  elegida: string | null;
  onElegir: (categoria: string | null) => void;
}

/** Fila de categorías con scroll horizontal: "Todas" y las del catálogo cargado. */
export function FiltroCategorias({ categorias, elegida, onElegir }: FiltroCategoriasProps) {
  return (
    <FilaPastillas accessibilityLabel="Categorías">
      <Chip texto="Todas" valor={null} activo={elegida === null} onElegir={onElegir} />
      {categorias.map((categoria) => (
        <Chip
          key={categoria}
          texto={categoria}
          valor={categoria}
          activo={elegida === categoria}
          onElegir={onElegir}
        />
      ))}
    </FilaPastillas>
  );
}

interface ChipProps {
  texto: string;
  valor: string | null;
  activo: boolean;
  onElegir: (categoria: string | null) => void;
}

/** Una categoría: la misma pastilla de filtro que el catálogo de servicios. */
const Chip = memo(function Chip({ texto, valor, activo, onElegir }: ChipProps) {
  const elegir = useCallback(() => onElegir(valor), [onElegir, valor]);
  return (
    <PastillaFiltro
      texto={texto}
      activo={activo}
      onPress={elegir}
      accessibilityLabel={`Categoría ${texto}`}
    />
  );
});
