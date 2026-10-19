/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { AparienciaProvider, useApariencia } from '@/shared/ui/apariencia';
import * as colores from '@/shared/ui/colores';
import { soloDigitos, telefonoEscrito, telefonoPegado, telefonoSinLada } from '@/shared/ui/digitos';
import {
  EASE_SALIDA,
  transicionBorde,
  transicionSeleccion,
  useEntradaContenido,
  usePresion,
} from '@/shared/ui/movimiento';
import {
  bienvenidaVista,
  guardarApariencia,
  leerApariencia,
  marcarBienvenidaVista,
  type PreferenciaApariencia,
} from '@/shared/ui/preferencias';
import * as tokens from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { leerSecureStore } from '../../helpers/secureStore';

/**
 * GP-04: tema y tokens de src/shared/ui. Cubre que los dos temas tengan las mismas claves, cómo
 * useTheme y AparienciaProvider eligen el tema según la preferencia guardada y el esquema del
 * teléfono, la lectura y escritura de preferencias en SecureStore, el formato de teléfonos de
 * digitos.ts y la lógica observable de movimiento.ts (usePresion y useEntradaContenido).
 * No revisa valores de estilo uno por uno.
 */

// Esquema del teléfono: useColorScheme de react-native se sustituye por un jest.fn controlable.
// El índice de react-native lo carga de este archivo, así que useTheme recibe el simulado.
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

// Appearance real, salvo setColorScheme, que se espía para ver qué esquema fija la apariencia.
jest.mock('react-native/Libraries/Utilities/Appearance', () => ({
  ...jest.requireActual<object>('react-native/Libraries/Utilities/Appearance'),
  setColorScheme: jest.fn(),
}));

// Movimiento reducido controlable para usePresion y useEntradaContenido.
jest.mock('@/shared/ui/useMovimientoReducido', () => ({
  useMovimientoReducido: jest.fn(() => false),
}));

type EsquemaSistema = 'light' | 'dark' | null;

interface SecureStoreSimulado {
  __almacen: Map<string, string>;
  getItemAsync: jest.Mock<Promise<string | null>, [string]>;
  setItemAsync: jest.Mock<Promise<void>, [string, string]>;
}

const CLAVE_APARIENCIA = 'preferencia_apariencia';
const CLAVE_BIENVENIDA = 'bienvenida_vista';

const ss = jest.requireMock<SecureStoreSimulado>('expo-secure-store');
const esquemaSistema = jest.requireMock<{ default: jest.Mock<EsquemaSistema, []> }>(
  'react-native/Libraries/Utilities/useColorScheme',
).default;
const setColorScheme = jest.requireMock<{ setColorScheme: jest.Mock<void, [string]> }>(
  'react-native/Libraries/Utilities/Appearance',
).setColorScheme;
const movimientoReducido = jest.requireMock<{ useMovimientoReducido: jest.Mock<boolean, []> }>(
  '@/shared/ui/useMovimientoReducido',
).useMovimientoReducido;
/**
 * El mock de Reanimated de test/setup.ts tal cual lo recibe src. Con `import * as` Babel haría una
 * copia (el mock no trae __esModule) y los espías no llegarían a movimiento.ts.
 */
const Reanimated = jest.requireMock<typeof import('react-native-reanimated')>('react-native-reanimated');

/** Espías de cada prueba; se restauran uno por uno para no tocar los jest.fn de test/setup.ts. */
const espias: jest.SpyInstance[] = [];

beforeEach(() => {
  esquemaSistema.mockReset();
  esquemaSistema.mockReturnValue('light');
  setColorScheme.mockClear();
  movimientoReducido.mockReset();
  movimientoReducido.mockReturnValue(false);
});

afterEach(() => {
  for (const espia of espias.splice(0)) {
    espia.mockRestore();
  }
});

/** Promesa que la prueba resuelve cuando quiere, para observar el estado antes de la lectura. */
function lecturaPendiente(): { resolver: (valor: string | null) => void } {
  const control: { resolver: (valor: string | null) => void } = { resolver: () => undefined };
  ss.getItemAsync.mockImplementationOnce(
    () =>
      new Promise<string | null>((resolve) => {
        control.resolver = resolve;
      }),
  );
  return control;
}

