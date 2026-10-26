/// <reference types="jest" />

import { ImageManipulator } from 'expo-image-manipulator';

import { borrarFotoTemporal, prepararFoto } from '@/features/auth/models/fotoPerfil';
import {
  CALIDAD_FOTO,
  cambiosDelPerfil,
  cambiosDeTratamientos,
  esFotoCloudinary,
  fechaParaFormulario,
  firmaDeRespuesta,
  formularioDesdePerfil,
  LADO_MAXIMO_FOTO,
  MENSAJE_ESPERA_UN_MOMENTO,
  MENSAJE_FOTO_FALLIDA,
  MENSAJE_FOTO_NO_GUARDADA,
  mensajeFotoPesada,
  MENSAJE_QUITAR_FALLIDO,
  MENSAJE_SUBIDA_NO_DISPONIBLE,
  normalizarPerfil,
  PESO_MAXIMO_FOTO,
  requiereConsentimientoPerfil,
  urlDeFotoSubida,
  type CambiosPerfil,
  type FormularioPerfil,
  type PerfilCuenta,
} from '@/features/auth/models/PerfilModel';

import { manipuladorSimulado } from '../../helpers/fotoSimulada';
import { PERFIL_COMPLETO } from '../../helpers/perfilClienta';

/**
 * GP-05.2 (#18): modelo del perfil de la clienta (src/features/auth/models/PerfilModel.ts) y
 * preparación de la foto (src/features/auth/models/fotoPerfil.ts). Pruebas de caja blanca de la
 * lectura de /api/auth/me, del formulario de Editar perfil, del cuerpo de PATCH /api/auth/me (solo
 * lo que cambió), del consentimiento de datos de salud y de la firma y la respuesta de Cloudinary.
 * Son funciones puras salvo prepararFoto y borrarFotoTemporal, que usan expo-image-manipulator y
 * expo-file-system simulados. No hay peticiones: ninguna de estas funciones llama a fetch.
 */

// ── Simulaciones de módulos nativos de la foto ───────────────────────────────────────────────

jest.mock('expo-image-manipulator', () => ({
  SaveFormat: { JPEG: 'jpeg', PNG: 'png', WEBP: 'webp' },
  ImageManipulator: { manipulate: jest.fn() },
}));

/** File simulado: cada prueba decide qué devuelve el constructor (size, exists y delete). */
jest.mock('expo-file-system', () => ({ File: jest.fn() }));

const ArchivoSimulado = jest.requireMock<{ File: jest.Mock }>('expo-file-system').File;
const manipular = ImageManipulator.manipulate as unknown as jest.Mock;

// ── Datos ficticios ──────────────────────────────────────────────────────────────────────────

/** El perfil de PERFIL_COMPLETO ya normalizado, tal como lo usa la pantalla. */
const PERFIL: PerfilCuenta = {
  id: 'clienta-perfil-1',
  nombre: 'Clienta Perfil',
  email: 'perfil@ejemplo.test',
  telefono: '7710000000',
  fechaNacimiento: '1995-04-12',
  tipoCabello: 'ondulado',
  colorNatural: 'Castaño',
  colorActual: 'Castaño claro',
  productosUsados: 'Shampoo ficticio',
  alergias: '',
  // PERFIL_COMPLETO no trae datosSensiblesAutorizados: sin ese true nunca se supone la autorización.
  datosSensiblesAutorizados: false,
  alergiasOcultas: false,
  tratamientosQuimicos: false,
  tratamientos: '',
  recibePromociones: false,
  foto: null,
  tienePassword: true,
};

/** GP-09 (Ronda 5): con la autorización de datos sensibles vigente, las alergias se leen y se mandan. */
const AUTORIZADA = { datosSensiblesAutorizados: true };
const PERFIL_AUTORIZADO: PerfilCuenta = { ...PERFIL, datosSensiblesAutorizados: true };

const FECHA_GUARDADA = '1995-04-12';

/** Lo mínimo que normalizarPerfil exige: id y correo. */
const MINIMO = { id: 'clienta-minima', email: 'minima@ejemplo.test' };

