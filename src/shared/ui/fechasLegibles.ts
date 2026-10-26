// ── Fechas locales (México, UTC-6) ─────────────────────────────────────────────────────────
//
// Fechas y horas para la clienta, siempre con el año, mes, día y hora locales del teléfono (nunca
// con toISOString, que pasa a UTC y recorre el día). Las usan varias features; citaModel las vuelve
// a exportar para las pantallas de citas.

/** Nombres de los días por getDay(): 0 es domingo. */
export const NOMBRES_DIAS: readonly string[] = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/** Nombres de los meses por getMonth(): 0 es enero. */
export const NOMBRES_MESES: readonly string[] = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

function dosDigitos(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date o texto a Date. Un 'YYYY-MM-DD' suelto se arma en hora local (no en UTC). */
export function aFecha(valor: string | Date): Date {
  if (valor instanceof Date) {
    return valor;
  }
  const partes = valor.trim().split('-');
  if (partes.length === 3 && partes[0].length === 4 && partes[1].length === 2 && partes[2].length === 2) {
    const [anio, mes, dia] = partes.map(Number);
    return new Date(anio, mes - 1, dia);
  }
  return new Date(valor);
}

/** 'YYYY-MM-DD' con el año, mes y día locales del teléfono (sin pasar a UTC). */
export function fechaLocal(fecha: Date): string {
  return `${fecha.getFullYear()}-${dosDigitos(fecha.getMonth() + 1)}-${dosDigitos(fecha.getDate())}`;
}

/** 'sábado 18 de octubre'; '' si la fecha no es válida. */
export function fechaLegible(valor: string | Date): string {
  const fecha = aFecha(valor);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  return `${NOMBRES_DIAS[fecha.getDay()]} ${fecha.getDate()} de ${NOMBRES_MESES[fecha.getMonth()]}`;
}

/** '6:30 p. m.' (12 horas, hora local); '' si la fecha no es válida. */
export function horaLegible(valor: string | Date): string {
  const fecha = aFecha(valor);
  if (Number.isNaN(fecha.getTime())) {
    return '';
  }
  const horas = fecha.getHours();
  const hora12 = horas % 12 === 0 ? 12 : horas % 12;
  return `${hora12}:${dosDigitos(fecha.getMinutes())} ${horas < 12 ? 'a. m.' : 'p. m.'}`;
}

/** 'jueves 29 de octubre de 2026' (año, mes y día locales); '' si la fecha no es válida. */
export function fechaLargaLegible(valor: string | Date): string {
  const fecha = aFecha(valor);
  const dia = fechaLegible(fecha);
  return dia ? `${dia} de ${fecha.getFullYear()}` : '';
}

/**
 * 'Sábado 18 de octubre, 6:30 p. m.' con los componentes locales de la fecha ISO. Es la única forma
 * de escribir un día y hora completos (por ejemplo, el "De" y el "A" al reprogramar), así los dos
 * salen en la misma zona horaria. '' si la fecha no es válida.
 */
export function fechaHoraLegible(valor: string | Date): string {
  const dia = fechaLegible(valor);
  if (!dia) {
    return '';
  }
  return `${dia.charAt(0).toUpperCase()}${dia.slice(1)}, ${horaLegible(valor)}`;
}