/** Tema y apariencia juntos, dentro del proveedor real. */
function useTemaYApariencia() {
  return { tema: useTheme(), apariencia: useApariencia() };
}

async function montarConProveedor() {
  const montado = await renderHook(useTemaYApariencia, { wrapper: AparienciaProvider });
  await waitFor(() => expect(montado.result.current.apariencia.lista).toBe(true));
  return montado;
}

describe('colores.ts: temaClaro y temaOscuro', () => {
  const FORMATO_COLOR =
    /^(?:#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})|rgba\(\s*\d{1,3},\s*\d{1,3},\s*\d{1,3},\s*(?:0|1|0?\.\d+)\s*\)|transparent)$/;

  it('tienen exactamente las mismas claves', () => {
    const clavesClaro = Object.keys(colores.temaClaro).sort();
    const clavesOscuro = Object.keys(colores.temaOscuro).sort();
    expect(clavesOscuro).toEqual(clavesClaro);
  });

  it.each([
    ['temaClaro', colores.temaClaro],
    ['temaOscuro', colores.temaOscuro],
  ])('%s solo tiene cadenas no vacías', (_nombre, tema) => {
    const invalidas = Object.entries(tema)
      .filter(([, valor]) => typeof valor !== 'string' || valor.trim() === '')
      .map(([clave]) => clave);
    expect(invalidas).toEqual([]);
  });

  it.each([
    ['temaClaro', colores.temaClaro],
    ['temaOscuro', colores.temaOscuro],
  ])('%s solo tiene colores con formato válido (hex, rgba o transparent)', (_nombre, tema) => {
    const invalidas = Object.entries(tema)
      .filter(([, valor]) => !FORMATO_COLOR.test(valor))
      .map(([clave, valor]) => `${clave}: ${valor}`);
    expect(invalidas).toEqual([]);
  });

  it('las insignias tienen los mismos estados en claro, en oscuro y en el borde', () => {
    const estadosClaro = Object.keys(colores.coloresInsignia.claro).sort();
    expect(Object.keys(colores.coloresInsignia.oscuro).sort()).toEqual(estadosClaro);
    expect(Object.keys(colores.coloresInsignia.borde).sort()).toEqual(estadosClaro);
  });

  it('el fondo del hero tiene las mismas claves en claro y en oscuro', () => {
    expect(Object.keys(colores.coloresFondoHero.oscuro).sort()).toEqual(
      Object.keys(colores.coloresFondoHero.claro).sort(),
    );
  });
});

describe('tokens.ts', () => {
  it('vuelve a exportar los mismos objetos de colores.ts (no copias)', () => {
    expect(tokens.temaClaro).toBe(colores.temaClaro);
    expect(tokens.temaOscuro).toBe(colores.temaOscuro);
    expect(tokens.paleta).toBe(colores.paleta);
    expect(tokens.coloresInsignia).toBe(colores.coloresInsignia);
    expect(tokens.coloresFondoHero).toBe(colores.coloresFondoHero);
  });

  it('el desplazamiento de las apariciones sale del ritmo de espacio', () => {
    expect(tokens.movimiento.desplazamiento).toBe(tokens.espacio.s);
  });

  it.each(Object.entries(tokens.curva))(
    'la curva %s tiene 4 puntos de control con x1 y x2 dentro de [0, 1] (cubic-bezier válido)',
    (_nombre, puntos) => {
      expect(puntos).toHaveLength(4);
      const [x1, , x2] = puntos;
      for (const x of [x1, x2]) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(1);
      }
    },
  );
});

