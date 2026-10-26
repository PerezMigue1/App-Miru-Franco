/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import { useReactivarViewModel } from '@/features/auth/viewmodels/useReactivarViewModel';
import type { RutaAcceso } from '@/features/auth/viewmodels/useRetornoActivacion';

import { limite429, MENSAJE_LIMITE, respuestaCon, servidorEnOrden, vecesA, type Respondedor } from '../../helpers/limitesRed';
import {
  CODIGO_INVALIDO_SERVIDOR,
  codigoInvalido,
  LISTO_SERVIDOR,
  NEUTRO_SOLICITAR,
  reactivacionLista,
  RUTA_CONFIRMAR,
  RUTA_SOLICITAR,
  solicitudNeutra,
  TEXTO,
  textoEsperaLimite,
  textoOtroCodigoEn,
  textoPaso,
} from '../../helpers/reactivar';
import { leerSecureStore } from '../../helpers/secureStore';
import {
  cerrarConTemporizadores,
  espiarAtras,
  reiniciarSimulaciones,
  routerSimulado,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque C: useReactivarViewModel con renderHook. El correo se valida y se manda normalizado;
 * la respuesta del envío es siempre la neutra; el código va con { email, codigo }; un 400 habla del
 * código, sin red o un 5xx del envío; cada 429 deja su botón en espera; otro código solo tras 60 s;
 * confirmar regresa a Acceso con el correo y el motivo 'reactivada' y no crea ninguna sesión.
 * expo-router simulado, fetch simulado en http://api.test, datos ficticios y temporizadores falsos.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());

const CORREO = 'clienta@ejemplo.test';
const CODIGO = '123456';

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
});

afterEach(async () => {
  await cerrarConTemporizadores();
});

function servidor(solicitar: Respondedor[] = [solicitudNeutra()], confirmar: Respondedor[] = [reactivacionLista()]) {
  return servidorEnOrden({ [`POST ${RUTA_SOLICITAR}`]: solicitar, [`POST ${RUTA_CONFIRMAR}`]: confirmar });
}

async function montar(correo = '', volverA: RutaAcceso = '/login') {
  return renderHook(() => useReactivarViewModel(correo, volverA));
}

type Vista = Awaited<ReturnType<typeof montar>>;

async function tocar(accion: () => void): Promise<void> {
  await act(async () => {
    accion();
  });
}

async function avanzar(ms: number): Promise<void> {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
}

/** Escribe el correo, pide el código y queda en el paso 2. */
async function llegarAlCodigo(vista: Vista, correo = CORREO): Promise<void> {
  await tocar(() => vista.result.current.setCorreo(correo));
  await tocar(() => vista.result.current.pedirCodigo());
  expect(vista.result.current.paso).toBe('codigo');
}

