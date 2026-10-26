/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import { iniciarSesion } from '@/features/auth/models/authService';
import { invalidarPerfil } from '@/features/auth/models/perfilCompartido';
import { useActivarViewModel } from '@/features/auth/viewmodels/useActivarViewModel';
import {
  useCambiarContrasenaViewModel,
  type CampoDato,
} from '@/features/auth/viewmodels/useCambiarContrasenaViewModel';
import { useLoginViewModel } from '@/features/auth/viewmodels/useLoginViewModel';
import { useRecuperarViewModel } from '@/features/auth/viewmodels/useRecuperarViewModel';
import {
  useRegistroViewModel,
  type CampoRegistro,
  type CamposRegistro,
} from '@/features/auth/viewmodels/useRegistroViewModel';
import { alCerrarSesion } from '@/shared/api/eventosSesion';
import { CODIGO_BLOQUEO_TEMPORAL, MENSAJE_SESION_TERMINADA } from '@/shared/api/mensajesError';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  limite429,
  MENSAJE_BLOQUEO,
  MENSAJE_LIMITE,
  respuestaCon,
  servidorEnOrden,
  vecesA,
  type Respondedor,
} from '../../helpers/limitesRed';
import { CLIENTA, PERFIL_COMPLETO } from '../../helpers/perfilClienta';
import {
  cerrarPruebaSesion,
  espiarExpiracion,
  guardarEnAlmacen,
  sesionFicticia,
  textoSesion,
} from '../../helpers/sesionLimites';
import { authSimulada, reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque D: autenticación con límites. Un 429 (incluido BLOQUEO_TEMPORAL) muestra el message
 * del backend y deja el botón principal deshabilitado con "Intenta de nuevo en N s", que baja cada
 * segundo y al terminar regresa a su texto; mientras tanto no se repite la petición. El reenvío del
 * código muestra el mensaje neutro del 200 y un 404 o 400 ya no dice nada de la cuenta. Viewmodels
 * con renderHook, fetch simulado en http://api.test, datos ficticios y temporizadores falsos.
 */

const mockIngresar = jest.fn();

jest.mock('expo-router', () => ({
  ...require('../../helpers/viewmodelsAuth').expoRouterSimulado(),
  usePathname: () => '/login',
}));
jest.mock('@/features/auth/viewmodels/useAuth', () => ({
  useAuth: () => ({ ...require('../../helpers/viewmodelsAuth').authSimulada, ingresar: mockIngresar }),
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })) }));

const CORREO = 'clienta@ejemplo.test';
const CLAVE = 'ClaveFicticia1!';
const CLAVE_NUEVA = 'NuevaFicticia7#';
const RUTA_LOGIN = '/api/auth/login';
const RUTA_REGISTRO = '/api/usuarios/registro';
const RUTA_RECUPERAR = '/api/auth/solicitar-enlace-recuperacion';
const RUTA_REENVIAR = '/api/auth/reenviar-codigo';
const RUTA_CODIGO = '/api/auth/me/password/codigo';
const RUTA_CAMBIO = '/api/auth/me/password';
const RUTA_VERIFICAR = '/api/auth/verificar-otp';
/** Mensaje neutro ficticio del 200 del reenvío (Ronda 7): el mismo exista o no la cuenta. */
const NEUTRO_REENVIO = 'Si la cuenta existe y falta activarla, te enviamos un código nuevo.';
const NO_SE_REENVIO = RESPALDO_TEXTOS['auth.activar.noSeReenvio'];
const ESPERA_PLANTILLA = RESPALDO_TEXTOS['errores.esperaLimite'];
const esperaDe = (segundos: number) => ESPERA_PLANTILLA.replace('{segundos}', String(segundos));

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
  invalidarPerfil();
  mockIngresar.mockReset();
  // El inicio de sesión real (authService y apiClient) contra el fetch simulado.
  mockIngresar.mockImplementation(async (email: string, clave: string) => {
    await iniciarSesion(email, clave);
  });
});

afterEach(async () => {
  await cerrarPruebaSesion();
  jest.clearAllTimers();
  jest.useRealTimers();
});

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

interface EstadoBoton {
  enEspera: boolean;
  texto: string;
}

/**
 * Con la espera recién empezada: deshabilitado con "Intenta de nuevo en N s", baja de uno en uno y
 * al terminar regresa al texto normal y se habilita.
 */