/** Perfil normalizado a partir de unos datos sueltos de /me (con id y correo de MINIMO). */
function normalizar(datos: Record<string, unknown>): PerfilCuenta {
  const perfil = normalizarPerfil({ ...MINIMO, ...datos });
  if (!perfil) {
    throw new Error('normalizarPerfil devolvió null');
  }
  return perfil;
}

/** Formulario sin tocar (el que arma la pantalla al abrir) con los cambios indicados. */
function formulario(cambios: Partial<FormularioPerfil> = {}): FormularioPerfil {
  return { ...formularioDesdePerfil(PERFIL), ...cambios };
}

const URL_SUBIDA = 'https://api.cloudinary.com/v1_1/nube-ficticia/image/upload';
const FOTO_CLOUDINARY = 'https://res.cloudinary.com/nube-ficticia/image/upload/v1/perfil-ficticio.jpg';

/** Respuesta de POST /api/auth/me/foto/firma válida, con los cambios indicados en data. */
function respuestaFirma(cambios: Record<string, unknown> = {}): unknown {
  return {
    data: {
      uploadUrl: URL_SUBIDA,
      apiKey: 123456,
      signature: 'firma-ficticia',
      params: { timestamp: 1760000000, folder: 'perfiles-ficticios', overwrite: true },
      ...cambios,
    },
  };
}

// ── normalizarPerfil ─────────────────────────────────────────────────────────────────────────

describe('normalizarPerfil: sobres y campos obligatorios', () => {
  it.each<[string, unknown]>([
    ['{ data }', { data: PERFIL_COMPLETO }],
    ['{ user }', { user: PERFIL_COMPLETO }],
    ['{ usuario }', { usuario: PERFIL_COMPLETO }],
    ['la raíz', PERFIL_COMPLETO],
  ])('lee el perfil completo dentro de %s', (_sobre, respuesta) => {
    expect(normalizarPerfil(respuesta)).toEqual(PERFIL);
  });

  it('data tiene prioridad sobre user y usuario', () => {
    const respuesta = {
      data: { ...MINIMO, nombre: 'Desde data' },
      user: { ...MINIMO, nombre: 'Desde user' },
      usuario: { ...MINIMO, nombre: 'Desde usuario' },
    };
    expect(normalizarPerfil(respuesta)?.nombre).toBe('Desde data');
  });

  it('si data no es un objeto, sigue con user', () => {
    const respuesta = { data: null, user: { ...MINIMO, nombre: 'Desde user' } };
    expect(normalizarPerfil(respuesta)?.nombre).toBe('Desde user');
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['undefined', undefined],
    ['un texto', 'perfil'],
    ['un número', 42],
    ['data vacío', { data: {} }],
    ['sin correo', { data: { id: 'clienta-sin-correo' } }],
    ['correo vacío', { data: { id: 'clienta-sin-correo', email: '' } }],
    ['correo que no es texto', { data: { id: 'clienta-x', email: 7 } }],
    ['sin id', { data: { email: 'sin-id@ejemplo.test' } }],
    ['id booleano', { data: { id: true, email: 'id-raro@ejemplo.test' } }],
    ['id objeto', { data: { id: { valor: 1 }, email: 'id-raro@ejemplo.test' } }],
  ])('devuelve null con %s', (_caso, respuesta) => {
    expect(normalizarPerfil(respuesta)).toBeNull();
  });

  it.each<[string, Record<string, unknown>, string]>([
    ['id numérico', { id: 41 }, '41'],
    ['_id cuando no hay id', { id: undefined, _id: 'mongo-ficticio' }, 'mongo-ficticio'],
    ['_id cuando id es null', { id: null, _id: 77 }, '77'],
    ['id antes que _id', { id: 'id-principal', _id: 'id-secundario' }, 'id-principal'],
  ])('%s queda como texto', (_caso, datos, esperado) => {
    expect(normalizar(datos).id).toBe(esperado);
  });

  it('sin datos opcionales, quedan vacíos y con los valores por defecto', () => {
    expect(normalizar({})).toEqual({
      id: 'clienta-minima',
      nombre: '',
      email: 'minima@ejemplo.test',
      telefono: '',
      fechaNacimiento: '',
      tipoCabello: null,
      colorNatural: '',
      colorActual: '',
      productosUsados: '',
      alergias: '',
      datosSensiblesAutorizados: false,
      alergiasOcultas: false,
      tratamientosQuimicos: null,
      tratamientos: '',
      recibePromociones: false,
      foto: null,
      tienePassword: true,
    });
  });
});

