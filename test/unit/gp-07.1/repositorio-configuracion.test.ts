/// <reference types="jest" />

import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import {
  cacheVencida,
  cargarConfiguracion,
  cargarConLimite,
  estadoConfiguracion,
  obtenerConfiguracion,
  refrescar,
  reiniciarConfiguracionPublica,
  RESPALDO_CONFIGURACION,
  suscribir,
  TIEMPO_MAXIMO_CARGA_MS,
  VIGENCIA_CONFIGURACION_MS,
} from '@/shared/api/configuracionPublica';

import { archivosGuardados, fallarArchivos, leerArchivo, limpiarArchivos } from '../../helpers/archivosLocales';
import {
  ARCHIVO_CONFIGURACION,
  CLABE_FICTICIA,
  CONFIGURACION_COMPLETA,
  CONFIGURACION_COMPLETA_EN_ARCHIVO,
  CONFIGURACION_GUARDADA,
  contenidoArchivo,
  DATOS_EXCLUIDOS,
  DATOS_TRANSFERENCIA,
  respuestaCompleta,
  rutaConfiguracion,
  RUTA_CONFIGURACION,
  sembrarConfiguracionGuardada,
} from '../../helpers/configuracionFicticia';
import { espiarConsola } from '../../helpers/consola';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { API, respuesta, servidorConRutas, type Llamada } from '../../helpers/servidorSimulado';

/**
 * GP-07.1: repositorio de la configuración pública (src/shared/api/configuracionPublica.ts). Orden
 * de carga (memoria vigente, red, archivo y respaldo), vigencia de la caché, archivo en disco,
 * refrescos en un solo vuelo, suscriptores, límite de la pantalla de carga y errores de la API.
 * fetch y expo-file-system van simulados (test/helpers/archivosLocales.ts); apiClient es el real.
 */

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

const simularServidor = servidorConRutas({});
const AHORA = new Date('2026-10-21T10:00:00-06:00').getTime();
const MINUTO = 60 * 1000;

/** fetch que rechaza como sin red. */
function sinRed(): void {
  globalThis.fetch = jest.fn(() => Promise.reject(new TypeError('Network request failed'))) as unknown as typeof fetch;
}

/** Servidor que no responde hasta que la prueba lo suelta. Devuelve cómo soltarlo y sus llamadas. */
function servidorLento(): { soltar: (cuerpo?: unknown) => void; llamadas: () => number } {
  let soltar: (r: Response) => void = () => {};
  const simulado = jest.fn(() => new Promise<Response>((resolve) => (soltar = resolve)));
  globalThis.fetch = simulado as unknown as typeof fetch;
  return { soltar: (cuerpo = respuestaCompleta()) => soltar(respuesta(cuerpo)), llamadas: () => simulado.mock.calls.length };
}

const peticiones = (llamadas: Llamada[]) => llamadas.filter((l) => l.ruta === RUTA_CONFIGURACION);

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

afterEach(() => {
  jest.useRealTimers();
});

// El repositorio nunca escribe en consola, ni con errores de red o del servidor.
espiarConsola(() => Promise.resolve(), true);

describe('petición al servidor', () => {
  it('sale con GET a http://api.test/api/configuracion-publica y sin Authorization aunque haya sesión', async () => {
    await sembrarSesion({ id: 'clienta-1', nombre: 'Clienta Ficticia', email: 'clienta@prueba.test', rol: 'cliente' });
    const llamadas = simularServidor(rutaConfiguracion());

    await refrescar();

    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].metodo).toBe('GET');
    expect(llamadas[0].url).toBe(`${API}${RUTA_CONFIGURACION}`);
    expect(llamadas[0].cabeceras).not.toHaveProperty('Authorization');
  });
});