async function revisarCuentaRegresiva(leer: () => EstadoBoton, segundos: number, normal: string): Promise<void> {
  expect(leer()).toEqual({ enEspera: true, texto: esperaDe(segundos) });
  for (let quedan = segundos - 1; quedan > 0; quedan -= 1) {
    await avanzar(1000);
    expect(leer()).toEqual({ enEspera: true, texto: esperaDe(quedan) });
  }
  await avanzar(1000);
  expect(leer()).toEqual({ enEspera: false, texto: normal });
}

// ── Acceso ───────────────────────────────────────────────────────────────────────────────────

describe('Acceso con límites', () => {
  async function entrarCon(rutas: Record<string, Respondedor[]>) {
    const llamadas = servidorEnOrden(rutas);
    const vista = await renderHook(() => useLoginViewModel());
    await tocar(() => vista.result.current.setCorreo(CORREO));
    await tocar(() => vista.result.current.setClave(CLAVE));
    await tocar(() => vista.result.current.entrar());
    await waitFor(() => expect(vista.result.current.cargando).toBe(false));
    return { ...vista, llamadas };
  }

  const botonEntrar = (vm: ReturnType<typeof useLoginViewModel>): EstadoBoton => ({
    enEspera: vm.enEspera,
    texto: vm.textoEntrar,
  });

  it('un 429 con retryAfter muestra el message y "Entrar" espera esos segundos sin volver a llamar', async () => {
    const { result, llamadas } = await entrarCon({
      [`POST ${RUTA_LOGIN}`]: [limite429(3), respuestaCon({ message: 'Unauthorized' }, 401)],
    });

    expect(result.current.errorGeneral).toBe(MENSAJE_LIMITE);
    // Durante la espera, tocar "Entrar" (o la tecla del teclado) no llama al servidor.
    await tocar(() => result.current.entrar());
    expect(vecesA(llamadas, 'POST', RUTA_LOGIN)).toBe(1);

    await revisarCuentaRegresiva(() => botonEntrar(result.current), 3, 'Entrar');
    await tocar(() => result.current.entrar());
    await waitFor(() => expect(vecesA(llamadas, 'POST', RUTA_LOGIN)).toBe(2));
    await waitFor(() => expect(result.current.errorGeneral).toBe('Correo o contraseña incorrectos'));
    expect(result.current.enEspera).toBe(false);
  });

  it('el 429 BLOQUEO_TEMPORAL muestra su message, no cierra la sesión, no abre Activar ni dice "sesión terminada"', async () => {
    const expiro = espiarExpiracion();
    const cierres = jest.fn();
    const quitarOyente = alCerrarSesion(cierres);
    const sesion = sesionFicticia();
    await guardarEnAlmacen(sesion);
    const guardada = textoSesion();

    const { result } = await entrarCon({
      [`POST ${RUTA_LOGIN}`]: [limite429(5, CODIGO_BLOQUEO_TEMPORAL, MENSAJE_BLOQUEO)],
    });
    quitarOyente();

    expect(result.current.errorGeneral).toBe(MENSAJE_BLOQUEO);
    expect(result.current.errorGeneral).not.toBe(MENSAJE_SESION_TERMINADA);
    expect(routerSimulado.push).not.toHaveBeenCalled();
    expect(expiro).not.toHaveBeenCalled();
    expect(cierres).not.toHaveBeenCalled();
    expect(authSimulada.salir).not.toHaveBeenCalled();
    expect(textoSesion()).toBe(guardada);
    expect(botonEntrar(result.current)).toEqual({ enEspera: true, texto: esperaDe(5) });
  });

  it('un BLOQUEO_TEMPORAL sin message usa el aviso propio de bloqueo, nunca un texto técnico', async () => {
    const { result } = await entrarCon({
      [`POST ${RUTA_LOGIN}`]: [limite429(5, CODIGO_BLOQUEO_TEMPORAL, '')],
    });

    expect(result.current.errorGeneral).toBe(RESPALDO_TEXTOS['auth.login.bloqueo']);
    expect(result.current.errorGeneral).not.toMatch(/too many|exception/i);
    expect(result.current.textoEntrar).toBe(esperaDe(5));
  });

  it('un 429 técnico sin retryAfter da el texto del catálogo y espera 60 s', async () => {
    const { result } = await entrarCon({
      [`POST ${RUTA_LOGIN}`]: [respuestaCon({ statusCode: 429, message: 'ThrottlerException: Too Many Requests' }, 429)],
    });

    expect(result.current.errorGeneral).toBe(RESPALDO_TEXTOS['errores.demasiadasSolicitudes']);
    expect(botonEntrar(result.current)).toEqual({ enEspera: true, texto: esperaDe(60) });
  });

  it('la espera de un BLOQUEO_TEMPORAL es de esa cuenta: con otro correo "Entrar" se suelta', async () => {
    const { result, llamadas } = await entrarCon({
      [`POST ${RUTA_LOGIN}`]: [limite429(30, CODIGO_BLOQUEO_TEMPORAL, MENSAJE_BLOQUEO), respuestaCon({}, 401)],
    });
    expect(result.current.enEspera).toBe(true);

    // El mismo correo, con mayúsculas o espacios, sigue en espera.
    await tocar(() => result.current.setCorreo(` ${CORREO.toUpperCase()} `));
    expect(botonEntrar(result.current)).toEqual({ enEspera: true, texto: esperaDe(30) });

    await tocar(() => result.current.setCorreo('otra@ejemplo.test'));
    expect(botonEntrar(result.current)).toEqual({ enEspera: false, texto: 'Entrar' });
    await tocar(() => result.current.entrar());
    await waitFor(() => expect(vecesA(llamadas, 'POST', RUTA_LOGIN)).toBe(2));
  });

  it('la espera de un 429 sin code (límite por IP) sigue aunque cambie el correo', async () => {
    const { result } = await entrarCon({ [`POST ${RUTA_LOGIN}`]: [limite429(30)] });

    await tocar(() => result.current.setCorreo('otra@ejemplo.test'));
    expect(botonEntrar(result.current)).toEqual({ enEspera: true, texto: esperaDe(30) });
  });

  it('mientras entra, el botón dice "Entrando…"', async () => {
    servidorEnOrden({ [`POST ${RUTA_LOGIN}`]: ['pendiente'] });
    const { result } = await renderHook(() => useLoginViewModel());
    await tocar(() => result.current.setCorreo(CORREO));
    await tocar(() => result.current.setClave(CLAVE));
    await tocar(() => result.current.entrar());

    expect(result.current.textoEntrar).toBe('Entrando…');
  });
});