describe('normalizarPerfil: datos de cada campo', () => {
  it.each<[unknown, PerfilCuenta['tipoCabello']]>([
    ['lacio', 'liso'],
    ['Lacio', 'liso'],
    ['liso', 'liso'],
    [' LISO ', 'liso'],
    ['ondulado', 'ondulado'],
    [' Ondulado', 'ondulado'],
    ['rizado', 'rizado'],
    ['RIZADO', 'rizado'],
    ['chino', null],
    ['', null],
    [3, null],
    [null, null],
  ])('tipoCabello %p se lee como %p', (valor, esperado) => {
    expect(normalizar({ tipoCabello: valor }).tipoCabello).toBe(esperado);
  });

  it.each<[unknown, boolean | null]>([
    [true, true],
    [false, false],
    ['true', null],
    [1, null],
    [null, null],
  ])('tratamientosQuimicos %p se lee como %p', (valor, esperado) => {
    expect(normalizar({ tratamientosQuimicos: valor }).tratamientosQuimicos).toBe(esperado);
  });

  it.each<[unknown, boolean]>([
    [true, true],
    [false, false],
    ['true', false],
    [1, false],
    [undefined, false],
  ])('recibePromociones %p se lee como %p', (valor, esperado) => {
    expect(normalizar({ recibePromociones: valor }).recibePromociones).toBe(esperado);
  });

  it.each<[unknown, boolean]>([
    [false, false],
    [true, true],
    [undefined, true],
    [null, true],
    ['false', true],
  ])('tienePassword %p se lee como %p', (valor, esperado) => {
    expect(normalizar({ tienePassword: valor }).tienePassword).toBe(esperado);
  });

  it.each<[unknown, string | null]>([
    [` ${FOTO_CLOUDINARY} `, FOTO_CLOUDINARY],
    ['   ', null],
    ['', null],
    [null, null],
    [5, null],
  ])('foto %p se lee como %p', (valor, esperado) => {
    expect(normalizar({ foto: valor }).foto).toBe(esperado);
  });

  it.each<[unknown, string]>([
    ['1995-04-12T00:00:00.000Z', '1995-04-12'],
    ['1995-04-12', '1995-04-12'],
    ['', ''],
    [null, ''],
  ])('fechaNacimiento %p se recorta a %p', (valor, esperado) => {
    expect(normalizar({ fechaNacimiento: valor }).fechaNacimiento).toBe(esperado);
  });

  it('los textos que no son texto quedan vacíos', () => {
    const perfil = normalizar({ nombre: 9, telefono: 7710000000, colorNatural: {}, tratamientos: null });
    expect(perfil).toMatchObject({ nombre: '', telefono: '', colorNatural: '', tratamientos: '' });
  });
});

describe('normalizarPerfil: datos capilares planos o en perfilCapilar', () => {
  const CAPILAR = {
    tipoCabello: 'Lacio',
    colorNatural: 'Negro',
    colorActual: 'Rojizo',
    productosUsados: 'Acondicionador ficticio',
    alergias: 'Amoniaco',
    tratamientosQuimicos: true,
    tratamientos: 'Keratina',
  };
  const CAPILAR_LEIDO = { ...CAPILAR, tipoCabello: 'liso' };

  it('los lee dentro de perfilCapilar', () => {
    expect(normalizar({ ...AUTORIZADA, perfilCapilar: CAPILAR })).toMatchObject(CAPILAR_LEIDO);
  });

  it('los lee planos, como la web', () => {
    expect(normalizar({ ...AUTORIZADA, ...CAPILAR })).toMatchObject(CAPILAR_LEIDO);
  });

  it('el dato plano gana sobre el de perfilCapilar', () => {
    const perfil = normalizar({ ...AUTORIZADA, tipoCabello: 'rizado', alergias: 'Polen', perfilCapilar: CAPILAR });
    expect(perfil.tipoCabello).toBe('rizado');
    expect(perfil.alergias).toBe('Polen');
    expect(perfil.colorNatural).toBe('Negro');
  });

  it('un dato plano en null se busca en perfilCapilar', () => {
    const perfil = normalizar({ tratamientosQuimicos: null, colorActual: null, perfilCapilar: CAPILAR });
    expect(perfil.tratamientosQuimicos).toBe(true);
    expect(perfil.colorActual).toBe('Rojizo');
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['un texto', 'liso'],
  ])('perfilCapilar como %s se ignora', (_caso, perfilCapilar) => {
    const perfil = normalizar({ perfilCapilar });
    expect(perfil.tipoCabello).toBeNull();
    expect(perfil.tratamientosQuimicos).toBeNull();
  });
});

