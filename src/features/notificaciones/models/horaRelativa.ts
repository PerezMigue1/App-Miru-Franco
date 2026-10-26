import { fechaLocal } from '@/shared/ui/fechasLegibles';

/**
 * Hora de un aviso dicha como la diría una persona, con la fecha y la hora locales del teléfono
 * (México es UTC-6: comparar días con toISOString los recorrería). Función pura: `ahora` se recibe
 * para probarla con una fecha fija.
 */

const MINUTO_MS = 60_000;
const HORA_MS = 60 * MINUTO_MS;

/** Meses abreviados de es-MX ("sept", como Intl en es-MX), sin depender de Intl del teléfono. */
const MESES_CORTOS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];

/** El día local anterior a `fecha`, en 'YYYY-MM-DD' (new Date resuelve el cambio de mes y año). */
function diaAnterior(fecha: Date): string {
  return fechaLocal(new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate() - 1));
}

/**
 * - Menos de un minuto (o una fecha adelantada por el reloj del teléfono): "Hace un momento".
 * - Menos de una hora: "Hace 5 min".
 * - El mismo día local: "Hace 2 h".
 * - El día local anterior: "Ayer".
 * - Antes: fecha corta, "18 oct", con el año si no es el actual ("18 oct 2025").
 * '' si `fechaIso` es null o no es una fecha válida.
 */
export function horaRelativa(fechaIso: string | null, ahora: Date = new Date()): string {
  if (!fechaIso) {
    return '';
  }
  const fecha = new Date(fechaIso);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  const transcurrido = ahora.getTime() - fecha.getTime();
  if (transcurrido < MINUTO_MS) {
    return 'Hace un momento';
  }
  if (transcurrido < HORA_MS) {
    return `Hace ${Math.floor(transcurrido / MINUTO_MS)} min`;
  }
  const dia = fechaLocal(fecha);
  if (dia === fechaLocal(ahora)) {
    return `Hace ${Math.floor(transcurrido / HORA_MS)} h`;
  }
  if (dia === diaAnterior(ahora)) {
    return 'Ayer';
  }
  const corta = `${fecha.getDate()} ${MESES_CORTOS[fecha.getMonth()]}`;
  return fecha.getFullYear() === ahora.getFullYear() ? corta : `${corta} ${fecha.getFullYear()}`;
}