// ── Registro ─────────────────────────────────────────────────────────────────────────────────

describe('Registro con límites', () => {
  const VALIDOS: Partial<CamposRegistro> = {
    nombre: 'Clienta Ficticia',
    correo: CORREO,
    telefono: '5512345678',
    nacimiento: '15/04/1995',
    pregunta: { id: '1', pregunta: '¿Cuál fue el nombre de tu primera mascota?' },
    respuesta: 'Respuesta ficticia',
    clave: CLAVE,
    confirmacion: CLAVE,
    tipoCabello: 'ondulado',
    tieneAlergias: false,
    tratamientosQuimicos: false,
    aceptaTerminos: true,
    aceptaAviso: true,
  };

  it('un 429 del registro muestra el message y "Finalizar registro" espera sin volver a enviar', async () => {
    const llamadas = servidorEnOrden({
      'POST /api/auth/verificar-correo': [respuestaCon({ existe: false })],
      [`POST ${RUTA_REGISTRO}`]: [limite429(2)],
    });
    const { result } = await renderHook(() => useRegistroViewModel());
    for (const [campo, valor] of Object.entries(VALIDOS) as [CampoRegistro, CamposRegistro[CampoRegistro]][]) {
      await tocar(() => result.current.cambiar(campo, valor));
    }

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(result.current.errorGeneral).toBe(MENSAJE_LIMITE));
    expect(result.current.cargando).toBe(false);
    expect(routerSimulado.push).not.toHaveBeenCalled();

    await tocar(() => result.current.crearCuenta());
    expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(1);
    await revisarCuentaRegresiva(
      () => ({ enEspera: result.current.enEspera, texto: result.current.textoFinalizar }),
      2,
      'Finalizar registro',
    );
  });
});

// ── Recuperar contraseña ─────────────────────────────────────────────────────────────────────