// ── Formulario ───────────────────────────────────────────────────────────────────────────────

describe('fechaParaFormulario', () => {
  it.each([
    ['1995-04-12', '12/04/1995'],
    ['2000-12-31', '31/12/2000'],
    ['', ''],
    ['1995-04', ''],
    ['1995', ''],
    ['1995--12', ''],
  ])('"%s" se muestra como "%s"', (iso, esperado) => {
    expect(fechaParaFormulario(iso)).toBe(esperado);
  });
});

describe('formularioDesdePerfil', () => {
  it('copia el perfil con la fecha en DD/MM/AAAA', () => {
    expect(formularioDesdePerfil(PERFIL)).toEqual({
      nombre: 'Clienta Perfil',
      telefono: '7710000000',
      nacimiento: '12/04/1995',
      tipoCabello: 'ondulado',
      colorNatural: 'Castaño',
      colorActual: 'Castaño claro',
      productosUsados: 'Shampoo ficticio',
      alergias: '',
      tratamientosQuimicos: false,
      tratamientos: '',
      recibePromociones: false,
    });
  });

  it.each([
    ['+52 771 000 0000', '7710000000'],
    ['521 771 000 0000', '7710000000'],
    ['(771) 000-0000', '7710000000'],
    ['', ''],
    ['   ', ''],
    // 12 dígitos que no empiezan con 52: no se recortan a otro número; la validación del formulario
    // pide corregirlo (GP-07.6: recortar daba un teléfono que no es el de la clienta).
    ['771000000099', '771000000099'],
  ])('el teléfono guardado "%s" aparece como "%s"', (telefono, esperado) => {
    expect(formularioDesdePerfil({ ...PERFIL, telefono }).telefono).toBe(esperado);
  });

  it('sin fecha guardada, el campo de nacimiento queda vacío', () => {
    expect(formularioDesdePerfil({ ...PERFIL, fechaNacimiento: '' }).nacimiento).toBe('');
  });
});

// ── Cuerpo de PATCH /api/auth/me ─────────────────────────────────────────────────────────────

describe('cambiosDeTratamientos', () => {
  it.each<[string, boolean | null, Partial<FormularioPerfil>, CambiosPerfil]>([
    // [caso, en /me, formulario, esperado]
    ['sin respuesta en el formulario no envía nada', true, { tratamientosQuimicos: null }, {}],
    ['sin respuesta en /me y sin tocar no envía nada', null, { tratamientosQuimicos: null }, {}],
    ['sigue en No', false, { tratamientosQuimicos: false, tratamientos: 'ignorado' }, {}],
    ['de Sí a No envía solo el No', true, { tratamientosQuimicos: false }, { tratamientosQuimicos: false }],
    ['de sin respuesta a No', null, { tratamientosQuimicos: false }, { tratamientosQuimicos: false }],
    [
      'de No a Sí envía el texto recortado',
      false,
      { tratamientosQuimicos: true, tratamientos: '  Keratina  ' },
      { tratamientosQuimicos: true, tratamientos: 'Keratina' },
    ],
    [
      'de sin respuesta a Sí, aun con el texto vacío',
      null,
      { tratamientosQuimicos: true, tratamientos: '' },
      { tratamientosQuimicos: true, tratamientos: '' },
    ],
    ['sigue en Sí con el mismo texto', true, { tratamientosQuimicos: true, tratamientos: ' Tinte ' }, {}],
    [
      'sigue en Sí y cambió el texto',
      true,
      { tratamientosQuimicos: true, tratamientos: 'Decoloración' },
      { tratamientos: 'Decoloración' },
    ],
  ])('%s', (_caso, enPerfil, cambios, esperado) => {
    const perfil = { ...PERFIL, tratamientosQuimicos: enPerfil, tratamientos: 'Tinte' };
    expect(cambiosDeTratamientos(perfil, formulario(cambios))).toEqual(esperado);
  });
});

