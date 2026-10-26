/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';

import {
  alergiasPendientesDelRegistro,
  esConsentimientoSaludRequerido,
} from '@/features/auth/models/AuthModel';
import {
  useRegistroViewModel,
  type CampoRegistro,
  type CamposRegistro,
  type RegistroViewModel,
} from '@/features/auth/viewmodels/useRegistroViewModel';
import { ApiError } from '@/shared/api/apiClient';
import { obtenerDocumentoVigente, reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import {
  documentoCrudo,
  documentoGuardado,
  HASH_GUARDADO,
  HASH_VIGENTE,
  rutaVigente,
  sembrarDocumentosGuardados,
} from '../../helpers/documentosFicticios';
import { HASH_SENSIBLES, PARRAFO_1, RUTA_SENSIBLES, RUTA_TEXTO_SENSIBLES, TEXTO_SENSIBLES } from '../../helpers/datosSensibles';
import { respuestaCon, servidorEnOrden, vecesA, type Respondedor } from '../../helpers/limitesRed';
import { cerrarPruebaSesion } from '../../helpers/sesionLimites';
import type { Llamada } from '../../helpers/servidorSimulado';
import { reiniciarSimulaciones, routerSimulado } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque B1: registro con la autorización expresa de datos sensibles (Ronda 5). El campo de
 * alergias solo existe después de autorizar en la hoja (casilla sin marcar, texto del backend); sin
 * autorizar no se manda nada de alergias ni consienteDatosSensibles. Con la autorización van la
 * versión y el hash del texto leído. Si el backend no guardó las alergias
 * (alergiasPendientesDeAutorizacion), se explica antes de la activación; el 400
 * CONSENTIMIENTO_SALUD_REQUERIDO vuelve a pedir la autorización. Viewmodel con renderHook, fetch
 * simulado en http://api.test, datos ficticios y temporizadores falsos.
 */

jest.mock('expo-router', () => ({
  ...require('../../helpers/viewmodelsAuth').expoRouterSimulado(),
  usePathname: () => '/registro',
}));
jest.mock('expo-web-browser', () => ({ openBrowserAsync: jest.fn(() => Promise.resolve({ type: 'opened' })) }));
// Disco en memoria: el aviso que el repositorio de documentos guarda se limpia en cada prueba.
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

const CORREO = 'clienta.sensibles@ejemplo.test';
const CLAVE = 'ClaveFicticia1!';
const RUTA_REGISTRO = '/api/usuarios/registro';
const AUTORIZACION = { version: '1.0', hash: HASH_SENSIBLES };
const ALERGIAS = 'Alergia ficticia al amoniaco';
const PREGUNTA = { id: '1', pregunta: '¿Cuál fue el nombre de tu primera mascota?' };

const VALIDOS: Partial<CamposRegistro> = {
  nombre: 'Clienta Sensibles',
  correo: CORREO,
  telefono: '5512345678',
  nacimiento: '15/04/1995',
  pregunta: PREGUNTA,
  respuesta: 'Respuesta ficticia',
  clave: CLAVE,
  confirmacion: CLAVE,
  tipoCabello: 'rizado',
  tratamientosQuimicos: false,
  aceptaTerminos: true,
  aceptaAviso: true,
};

/** Lo que el cuerpo lleva siempre (sin el perfil capilar), con los datos de VALIDOS. */
const CUERPO_BASE = {
  nombre: 'Clienta Sensibles',
  email: CORREO,
  telefono: '5512345678',
  password: CLAVE,
  fechaNacimiento: '1995-04-15',
  preguntaSeguridad: { pregunta: PREGUNTA.pregunta, respuesta: 'Respuesta ficticia' },
  aceptaTerminos: true,
  aceptaAvisoPrivacidad: true,
  recibePromociones: false,
  rutaOrigen: '/registro',
};

const HASH_NUEVO = 'c'.repeat(64);
const TERMINOS_VISTOS = { slug: 'terminos', version: '2.3', hash: HASH_VIGENTE };
const AVISO_VISTO = { slug: 'aviso-privacidad', version: '2.3', hash: HASH_VIGENTE };
const TERMINOS_NUEVOS = documentoCrudo('terminos', { version: '2.4', hash: HASH_NUEVO });
const AVISO_NUEVO = documentoCrudo('aviso-privacidad', { version: '2.4', hash: HASH_NUEVO });

const creada = () => respuestaCon({ success: true, message: 'Ingresa el código.', requiereVerificacion: true, usuario: { id: 'u-1' } }, 201);

type Resultado = { current: RegistroViewModel };

beforeEach(() => {
  jest.useFakeTimers();
  reiniciarSimulaciones();
  reiniciarDocumentosLegales();
  // Sin documentos guardados de otra prueba: el respaldo del archivo se prueba aparte.
  limpiarArchivos();
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

async function llenar(result: Resultado, campos: Partial<CamposRegistro>): Promise<void> {
  for (const [campo, valor] of Object.entries(campos) as [CampoRegistro, CamposRegistro[CampoRegistro]][]) {
    await tocar(() => result.current.cambiar(campo, valor));
  }
}

async function montar(
  registro: Respondedor[],
  avisos: Respondedor[] = [],
  terminos: Respondedor[] = [],
): Promise<{ result: Resultado; llamadas: Llamada[] }> {
  const llamadas = servidorEnOrden({
    [`GET ${rutaVigente('terminos')}`]: terminos,
    [`GET ${rutaVigente('aviso-privacidad')}`]: avisos,
    'POST /api/auth/verificar-correo': [respuestaCon({ existe: false })],
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: [
      respuestaCon({ success: true, data: { version: '1.0', hash: HASH_SENSIBLES, texto: TEXTO_SENSIBLES } }),
    ],
    [`POST ${RUTA_REGISTRO}`]: registro,
  });
  const { result } = await renderHook(() => useRegistroViewModel());
  await llenar(result, VALIDOS);
  return { result, llamadas };
}

/** Abre la hoja, espera el texto del backend, marca la casilla y toca "Autorizo". */
async function autorizarEnHoja(result: Resultado): Promise<void> {
  await tocar(() => result.current.autorizacion.abrir());
  await waitFor(() => expect(result.current.autorizacion.parrafos).toContain(PARRAFO_1));
  // La casilla siempre empieza sin marcar y "Autorizo" espera a que se marque.
  expect(result.current.autorizacion.marcada).toBe(false);
  expect(result.current.autorizacion.autorizoDeshabilitado).toBe(true);
  await tocar(() => result.current.autorizacion.alternar(true));
  await tocar(() => result.current.autorizacion.autorizar());
}

/** Espera a que los Términos y el Aviso vigentes se hayan pedido `veces` veces cada uno. */
async function esperarLecturas(llamadas: Llamada[], veces: number): Promise<void> {
  await waitFor(() => expect(vecesA(llamadas, 'GET', rutaVigente('terminos'))).toBe(veces));
  await waitFor(() => expect(vecesA(llamadas, 'GET', rutaVigente('aviso-privacidad'))).toBe(veces));
}

function cuerpoRegistro(llamadas: Llamada[]): unknown {
  return llamadas.filter((l) => l.metodo === 'POST' && l.ruta === RUTA_REGISTRO)[0]?.cuerpo;
}

describe('Registro: alergias solo con la autorización de datos sensibles', () => {
  it('sin autorizar, con "Sí", no se manda nada de alergias ni consienteDatosSensibles', async () => {
    const { result, llamadas } = await montar([creada()]);
    await llenar(result, { tieneAlergias: true });

    // Sin autorizar no se pide el detalle (el campo ni se muestra) y escribirlo tampoco lo envía.
    await tocar(() => result.current.cambiar('alergias', ALERGIAS));
    await tocar(() => result.current.salir('alergias'));
    expect(result.current.errores.alergias).toBeNull();
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));

    expect(cuerpoRegistro(llamadas)).toEqual({
      ...CUERPO_BASE,
      perfilCapilar: { tipoCabello: 'rizado', tratamientosQuimicos: false },
    });
    // La hoja del registro nunca llama al backend para autorizar.
    expect(vecesA(llamadas, 'POST', RUTA_SENSIBLES)).toBe(0);
  });

  it('con "No" manda tieneAlergias en false, sin alergias ni autorización', async () => {
    const { result, llamadas } = await montar([creada()]);
    await llenar(result, { tieneAlergias: false });

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));
    expect(cuerpoRegistro(llamadas)).toEqual({
      ...CUERPO_BASE,
      perfilCapilar: { tipoCabello: 'rizado', tieneAlergias: false, tratamientosQuimicos: false },
    });
  });

  it('al autorizar en la hoja aparece el campo, se pide el detalle y viajan la versión y el hash', async () => {
    const { result, llamadas } = await montar([creada()]);
    await llenar(result, { tieneAlergias: true });

    await autorizarEnHoja(result);
    expect(result.current.autorizacion.visible).toBe(false);
    expect(result.current.campos.autorizacionDatosSensibles).toEqual(AUTORIZACION);
    // El foco va al campo de alergias que acaba de aparecer.
    expect(result.current.enfoque?.campo).toBe('alergias');
    expect(vecesA(llamadas, 'POST', RUTA_SENSIBLES)).toBe(0);

    // Autorizado, el detalle es obligatorio.
    await tocar(() => result.current.crearCuenta());
    expect(result.current.errores.alergias).toBe('Especifica tus alergias');
    expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(0);

    await llenar(result, { alergias: `  ${ALERGIAS} ` });
    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));

    expect(cuerpoRegistro(llamadas)).toEqual({
      ...CUERPO_BASE,
      perfilCapilar: { tipoCabello: 'rizado', tieneAlergias: true, alergias: ALERGIAS, tratamientosQuimicos: false },
      consienteDatosSensibles: true,
      autorizacionDatosSensibles: AUTORIZACION,
    });
    expect(routerSimulado.push).toHaveBeenCalledWith({
      pathname: '/activar',
      params: { email: CORREO, enviado: '1', volverA: '/registro' },
    });
    // Los datos de salud y la autorización no se quedan en memoria.
    expect(result.current.campos.alergias).toBe('');
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
  });

  it('"Ahora no" en la hoja no autoriza y al volver a abrirla la casilla empieza sin marcar', async () => {
    const { result } = await montar([creada()]);
    await llenar(result, { tieneAlergias: true });

    await tocar(() => result.current.autorizacion.abrir());
    await waitFor(() => expect(result.current.autorizacion.parrafos.length).toBeGreaterThan(0));
    await tocar(() => result.current.autorizacion.alternar(true));
    await tocar(() => result.current.autorizacion.cerrar());
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();

    await tocar(() => result.current.autorizacion.abrir());
    await waitFor(() => expect(result.current.autorizacion.parrafos.length).toBeGreaterThan(0));
    expect(result.current.autorizacion.marcada).toBe(false);
  });

  it('responder "No" después de autorizar quita la autorización y el detalle', async () => {
    const { result } = await montar([creada()]);
    await llenar(result, { tieneAlergias: true });
    await autorizarEnHoja(result);
    await llenar(result, { alergias: ALERGIAS });

    await llenar(result, { tieneAlergias: false });
    expect(result.current.campos.alergias).toBe('');
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
  });

  it('con alergiasPendientesDeAutorizacion lo explica antes de pasar a la activación', async () => {
    const { result } = await montar([
      respuestaCon({ success: true, usuario: { id: 'u-2', alergiasPendientesDeAutorizacion: true } }, 201),
    ]);
    await llenar(result, { tieneAlergias: true });
    await autorizarEnHoja(result);
    await llenar(result, { alergias: ALERGIAS });

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(result.current.alergiasNoGuardadas).toBe(true));
    expect(routerSimulado.push).not.toHaveBeenCalled();
    expect(result.current.textosAlergias.noGuardadasTitulo).toBe(RESPALDO_TEXTOS['auth.registro.alergiasNoGuardadasTitulo']);
    expect(result.current.textosAlergias.noGuardadasTexto).toBe(RESPALDO_TEXTOS['auth.registro.alergiasNoGuardadas']);
    expect(result.current.campos.alergias).toBe('');

    await tocar(() => result.current.continuarAActivar());
    expect(result.current.alergiasNoGuardadas).toBe(false);
    expect(routerSimulado.push).toHaveBeenCalledWith({
      pathname: '/activar',
      params: { email: CORREO, enviado: '1', volverA: '/registro' },
    });
    // Una segunda vez no navega de nuevo.
    await tocar(() => result.current.continuarAActivar());
    expect(routerSimulado.push).toHaveBeenCalledTimes(1);
  });

  it('reiniciar olvida la explicación pendiente y cierra la hoja', async () => {
    const { result } = await montar([
      respuestaCon({ success: true, usuario: { id: 'u-3', alergiasPendientesDeAutorizacion: true } }, 201),
    ]);
    await llenar(result, { tieneAlergias: true });
    await autorizarEnHoja(result);
    await llenar(result, { alergias: ALERGIAS });
    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(result.current.alergiasNoGuardadas).toBe(true));

    await tocar(() => result.current.reiniciar());
    expect(result.current.alergiasNoGuardadas).toBe(false);
    expect(result.current.autorizacion.visible).toBe(false);
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
  });

  it('el 400 CONSENTIMIENTO_SALUD_REQUERIDO explica el motivo y vuelve a pedir la autorización', async () => {
    const { result, llamadas } = await montar([
      respuestaCon(
        {
          success: false,
          statusCode: 400,
          code: 'CONSENTIMIENTO_SALUD_REQUERIDO',
          message: 'Para guardar tus alergias marca la casilla de datos de salud.',
          errors: { consienteDatosSensibles: ['requerido'] },
        },
        400,
      ),
    ]);
    await llenar(result, { tieneAlergias: true });
    await autorizarEnHoja(result);
    await llenar(result, { alergias: ALERGIAS });

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(result.current.errorGeneral).toBe(RESPALDO_TEXTOS['errores.consentimientoSalud']));
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
    expect(result.current.enfoque?.campo).toBe('tieneAlergias');
    expect(routerSimulado.push).not.toHaveBeenCalled();
    expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(1);
  });

  it('el 400 TEXTO_DATOS_SENSIBLES_NO_VIGENTE quita la autorización, vuelve a pedir el texto y no borra lo escrito', async () => {
    const { result, llamadas } = await montar([
      respuestaCon(
        { success: false, statusCode: 400, code: 'TEXTO_DATOS_SENSIBLES_NO_VIGENTE', message: 'Mensaje técnico ficticio' },
        400,
      ),
    ]);
    await llenar(result, { tieneAlergias: true });
    await autorizarEnHoja(result);
    await llenar(result, { alergias: ALERGIAS });
    const lecturasTexto = vecesA(llamadas, 'GET', RUTA_TEXTO_SENSIBLES);

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(result.current.errorGeneral).toBe(RESPALDO_TEXTOS['datosSensibles.app.textoCambio']));
    expect(result.current.campos.autorizacionDatosSensibles).toBeNull();
    // La hoja se abre otra vez con el texto vigente y la casilla sin marcar.
    expect(result.current.autorizacion.visible).toBe(true);
    await waitFor(() => expect(vecesA(llamadas, 'GET', RUTA_TEXTO_SENSIBLES)).toBe(lecturasTexto + 1));
    expect(result.current.autorizacion.marcada).toBe(false);
    // Lo que la clienta escribió se queda.
    expect(result.current.campos).toMatchObject({ ...VALIDOS, tieneAlergias: true, alergias: ALERGIAS });
    expect(result.current.enfoque?.campo).toBe('tieneAlergias');
    expect(routerSimulado.push).not.toHaveBeenCalled();
    expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(1);
  });

  it.each(['DOCUMENTO_NO_VIGENTE', 'DOCUMENTO_NO_COINCIDE'])(
    'el 400 %s pide el aviso vigente a la red, desmarca solo su casilla con su aviso al lado y no borra lo escrito',
    async (code) => {
      const { result, llamadas } = await montar(
        [respuestaCon({ success: false, statusCode: 400, code, message: 'Mensaje técnico ficticio' }, 400)],
        [respuestaCon({ success: true, data: documentoCrudo('aviso-privacidad') }), respuestaCon({ success: true, data: AVISO_NUEVO })],
        [respuestaCon({ success: true, data: documentoCrudo('terminos') })],
      );
      await llenar(result, { tieneAlergias: false, recibePromociones: true });
      await esperarLecturas(llamadas, 1);

      await tocar(() => result.current.crearCuenta());
      await waitFor(() => expect(result.current.errores.aceptaAviso).toBe(RESPALDO_TEXTOS['legal.documentoActualizado']));
      // Se mandaron las versiones que tenía a la vista.
      expect(cuerpoRegistro(llamadas)).toMatchObject({ documentos: [TERMINOS_VISTOS, AVISO_VISTO] });
      expect(result.current.campos.aceptaAviso).toBe(false);
      expect(result.current.errorGeneral).toBe(RESPALDO_TEXTOS['legal.documentoActualizado']);
      expect(result.current.enfoque?.campo).toBe('aceptaAviso');
      // Solo esa casilla: los Términos, las promociones y lo demás se quedan como la clienta los dejó.
      expect(result.current.campos).toMatchObject({ ...VALIDOS, tieneAlergias: false, aceptaAviso: false, recibePromociones: true });
      expect(result.current.errores.aceptaTerminos).toBeFalsy();
      // Los dos vigentes se pidieron otra vez a la red.
      await esperarLecturas(llamadas, 2);
      expect(routerSimulado.push).not.toHaveBeenCalled();
      expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(1);

      // Al volver a marcarla se revalida, el aviso se va y el siguiente intento manda la versión nueva.
      await tocar(() => result.current.cambiar('aceptaAviso', true));
      expect(result.current.errores.aceptaAviso).toBeNull();
      await tocar(() => result.current.crearCuenta());
      await waitFor(() => expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(2));
      expect(llamadas.filter((l) => l.metodo === 'POST' && l.ruta === RUTA_REGISTRO)[1].cuerpo).toMatchObject({
        documentos: [TERMINOS_VISTOS, { slug: 'aviso-privacidad', version: '2.4', hash: HASH_NUEVO }],
      });
    },
  );

  it('manda el Aviso de Privacidad con la versión y el hash vistos y la ruta de origen', async () => {
    const { result, llamadas } = await montar([creada()], [respuestaCon({ success: true, data: documentoCrudo('aviso-privacidad') })]);
    await llenar(result, { tieneAlergias: false });
    await waitFor(() => expect(vecesA(llamadas, 'GET', rutaVigente('aviso-privacidad'))).toBe(1));

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));
    expect(cuerpoRegistro(llamadas)).toEqual({
      ...CUERPO_BASE,
      perfilCapilar: { tipoCabello: 'rizado', tieneAlergias: false, tratamientosQuimicos: false },
      documentos: [{ slug: 'aviso-privacidad', version: '2.3', hash: HASH_VIGENTE }],
    });
    // La versión vista ya estaba: no se volvió a pedir al enviar.
    expect(vecesA(llamadas, 'GET', rutaVigente('aviso-privacidad'))).toBe(1);
  });

  it('si con la casilla marcada llega otra versión del aviso, la desmarca con el aviso de documento actualizado', async () => {
    const { result, llamadas } = await montar(
      [creada()],
      [
        respuestaCon({ success: true, data: documentoCrudo('aviso-privacidad') }),
        respuestaCon({ success: true, data: documentoCrudo('aviso-privacidad', { version: '2.4', hash: 'c'.repeat(64) }) }),
      ],
    );
    await waitFor(() => expect(vecesA(llamadas, 'GET', rutaVigente('aviso-privacidad'))).toBe(1));
    expect(result.current.campos.aceptaAviso).toBe(true);

    // Otra pantalla vuelve a pedir el aviso a la red y llega la 2.4.
    await act(async () => {
      await obtenerDocumentoVigente('aviso-privacidad', { forzarRed: true });
    });
    await waitFor(() => expect(result.current.campos.aceptaAviso).toBe(false));
    expect(result.current.errores.aceptaAviso).toBe(RESPALDO_TEXTOS['legal.documentoActualizado']);
    expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(0);
  });

  it.each([
    ['404', []],
    ['sin red', ['sinRed', 'sinRed']],
  ] as [string, Respondedor[]][])('sin el aviso a la mano (%s) se registra igual, sin documentos: el backend toma la vigente', async (_caso, avisos) => {
    const { result, llamadas } = await montar([creada()], avisos);
    await llenar(result, { tieneAlergias: false });

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));
    expect(cuerpoRegistro(llamadas)).not.toHaveProperty('documentos');
    expect(cuerpoRegistro(llamadas)).toMatchObject({ rutaOrigen: '/registro' });
    // Al marcar y otra vez al enviar, porque no había versión vista.
    expect(vecesA(llamadas, 'GET', rutaVigente('aviso-privacidad'))).toBe(2);
  });

  it('sin red, con el aviso guardado en el teléfono, viaja la versión guardada (el backend dirá si sigue vigente)', async () => {
    sembrarDocumentosGuardados({ 'aviso-privacidad': documentoGuardado('aviso-privacidad') });
    const { result, llamadas } = await montar([creada()], ['sinRed', 'sinRed']);
    await llenar(result, { tieneAlergias: false });

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));
    expect(cuerpoRegistro(llamadas)).toMatchObject({ documentos: [{ slug: 'aviso-privacidad', version: '2.2', hash: HASH_GUARDADO }] });
  });
});