describe('orden de carga: memoria vigente, red, archivo y respaldo', () => {
  it('antes de cargar nada hay respaldo, sin fecha de lectura y con la caché vencida', () => {
    expect(obtenerConfiguracion()).toBe(RESPALDO_CONFIGURACION);
    expect(estadoConfiguracion()).toEqual({ configuracion: RESPALDO_CONFIGURACION, origen: 'respaldo', leidoEn: null });
    expect(cacheVencida()).toBe(true);
  });

  it('memoria vigente: la segunda carga no vuelve a pedir a la red', async () => {
    const llamadas = simularServidor(rutaConfiguracion());

    const primera = await cargarConfiguracion();
    const segunda = await cargarConfiguracion();

    expect(peticiones(llamadas)).toHaveLength(1);
    expect(segunda).toBe(primera);
    expect(obtenerConfiguracion()).toEqual(CONFIGURACION_COMPLETA);
  });

  it('red: aunque haya archivo guardado, gana lo que responde el servidor', async () => {
    sembrarConfiguracionGuardada();
    simularServidor(rutaConfiguracion());

    await expect(cargarConfiguracion()).resolves.toEqual(CONFIGURACION_COMPLETA);
    expect(estadoConfiguracion().origen).toBe('red');
    // Y reemplaza lo guardado con la versión nueva (sin datos de transferencia, GP-07.5).
    expect(JSON.parse(leerArchivo(ARCHIVO_CONFIGURACION) ?? '').configuracion).toEqual(CONFIGURACION_COMPLETA_EN_ARCHIVO);
  });

  it('archivo: sin red, usa lo guardado en el archivo', async () => {
    sembrarConfiguracionGuardada();
    sinRed();

    await expect(cargarConfiguracion()).resolves.toEqual(CONFIGURACION_GUARDADA);
    expect(estadoConfiguracion()).toMatchObject({ origen: 'archivo', leidoEn: 1_000 });
  });

  it('respaldo: sin red ni archivo, los valores fijos de la app', async () => {
    sinRed();

    await expect(cargarConfiguracion()).resolves.toBe(RESPALDO_CONFIGURACION);
    expect(estadoConfiguracion().origen).toBe('respaldo');
  });

  it('si la red falla y ya había una lectura de red en memoria, la conserva y no baja al archivo', async () => {
    simularServidor(rutaConfiguracion());
    await refrescar();
    sembrarConfiguracionGuardada();
    sinRed();

    const resultado = await refrescar();

    expect(resultado.configuracion).toEqual(CONFIGURACION_COMPLETA);
    expect(resultado.origen).toBe('red');
    expect(resultado.error).toBeInstanceOf(ErrorDeRed);
  });
});

describe('vigencia de la caché', () => {
  it(`dura ${VIGENCIA_CONFIGURACION_MS / MINUTO} minutos desde la lectura de red`, async () => {
    jest.useFakeTimers({ now: AHORA });
    const llamadas = simularServidor(rutaConfiguracion());
    await cargarConfiguracion();

    jest.advanceTimersByTime(VIGENCIA_CONFIGURACION_MS - 1);
    expect(cacheVencida()).toBe(false);
    await cargarConfiguracion();
    expect(peticiones(llamadas)).toHaveLength(1);

    jest.advanceTimersByTime(1);
    expect(cacheVencida()).toBe(true);
    await cargarConfiguracion();
    expect(peticiones(llamadas)).toHaveLength(2);
    expect(estadoConfiguracion().leidoEn).toBe(AHORA + VIGENCIA_CONFIGURACION_MS);
  });

  it('cacheVencida acepta el momento a revisar', async () => {
    jest.useFakeTimers({ now: AHORA });
    simularServidor(rutaConfiguracion());
    await refrescar();

    expect(cacheVencida(AHORA + 4 * MINUTO)).toBe(false);
    jest.setSystemTime(AHORA + 6 * MINUTO);
    expect(cacheVencida()).toBe(true);
  });

  it('lo que vino del archivo siempre cuenta como vencido, aunque su fecha sea reciente', async () => {
    jest.useFakeTimers({ now: AHORA });
    sembrarConfiguracionGuardada(contenidoArchivo(CONFIGURACION_GUARDADA, AHORA));
    sinRed();
    await cargarConfiguracion();

    expect(estadoConfiguracion()).toMatchObject({ origen: 'archivo', leidoEn: AHORA });
    expect(cacheVencida()).toBe(true);
  });
});