describe('Reactivar: paso 1, el correo', () => {
  it('arranca con el correo del login, el título y el paso 1', async () => {
    servidor();
    const { result } = await montar(CORREO);
    expect(result.current.paso).toBe('correo');
    expect(result.current.correo).toBe(CORREO);
    expect(result.current.textos).toMatchObject({
      titulo: TEXTO.titulo,
      explicacion: TEXTO.explicacion,
      paso: textoPaso(1),
      etiquetaCorreo: TEXTO.etiquetaCorreo,
      etiquetaCodigo: TEXTO.etiquetaCodigo,
      cambiarCorreo: TEXTO.cambiarCorreo,
      volver: TEXTO.volver,
    });
    expect(result.current.textoEnviar).toBe(TEXTO.pedirCodigo);
  });

  it('valida el correo antes de llamar al servidor y lo vuelve a revisar en cada cambio tras el error', async () => {
    const llamadas = servidor();
    const { result } = await montar();

    // Sin error previo, escribir no muestra nada.
    await tocar(() => result.current.setCorreo('cli'));
    expect(result.current.errorCorreo).toBeNull();
    await tocar(() => result.current.setCorreo(''));
    await tocar(() => result.current.pedirCodigo());
    expect(result.current.errorCorreo).toBe('El correo electrónico es requerido');
    await tocar(() => result.current.setCorreo('clienta@ejemplo'));
    expect(result.current.errorCorreo).toBe('El correo electrónico no es válido');
    await tocar(() => result.current.setCorreo(CORREO));
    expect(result.current.errorCorreo).toBeNull();
    expect(vecesA(llamadas, 'POST', RUTA_SOLICITAR)).toBe(0);
    expect(result.current.paso).toBe('correo');
  });

  it('manda solo { email } normalizado, sin sesión, y muestra la respuesta neutra del servidor', async () => {
    const llamadas = servidor();
    const vista = await montar();
    await llegarAlCodigo(vista, '  Clienta@Ejemplo.TEST ');

    const envios = llamadas.filter((l) => l.ruta === RUTA_SOLICITAR);
    expect(envios).toHaveLength(1);
    expect(envios[0].cuerpo).toEqual({ email: CORREO });
    expect(envios[0].cabeceras.Authorization).toBeUndefined();
    expect(vista.result.current.mensaje).toBe(NEUTRO_SOLICITAR);
    expect(vista.result.current.error).toBeNull();
    expect(vista.result.current.textos.paso).toBe(textoPaso(2));
  });

  it('si la respuesta no trae un texto que sirva, muestra el neutro del catálogo y pasa igual al código', async () => {
    servidor([respuestaCon({ success: true })]);
    const vista = await montar(CORREO);
    await tocar(() => vista.result.current.pedirCodigo());
    expect(vista.result.current.paso).toBe('codigo');
    expect(vista.result.current.mensaje).toBe(TEXTO.enviado);
  });

  it('dos toques seguidos mandan una sola solicitud y el botón dice "Enviando…" mientras tanto', async () => {
    let soltar: (r: Response) => void = () => undefined;
    const llamadas = servidor([() => new Promise<Response>((resolver) => { soltar = resolver; })]);
    const { result } = await montar(CORREO);

    await tocar(() => {
      result.current.pedirCodigo();
      result.current.pedirCodigo();
    });
    expect(result.current.enviando).toBe(true);
    expect(result.current.textoEnviar).toBe(TEXTO.pidiendoCodigo);
    // Con el envío en curso, otro toque tampoco sale.
    await tocar(() => result.current.pedirCodigo());
    expect(vecesA(llamadas, 'POST', RUTA_SOLICITAR)).toBe(1);

    await act(async () => {
      soltar(solicitudNeutra());
    });
    expect(result.current.enviando).toBe(false);
    expect(result.current.paso).toBe('codigo');
  });

  it('el 429 muestra su message y deja "Enviarme el código" en espera con su cuenta regresiva', async () => {
    const llamadas = servidor([limite429(2), solicitudNeutra()]);
    const { result } = await montar(CORREO);

    await tocar(() => result.current.pedirCodigo());
    expect(result.current.error).toBe(MENSAJE_LIMITE);
    expect(result.current.paso).toBe('correo');
    expect(result.current.envioEnLimite).toBe(true);
    expect(result.current.textoEnviar).toBe(textoEsperaLimite(2));
    await tocar(() => result.current.pedirCodigo());
    expect(vecesA(llamadas, 'POST', RUTA_SOLICITAR)).toBe(1);

    await avanzar(1000);
    expect(result.current.textoEnviar).toBe(textoEsperaLimite(1));
    await avanzar(1000);
    expect(result.current.envioEnLimite).toBe(false);
    expect(result.current.textoEnviar).toBe(TEXTO.pedirCodigo);
    await tocar(() => result.current.pedirCodigo());
    expect(vecesA(llamadas, 'POST', RUTA_SOLICITAR)).toBe(2);
    expect(result.current.error).toBeNull();
    expect(result.current.paso).toBe('codigo');
  });

  it.each([
    ['sin red', 'sinRed' as Respondedor],
    ['un 5xx con texto técnico', respuestaCon({ statusCode: 500, message: 'PrismaClientKnownRequestError: ficticio' }, 500)],
  ])('con %s muestra el respaldo para la clienta y sigue en el correo', async (_caso, falla) => {
    servidor([falla]);
    const { result } = await montar(CORREO);
    await tocar(() => result.current.pedirCodigo());
    expect(result.current.paso).toBe('correo');
    expect(result.current.error).toEqual(expect.any(String));
    expect(result.current.error).not.toMatch(/Prisma/);
    expect(result.current.envioEnLimite).toBe(false);
  });

  it('un 5xx sin texto para la clienta usa el respaldo de la pantalla', async () => {
    servidor([respuestaCon({ statusCode: 502, message: 'Bad Gateway' }, 502)]);
    const { result } = await montar(CORREO);
    await tocar(() => result.current.pedirCodigo());
    expect(result.current.error).toContain(TEXTO.errorCodigo);
  });
});

