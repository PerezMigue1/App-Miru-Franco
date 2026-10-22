/// <reference types="jest" />

import {
  MAXIMO_VALORES,
  normalizarConfiguracion,
  RESPALDO_CONFIGURACION,
  type ContenidoPublico,
} from '@/shared/api/configuracionPublica';

import { CONFIGURACION_COMPLETA, respuestaCompleta } from '../../helpers/configuracionFicticia';

/**
 * GP-07.3: normalización del contenido editable de la configuración pública (inicio, sobre nosotros
 * y contacto) en normalizarConfiguracion. Campo por campo, como el resto: los obligatorios del
 * backend vacíos o con otro tipo toman el respaldo, los opcionales pueden quedar vacíos, las
 * imágenes solo valen con https:// y las listas se limpian. Pura: sin red ni disco.
 */

const RESPALDO = RESPALDO_CONFIGURACION.contenido;
const COMPLETO = CONFIGURACION_COMPLETA.contenido;

type Seccion = keyof ContenidoPublico;

/** Contenido normalizado de respuestaCompleta() con una sección cambiada. */
function conSeccion(seccion: Seccion, cambios: unknown): ContenidoPublico {
  const contenido = respuestaCompleta().contenido as Record<Seccion, Record<string, unknown>>;
  const valor = cambios && typeof cambios === 'object' ? { ...contenido[seccion], ...cambios } : cambios;
  return normalizarConfiguracion({ ...respuestaCompleta(), contenido: { ...contenido, [seccion]: valor } }).contenido;
}

const valor = (i: number) => ({ titulo: `Valor ficticio ${i}`, descripcion: `Descripción ficticia ${i}` });

describe('contenido completo', () => {
  it('se queda con los campos conocidos, recortados, y sin los ajenos', () => {
    const { contenido } = normalizarConfiguracion(respuestaCompleta());

    expect(contenido).toEqual(COMPLETO);
    expect(contenido.inicio).not.toHaveProperty('campoAjeno');
  });

  it('queda congelado, igual que el respaldo', () => {
    const { contenido } = normalizarConfiguracion(respuestaCompleta());

    expect(Object.isFrozen(contenido.sobreNosotros.valores[0])).toBe(true);
    expect(Object.isFrozen(contenido.inicio.sobreNosotrosParrafos)).toBe(true);
    expect(Object.isFrozen(RESPALDO.sobreNosotros.valores)).toBe(true);
  });
});

describe('contenido que falta', () => {
  it.each([
    ['sin contenido (un archivo guardado antes de GP-07.3)', undefined],
    ['contenido en null', null],
    ['contenido que no es objeto', 'portada'],
    ['las tres secciones en null (sin guardar en el backend)', { inicio: null, sobreNosotros: null, contacto: null }],
  ])('%s: todo el contenido del respaldo', (_caso, contenido) => {
    expect(normalizarConfiguracion({ ...respuestaCompleta(), contenido }).contenido).toEqual(RESPALDO);
  });

  it.each<[Seccion]>([['inicio'], ['sobreNosotros'], ['contacto']])('sección %s en null: esa del respaldo y las demás del servidor', (seccion) => {
    expect(conSeccion(seccion, null)).toEqual({ ...COMPLETO, [seccion]: RESPALDO[seccion] });
  });
});

describe('textos obligatorios y opcionales', () => {
  it.each([
    ['vacíos', ''],
    ['con solo espacios', '   '],
    ['con otro tipo', 123],
  ])('obligatorios %s: el respaldo', (_caso, malo) => {
    const inicio = conSeccion('inicio', { heroTexto: malo, heroDestacado: malo, cierreTitulo: malo }).inicio;
    const sobreNosotros = conSeccion('sobreNosotros', { titulo: malo }).sobreNosotros;
    const contacto = conSeccion('contacto', { introduccion: malo, agendaTexto: malo }).contacto;

    expect(inicio).toEqual({
      ...COMPLETO.inicio,
      heroTexto: RESPALDO.inicio.heroTexto,
      heroDestacado: RESPALDO.inicio.heroDestacado,
      cierreTitulo: RESPALDO.inicio.cierreTitulo,
    });
    expect(sobreNosotros.titulo).toBe(RESPALDO.sobreNosotros.titulo);
    expect(contacto).toEqual(RESPALDO.contacto);
  });

  it('opcionales vacíos se quedan vacíos; con otro tipo toman el respaldo', () => {
    const inicio = conSeccion('inicio', { productosDescripcion: '  ', serviciosDescripcion: '', trabajoDescripcion: 7, cierreTexto: null }).inicio;

    expect(inicio).toMatchObject({
      productosDescripcion: '',
      serviciosDescripcion: '',
      trabajoDescripcion: RESPALDO.inicio.trabajoDescripcion,
      cierreTexto: RESPALDO.inicio.cierreTexto,
    });
  });
});

