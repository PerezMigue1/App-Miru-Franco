/// <reference types="jest" />

import { enlaceMapa } from '@/features/salon/models/salonModel';
import {
  cargarConfiguracion,
  estadoConfiguracion,
  normalizarConfiguracion,
  reiniciarConfiguracionPublica,
  RESPALDO_CONFIGURACION,
} from '@/shared/api/configuracionPublica';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import {
  CLABE_FICTICIA,
  CLABE_FICTICIA_CON_ESPACIOS,
  contenidoArchivo,
  sembrarConfiguracionGuardada,
} from '../../helpers/configuracionFicticia';
import { espiarConsola } from '../../helpers/consola';

/**
 * GP-07.5: lo que la base compartida agrega a la configuración pública para la tienda y los pagos.
 * Datos de transferencia (banco, titular y CLABE de 18 dígitos, o null), días hábiles de revocación
 * (nunca menos de 5), días para preparar un apartado y día del recordatorio para recoger. Un archivo
 * guardado por una versión anterior con transferencia no la devuelve, y el respaldo no trae ninguna
 * cuenta. Lo que ya cubren las pruebas de GP-07.1 (respuesta completa y escritura del archivo) no se
 * repite. Datos ficticios; expo-file-system simulado y sin red.
 */

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

const BANCO = 'Banco Ficticio';
const TITULAR = 'Titular Ficticia';
const CUENTA = { banco: BANCO, titular: TITULAR, clabe: CLABE_FICTICIA };

/** Cuerpo con la transferencia indicada (y el método activo, para que solo cuente la validación). */
const conTransferencia = (transferencia: unknown) => ({
  reglas: { pagos: { metodosSalon: ['transferencia'], transferencia } },
});

const transferenciaDe = (transferencia: unknown) =>
  normalizarConfiguracion(conTransferencia(transferencia)).reglas.pagos.transferencia;

const fetchOriginal = globalThis.fetch;

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

afterEach(() => {
  globalThis.fetch = fetchOriginal;
});

espiarConsola(() => Promise.resolve(), true);

describe('normalizarConfiguracion: datos de transferencia', () => {
  it('completa: banco y titular recortados y la CLABE de 18 dígitos', () => {
    expect(transferenciaDe({ banco: `  ${BANCO} `, titular: ` ${TITULAR}`, clabe: CLABE_FICTICIA })).toEqual(CUENTA);
  });

  it('con espacios en la CLABE: se guarda sin ellos', () => {
    expect(transferenciaDe({ ...CUENTA, clabe: ` ${CLABE_FICTICIA_CON_ESPACIOS} ` })).toEqual(CUENTA);
  });

  it.each<[string, unknown]>([
    ['sin banco', { titular: TITULAR, clabe: CLABE_FICTICIA }],
    ['con el banco en blanco', { ...CUENTA, banco: '   ' }],
    ['sin titular', { banco: BANCO, clabe: CLABE_FICTICIA }],
    ['con letras en la CLABE', { ...CUENTA, clabe: `${'0'.repeat(17)}A` }],
    ['con 17 dígitos', { ...CUENTA, clabe: '0'.repeat(17) }],
    ['con la CLABE como número', { ...CUENTA, clabe: 0 }],
    ['en null', null],
    ['como texto', 'Banco Ficticio'],
  ])('%s: null (nunca una cuenta a medias)', (_caso, transferencia) => {
    expect(transferenciaDe(transferencia)).toBeNull();
  });

  it('sin la sección de pagos: null, como el respaldo', () => {
    expect(normalizarConfiguracion({}).reglas.pagos.transferencia).toBeNull();
  });
});

describe('normalizarConfiguracion: revocación de compra', () => {
  const diasDe = (revocacion: unknown) => normalizarConfiguracion({ reglas: { revocacion } }).reglas.revocacion.diasHabiles;

  it('un entero de 5 o más pasa tal cual', () => {
    expect(diasDe({ diasHabiles: 5 })).toBe(5);
    expect(diasDe({ diasHabiles: 8 })).toBe(8);
  });

  it.each<[string, unknown]>([
    ['menor a 5 (mínimo de ley)', { diasHabiles: 4 }],
    ['no entero', { diasHabiles: 6.5 }],
    ['faltante', {}],
  ])('%s: 5 días hábiles', (_caso, revocacion) => {
    expect(diasDe(revocacion)).toBe(5);
  });
});

describe('normalizarConfiguracion: apartados de la tienda', () => {
  const tiendaDe = (tienda: unknown) => normalizarConfiguracion({ reglas: { tienda } }).reglas.tienda;

  it('días para preparar y día del recordatorio válidos pasan tal cual', () => {
    expect(tiendaDe({ diasPrepararApartado: 4, diaRecordatorioRecoger: 2 })).toMatchObject({
      diasPrepararApartado: 4,
      diaRecordatorioRecoger: 2,
    });
  });

  it.each<[string, unknown]>([
    ['faltantes', {}],
    ['con otro tipo o negativos', { diasPrepararApartado: '4', diaRecordatorioRecoger: -1 }],
  ])('%s: los del respaldo (3 y 3)', (_caso, tienda) => {
    expect(tiendaDe(tienda)).toMatchObject({ diasPrepararApartado: 3, diaRecordatorioRecoger: 3 });
  });
});

describe('transferencia fuera de la red', () => {
  it('un archivo de una versión anterior que la guardó: se lee sin transferencia', async () => {
    sembrarConfiguracionGuardada(contenidoArchivo(conTransferencia(CUENTA)));
    globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;

    const configuracion = await cargarConfiguracion();

    expect(estadoConfiguracion().origen).toBe('archivo');
    expect(configuracion.reglas.pagos.metodosSalon).toEqual(['transferencia']);
    expect(configuracion.reglas.pagos.transferencia).toBeNull();
    expect(JSON.stringify(configuracion)).not.toContain(CLABE_FICTICIA);
  });

  it('el respaldo no trae cuenta y sí el mapa del salón, que es el enlace que se abre', () => {
    expect(RESPALDO_CONFIGURACION.reglas.pagos.transferencia).toBeNull();
    expect(RESPALDO_CONFIGURACION.salon.mapaUrl).toMatch(/^https:\/\/www\.google\.com\/maps\//);
    expect(enlaceMapa(RESPALDO_CONFIGURACION.salon)).toBe(RESPALDO_CONFIGURACION.salon.mapaUrl);
  });
});
