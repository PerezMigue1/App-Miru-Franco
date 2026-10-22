/// <reference types="jest" />

import { horaRelativa } from '@/features/notificaciones/models/horaRelativa';

/**
 * GP-07.2: hora relativa de los avisos de la bandeja. Función pura con `ahora` fijo; las fechas se
 * arman con año, mes y día locales (new Date(año, mes, día, hora, minuto)), así la prueba da lo
 * mismo en cualquier zona horaria.
 */

/** Jueves 22 de octubre de 2026, 12:00 locales. */
const AHORA = new Date(2026, 9, 22, 12, 0, 0);

/** ISO del instante local indicado (el que mandaría el servidor). */
function iso(anio: number, mes: number, dia: number, hora = 0, minuto = 0, segundo = 0): string {
  return new Date(anio, mes, dia, hora, minuto, segundo).toISOString();
}

describe('horaRelativa', () => {
  it.each([
    ['sin fecha', null],
    ['texto que no es fecha', 'no es fecha'],
    ['cadena vacía', ''],
  ])('%s da cadena vacía', (_caso, fecha) => {
    expect(horaRelativa(fecha, AHORA)).toBe('');
  });

  it.each([
    ['ahora mismo', iso(2026, 9, 22, 12, 0, 0)],
    ['hace 30 segundos', iso(2026, 9, 22, 11, 59, 30)],
    ['hace 59 segundos', iso(2026, 9, 22, 11, 59, 1)],
    ['dos minutos en el futuro (reloj adelantado)', iso(2026, 9, 22, 12, 2, 0)],
  ])('%s: "Hace un momento"', (_caso, fecha) => {
    expect(horaRelativa(fecha, AHORA)).toBe('Hace un momento');
  });

  it.each([
    [iso(2026, 9, 22, 11, 59, 0), 'Hace 1 min'],
    [iso(2026, 9, 22, 11, 55, 0), 'Hace 5 min'],
    [iso(2026, 9, 22, 11, 1, 0), 'Hace 59 min'],
  ])('%s: %s', (fecha, esperado) => {
    expect(horaRelativa(fecha, AHORA)).toBe(esperado);
  });

  it.each([
    [iso(2026, 9, 22, 11, 0, 0), 'Hace 1 h'],
    [iso(2026, 9, 22, 10, 0, 0), 'Hace 2 h'],
    [iso(2026, 9, 22, 0, 5, 0), 'Hace 11 h'],
  ])('el mismo día local, %s: %s', (fecha, esperado) => {
    expect(horaRelativa(fecha, AHORA)).toBe(esperado);
  });

  it.each([
    ['ayer a las 23:30', iso(2026, 9, 21, 23, 30)],
    ['ayer a las 00:01', iso(2026, 9, 21, 0, 1)],
  ])('%s: "Ayer"', (_caso, fecha) => {
    expect(horaRelativa(fecha, AHORA)).toBe('Ayer');
  });

  it('pasada la medianoche, un aviso de hace 40 minutos sigue en minutos', () => {
    const ahora = new Date(2026, 9, 22, 0, 30);
    expect(horaRelativa(iso(2026, 9, 21, 23, 50), ahora)).toBe('Hace 40 min');
  });

  it('el 1 de enero, un aviso del 31 de diciembre es "Ayer" (cambio de año)', () => {
    const ahora = new Date(2027, 0, 1, 9, 0);
    expect(horaRelativa(iso(2026, 11, 31, 20, 0), ahora)).toBe('Ayer');
  });

  it('el 1 de marzo, un aviso del 28 de febrero es "Ayer" (cambio de mes)', () => {
    const ahora = new Date(2026, 2, 1, 9, 0);
    expect(horaRelativa(iso(2026, 1, 28, 20, 0), ahora)).toBe('Ayer');
  });

  it.each([
    ['anteayer', iso(2026, 9, 20, 18, 30), '20 oct'],
    ['a principios de septiembre', iso(2026, 8, 5, 10, 0), '5 sept'],
    ['en enero', iso(2026, 0, 2, 10, 0), '2 ene'],
    ['el año pasado', iso(2025, 9, 18, 10, 0), '18 oct 2025'],
  ])('%s da la fecha corta: %s', (_caso, fecha, esperado) => {
    expect(horaRelativa(fecha, AHORA)).toBe(esperado);
  });

  it('sin `ahora` usa la hora actual del teléfono', () => {
    expect(horaRelativa(new Date().toISOString())).toBe('Hace un momento');
  });
});