describe('imágenes', () => {
  it.each([
    ['http://', 'http://res.cloudinary.com/ficticio/salon.jpg'],
    ['ruta relativa', '/imagenes/salon.jpg'],
    ['subida sin dominio', 'sitio/panel_0123456789abcdef0123456789abcdef'],
    ['https:// sin nada más', 'https://'],
    ['con otro tipo', 42],
  ])('imagen %s: vacía', (_caso, imagen) => {
    expect(conSeccion('sobreNosotros', { imagen }).sobreNosotros.imagen).toBe('');
    expect(conSeccion('inicio', { sobreNosotrosImagen: imagen }).inicio.sobreNosotrosImagen).toBe('');
  });

  it('imagen https:// con espacios: recortada', () => {
    expect(conSeccion('sobreNosotros', { imagen: ' https://res.cloudinary.com/ficticio/b.jpg ' }).sobreNosotros.imagen).toBe(
      'https://res.cloudinary.com/ficticio/b.jpg',
    );
  });
});

describe('listas de párrafos', () => {
  it('solo los textos no vacíos, recortados', () => {
    const parrafos = ['  Uno ficticio ', '', '   ', 3, null, 'Dos ficticio'];

    expect(conSeccion('sobreNosotros', { parrafos }).sobreNosotros.parrafos).toEqual(['Uno ficticio', 'Dos ficticio']);
  });

  it.each([
    ['vacía', []],
    ['sin ningún texto útil', ['', '  ', 5, { texto: 'x' }]],
    ['que no es lista', 'Un párrafo suelto'],
  ])('lista %s: los párrafos del respaldo', (_caso, parrafos) => {
    expect(conSeccion('sobreNosotros', { parrafos }).sobreNosotros.parrafos).toEqual(RESPALDO.sobreNosotros.parrafos);
    expect(conSeccion('inicio', { sobreNosotrosParrafos: parrafos }).inicio.sobreNosotrosParrafos).toEqual(
      RESPALDO.inicio.sobreNosotrosParrafos,
    );
  });
});

describe('valores', () => {
  it(`más de ${MAXIMO_VALORES}: solo los primeros ${MAXIMO_VALORES}`, () => {
    const valores = Array.from({ length: MAXIMO_VALORES + 2 }, (_v, i) => valor(i + 1));

    expect(conSeccion('sobreNosotros', { valores }).sobreNosotros.valores).toEqual(valores.slice(0, MAXIMO_VALORES));
  });

  it('solo los pares con título y descripción de texto no vacío, recortados', () => {
    const valores = [
      { titulo: ' Valor ficticio ', descripcion: ' Descripción ficticia ' },
      { titulo: '', descripcion: 'Sin título' },
      { titulo: 'Sin descripción', descripcion: '   ' },
      { titulo: 3, descripcion: 'Título que no es texto' },
      null,
      'suelto',
    ];

    expect(conSeccion('sobreNosotros', { valores }).sobreNosotros.valores).toEqual([
      { titulo: 'Valor ficticio', descripcion: 'Descripción ficticia' },
    ]);
  });

  it('lista vacía vale (la dueña los quitó todos); si no es lista, los del respaldo', () => {
    expect(conSeccion('sobreNosotros', { valores: [] }).sobreNosotros.valores).toEqual([]);
    expect(conSeccion('sobreNosotros', { valores: { titulo: 'x' } }).sobreNosotros.valores).toEqual(RESPALDO.sobreNosotros.valores);
  });
});