describe('cambiosDelPerfil', () => {
  it('sin tocar nada, el cuerpo va vacío', () => {
    expect(cambiosDelPerfil(PERFIL, formulario(), FECHA_GUARDADA)).toEqual({});
  });

  it('sin fecha guardada y sin fecha escrita, la fecha no se envía', () => {
    const perfil = { ...PERFIL, fechaNacimiento: '' };
    expect(cambiosDelPerfil(perfil, formularioDesdePerfil(perfil), null)).toEqual({});
  });

  it.each<[string, Partial<FormularioPerfil>, CambiosPerfil]>([
    ['nombre con espacios, igual al guardado', { nombre: '  Clienta Perfil  ' }, {}],
    ['nombre nuevo, recortado', { nombre: ' Clienta Nueva ' }, { nombre: 'Clienta Nueva' }],
    ['teléfono igual con lada', { telefono: '+52 771 000 0000' }, {}],
    ['teléfono nuevo', { telefono: '771 999 9999' }, { telefono: '7719999999' }],
    ['teléfono borrado se vacía con null', { telefono: '  ' }, { telefono: null }],
    ['tipo de cabello nuevo', { tipoCabello: 'rizado' }, { tipoCabello: 'rizado' }],
    ['tipo de cabello sin elegir no se envía', { tipoCabello: null }, {}],
    ['color natural igual con espacios', { colorNatural: ' Castaño ' }, {}],
    ['color natural nuevo', { colorNatural: 'Negro' }, { colorNatural: 'Negro' }],
    ['color actual borrado se vacía con null', { colorActual: '' }, { colorActual: null }],
    ['productos borrados se vacían con null', { productosUsados: '   ' }, { productosUsados: null }],
    ['promociones activadas', { recibePromociones: true }, { recibePromociones: true }],
    [
      'alergias con texto llevan el consentimiento',
      { alergias: ' Amoniaco ' },
      { alergias: 'Amoniaco', consienteDatosSensibles: true },
    ],
    [
      'tratamientos de No a Sí',
      { tratamientosQuimicos: true, tratamientos: 'Keratina' },
      { tratamientosQuimicos: true, tratamientos: 'Keratina' },
    ],
  ])('%s', (_caso, cambios, esperado) => {
    expect(cambiosDelPerfil(PERFIL_AUTORIZADO, formulario(cambios), FECHA_GUARDADA)).toEqual(esperado);
  });

  it.each<[string, string | null, CambiosPerfil]>([
    ['fecha nueva', '2000-01-31', { fechaNacimiento: '2000-01-31' }],
    ['fecha borrada se vacía con null', null, { fechaNacimiento: null }],
  ])('%s', (_caso, fechaIso, esperado) => {
    expect(cambiosDelPerfil(PERFIL, formulario(), fechaIso)).toEqual(esperado);
  });

  it('el teléfono guardado con lada no cuenta como cambio', () => {
    const perfil = { ...PERFIL, telefono: '+52 1 771 000 0000' };
    expect(cambiosDelPerfil(perfil, formulario({ telefono: '7710000000' }), FECHA_GUARDADA)).toEqual({});
  });

  it('borrar las alergias envía null y no pide consentimiento', () => {
    const perfil = { ...PERFIL_AUTORIZADO, alergias: 'Polen' };
    const cambios = cambiosDelPerfil(perfil, formulario({ alergias: ' ' }), FECHA_GUARDADA);
    expect(cambios).toEqual({ alergias: null });
    expect(cambios).not.toHaveProperty('consienteDatosSensibles');
  });

  it('las alergias sin cambio no piden consentimiento aunque traigan texto', () => {
    const perfil = { ...PERFIL_AUTORIZADO, alergias: 'Polen' };
    const cambios = cambiosDelPerfil(perfil, { ...formularioDesdePerfil(perfil) }, FECHA_GUARDADA);
    expect(cambios).toEqual({});
  });

  it('junta varios cambios en un solo cuerpo', () => {
    const cambios = cambiosDelPerfil(
      PERFIL_AUTORIZADO,
      formulario({
        nombre: 'Clienta Nueva',
        tipoCabello: 'liso',
        alergias: 'Látex',
        tratamientosQuimicos: true,
        tratamientos: 'Tinte',
        recibePromociones: true,
      }),
      '1990-02-03',
    );
    expect(cambios).toEqual({
      nombre: 'Clienta Nueva',
      fechaNacimiento: '1990-02-03',
      tipoCabello: 'liso',
      alergias: 'Látex',
      tratamientosQuimicos: true,
      tratamientos: 'Tinte',
      recibePromociones: true,
      consienteDatosSensibles: true,
    });
  });
});