describe('Recuperar contraseña con límites', () => {
  it('un 429 muestra el message y "Enviar enlace" espera sin volver a pedir el enlace', async () => {
    const llamadas = servidorEnOrden({ [`POST ${RUTA_RECUPERAR}`]: [limite429(2), respuestaCon({ success: true })] });
    const { result } = await renderHook(() => useRecuperarViewModel());
    await tocar(() => result.current.setCorreo(CORREO));

    await tocar(() => result.current.enviar());
    await waitFor(() => expect(result.current.error).toBe(MENSAJE_LIMITE));
    expect(result.current.mensaje).toBeNull();

    await tocar(() => result.current.enviar());
    expect(vecesA(llamadas, 'POST', RUTA_RECUPERAR)).toBe(1);
    await revisarCuentaRegresiva(
      () => ({ enEspera: result.current.enEspera, texto: result.current.textoEnviar }),
      2,
      'Enviar enlace',
    );

    await tocar(() => result.current.enviar());
    await waitFor(() => expect(result.current.mensaje).toBe(RESPALDO_TEXTOS['auth.recuperar.neutro']));
    expect(vecesA(llamadas, 'POST', RUTA_RECUPERAR)).toBe(2);
  });

  it('mientras envía, el botón dice "Enviando…"', async () => {
    servidorEnOrden({ [`POST ${RUTA_RECUPERAR}`]: ['pendiente'] });
    const { result } = await renderHook(() => useRecuperarViewModel());
    await tocar(() => result.current.setCorreo(CORREO));
    await tocar(() => result.current.enviar());

    expect(result.current.textoEnviar).toBe('Enviando…');
  });
});

// ── Activar: reenviar el código ──────────────────────────────────────────────────────────────