describe('preferencias.ts: apariencia', () => {
  it('sin nada guardado, leerApariencia devuelve "sistema"', async () => {
    await expect(leerApariencia()).resolves.toBe('sistema');
  });

  it.each<PreferenciaApariencia>(['sistema', 'claro', 'oscuro'])(
    'leerApariencia devuelve "%s" si eso está guardado',
    async (preferencia) => {
      ss.__almacen.set(CLAVE_APARIENCIA, preferencia);
      await expect(leerApariencia()).resolves.toBe(preferencia);
    },
  );

  it.each(['morado', '', 'OSCURO', '"oscuro"'])(
    'un valor guardado que no es una preferencia ("%s") vuelve a "sistema"',
    async (valor) => {
      ss.__almacen.set(CLAVE_APARIENCIA, valor);
      await expect(leerApariencia()).resolves.toBe('sistema');
    },
  );

  it('si SecureStore falla al leer, devuelve "sistema" sin lanzar', async () => {
    ss.getItemAsync.mockRejectedValueOnce(new Error('falla de SecureStore'));
    await expect(leerApariencia()).resolves.toBe('sistema');
  });

  it('guardarApariencia escribe la preferencia en su clave propia', async () => {
    await guardarApariencia('oscuro');
    expect(leerSecureStore()).toEqual({ [CLAVE_APARIENCIA]: 'oscuro' });
    await expect(leerApariencia()).resolves.toBe('oscuro');
  });

  it('si SecureStore falla al guardar, guardarApariencia no lanza', async () => {
    ss.setItemAsync.mockRejectedValueOnce(new Error('falla de SecureStore'));
    await expect(guardarApariencia('claro')).resolves.toBeUndefined();
    expect(leerSecureStore()).toEqual({});
  });
});

describe('preferencias.ts: bienvenida', () => {
  it('sin nada guardado, la bienvenida no se ha visto', async () => {
    await expect(bienvenidaVista()).resolves.toBe(false);
  });

  it('marcarBienvenidaVista guarda "1" y después bienvenidaVista da true', async () => {
    await marcarBienvenidaVista();
    expect(leerSecureStore()).toEqual({ [CLAVE_BIENVENIDA]: '1' });
    await expect(bienvenidaVista()).resolves.toBe(true);
  });

  it('solo "1" cuenta como vista', async () => {
    ss.__almacen.set(CLAVE_BIENVENIDA, 'true');
    await expect(bienvenidaVista()).resolves.toBe(false);
  });

  it('si SecureStore falla al leer, la da por vista (no insiste con la hoja)', async () => {
    ss.getItemAsync.mockRejectedValueOnce(new Error('falla de SecureStore'));
    await expect(bienvenidaVista()).resolves.toBe(true);
  });

  it('si SecureStore falla al guardar, marcarBienvenidaVista no lanza', async () => {
    ss.setItemAsync.mockRejectedValueOnce(new Error('falla de SecureStore'));
    await expect(marcarBienvenidaVista()).resolves.toBeUndefined();
  });

  it('la apariencia y la bienvenida usan claves distintas', async () => {
    await guardarApariencia('claro');
    await marcarBienvenidaVista();
    expect(leerSecureStore()).toEqual({ [CLAVE_APARIENCIA]: 'claro', [CLAVE_BIENVENIDA]: '1' });
  });
});

describe('useTheme sin AparienciaProvider (contexto por defecto)', () => {
  it('useApariencia da "sistema", lista y un cambiar que no hace nada', async () => {
    const { result } = await renderHook(() => useApariencia());
    expect(result.current.preferencia).toBe('sistema');
    expect(result.current.lista).toBe(true);
    expect(() => result.current.cambiar('oscuro')).not.toThrow();
    expect(setColorScheme).not.toHaveBeenCalled();
  });

  it.each<[EsquemaSistema, boolean]>([
    ['dark', true],
    ['light', false],
    [null, false],
  ])('con el teléfono en %s, oscuro es %s', async (esquema, oscuro) => {
    esquemaSistema.mockReturnValue(esquema);
    const { result } = await renderHook(() => useTheme());
    expect(result.current.oscuro).toBe(oscuro);
    expect(result.current.colores).toBe(oscuro ? colores.temaOscuro : colores.temaClaro);
  });
});