describe('archivo en disco', () => {
  // GP-07.5: los datos de transferencia quedan en memoria, pero nunca en el archivo.
  it('guarda solo la versión, la fecha de lectura y la configuración normalizada, sin datos de transferencia', async () => {
    jest.useFakeTimers({ now: AHORA });
    simularServidor(rutaConfiguracion());

    await refrescar();

    expect(archivosGuardados()).toEqual([`file:///documentos/${ARCHIVO_CONFIGURACION}`]);
    const texto = leerArchivo(ARCHIVO_CONFIGURACION) ?? '';
    expect(JSON.parse(texto)).toEqual({ version: 1, leidoEn: AHORA, configuracion: CONFIGURACION_COMPLETA_EN_ARCHIVO });
    for (const dato of [...DATOS_EXCLUIDOS, ...DATOS_TRANSFERENCIA, CLABE_FICTICIA]) {
      expect(texto).not.toContain(dato);
    }
    expect(obtenerConfiguracion().reglas.pagos.transferencia).toEqual(CONFIGURACION_COMPLETA.reglas.pagos.transferencia);
  });

  it.each([
    ['JSON inválido', '{"version":1,"configuracion":'],
    ['de otra versión', JSON.stringify({ version: 2, leidoEn: 1_000, configuracion: CONFIGURACION_GUARDADA })],
    ['con forma rara (arreglo)', JSON.stringify([CONFIGURACION_GUARDADA])],
    ['con la configuración que no es objeto', contenidoArchivo('Salón Guardado en Archivo')],
  ])('archivo %s: se ignora y queda el respaldo', async (_caso, contenido) => {
    sembrarConfiguracionGuardada(contenido);
    sinRed();

    await expect(cargarConfiguracion()).resolves.toBe(RESPALDO_CONFIGURACION);
    expect(estadoConfiguracion().origen).toBe('respaldo');
  });

  it('lo guardado también pasa por la normalización (campos raros toman el respaldo)', async () => {
    sembrarConfiguracionGuardada(
      contenidoArchivo({ salon: { nombre: '  Salón Viejo ', responsable: 'Responsable Ficticia' }, textos: { a: 1 } }, -5),
    );
    sinRed();

    const configuracion = await cargarConfiguracion();

    expect(configuracion).toEqual({ ...RESPALDO_CONFIGURACION, salon: { ...RESPALDO_CONFIGURACION.salon, nombre: 'Salón Viejo' } });
    expect(estadoConfiguracion()).toMatchObject({ origen: 'archivo', leidoEn: null });
  });

  it('sin acceso a Paths: la red funciona igual y no se guarda nada', async () => {
    fallarArchivos({ acceso: true });
    simularServidor(rutaConfiguracion());

    await expect(refrescar()).resolves.toEqual({ configuracion: CONFIGURACION_COMPLETA, origen: 'red' });
    expect(archivosGuardados()).toEqual([]);
  });

  it('si la escritura falla, la configuración de la red queda en memoria', async () => {
    fallarArchivos({ escribir: true });
    simularServidor(rutaConfiguracion());

    await refrescar();

    expect(obtenerConfiguracion()).toEqual(CONFIGURACION_COMPLETA);
    expect(leerArchivo(ARCHIVO_CONFIGURACION)).toBeUndefined();
  });

  it('si la lectura falla y no hay red, queda el respaldo', async () => {
    sembrarConfiguracionGuardada();
    fallarArchivos({ leer: true });
    sinRed();

    await expect(cargarConfiguracion()).resolves.toBe(RESPALDO_CONFIGURACION);
  });
});

describe('refrescos simultáneos', () => {
  it('dos refrescos a la vez hacen una sola petición y reciben lo mismo; el siguiente vuelve a pedir', async () => {
    const llamadas = simularServidor(rutaConfiguracion());

    const [uno, dos] = await Promise.all([refrescar(), refrescar()]);

    expect(peticiones(llamadas)).toHaveLength(1);
    expect(dos).toBe(uno);
    await refrescar();
    expect(peticiones(llamadas)).toHaveLength(2);
  });
});