describe('Reenviar el código de activación', () => {
  function montar() {
    return renderHook(() => useActivarViewModel(CORREO, false, '/login'));
  }

  /** Corre la espera propia de 60 s tras un envío correcto. */
  async function agotarEsperaPropia(result: { current: ReturnType<typeof useActivarViewModel> }): Promise<void> {
    for (let vuelta = 0; vuelta < 60 && result.current.espera > 0; vuelta += 1) {
      await avanzar(1000);
    }
    expect(result.current.espera).toBe(0);
  }

  it.each<[string, Response, string]>([
    ['con su mensaje neutro lo muestra tal cual', respuestaCon({ success: true, message: NEUTRO_REENVIO }), NEUTRO_REENVIO],
    ['sin mensaje usa el texto del catálogo', respuestaCon({ success: true }), RESPALDO_TEXTOS['auth.codigo.reenviado']],
  ])('el 200 %s y arranca la espera propia de 60 s', async (_caso, salida, esperado) => {
    servidorEnOrden({ [`POST ${RUTA_REENVIAR}`]: [salida] });
    const { result } = await montar();

    await tocar(() => result.current.reenviar());
    await waitFor(() => expect(result.current.mensaje).toBe(esperado));
    expect(result.current.error).toBeNull();
    expect(result.current.espera).toBe(60);
    expect(result.current.reenvioEnLimite).toBe(false);
  });

  it.each<[string]>([['OK'], ['Created'], ['success'], ['Bad Request'], ['Too Many Requests'], ['NullPointerException: ficticia'], ['   ']])(
    'un 200 con el message "%s" no se muestra: usa el texto del catálogo',
    async (message) => {
      servidorEnOrden({ [`POST ${RUTA_REENVIAR}`]: [respuestaCon({ success: true, message })] });
      const { result } = await montar();

      await tocar(() => result.current.reenviar());
      await waitFor(() => expect(result.current.mensaje).toBe(RESPALDO_TEXTOS['auth.codigo.reenviado']));
    },
  );

  it('un 429 al verificar deja "Verificar código" en espera, aparte de la del reenvío', async () => {
    const llamadas = servidorEnOrden({ [`POST ${RUTA_VERIFICAR}`]: [limite429(2)] });
    const { result } = await montar();
    await tocar(() => result.current.setCodigo('123456'));

    await tocar(() => result.current.verificar());
    await waitFor(() => expect(result.current.error).toBe(MENSAJE_LIMITE));
    expect(result.current.cargando).toBe(false);
    expect(routerSimulado.dismissTo).not.toHaveBeenCalled();
    // Son límites distintos: el reenvío no queda en espera.
    expect(result.current.reenvioEnLimite).toBe(false);
    expect(result.current.textoReenviar).toBe('Reenviar código');
    await tocar(() => result.current.verificar());
    expect(vecesA(llamadas, 'POST', RUTA_VERIFICAR)).toBe(1);

    await revisarCuentaRegresiva(
      () => ({ enEspera: result.current.verificacionEnLimite, texto: result.current.textoVerificar }),
      2,
      'Verificar código',
    );
  });

  it('mientras verifica, el botón dice "Verificando…"', async () => {
    servidorEnOrden({ [`POST ${RUTA_VERIFICAR}`]: ['pendiente'] });
    const { result } = await montar();
    await tocar(() => result.current.setCodigo('123456'));
    await tocar(() => result.current.verificar());

    expect(result.current.textoVerificar).toBe(RESPALDO_TEXTOS['auth.activar.verificando']);
  });

  it.each<[string, Response]>([
    ['un 404', respuestaCon({ statusCode: 404, message: 'Usuario no encontrado' }, 404)],
    ['un 400', respuestaCon({ statusCode: 400, message: 'Este correo electrónico ya está activado.' }, 400)],
  ])('%s ya no dice si la cuenta existe ni si está activada', async (_caso, salida) => {
    servidorEnOrden({ [`POST ${RUTA_REENVIAR}`]: [salida] });
    const { result } = await montar();

    await tocar(() => result.current.reenviar());
    await waitFor(() => expect(result.current.error).toBe(NO_SE_REENVIO));
    expect(result.current.error).not.toMatch(/ya está activad/i);
    expect(result.current.error).not.toMatch(/activad|encontrad|existe|registrad/i);
    expect(result.current.mensaje).toBeNull();
    expect(result.current.reenvioEnLimite).toBe(false);
  });

  it('un 429 muestra el message y "Reenviar código" espera los segundos del servidor', async () => {
    const llamadas = servidorEnOrden({ [`POST ${RUTA_REENVIAR}`]: [limite429(3), respuestaCon({ success: true })] });
    const { result } = await montar();

    await tocar(() => result.current.reenviar());
    await waitFor(() => expect(result.current.error).toBe(MENSAJE_LIMITE));
    // La espera propia de 60 s es solo para el envío correcto.
    expect(result.current.espera).toBe(0);
    await tocar(() => result.current.reenviar());
    expect(vecesA(llamadas, 'POST', RUTA_REENVIAR)).toBe(1);

    await revisarCuentaRegresiva(
      () => ({ enEspera: result.current.reenvioEnLimite, texto: result.current.textoReenviar }),
      3,
      'Reenviar código',
    );
    await tocar(() => result.current.reenviar());
    await waitFor(() => expect(vecesA(llamadas, 'POST', RUTA_REENVIAR)).toBe(2));
  });

  it('cuatro reenvíos seguidos: el cuarto responde 429 y da la espera con sus segundos', async () => {
    const llamadas = servidorEnOrden({
      [`POST ${RUTA_REENVIAR}`]: [
        respuestaCon({ success: true, message: NEUTRO_REENVIO }),
        respuestaCon({ success: true, message: NEUTRO_REENVIO }),
        respuestaCon({ success: true, message: NEUTRO_REENVIO }),
        limite429(40),
      ],
    });
    const { result } = await montar();

    for (let vez = 1; vez <= 3; vez += 1) {
      await tocar(() => result.current.reenviar());
      await waitFor(() => expect(vecesA(llamadas, 'POST', RUTA_REENVIAR)).toBe(vez));
      await waitFor(() => expect(result.current.mensaje).toBe(NEUTRO_REENVIO));
      await agotarEsperaPropia(result);
    }
    await tocar(() => result.current.reenviar());

    await waitFor(() => expect(result.current.error).toBe(MENSAJE_LIMITE));
    expect(vecesA(llamadas, 'POST', RUTA_REENVIAR)).toBe(4);
    expect(result.current.mensaje).toBeNull();
    expect(result.current.reenvioEnLimite).toBe(true);
    expect(result.current.textoReenviar).toBe(esperaDe(40));
    await avanzar(1000);
    expect(result.current.textoReenviar).toBe(esperaDe(39));
  });

  it('mientras reenvía, el enlace dice "Enviando código…"', async () => {
    servidorEnOrden({ [`POST ${RUTA_REENVIAR}`]: ['pendiente'] });
    const { result } = await montar();
    await tocar(() => result.current.reenviar());

    expect(result.current.textoReenviar).toBe(RESPALDO_TEXTOS['auth.activar.reenviando']);
  });
});

// ── Cambiar contraseña: pedir y reenviar el código ───────────────────────────────────────────

