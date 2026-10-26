import { fechaLocal } from '@/shared/ui/fechasLegibles';
import type {
  DiaHorario,
  DiaInhabil,
  DiaSemana,
  SalonPublico,
} from '@/shared/api/configuracionPublica';
import { soloDigitos } from '@/shared/ui/digitos';

/**
 * Reglas puras de la pantalla El salón (GP-07.3): enlaces de contacto (teléfono, WhatsApp, correo y
 * mapa) a partir de los datos de la configuración pública, el horario de la semana y los próximos
 * días sin servicio. Sin React ni peticiones: todo sale de la configuración que ya está en memoria.
 */

/** Un teléfono de México tiene 10 dígitos; con menos no se arma enlace. */
const DIGITOS_TELEFONO = 10;
const LADA_MEXICO = '52';

/** Días sin servicio que se muestran como máximo. */
export const MAXIMO_DIAS_INHABILES = 6;

/** Búsqueda de Google Maps cuando el salón no publica su enlace de mapa. */
export const BUSQUEDA_MAPA = 'https://www.google.com/maps/search/?api=1&query=';

/** Nombre de cada día en español, con acentos. */
export const NOMBRE_DIA: Readonly<Record<DiaSemana, string>> = {
  lunes: 'Lunes',
  martes: 'Martes',
  miercoles: 'Miércoles',
  jueves: 'Jueves',
  viernes: 'Viernes',
  sabado: 'Sábado',
  domingo: 'Domingo',
};

/** Día de la semana de una fecha local (getDay: 0 es domingo). */
const DIAS_POR_INDICE: DiaSemana[] = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/** Los dígitos con la lada: 10 dígitos llevan 52 delante; menos de 10 no sirven (null). */
function digitosConLada(numero: string): string | null {
  const digitos = soloDigitos(numero);
  if (digitos.length < DIGITOS_TELEFONO) {
    return null;
  }
  return digitos.length === DIGITOS_TELEFONO ? `${LADA_MEXICO}${digitos}` : digitos;
}

/** "tel:+527711234567" (como enlaceTelefono de la web), o null si no hay un teléfono completo. */
export function enlaceTelefono(telefono: string): string | null {
  const digitos = digitosConLada(telefono);
  return digitos ? `tel:+${digitos}` : null;
}

/** "https://wa.me/527711234567" con solo dígitos (10 dígitos llevan 52), o null. */
export function enlaceWhatsApp(numero: string): string | null {
  const digitos = digitosConLada(numero);
  return digitos ? `https://wa.me/${digitos}` : null;
}

/** "mailto:correo@dominio" para un correo con forma de correo (sin espacios y con @), o null. */
export function enlaceCorreo(correo: string): string | null {
  const limpio = correo.trim();
  return /^[^\s@]+@[^\s@]+$/.test(limpio) ? `mailto:${limpio}` : null;
}

/** Dirección y ciudad en una línea ("Calle 1, Huejutla de Reyes, Hidalgo"), o '' sin ninguna. */
export function domicilio(salon: Pick<SalonPublico, 'direccion' | 'ciudad'>): string {
  return [salon.direccion.trim(), salon.ciudad.trim()].filter(Boolean).join(', ');
}

/**
 * Enlace "Ver en el mapa": el mapaUrl del salón si es https; si no lo hay y sí hay dirección, la
 * búsqueda de Google Maps con el domicilio (dirección y ciudad) codificado; sin dirección, null.
 */
export function enlaceMapa(salon: Pick<SalonPublico, 'mapaUrl' | 'direccion' | 'ciudad'>): string | null {
  const mapa = salon.mapaUrl.trim();
  if (mapa.startsWith('https://') && mapa.length > 'https://'.length) {
    return mapa;
  }
  return salon.direccion.trim() ? `${BUSQUEDA_MAPA}${encodeURIComponent(domicilio(salon))}` : null;
}

/** El día de la semana de una fecha, en hora local. */
export function diaDeLaSemana(fecha: Date): DiaSemana {
  return DIAS_POR_INDICE[fecha.getDay()];
}

/** "09:30" a "9:30": sin el cero de la hora, como se dice el horario. */
export function horaCorta(hora: string): string {
  const [horas, minutos] = hora.trim().split(':');
  return minutos === undefined ? hora.trim() : `${Number(horas)}:${minutos}`;
}

/** Un día del horario listo para pintar. */
export interface DiaDelHorario {
  dia: DiaSemana;
  /** "Miércoles". */
  nombre: string;
  cerrado: boolean;
  /** "9:30" y "19:30"; vacíos si cierra. */
  abre: string;
  cierra: string;
  /** Es el día de hoy (hora local). */
  hoy: boolean;
}

/** Los siete días del horario en su orden (lunes a domingo), con el de hoy marcado. */
export function horarioDeLaSemana(dias: DiaHorario[], hoy: Date): DiaDelHorario[] {
  const diaHoy = diaDeLaSemana(hoy);
  return dias.map((dia) => ({
    dia: dia.dia,
    nombre: NOMBRE_DIA[dia.dia],
    cerrado: dia.cerrado,
    abre: dia.cerrado ? '' : horaCorta(dia.abre),
    cierra: dia.cerrado ? '' : horaCorta(dia.cierra),
    hoy: dia.dia === diaHoy,
  }));
}

/**
 * Próximos días sin servicio: los de hoy en adelante (fecha local del teléfono), ordenados del más
 * cercano al más lejano y hasta `maximo`.
 */
export function diasInhabilesProximos(
  dias: DiaInhabil[],
  hoy: Date,
  maximo: number = MAXIMO_DIAS_INHABILES,
): DiaInhabil[] {
  const desde = fechaLocal(hoy);
  return dias
    .filter((dia) => dia.fecha >= desde)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, maximo);
}
