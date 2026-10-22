/// <reference types="jest" />

import { crearLectorSse, type EventoSse } from '@/features/notificaciones/models/lectorSse';

/**
 * GP-07.2: lector incremental de SSE (src/features/notificaciones/models/lectorSse.ts). Es puro: se
 * le pasa texto por trozos y se revisa qué eventos emite. Sin red ni temporizadores.
 */

const AVISO_JSON = '{"id":"aviso-ficticio-1","titulo":"Tu cita","mensaje":"Mañana a las 10"}';
const BLOQUE_AVISO = `id: 0\nevent: notificacion\ndata: ${AVISO_JSON}\n\n`;

function lector() {
  const eventos: EventoSse[] = [];
  const sse = crearLectorSse((evento) => eventos.push(evento));
  return { sse, eventos };
}

/** Pasa el texto completo en trozos del tamaño indicado. */
function enTrozos(texto: string, tamano: number): string[] {
  const trozos: string[] = [];
  for (let i = 0; i < texto.length; i += tamano) {
    trozos.push(texto.slice(i, i + tamano));
  }
  return trozos;
}

describe('crearLectorSse', () => {
  it('emite un aviso del backend con su event, data e id', () => {
    const { sse, eventos } = lector();
    sse.leer(BLOQUE_AVISO);
    expect(eventos).toEqual([{ evento: 'notificacion', data: AVISO_JSON, id: '0' }]);
  });

  it('el keep-alive del backend llega como evento con data vacía (lo ignora la conexión)', () => {
    const { sse, eventos } = lector();
    sse.leer('id: 0\nevent: keep-alive\ndata: \n\n');
    expect(eventos).toEqual([{ evento: 'keep-alive', data: '', id: '0' }]);
  });

  it.each([1, 2, 3, 7])('da lo mismo cortado en trozos de %i caracteres', (tamano) => {
    const { sse, eventos } = lector();
    const texto = `${BLOQUE_AVISO}: comentario\n\n${BLOQUE_AVISO}`;
    enTrozos(texto, tamano).forEach((trozo) => sse.leer(trozo));
    expect(eventos).toHaveLength(2);
    expect(eventos.every((evento) => evento.data === AVISO_JSON)).toBe(true);
  });

  it.each([
    ['\\r\\n', '\r\n'],
    ['\\r', '\r'],
  ])('acepta saltos %s', (_nombre, salto) => {
    const { sse, eventos } = lector();
    sse.leer(['event: notificacion', 'data: uno', 'data: dos', '', ''].join(salto));
    expect(eventos).toEqual([{ evento: 'notificacion', data: 'uno\ndos', id: '' }]);
  });

  it('un \\r\\n partido entre dos trozos cuenta como un solo salto', () => {
    const { sse, eventos } = lector();
    sse.leer('data: uno\r');
    sse.leer('\ndata: dos\r');
    sse.leer('\n\r');
    sse.leer('\n');
    expect(eventos).toEqual([{ evento: '', data: 'uno\ndos', id: '' }]);
  });

  it('un trozo vacío no cambia nada y un \\r al inicio del siguiente es otro salto', () => {
    const { sse, eventos } = lector();
    sse.leer('data: uno\r');
    sse.leer('');
    sse.leer('\r');
    expect(eventos).toEqual([{ evento: '', data: 'uno', id: '' }]);
  });

  it('ignora comentarios, campos desconocidos y bloques sin data', () => {
    const { sse, eventos } = lector();
    sse.leer(': ping\n\nevent: solo-evento\n\notro: valor\ndata\n\n');
    // "data" sin dos puntos es una línea data vacía.
    expect(eventos).toEqual([{ evento: '', data: '', id: '' }]);
  });

  it('quita solo un espacio después de los dos puntos', () => {
    const { sse, eventos } = lector();
    sse.leer('data:sin espacio\ndata:  con dos\n\n');
    expect(eventos[0].data).toBe('sin espacio\n con dos');
  });

  it('conserva el último id entre eventos e ignora un id con NUL', () => {
    const { sse, eventos } = lector();
    sse.leer('id: 7\ndata: a\n\ndata: b\n\nid: 8\0\ndata: c\n\n');
    expect(eventos.map((evento) => evento.id)).toEqual(['7', '7', '7']);
  });

  it('lee retry solo si son dígitos', () => {
    const { sse } = lector();
    expect(sse.reintentoMs()).toBeNull();
    sse.leer('retry: 5000\n\nretry: pronto\n\n');
    expect(sse.reintentoMs()).toBe(5000);
  });

  it('quita la marca BOM solo al inicio del flujo', () => {
    const { sse, eventos } = lector();
    const bom = String.fromCodePoint(0xfeff);
    sse.leer(`${bom}data: a\n\n`);
    sse.leer(`${bom}data: b\n\n`);
    // La segunda marca ya no está al inicio: forma parte del nombre del campo y se ignora.
    expect(eventos).toEqual([{ evento: '', data: 'a', id: '' }]);
  });

  it('terminar descarta el evento y la línea a medias', () => {
    const { sse, eventos } = lector();
    sse.leer('event: notificacion\ndata: incomple');
    sse.terminar();
    sse.leer('data: nuevo\n\n');
    expect(eventos).toEqual([{ evento: '', data: 'nuevo', id: '' }]);
  });
});