describe('Cambiar contraseña con límites', () => {
  async function montar(codigo: Respondedor[], cambio: Respondedor[] = []) {
    authSimulada.estado = 'autenticado';
    authSimulada.usuario = { id: CLIENTA.id, nombre: CLIENTA.nombre, email: CLIENTA.email, rol: 'cliente' };
    const llamadas = servidorEnOrden({
      'GET /api/auth/me': [respuestaCon({ data: PERFIL_COMPLETO })],
      [`POST ${RUTA_CODIGO}`]: codigo,
      [`POST ${RUTA_CAMBIO}`]: cambio,
    });
    const vista = await renderHook(() => useCambiarContrasenaViewModel());
    await waitFor(() => expect(vista.result.current.estado).toBe('listo'));
    const valores: Record<CampoDato, string> = { actual: CLAVE, nueva: CLAVE_NUEVA, confirmacion: CLAVE_NUEVA };
    for (const [campo, valor] of Object.entries(valores) as [CampoDato, string][]) {
      await tocar(() => vista.result.current.cambiar(campo, valor));
    }
    return { ...vista, llamadas };
  }

  it('un 429 al pedir el código muestra el message y "Enviar código" espera sin volver a pedirlo', async () => {
    const { result, llamadas } = await montar([limite429(2)]);

    await tocar(() => result.current.enviarCodigo());
    await waitFor(() => expect(result.current.aviso).toBe(MENSAJE_LIMITE));
    expect(result.current.paso).toBe(1);
    await tocar(() => result.current.enviarCodigo());
    expect(vecesA(llamadas, 'POST', RUTA_CODIGO)).toBe(1);

    await revisarCuentaRegresiva(
      () => ({ enEspera: result.current.enEspera, texto: result.current.tituloEnvio }),
      2,
      'Enviar código',
    );
  });

  it('un 429 al reenviar muestra el message y "Reenviar código" espera los segundos del servidor', async () => {
    const { result, llamadas } = await montar([
      respuestaCon({ success: true, vigenciaMinutos: 10 }),
      limite429(3, 'DEMASIADOS_CODIGOS'),
    ]);
    await tocar(() => result.current.enviarCodigo());
    await waitFor(() => expect(result.current.paso).toBe(2));
    expect(result.current.tituloReenviar).toBe('Reenviar código');
    for (let vuelta = 0; vuelta < 60 && result.current.espera > 0; vuelta += 1) {
      await avanzar(1000);
    }

    await tocar(() => result.current.reenviar());
    await waitFor(() => expect(result.current.aviso).toBe(MENSAJE_LIMITE));
    expect(result.current.avisoExito).toBeNull();
    await tocar(() => result.current.reenviar());
    expect(vecesA(llamadas, 'POST', RUTA_CODIGO)).toBe(2);

    await revisarCuentaRegresiva(
      () => ({ enEspera: result.current.enEspera, texto: result.current.tituloReenviar }),
      3,
      'Reenviar código',
    );
  });

  it('un 429 al cambiar con el código deja "Cambiar contraseña" en espera sin volver a llamar', async () => {
    const { result, llamadas } = await montar([respuestaCon({ success: true, vigenciaMinutos: 10 })], [limite429(2)]);
    await tocar(() => result.current.enviarCodigo());
    await waitFor(() => expect(result.current.paso).toBe(2));
    await tocar(() => result.current.setCodigo('123456'));
    expect(result.current.tituloCambiar).toBe('Cambiar contraseña');

    await tocar(() => result.current.cambiarContrasena());
    await waitFor(() => expect(result.current.aviso).toBe(MENSAJE_LIMITE));
    expect(result.current.cambiando).toBe(false);
    expect(authSimulada.cerrarTrasCambioDeContrasena).not.toHaveBeenCalled();
    // El pedido del código tiene su propia espera: no se mezcla.
    expect(result.current.enEspera).toBe(false);
    await tocar(() => result.current.cambiarContrasena());
    expect(vecesA(llamadas, 'POST', RUTA_CAMBIO)).toBe(1);

    await revisarCuentaRegresiva(
      () => ({ enEspera: result.current.cambioEnEspera, texto: result.current.tituloCambiar }),
      2,
      'Cambiar contraseña',
    );
  });

  it('mientras cambia, el botón dice "Cambiando…"', async () => {
    const { result } = await montar([respuestaCon({ success: true, vigenciaMinutos: 10 })], ['pendiente']);
    await tocar(() => result.current.enviarCodigo());
    await waitFor(() => expect(result.current.paso).toBe(2));
    await tocar(() => result.current.setCodigo('123456'));
    await tocar(() => result.current.cambiarContrasena());

    expect(result.current.tituloCambiar).toBe('Cambiando…');
  });

  it('el botón del paso 1 dice "Enviando código…" mientras pide el código', async () => {
    const { result } = await montar(['pendiente']);
    await tocar(() => result.current.enviarCodigo());

    expect(result.current.tituloEnvio).toBe('Enviando código…');
  });
});
