/// <reference types="jest" />

import {
  BOTON_GOJI_RESPALDO,
  destinoDePromocion,
  partirDestacado,
  tituloBotonGoji,
} from '@/features/inicio/models/contenidoInicioModel';
import { RESPALDO_CONFIGURACION } from '@/shared/api/configuracionPublica';

/**
 * GP-07.3: reglas puras del contenido de Inicio (src/features/inicio/models/contenidoInicioModel.ts):
 * cómo se parte la frase grande del hero, el texto del botón del Fluido Di Goji y a dónde lleva el
 * enlace de una promoción. Sin red ni React.
 */

describe('partirDestacado (contenido.inicio.heroDestacado)', () => {
  it('la frase del respaldo queda "Brillo / que se / nota": serif, manuscrita y serif', () => {
    expect(partirDestacado(RESPALDO_CONFIGURACION.contenido.inicio.heroDestacado)).toEqual([
      { texto: 'Brillo', estilo: 'serif' },
      { texto: 'que se', estilo: 'manuscrita' },
      { texto: 'nota', estilo: 'serif' },
    ]);
  });

  it('con tres palabras, la del medio sola va en manuscrita', () => {
    expect(partirDestacado('Belleza muy natural')).toEqual([
      { texto: 'Belleza', estilo: 'serif' },
      { texto: 'muy', estilo: 'manuscrita' },
      { texto: 'natural', estilo: 'serif' },
    ]);
  });

  it('con más de tres palabras, todas las del medio van juntas en manuscrita', () => {
    expect(partirDestacado('Tu cabello merece lo mejor')).toEqual([
      { texto: 'Tu', estilo: 'serif' },
      { texto: 'cabello merece lo', estilo: 'manuscrita' },
      { texto: 'mejor', estilo: 'serif' },
    ]);
  });

  it.each<[string, string[]]>([
    ['una palabra', ['Brillo']],
    ['dos palabras', ['Brillo', 'propio']],
  ])('con %s, todo en serif, una línea por palabra', (_caso, palabras) => {
    expect(partirDestacado(palabras.join(' '))).toEqual(palabras.map((texto) => ({ texto, estilo: 'serif' })));
  });

  it('recorta y junta los espacios de sobra; sin palabras no hay líneas', () => {
    expect(partirDestacado('   Brillo    que \n se   nota  ')).toEqual([
      { texto: 'Brillo', estilo: 'serif' },
      { texto: 'que se', estilo: 'manuscrita' },
      { texto: 'nota', estilo: 'serif' },
    ]);
    expect(partirDestacado('   ')).toEqual([]);
  });
});

describe('tituloBotonGoji', () => {
  it('usa el nombre del catálogo: "Ver {nombre}"', () => {
    expect(tituloBotonGoji('Fluido Di Goji AVYNA')).toBe('Ver Fluido Di Goji AVYNA');
    expect(tituloBotonGoji('  Fluido Goji  ')).toBe('Ver Fluido Goji');
  });

  it.each([null, undefined, '', '   '])('sin nombre (%p) deja el texto de siempre', (nombre) => {
    expect(tituloBotonGoji(nombre)).toBe(BOTON_GOJI_RESPALDO);
    expect(BOTON_GOJI_RESPALDO).toBe('Ver Fluido Di Goji');
  });
});

describe('destinoDePromocion', () => {
  it('una URL https se abre fuera de la app', () => {
    expect(destinoDePromocion('https://promos.test/otono')).toEqual({ tipo: 'url', url: 'https://promos.test/otono' });
  });

  it.each<[string, string]>([
    ['/cliente/servicios-citas', '/citas'],
    ['/cliente/servicios-citas/', '/citas'],
    ['/cliente/servicios-citas?categoria=color', '/citas'],
    ['/cliente/servicios-citas/servicios/12', '/servicio/12'],
    ['/cliente/tienda-online', '/tienda'],
    ['/contacto', '/salon'],
    ['/sobre-nosotros', '/salon'],
  ])('la ruta del sitio %s abre la pantalla %s de la app', (enlace, ruta) => {
    expect(destinoDePromocion(enlace)).toEqual({ tipo: 'ruta', ruta });
  });

  it.each(['/citas', '/tienda', '/salon', '/servicio/7', '/producto/34', '/mis-citas'])(
    'la ruta propia de la app %s se acepta tal cual',
    (ruta) => {
      expect(destinoDePromocion(ruta)).toEqual({ tipo: 'ruta', ruta });
    },
  );

  it.each([null, '', '/admin/contenido', '/ruta-que-no-existe', '/servicio/7/editar'])(
    'sin enlace o con una ruta sin pantalla (%p) la tarjeta no es enlace',
    (enlace) => {
      expect(destinoDePromocion(enlace)).toBeNull();
    },
  );
});