describe('useTheme con AparienciaProvider y la preferencia guardada', () => {
  it.each<[PreferenciaApariencia | null, EsquemaSistema, PreferenciaApariencia, boolean]>([
    // [guardada, esquema del teléfono, preferencia esperada, oscuro esperado]
    ['oscuro', 'light', 'oscuro', true],
    ['oscuro', 'dark', 'oscuro', true],
    ['claro', 'dark', 'claro', false],
    ['claro', 'light', 'claro', false],
    ['sistema', 'dark', 'sistema', true],
    ['sistema', 'light', 'sistema', false],
    ['sistema', null, 'sistema', false],
    [null, 'dark', 'sistema', true],
    [null, 'light', 'sistema', false],
  ])(
    'guardada %s y teléfono en %s: preferencia %s y oscuro %s',
    async (guardada, esquema, preferencia, oscuro) => {
      if (guardada !== null) {
        ss.__almacen.set(CLAVE_APARIENCIA, guardada);
      }
      esquemaSistema.mockReturnValue(esquema);

      const { result } = await montarConProveedor();

      expect(result.current.apariencia.preferencia).toBe(preferencia);
      expect(result.current.tema.oscuro).toBe(oscuro);
      expect(result.current.tema.colores).toBe(oscuro ? colores.temaOscuro : colores.temaClaro);
    },
  );

  it('un valor guardado inválido se trata como "sistema"', async () => {
    ss.__almacen.set(CLAVE_APARIENCIA, 'morado');
    esquemaSistema.mockReturnValue('dark');
    const { result } = await montarConProveedor();
    expect(result.current.apariencia.preferencia).toBe('sistema');
    expect(result.current.tema.oscuro).toBe(true);
  });

  it.each<[PreferenciaApariencia, string]>([
    ['sistema', 'unspecified'],
    ['claro', 'light'],
    ['oscuro', 'dark'],
  ])('al leer "%s" fija Appearance en "%s"', async (guardada, esquema) => {
    ss.__almacen.set(CLAVE_APARIENCIA, guardada);
    await montarConProveedor();
    expect(setColorScheme).toHaveBeenCalledTimes(1);
    expect(setColorScheme).toHaveBeenCalledWith(esquema);
  });

  it('mientras lee no está lista y usa "sistema"; al terminar aplica la guardada', async () => {
    const lectura = lecturaPendiente();
    esquemaSistema.mockReturnValue('light');
    const { result } = await renderHook(useTemaYApariencia, { wrapper: AparienciaProvider });

    expect(result.current.apariencia.lista).toBe(false);
    expect(result.current.apariencia.preferencia).toBe('sistema');
    expect(result.current.tema.oscuro).toBe(false);
    expect(setColorScheme).not.toHaveBeenCalled();

    await act(async () => {
      lectura.resolver('oscuro');
    });

    expect(result.current.apariencia.lista).toBe(true);
    expect(result.current.apariencia.preferencia).toBe('oscuro');
    expect(result.current.tema.oscuro).toBe(true);
    expect(setColorScheme).toHaveBeenCalledWith('dark');
  });

  it('si SecureStore falla al leer, queda lista con "sistema"', async () => {
    ss.getItemAsync.mockRejectedValueOnce(new Error('falla de SecureStore'));
    esquemaSistema.mockReturnValue('dark');
    const { result } = await montarConProveedor();
    expect(result.current.apariencia.preferencia).toBe('sistema');
    expect(result.current.tema.oscuro).toBe(true);
    expect(setColorScheme).toHaveBeenCalledWith('unspecified');
  });

  it('si se desmonta antes de terminar la lectura, no aplica nada', async () => {
    const lectura = lecturaPendiente();
    const { unmount } = await renderHook(useTemaYApariencia, { wrapper: AparienciaProvider });
    await unmount();

    await act(async () => {
      lectura.resolver('oscuro');
    });

    expect(setColorScheme).not.toHaveBeenCalled();
  });
});