describe('Registro: casilla de los Términos y Condiciones', () => {
  it('empieza sin marcar y, sin marcarla, "Finalizar registro" no envía nada', async () => {
    const { result, llamadas } = await montar([creada()]);
    await tocar(() => result.current.reiniciar());
    expect(result.current.campos.aceptaTerminos).toBe(false);

    await llenar(result, { ...VALIDOS, tieneAlergias: false, aceptaTerminos: false });
    await tocar(() => result.current.crearCuenta());
    expect(result.current.errores.aceptaTerminos).toBe(RESPALDO_TEXTOS['auth.registro.faltaTerminos']);
    expect(result.current.errores.aceptaAviso).toBeNull();
    expect(result.current.errorGeneral).toBe(RESPALDO_TEXTOS['auth.revisaCampos']);
    expect(result.current.enfoque?.campo).toBe('aceptaTerminos');
    expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(0);

    // Al marcarla se revalida y el error se va.
    await tocar(() => result.current.cambiar('aceptaTerminos', true));
    expect(result.current.errores.aceptaTerminos).toBeNull();
  });

  it('con las dos casillas marcadas manda aceptaTerminos y los dos documentos vistos, Términos primero', async () => {
    const { result, llamadas } = await montar(
      [creada()],
      [respuestaCon({ success: true, data: documentoCrudo('aviso-privacidad') })],
      [respuestaCon({ success: true, data: documentoCrudo('terminos') })],
    );
    await llenar(result, { tieneAlergias: false });
    await esperarLecturas(llamadas, 1);

    await tocar(() => result.current.crearCuenta());
    await waitFor(() => expect(routerSimulado.push).toHaveBeenCalledTimes(1));
    expect(cuerpoRegistro(llamadas)).toEqual({
      ...CUERPO_BASE,
      perfilCapilar: { tipoCabello: 'rizado', tieneAlergias: false, tratamientosQuimicos: false },
      documentos: [TERMINOS_VISTOS, AVISO_VISTO],
    });
    // Las versiones vistas ya estaban: no se volvieron a pedir al enviar.
    await esperarLecturas(llamadas, 1);
  });

  it.each(['DOCUMENTO_NO_VIGENTE', 'DOCUMENTO_NO_COINCIDE'])(
    'el 400 %s de los Términos desmarca solo su casilla, deja marcado el Aviso y no borra lo escrito',
    async (code) => {
      const { result, llamadas } = await montar(
        [respuestaCon({ success: false, statusCode: 400, code, message: 'Mensaje técnico ficticio' }, 400)],
        [respuestaCon({ success: true, data: documentoCrudo('aviso-privacidad') })],
        [respuestaCon({ success: true, data: documentoCrudo('terminos') }), respuestaCon({ success: true, data: TERMINOS_NUEVOS })],
      );
      await llenar(result, { tieneAlergias: false, colorNatural: 'Castaño ficticio' });
      await esperarLecturas(llamadas, 1);

      await tocar(() => result.current.crearCuenta());
      await waitFor(() => expect(result.current.errores.aceptaTerminos).toBe(RESPALDO_TEXTOS['legal.documentoActualizado']));
      expect(result.current.campos.aceptaTerminos).toBe(false);
      expect(result.current.campos.aceptaAviso).toBe(true);
      expect(result.current.errores.aceptaAviso).toBeFalsy();
      expect(result.current.enfoque?.campo).toBe('aceptaTerminos');
      expect(result.current.errorGeneral).toBe(RESPALDO_TEXTOS['legal.documentoActualizado']);
      expect(result.current.campos).toMatchObject({
        ...VALIDOS,
        tieneAlergias: false,
        colorNatural: 'Castaño ficticio',
        aceptaTerminos: false,
      });
      await esperarLecturas(llamadas, 2);
      expect(routerSimulado.push).not.toHaveBeenCalled();
      expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(1);

      // Al volver a marcarla, el siguiente intento manda la versión nueva de los Términos.
      await tocar(() => result.current.cambiar('aceptaTerminos', true));
      expect(result.current.errores.aceptaTerminos).toBeNull();
      await tocar(() => result.current.crearCuenta());
      await waitFor(() => expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(2));
      expect(llamadas.filter((l) => l.metodo === 'POST' && l.ruta === RUTA_REGISTRO)[1].cuerpo).toMatchObject({
        aceptaTerminos: true,
        documentos: [{ slug: 'terminos', version: '2.4', hash: HASH_NUEVO }, AVISO_VISTO],
      });
    },
  );

  it.each([
    ['su message para la clienta', 'Por ahora no podemos crear cuentas nuevas. Intenta más tarde.', 'Por ahora no podemos crear cuentas nuevas. Intenta más tarde.'],
    ['el respaldo si el message es técnico', 'ServiceUnavailableException', RESPALDO_TEXTOS['auth.registro.sinDocumentosPublicados']],
  ])(
    'sin Términos publicados (503 DOCUMENTO_NO_PUBLICADO) muestra %s con la referencia, no crea nada ni desmarca casillas',
    async (_caso, message, esperado) => {
      const { result, llamadas } = await montar(
        [respuestaCon({ success: false, statusCode: 503, code: 'DOCUMENTO_NO_PUBLICADO', message, referencia: 'A1B2C3D4' }, 503)],
        [respuestaCon({ success: true, data: documentoCrudo('aviso-privacidad') })],
      );
      await llenar(result, { tieneAlergias: false });

      await tocar(() => result.current.crearCuenta());
      await waitFor(() => expect(result.current.errorGeneral).not.toBeNull());
      const referencia = RESPALDO_TEXTOS['errores.referencia'].replace('{referencia}', 'A1B2C3D4');
      expect(result.current.errorGeneral).toBe(`${esperado} ${referencia}`);
      // Sin Términos a la mano solo viaja el Aviso; las casillas y lo escrito se quedan y nada se reintenta solo.
      expect(cuerpoRegistro(llamadas)).toMatchObject({ aceptaTerminos: true, documentos: [AVISO_VISTO] });
      expect(result.current.campos).toMatchObject({ ...VALIDOS, tieneAlergias: false, aceptaTerminos: true, aceptaAviso: true });
      expect(result.current.errores.aceptaTerminos).toBeFalsy();
      expect(result.current.enEspera).toBe(false);
      expect(routerSimulado.push).not.toHaveBeenCalled();
      await act(async () => {
        jest.advanceTimersByTime(60_000);
      });
      expect(vecesA(llamadas, 'POST', RUTA_REGISTRO)).toBe(1);
    },
  );
});