describe('requiereConsentimientoPerfil', () => {
  it.each<[string, string, boolean]>([
    // [alergias guardadas, alergias escritas, requiere]
    ['', 'Polen', true],
    ['', '   ', false],
    ['', '', false],
    ['Polen', ' Polen ', false],
    ['Polen', 'Látex', true],
    ['Polen', '', false],
  ])('guardadas "%s" y escritas "%s": %s', (guardadas, escritas, esperado) => {
    expect(requiereConsentimientoPerfil({ ...PERFIL_AUTORIZADO, alergias: guardadas }, escritas)).toBe(esperado);
  });
});

// ── Foto: constantes, firma y respuesta de Cloudinary ────────────────────────────────────────

describe('constantes de la foto', () => {
  it('lado máximo de 1024 px, tope de 5 MB y JPEG al 85 %', () => {
    expect(LADO_MAXIMO_FOTO).toBe(1024);
    expect(PESO_MAXIMO_FOTO).toBe(5 * 1024 * 1024);
    expect(CALIDAD_FOTO).toBe(0.85);
  });

  it.each([
    // GP-07.6: el de la foto pesada sale del catálogo con el tope en megas (5).
    mensajeFotoPesada(),
    MENSAJE_SUBIDA_NO_DISPONIBLE,
    MENSAJE_ESPERA_UN_MOMENTO,
    MENSAJE_FOTO_NO_GUARDADA,
    MENSAJE_FOTO_FALLIDA,
    MENSAJE_QUITAR_FALLIDO,
  ])('"%s" es un mensaje para la clienta sin guion largo', (mensaje) => {
    expect(mensaje.trim()).not.toBe('');
    expect(mensaje).not.toContain(String.fromCodePoint(0x2014));
    expect(mensaje.endsWith('.')).toBe(true);
  });
});

describe('firmaDeRespuesta', () => {
  it('convierte la firma en los campos del formulario de Cloudinary, todos como texto', () => {
    expect(firmaDeRespuesta(respuestaFirma())).toEqual({
      uploadUrl: URL_SUBIDA,
      campos: {
        api_key: '123456',
        signature: 'firma-ficticia',
        timestamp: '1760000000',
        folder: 'perfiles-ficticios',
        overwrite: 'true',
      },
    });
  });

  it('recorta la url y acepta la apiKey como texto y params vacío', () => {
    const firma = firmaDeRespuesta(respuestaFirma({ uploadUrl: `  ${URL_SUBIDA} `, apiKey: 'llave-ficticia', params: {} }));
    expect(firma).toEqual({ uploadUrl: URL_SUBIDA, campos: { api_key: 'llave-ficticia', signature: 'firma-ficticia' } });
  });

  it('compara el inicio de la url sin importar mayúsculas', () => {
    const url = 'HTTPS://API.CLOUDINARY.COM/v1_1/nube-ficticia/image/upload';
    expect(firmaDeRespuesta(respuestaFirma({ uploadUrl: url }))?.uploadUrl).toBe(url);
  });

  it.each<[string, unknown]>([
    ['sin respuesta', null],
    ['sin data', { uploadUrl: URL_SUBIDA }],
    ['data como texto', { data: 'firma' }],
  ])('devuelve null %s', (_caso, respuesta) => {
    expect(firmaDeRespuesta(respuesta)).toBeNull();
  });

  it.each<[string, Record<string, unknown>]>([
    ['url por http', { uploadUrl: 'http://api.cloudinary.com/v1_1/nube-ficticia/image/upload' }],
    ['url de otro host', { uploadUrl: 'https://subidas.ejemplo.test/upload' }],
    ['host que solo empieza igual', { uploadUrl: 'https://api.cloudinary.com.ejemplo.test/upload' }],
    ['url de entrega en vez de subida', { uploadUrl: FOTO_CLOUDINARY }],
    ['url vacía', { uploadUrl: '' }],
    ['sin firma', { signature: '' }],
    ['firma que no es texto', { signature: 123 }],
    ['sin apiKey', { apiKey: undefined }],
    ['apiKey booleana', { apiKey: true }],
    ['sin params', { params: undefined }],
    ['params null', { params: null }],
    ['params con un objeto', { params: { timestamp: 1, eager: { ancho: 100 } } }],
    ['params con null', { params: { timestamp: null } }],
    ['params con una lista', { params: { tags: ['perfil'] } }],
  ])('devuelve null con %s', (_caso, cambios) => {
    expect(firmaDeRespuesta(respuestaFirma(cambios))).toBeNull();
  });

  it.each(['file', 'api_key', 'signature', 'cloud_name', 'resource_type'])(
    'devuelve null si params trae el campo reservado "%s"',
    (campo) => {
      expect(firmaDeRespuesta(respuestaFirma({ params: { timestamp: 1, [campo]: 'valor-ficticio' } }))).toBeNull();
    },
  );
});