describe('AparienciaProvider: cambiar la apariencia', () => {
  it.each<[PreferenciaApariencia, string, EsquemaSistema, boolean]>([
    // [nueva, esquema que fija, teléfono, oscuro esperado]
    ['oscuro', 'dark', 'light', true],
    ['claro', 'light', 'dark', false],
    ['sistema', 'unspecified', 'dark', true],
    ['sistema', 'unspecified', 'light', false],
  ])(
    'cambiar a "%s" fija Appearance en "%s" y con el teléfono en %s el tema queda oscuro %s',
    async (nueva, esquema, telefono, oscuro) => {
      ss.__almacen.set(CLAVE_APARIENCIA, nueva === 'oscuro' ? 'claro' : 'oscuro');
      esquemaSistema.mockReturnValue(telefono);
      const { result } = await montarConProveedor();
      setColorScheme.mockClear();

      await act(async () => {
        result.current.apariencia.cambiar(nueva);
      });

      expect(setColorScheme).toHaveBeenCalledTimes(1);
      expect(setColorScheme).toHaveBeenCalledWith(esquema);
      expect(result.current.apariencia.preferencia).toBe(nueva);
      expect(result.current.tema.oscuro).toBe(oscuro);
      await waitFor(() => expect(leerSecureStore()[CLAVE_APARIENCIA]).toBe(nueva));
    },
  );

  it('si no se puede guardar, el cambio se aplica igual en esta sesión', async () => {
    const { result } = await montarConProveedor();
    ss.setItemAsync.mockRejectedValueOnce(new Error('falla de SecureStore'));

    await act(async () => {
      result.current.apariencia.cambiar('oscuro');
    });

    expect(result.current.apariencia.preferencia).toBe('oscuro');
    expect(result.current.tema.oscuro).toBe(true);
    expect(leerSecureStore()[CLAVE_APARIENCIA]).toBeUndefined();
  });

  it('cambiar conserva la misma función entre renders', async () => {
    const { result } = await montarConProveedor();
    const cambiarAntes = result.current.apariencia.cambiar;
    await act(async () => {
      result.current.apariencia.cambiar('claro');
    });
    expect(result.current.apariencia.cambiar).toBe(cambiarAntes);
  });
});

describe('digitos.ts', () => {
  it.each([
    ['(771) 123-45 67', '7711234567'],
    ['+52 1 771 123 4567', '5217711234567'],
    ['sin números', ''],
    ['', ''],
    ['٧٧١', ''],
  ])('soloDigitos("%s") da "%s"', (texto, esperado) => {
    expect(soloDigitos(texto)).toBe(esperado);
  });

  it.each([
    ['7711234567', '7711234567'],
    ['+52 771 123 4567', '7711234567'],
    ['+52 1 771 123 4567', '7711234567'],
    ['521 771 123 4567', '7711234567'],
    // 12 dígitos que no empiezan con 52: no se toca.
    ['127711234567', '127711234567'],
    // 13 dígitos que empiezan con 52 pero no con 521: no se toca.
    ['5277112345678', '5277112345678'],
    // 10 dígitos que empiezan con 52: es un número local, no se toca.
    ['5212345678', '5212345678'],
    // 11 dígitos: no se recorta, la validación lo marca.
    ['52771123456', '52771123456'],
  ])('telefonoSinLada("%s") da "%s"', (texto, esperado) => {
    expect(telefonoSinLada(texto)).toBe(esperado);
  });

  it('telefonoPegado hace lo mismo que telefonoSinLada', () => {
    for (const texto of ['+52 771 123 4567', '+52 1 771 123 4567', '771-123-4567', '99 99']) {
      expect(telefonoPegado(texto)).toBe(telefonoSinLada(texto));
    }
  });

  it.each([
    ['771 123 4567', '7711234567'],
    ['+52 1 771 123 4567', '5217711234567'],
    ['+52 1 771 123 4567 89', '5217711234567'],
    ['abc', ''],
  ])('telefonoEscrito("%s") da "%s" (solo dígitos, hasta 13, sin quitar la lada)', (texto, esperado) => {
    expect(telefonoEscrito(texto)).toBe(esperado);
  });
});