describe('modelo: respuestas del registro con datos sensibles', () => {
  it('alergiasPendientesDelRegistro solo con el true del backend', () => {
    expect(alergiasPendientesDelRegistro({ usuario: { alergiasPendientesDeAutorizacion: true } })).toBe(true);
    expect(alergiasPendientesDelRegistro({ usuario: {} })).toBe(false);
    expect(alergiasPendientesDelRegistro({ success: true })).toBe(false);
    expect(alergiasPendientesDelRegistro(null)).toBe(false);
    expect(alergiasPendientesDelRegistro(undefined)).toBe(false);
  });

  it('esConsentimientoSaludRequerido se reconoce por status y code, nunca por el texto', () => {
    expect(esConsentimientoSaludRequerido(new ApiError(400, 'x', 'CONSENTIMIENTO_SALUD_REQUERIDO'))).toBe(true);
    expect(esConsentimientoSaludRequerido(new ApiError(400, 'Para guardar tus alergias marca la casilla.'))).toBe(false);
    expect(esConsentimientoSaludRequerido(new ApiError(409, 'x', 'CONSENTIMIENTO_SALUD_REQUERIDO'))).toBe(false);
    expect(esConsentimientoSaludRequerido(new Error('CONSENTIMIENTO_SALUD_REQUERIDO'))).toBe(false);
  });
});
