/**
 * Funciones y constantes de presentación de las citas (fechas, horas, calendario e insignias) para
 * los componentes de src/features/citas/components. Existe para que los componentes no importen
 * valores de models/ (solo sus tipos con import type): los toman de la capa viewmodel, que los
 * vuelve a exportar tal cual desde citaModel. Sin React ni estado.
 */
export {
  compararMeses,
  ENCABEZADOS_SEMANA,
  estadoAnticipo,
  etiquetaEstadoAnticipo,
  etiquetaEstadoCita,
  fechaLegible,
  fechaLocal,
  horaLegible,
  limitePagoCorto,
  mesDe,
  semanasDelMes,
  tituloMes,
} from '../models/citaModel';