describe('movimiento.ts', () => {
  /** Valor compartido simulado que sobrevive entre renders, para ver el estilo ya presionado. */
  function valorCompartidoFijo(inicial = 0) {
    const estado = { actual: inicial };
    const valor = {
      get: () => estado.actual,
      set: (nuevo: number) => {
        estado.actual = nuevo;
      },
    };
    espias.push(jest.spyOn(Reanimated, 'useSharedValue').mockImplementation((() => valor) as never));
    return estado;
  }

  interface EstiloPresion {
    opacity: number;
    transform: { scale: number }[];
  }

  const AJUSTE_PRESION = {
    duration: tokens.duracion.presionar,
    easing: EASE_SALIDA,
    reduceMotion: Reanimated.ReduceMotion.Never,
  };

  it('transicionBorde y transicionSeleccion usan la curva de salida y la duración del estado de campo', () => {
    for (const transicion of [transicionBorde, transicionSeleccion]) {
      expect(transicion.transitionDuration).toBe(tokens.duracion.estadoCampo);
      expect(transicion.transitionTimingFunction).toEqual(Reanimated.cubicBezier(...tokens.curva.salida));
    }
    expect(transicionBorde.transitionProperty).toBe('borderColor');
    expect(transicionSeleccion.transitionProperty).toEqual(['backgroundColor', 'borderColor']);
  });

  it('usePresion en reposo: escala 1 y opacidad 1', async () => {
    const { result } = await renderHook(() => usePresion());
    expect(result.current.estilo).toEqual({ opacity: 1, transform: [{ scale: 1 }] });
  });

  it('hundir anima hacia 1 y soltar hacia 0, con la duración de presionar y sin saltarse con movimiento reducido', async () => {
    const estado = valorCompartidoFijo();
    const espiaTiming = jest.spyOn(Reanimated, 'withTiming');
    espias.push(espiaTiming);
    const { result } = await renderHook(() => usePresion());

    result.current.hundir();
    expect(espiaTiming).toHaveBeenLastCalledWith(1, AJUSTE_PRESION);
    expect(estado.actual).toBe(1);

    result.current.soltar();
    expect(espiaTiming).toHaveBeenLastCalledWith(0, AJUSTE_PRESION);
    expect(estado.actual).toBe(0);
  });

  it('presionado sin movimiento reducido: se hunde a la escala de presionado con opacidad 1', async () => {
    valorCompartidoFijo(1);
    const { result } = await renderHook(() => usePresion());
    const estilo = result.current.estilo as unknown as EstiloPresion;
    expect(estilo.opacity).toBe(1);
    expect(estilo.transform[0].scale).toBeCloseTo(tokens.escalaPresionado, 10);
  });

  it('presionado con una escala propia (tarjeta): se hunde a esa escala', async () => {
    valorCompartidoFijo(1);
    const { result } = await renderHook(() => usePresion(tokens.escalaPresionadoTarjeta));
    const estilo = result.current.estilo as unknown as EstiloPresion;
    expect(estilo.transform[0].scale).toBeCloseTo(tokens.escalaPresionadoTarjeta, 10);
  });

  it('presionado con movimiento reducido: no cambia de tamaño, baja la opacidad', async () => {
    movimientoReducido.mockReturnValue(true);
    valorCompartidoFijo(1);
    const { result } = await renderHook(() => usePresion());
    const estilo = result.current.estilo as unknown as EstiloPresion;
    expect(estilo.transform).toEqual([{ scale: 1 }]);
    expect(estilo.opacity).toBeCloseTo(tokens.opacidad.presionadoReducido, 10);
  });

  it('useEntradaContenido sin movimiento reducido arma un Keyframe propio', async () => {
    const { result } = await renderHook(() => useEntradaContenido());
    expect(result.current).toBeInstanceOf(Reanimated.Keyframe);
    expect(result.current).not.toBe(Reanimated.FadeIn);
  });

  it('useEntradaContenido con movimiento reducido usa solo FadeIn con el retraso pedido y sin saltarse', async () => {
    movimientoReducido.mockReturnValue(true);
    const espiaRetraso = jest.spyOn(Reanimated.FadeIn, 'delay');
    const espiaReducido = jest.spyOn(Reanimated.FadeIn, 'reduceMotion');
    espias.push(espiaRetraso, espiaReducido);

    const { result } = await renderHook(() => useEntradaContenido(120));

    expect(result.current).toBe(Reanimated.FadeIn);
    expect(espiaRetraso).toHaveBeenCalledWith(120);
    expect(espiaReducido).toHaveBeenCalledWith(Reanimated.ReduceMotion.Never);
  });

  it('useEntradaContenido conserva la animación si el retraso no cambia y arma otra si cambia', async () => {
    const { result, rerender } = await renderHook((retraso: number) => useEntradaContenido(retraso), {
      initialProps: 0,
    });
    const primera = result.current;

    await rerender(0);
    expect(result.current).toBe(primera);

    await rerender(120);
    expect(result.current).not.toBe(primera);
  });
});
