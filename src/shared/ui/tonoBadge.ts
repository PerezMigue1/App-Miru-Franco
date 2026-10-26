/**
 * Tono de una insignia de estado (BadgeEstado). Vive en un archivo de solo tipos para que los models
 * de cualquier feature lo usen sin importar un componente.
 */
export type TonoBadge = 'aviso' | 'exito' | 'neutro' | 'peligro' | 'info';

/** Texto y tono de una insignia (BadgeEstado). */
export interface EtiquetaEstado {
  texto: string;
  tono: TonoBadge;
}