describe('esFotoCloudinary y urlDeFotoSubida', () => {
  it.each<[string, boolean]>([
    [FOTO_CLOUDINARY, true],
    [`  ${FOTO_CLOUDINARY.toUpperCase()}`, true],
    ['http://res.cloudinary.com/nube-ficticia/perfil.jpg', false],
    ['https://res.cloudinary.com.ejemplo.test/perfil.jpg', false],
    ['https://api.cloudinary.com/v1_1/nube-ficticia/perfil.jpg', false],
    ['https://fotos.ejemplo.test/perfil.jpg', false],
    ['', false],
  ])('esFotoCloudinary("%s") es %s', (url, esperado) => {
    expect(esFotoCloudinary(url)).toBe(esperado);
  });

  it('urlDeFotoSubida toma secure_url recortada', () => {
    expect(urlDeFotoSubida({ secure_url: ` ${FOTO_CLOUDINARY} `, public_id: 'perfil-ficticio' })).toBe(FOTO_CLOUDINARY);
  });

  it.each<[string, unknown]>([
    ['sin respuesta', null],
    ['solo con url (sin https seguro)', { url: FOTO_CLOUDINARY }],
    ['secure_url por http', { secure_url: 'http://res.cloudinary.com/nube-ficticia/perfil.jpg' }],
    ['secure_url de otro host', { secure_url: 'https://fotos.ejemplo.test/perfil.jpg' }],
    ['secure_url que no es texto', { secure_url: 42 }],
    ['un texto suelto', FOTO_CLOUDINARY],
  ])('urlDeFotoSubida devuelve null %s', (_caso, respuesta) => {
    expect(urlDeFotoSubida(respuesta)).toBeNull();
  });
});

// ── fotoPerfil.ts: preparar y borrar la copia temporal ───────────────────────────────────────

const URI_ORIGEN = 'file:///datos/cache/galeria-ficticia.jpg';
const URI_LISTA = 'file:///datos/cache/foto-lista-ficticia.jpg';

/** Contexto e imagen simulados de ImageManipulator, con sus release para revisar que se liberan. */
function simularManipulador() {
  const simulado = manipuladorSimulado(URI_LISTA, 1);
  manipular.mockReturnValue(simulado.contexto);
  return simulado;
}

/** Archivo simulado que devuelve `new File(uri)`. */
function simularArchivo(archivo: { size?: number; exists?: boolean; delete?: jest.Mock }) {
  ArchivoSimulado.mockImplementation(() => archivo);
}

beforeEach(() => {
  manipular.mockReset();
  ArchivoSimulado.mockReset();
});