describe('Reactivar: paso 2, el código', () => {
  it('deja solo 6 dígitos y no llama al servidor con un código incompleto', async () => {
    const llamadas = servidor();
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);

    await tocar(() => vista.result.current.setCodigo('12 3-4'));
    expect(vista.result.current.codigo).toBe('1234');
    await tocar(() => vista.result.current.reactivar());
    expect(vista.result.current.errorCodigo).toBe(TEXTO.codigoRequerido);
    expect(vecesA(llamadas, 'POST', RUTA_CONFIRMAR)).toBe(0);
    await tocar(() => vista.result.current.setCodigo('123 4567'));
    expect(vista.result.current.codigo).toBe(CODIGO);
    expect(vista.result.current.errorCodigo).toBeNull();
  });

  it('confirma con { email, codigo }, regresa a Acceso con el correo y el motivo y no crea sesión', async () => {
    const llamadas = servidor();
    const vista = await montar('', '/registro');
    await llegarAlCodigo(vista, 'Clienta@Ejemplo.test');
    jest.setSystemTime(new Date(2026, 9, 25, 10, 0, 0));

    await tocar(() => vista.result.current.setCodigo(CODIGO));
    await tocar(() => {
      vista.result.current.reactivar();
      vista.result.current.reactivar();
    });

    const confirmaciones = llamadas.filter((l) => l.ruta === RUTA_CONFIRMAR);
    expect(confirmaciones).toHaveLength(1);
    expect(confirmaciones[0].cuerpo).toEqual({ email: CORREO, codigo: CODIGO });
    expect(confirmaciones[0].cabeceras.Authorization).toBeUndefined();
    expect(vista.result.current.mensaje).toBe(LISTO_SERVIDOR);
    expect(routerSimulado.dismissTo).toHaveBeenCalledTimes(1);
    expect(routerSimulado.dismissTo).toHaveBeenCalledWith({
      pathname: '/registro',
      params: { correo: CORREO, vuelta: String(Date.now()), motivo: 'reactivada' },
    });
    // El texto del servidor nunca viaja en la ruta, y confirmar no deja ninguna sesión guardada.
    expect(JSON.stringify(routerSimulado.dismissTo.mock.calls)).not.toContain(LISTO_SERVIDOR);
    expect(leerSecureStore()).toEqual({});
  });

  it('sin texto en el 200, el aviso de la pantalla es el del catálogo', async () => {
    servidor([solicitudNeutra()], [respuestaCon({ success: true })]);
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);
    await tocar(() => vista.result.current.setCodigo(CODIGO));
    await tocar(() => vista.result.current.reactivar());
    expect(vista.result.current.mensaje).toBe(TEXTO.listo);
    expect(routerSimulado.dismissTo).toHaveBeenCalledTimes(1);
  });

  it('el 400 CODIGO_INVALIDO muestra su mensaje neutro junto al campo y deja intentar de nuevo', async () => {
    const llamadas = servidor([solicitudNeutra()], [codigoInvalido(), reactivacionLista()]);
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);
    await tocar(() => vista.result.current.setCodigo('654321'));
    await tocar(() => vista.result.current.reactivar());

    expect(vista.result.current.errorCodigo).toBe(CODIGO_INVALIDO_SERVIDOR);
    expect(vista.result.current.error).toBeNull();
    expect(vista.result.current.reactivando).toBe(false);
    expect(routerSimulado.dismissTo).not.toHaveBeenCalled();

    await tocar(() => vista.result.current.setCodigo(CODIGO));
    expect(vista.result.current.errorCodigo).toBeNull();
    await tocar(() => vista.result.current.reactivar());
    expect(vecesA(llamadas, 'POST', RUTA_CONFIRMAR)).toBe(2);
    expect(routerSimulado.dismissTo).toHaveBeenCalledTimes(1);
  });

  it('un 400 con texto técnico usa el respaldo, nunca el texto del servidor', async () => {
    servidor([solicitudNeutra()], [codigoInvalido('ValidationException: codigo must be a string')]);
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);
    await tocar(() => vista.result.current.setCodigo(CODIGO));
    await tocar(() => vista.result.current.reactivar());
    expect(vista.result.current.errorCodigo).toEqual(expect.any(String));
    expect(vista.result.current.errorCodigo).not.toMatch(/Exception/);
  });

  it('sin red al confirmar, el aviso general lleva el mensaje para la clienta y el código se conserva', async () => {
    servidor([solicitudNeutra()], ['sinRed']);
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);
    await tocar(() => vista.result.current.setCodigo(CODIGO));
    await tocar(() => vista.result.current.reactivar());
    expect(vista.result.current.error).toEqual(expect.any(String));
    expect(vista.result.current.errorCodigo).toBeNull();
    expect(vista.result.current.codigo).toBe(CODIGO);
    expect(routerSimulado.dismissTo).not.toHaveBeenCalled();
  });

  it('un 5xx sin texto al confirmar usa "No pudimos reactivar tu cuenta"', async () => {
    servidor([solicitudNeutra()], [respuestaCon({ statusCode: 500, message: 'Internal Server Error' }, 500)]);
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);
    await tocar(() => vista.result.current.setCodigo(CODIGO));
    await tocar(() => vista.result.current.reactivar());
    expect(vista.result.current.error).toContain(TEXTO.errorReactivar);
  });

  it('el 429 al confirmar deja "Reactivar mi cuenta" en espera y no repite la petición', async () => {
    const llamadas = servidor([solicitudNeutra()], [limite429(2)]);
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);
    await tocar(() => vista.result.current.setCodigo(CODIGO));
    await tocar(() => vista.result.current.reactivar());

    expect(vista.result.current.error).toBe(MENSAJE_LIMITE);
    expect(vista.result.current.reactivacionEnLimite).toBe(true);
    expect(vista.result.current.textoReactivar).toBe(textoEsperaLimite(2));
    await tocar(() => vista.result.current.reactivar());
    expect(vecesA(llamadas, 'POST', RUTA_CONFIRMAR)).toBe(1);
    await avanzar(2000);
    expect(vista.result.current.reactivacionEnLimite).toBe(false);
    expect(vista.result.current.textoReactivar).toBe(TEXTO.reactivar);
  });

  it('mientras confirma, el botón dice "Reactivando…" y no se puede cambiar el correo ni pedir otro código', async () => {
    let soltar: (r: Response) => void = () => undefined;
    const llamadas = servidor(
      [solicitudNeutra()],
      [() => new Promise<Response>((resolver) => { soltar = resolver; })],
    );
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);
    await avanzar(60_000);
    await tocar(() => vista.result.current.setCodigo(CODIGO));
    await tocar(() => vista.result.current.reactivar());
    expect(vista.result.current.reactivando).toBe(true);
    expect(vista.result.current.textoReactivar).toBe(TEXTO.reactivando);

    await tocar(() => vista.result.current.cambiarCorreo());
    await tocar(() => vista.result.current.pedirOtroCodigo());
    expect(vista.result.current.paso).toBe('codigo');
    expect(vecesA(llamadas, 'POST', RUTA_SOLICITAR)).toBe(1);

    await act(async () => {
      soltar(codigoInvalido());
    });
    expect(vista.result.current.reactivando).toBe(false);
  });
});