describe('suscriptores', () => {
  it('reciben aviso con cada versión nueva y dejan de recibir al desuscribirse', async () => {
    simularServidor(rutaConfiguracion());
    const oyente = jest.fn();
    const desuscribir = suscribir(oyente);

    await refrescar();
    expect(oyente).toHaveBeenCalledTimes(1);

    desuscribir();
    await refrescar();
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('el estado conserva la misma referencia hasta que llega una versión nueva', async () => {
    simularServidor(rutaConfiguracion());
    const inicial = estadoConfiguracion();
    expect(estadoConfiguracion()).toBe(inicial);

    await refrescar();

    const nuevo = estadoConfiguracion();
    expect(nuevo).not.toBe(inicial);
    expect(estadoConfiguracion()).toBe(nuevo);
  });

  it('avisa también cuando sube lo guardado en el archivo, pero no si la red falla y la memoria se conserva', async () => {
    sembrarConfiguracionGuardada();
    sinRed();
    const oyente = jest.fn();
    suscribir(oyente);

    await refrescar();
    expect(oyente).toHaveBeenCalledTimes(1);

    await refrescar();
    expect(oyente).toHaveBeenCalledTimes(1);
  });

  it('un oyente que falla no impide avisar a los demás ni rompe el refresco', async () => {
    simularServidor(rutaConfiguracion());
    const otro = jest.fn();
    suscribir(() => {
      throw new Error('Oyente roto');
    });
    suscribir(otro);

    await expect(refrescar()).resolves.toMatchObject({ origen: 'red' });
    expect(otro).toHaveBeenCalledTimes(1);
  });

  it('reiniciarConfiguracionPublica olvida la memoria y a los suscriptores', async () => {
    simularServidor(rutaConfiguracion());
    const oyente = jest.fn();
    suscribir(oyente);
    await refrescar();

    reiniciarConfiguracionPublica();
    await refrescar();

    expect(oyente).toHaveBeenCalledTimes(1);
    expect(estadoConfiguracion().origen).toBe('red');
  });
});

describe('errores de la API', () => {
  it.each([
    ['sin red (fetch rechaza)', () => sinRed(), ErrorDeRed, undefined],
    ['500 del servidor', () => simularServidor(rutaConfiguracion({ message: 'Detalle técnico' }, 500)), ApiError, 500],
    ['404 del servidor', () => simularServidor({}), ApiError, 404],
  ])('%s: el error viaja en el resultado y se usa el archivo', async (_caso, preparar, clase, status) => {
    sembrarConfiguracionGuardada();
    preparar();

    const resultado = await refrescar();

    expect(resultado.error).toBeInstanceOf(clase);
    expect((resultado.error as ApiError).status).toBe(status);
    expect(resultado.origen).toBe('archivo');
    expect(resultado.configuracion).toEqual(CONFIGURACION_GUARDADA);
  });

  it('un 200 que no es un objeto JSON cuenta como sin red y no pisa el archivo guardado', async () => {
    sembrarConfiguracionGuardada();
    const guardado = leerArchivo(ARCHIVO_CONFIGURACION);
    simularServidor(rutaConfiguracion('<html>Inicia sesión en el wifi</html>'));

    const resultado = await refrescar();

    expect(resultado.error).toBeInstanceOf(ErrorDeRed);
    expect(resultado.origen).toBe('archivo');
    expect(resultado.configuracion).toEqual(CONFIGURACION_GUARDADA);
    expect(leerArchivo(ARCHIVO_CONFIGURACION)).toBe(guardado);
  });

  it('sin archivo, el error deja el respaldo', async () => {
    simularServidor(rutaConfiguracion(null, 503));

    const resultado = await refrescar();

    expect(resultado).toEqual({ configuracion: RESPALDO_CONFIGURACION, origen: 'respaldo', error: expect.any(ApiError) });
  });

  it('un error que no es de la API (sin URL configurada) cuenta como sin red', async () => {
    const url = process.env.EXPO_PUBLIC_API_URL;
    delete process.env.EXPO_PUBLIC_API_URL;
    try {
      const resultado = await refrescar();
      expect(resultado.error).toBeInstanceOf(ErrorDeRed);
      expect(resultado.origen).toBe('respaldo');
    } finally {
      process.env.EXPO_PUBLIC_API_URL = url;
    }
  });
});

describe('cargarConLimite (pantalla de carga)', () => {
  it(`servidor lento: a los ${TIEMPO_MAXIMO_CARGA_MS} ms resuelve con el archivo y luego avisa con la versión de red`, async () => {
    jest.useFakeTimers({ now: AHORA });
    sembrarConfiguracionGuardada();
    const servidor = servidorLento();
    const oyente = jest.fn();
    suscribir(oyente);

    const carga = cargarConLimite();
    await jest.advanceTimersByTimeAsync(TIEMPO_MAXIMO_CARGA_MS);

    await expect(carga).resolves.toEqual(CONFIGURACION_GUARDADA);
    expect(oyente).toHaveBeenCalledTimes(1);
    expect(estadoConfiguracion().origen).toBe('archivo');

    servidor.soltar();
    await expect(refrescar()).resolves.toMatchObject({ origen: 'red' });
    expect(servidor.llamadas()).toBe(1);
    expect(oyente).toHaveBeenCalledTimes(2);
    expect(obtenerConfiguracion()).toEqual(CONFIGURACION_COMPLETA);
  });

  it('servidor lento sin archivo: resuelve con el respaldo al vencer el límite indicado', async () => {
    jest.useFakeTimers({ now: AHORA });
    const servidor = servidorLento();
    let resuelta = false;

    const carga = cargarConLimite(500).then((configuracion) => {
      resuelta = true;
      return configuracion;
    });
    await jest.advanceTimersByTimeAsync(499);
    expect(resuelta).toBe(false);
    await jest.advanceTimersByTimeAsync(1);

    await expect(carga).resolves.toBe(RESPALDO_CONFIGURACION);
    servidor.soltar();
    await refrescar();
    expect(estadoConfiguracion().origen).toBe('red');
  });

  it('servidor a tiempo: resuelve con la red y no deja temporizadores pendientes', async () => {
    jest.useFakeTimers({ now: AHORA });
    simularServidor(rutaConfiguracion());

    await expect(cargarConLimite()).resolves.toEqual(CONFIGURACION_COMPLETA);
    expect(jest.getTimerCount()).toBe(0);
  });
});