describe('prepararFoto', () => {
  it('una foto cuadrada chica no se recorta ni se reduce; sale en JPEG con su peso', async () => {
    const { contexto, imagen } = simularManipulador();
    simularArchivo({ size: 204800 });

    await expect(prepararFoto(URI_ORIGEN, 800, 800)).resolves.toEqual({ uri: URI_LISTA, tamano: 204800 });

    expect(manipular).toHaveBeenCalledWith(URI_ORIGEN);
    expect(contexto.crop).not.toHaveBeenCalled();
    expect(contexto.resize).not.toHaveBeenCalled();
    expect(imagen.saveAsync).toHaveBeenCalledWith({ compress: CALIDAD_FOTO, format: 'jpeg' });
    expect(ArchivoSimulado).toHaveBeenCalledWith(URI_LISTA);
    expect(imagen.release).toHaveBeenCalledTimes(1);
    expect(contexto.release).toHaveBeenCalledTimes(1);
  });

  it.each<[number, number, { originX: number; originY: number; width: number; height: number } | null, boolean]>([
    // [ancho, alto, recorte esperado, se reduce]
    [3000, 2000, { originX: 500, originY: 0, width: 2000, height: 2000 }, true],
    [1001, 2000, { originX: 0, originY: 499, width: 1001, height: 1001 }, false],
    [1200, 1025, { originX: 87, originY: 0, width: 1025, height: 1025 }, true],
    [1024, 1024, null, false],
    [1025, 1025, null, true],
  ])('%ix%i: recorte %o y reducción %s', async (ancho, alto, recorte, reduce) => {
    const { contexto } = simularManipulador();
    simularArchivo({ size: 1 });

    await prepararFoto(URI_ORIGEN, ancho, alto);

    if (recorte) {
      expect(contexto.crop).toHaveBeenCalledWith(recorte);
    } else {
      expect(contexto.crop).not.toHaveBeenCalled();
    }
    if (reduce) {
      expect(contexto.resize).toHaveBeenCalledWith({ width: LADO_MAXIMO_FOTO, height: LADO_MAXIMO_FOTO });
    } else {
      expect(contexto.resize).not.toHaveBeenCalled();
    }
  });

  it('si falla al procesar, libera el contexto y propaga el error', async () => {
    const { contexto, imagen } = simularManipulador();
    contexto.renderAsync.mockRejectedValueOnce(new Error('falla ficticia al procesar'));

    await expect(prepararFoto(URI_ORIGEN, 800, 800)).rejects.toThrow('falla ficticia al procesar');

    expect(contexto.release).toHaveBeenCalledTimes(1);
    expect(imagen.release).not.toHaveBeenCalled();
  });

  it('si falla al guardar el JPEG, libera la imagen y el contexto', async () => {
    const { contexto, imagen } = simularManipulador();
    imagen.saveAsync.mockRejectedValueOnce(new Error('falla ficticia al guardar'));

    await expect(prepararFoto(URI_ORIGEN, 800, 800)).rejects.toThrow('falla ficticia al guardar');

    expect(imagen.release).toHaveBeenCalledTimes(1);
    expect(contexto.release).toHaveBeenCalledTimes(1);
    expect(ArchivoSimulado).not.toHaveBeenCalled();
  });
});

describe('borrarFotoTemporal', () => {
  it('borra la copia si existe', () => {
    const borrar = jest.fn();
    simularArchivo({ exists: true, delete: borrar });
    borrarFotoTemporal(URI_LISTA);
    expect(ArchivoSimulado).toHaveBeenCalledWith(URI_LISTA);
    expect(borrar).toHaveBeenCalledTimes(1);
  });

  it('no intenta borrar si ya no existe', () => {
    const borrar = jest.fn();
    simularArchivo({ exists: false, delete: borrar });
    borrarFotoTemporal(URI_LISTA);
    expect(borrar).not.toHaveBeenCalled();
  });

  it.each<[string, () => void]>([
    [
      'al abrir el archivo',
      () =>
        ArchivoSimulado.mockImplementation(() => {
          throw new Error('uri ficticia inválida');
        }),
    ],
    [
      'al borrarlo',
      () =>
        simularArchivo({
          exists: true,
          delete: jest.fn(() => {
            throw new Error('falla ficticia al borrar');
          }),
        }),
    ],
  ])('no lanza si falla %s', (_caso, preparar) => {
    preparar();
    expect(() => borrarFotoTemporal(URI_LISTA)).not.toThrow();
  });
});