describe('Reactivar: otro código y cambiar el correo', () => {
  it('otro código solo después de 60 s, con la cuenta regresiva; luego vuelve a pedir y reinicia la espera', async () => {
    const llamadas = servidor([solicitudNeutra(), respuestaCon({ success: true, message: 'Otra respuesta neutra ficticia.' })]);
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);

    expect(vista.result.current.esperaOtroCodigo).toBe(60);
    expect(vista.result.current.textos.espera).toBe(textoOtroCodigoEn(60));
    await tocar(() => vista.result.current.pedirOtroCodigo());
    expect(vecesA(llamadas, 'POST', RUTA_SOLICITAR)).toBe(1);

    await avanzar(59_000);
    expect(vista.result.current.esperaOtroCodigo).toBe(1);
    expect(vista.result.current.textos.espera).toBe(textoOtroCodigoEn(1));
    await tocar(() => vista.result.current.pedirOtroCodigo());
    expect(vecesA(llamadas, 'POST', RUTA_SOLICITAR)).toBe(1);

    await avanzar(1000);
    expect(vista.result.current.esperaOtroCodigo).toBe(0);
    expect(vista.result.current.textoOtroCodigo).toBe(TEXTO.otroCodigo);
    await tocar(() => vista.result.current.setCodigo('12'));
    await tocar(() => vista.result.current.pedirOtroCodigo());
    const envios = llamadas.filter((l) => l.ruta === RUTA_SOLICITAR);
    expect(envios).toHaveLength(2);
    expect(envios[1].cuerpo).toEqual({ email: CORREO });
    expect(vista.result.current.mensaje).toBe('Otra respuesta neutra ficticia.');
    expect(vista.result.current.codigo).toBe('');
    expect(vista.result.current.esperaOtroCodigo).toBe(60);
  });

  it('un 429 al pedir otro código deja el enlace en espera con su texto', async () => {
    servidor([solicitudNeutra(), limite429(3)]);
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);
    await avanzar(60_000);
    await tocar(() => vista.result.current.pedirOtroCodigo());
    expect(vista.result.current.error).toBe(MENSAJE_LIMITE);
    expect(vista.result.current.envioEnLimite).toBe(true);
    expect(vista.result.current.textoOtroCodigo).toBe(textoEsperaLimite(3));
    expect(vista.result.current.paso).toBe('codigo');
  });

  it('"Cambiar el correo" vuelve al paso 1 con el correo escrito y sin código ni avisos', async () => {
    const llamadas = servidor([solicitudNeutra(), solicitudNeutra()]);
    const vista = await montar(CORREO);
    await llegarAlCodigo(vista);
    await tocar(() => vista.result.current.setCodigo('123'));

    await tocar(() => vista.result.current.cambiarCorreo());
    expect(vista.result.current.paso).toBe('correo');
    expect(vista.result.current.correo).toBe(CORREO);
    expect(vista.result.current.codigo).toBe('');
    expect(vista.result.current.mensaje).toBeNull();
    expect(vista.result.current.error).toBeNull();

    await tocar(() => vista.result.current.setCorreo('otra@ejemplo.test'));
    await tocar(() => vista.result.current.pedirCodigo());
    const envios = llamadas.filter((l) => l.ruta === RUTA_SOLICITAR);
    expect(envios[1].cuerpo).toEqual({ email: 'otra@ejemplo.test' });
  });
});

describe('Reactivar: salir sin reactivar', () => {
  it('"Volver a iniciar sesión" y el Atrás de Android regresan a Acceso sin correo ni motivo', async () => {
    servidor();
    const atras = espiarAtras();
    try {
      const vista = await montar(CORREO, '/registro');
      await tocar(() => vista.result.current.volver());
      expect(routerSimulado.dismissTo).toHaveBeenLastCalledWith('/registro');

      let consumido = false;
      await tocar(() => {
        consumido = atras.pulsar();
      });
      expect(consumido).toBe(true);
      expect(routerSimulado.dismissTo).toHaveBeenCalledTimes(2);
      expect(routerSimulado.dismissTo).toHaveBeenLastCalledWith('/registro');

      await vista.unmount();
      expect(atras.quitar).toHaveBeenCalled();
    } finally {
      atras.restaurar();
    }
  });
});
