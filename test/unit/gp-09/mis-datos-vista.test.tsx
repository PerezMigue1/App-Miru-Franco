/// <reference types="jest" />

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { invalidarPerfil } from '@/features/auth/models/perfilCompartido';
import MisDatosView from '@/features/auth/views/MisDatosView';
import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { obtenerTexto as t } from '@/shared/api/textosSitio';

import {
  RUTA_RETIRAR_SENSIBLES,
  RUTA_SENSIBLES,
  RUTA_TEXTO_SENSIBLES,
  respuestaAutorizada,
  respuestaEstadoSensibles,
  respuestaRetirada,
  respuestaTextoSensibles,
} from '../../helpers/datosSensibles';
import { MENSAJE_LIMITE, limite429 } from '../../helpers/limitesRed';
import {
  ALERGIA_FICTICIA,
  ALERGIAS_AUTORIZADAS,
  FOLIO_ABIERTA,
  FOTOS_ACEPTADAS,
  FOTOS_REVOCADAS,
  OPOSICION_ATENDIDA,
  RESPONDIDA,
  RUTA_CONSENTIMIENTOS,
  RUTA_ME,
  RUTA_MIAS,
  RUTA_MIOS,
  RUTA_MIS_DATOS,
  RUTA_OPOSICION,
  RUTA_SOLICITUDES,
  SIN_ALERGIAS,
  cancelacionAbierta409,
  error500,
  perfilMisDatos,
  respuestaMe,
  respuestaMias,
  respuestaMios,
  respuestaMisDatos,
  respuestaRevocado,
  respuestaSolicitud,
  solicitudCruda,
  validacion400,
} from '../../helpers/misDatos';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  diferida,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  sinRed,
  type LlamadaVm,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque C: la pantalla Mis datos y privacidad pintada con sus viewmodels reales. Derechos
 * ARCO (acceso sin alergias sin autorización, rectificación, cancelación y oposición con
 * confirmación), Mis solicitudes con estados y fechas locales, la hoja de solicitud (sin tipo por
 * omisión, 409 CANCELACION_ABIERTA, 429, 400 y 5xx) y Mis permisos con el estado real de cada
 * interruptor, la confirmación antes de retirar y el cuerpo exacto de cada envío. expo-router y
 * useAuth simulados; fetch simulado en http://api.test con datos ficticios.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const esquema = jest.requireMock<{ default: jest.Mock<'light' | 'dark', []> }>(
  'react-native/Libraries/Utilities/useColorScheme',
).default;

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const CLIENTA = { id: 'clienta-mis-datos-1', nombre: 'Clienta Ficticia', email: 'misdatos@ejemplo.test', rol: 'cliente' };

beforeEach(() => {
  reiniciarSimulaciones();
  invalidarPerfil();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
  esquema.mockReturnValue('light');
});

afterEach(async () => {
  await cleanup();
});

/** Lo que pide la pantalla al abrir: salud sin autorizar, promociones encendidas y fotos autorizadas. */
function servidor(rutas: Record<string, ManejadorVm> = {}): LlamadaVm[] {
  return servidorVm({
    [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(false),
    [`GET ${RUTA_TEXTO_SENSIBLES}`]: () => respuestaTextoSensibles(),
    [`GET ${RUTA_ME}`]: () => respuestaMe(true),
    [`GET ${RUTA_MIOS}`]: () => respuestaMios(FOTOS_ACEPTADAS),
    [`GET ${RUTA_MIAS}`]: () => respuestaMias([]),
    [`GET ${RUTA_MIS_DATOS}`]: () => respuestaMisDatos(),
    ...rutas,
  });
}

async function pintar(): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <MisDatosView />
    </SafeAreaProvider>,
  );
}

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Fila de "Mis derechos" por su título (su nombre accesible es "título, descripción"). */
function fila(clave: string) {
  return screen.getByRole('button', { name: new RegExp(`^${escapar(t(clave))}`) });
}

/** Último botón con ese nombre: el de la hoja (su Modal va después del contenido). */
function ultimoBoton(nombre: string) {
  const botones = screen.getAllByRole('button', { name: nombre });
  return botones[botones.length - 1];
}

async function interruptor(clave: string) {
  return screen.findByRole('switch', { name: t(clave) });
}

/** Día local de una fecha ISO como lo escribe la app ('lunes 19 de octubre de 2026'). */
function diaLocal(iso: string): string {
  const fecha = new Date(iso);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  return `${dias[fecha.getDay()]} ${fecha.getDate()} de octubre de 2026`;
}

describe('MisDatosView: estructura y enlaces', () => {
  it.each([
    ['claro', 'light' as const],
    ['oscuro', 'dark' as const],
  ])('(%s) muestra las secciones y lo que se conserva por ley', async (_tema, valor) => {
    esquema.mockReturnValue(valor);
    servidor();
    await pintar();
    expect(screen.getByText(t('privacidad.app.titulo'))).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: t('privacidad.app.derechos.titulo') })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: t('privacidad.app.solicitudes.titulo') })).toBeOnTheScreen();
    expect(await screen.findByRole('header', { name: t('privacidad.app.permisos.titulo') })).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: t('eliminarCuenta.conserva.titulo') })).toBeOnTheScreen();
    expect(screen.getByText(t('eliminarCuenta.conserva.fiscal'))).toBeOnTheScreen();
    expect(screen.getByText(/facturas con sus datos fiscales/)).toBeOnTheScreen();
    // En Mis datos va la versión de las constancias sin "esta eliminación" (Ronda 9).
    expect(screen.getByText('La constancia de tus consentimientos y de tus solicitudes ARCO.')).toBeOnTheScreen();
    expect(screen.queryByText(t('eliminarCuenta.conserva.constancias'))).not.toBeOnTheScreen();
    expect(await screen.findByText(t('privacidad.app.solicitudes.vacia'))).toBeOnTheScreen();
  });

  it('Rectificación lleva a Editar perfil, Cancelación a Mi cuenta y Volver regresa', async () => {
    servidor();
    await pintar();
    await fireEvent.press(fila('privacidad.app.rectificacion.titulo'));
    expect(routerSimulado.push).toHaveBeenCalledWith('/editar-perfil');
    await fireEvent.press(fila('privacidad.app.cancelacion.titulo'));
    expect(routerSimulado.push).toHaveBeenCalledWith('/mi-cuenta');
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(routerSimulado.back).toHaveBeenCalledTimes(1);
  });
});

describe('MisDatosView: acceso a mis datos', () => {
  it('sin autorización vigente no muestra las alergias: dice que están ocultas y ofrece autorizar', async () => {
    const espera = diferida();
    servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => espera.promesa });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    expect(screen.getByLabelText(t('privacidad.app.acceso.cargando'))).toBeOnTheScreen();

    await act(async () => {
      espera.soltar(respuestaMisDatos());
    });
    expect(await screen.findByText('Clienta Ficticia')).toBeOnTheScreen();
    expect(screen.getByText('misdatos@ejemplo.test')).toBeOnTheScreen();
    // La fecha de nacimiento sale del AAAA-MM-DD, sin pasar por UTC.
    expect(screen.getByText('miércoles 12 de abril de 1995')).toBeOnTheScreen();
    expect(screen.getByText('Tinte ficticio')).toBeOnTheScreen();
    expect(screen.queryByText(ALERGIA_FICTICIA)).not.toBeOnTheScreen();
    expect(screen.queryByText(t('privacidad.app.campo.alergias'))).not.toBeOnTheScreen();
    expect(screen.getByText(t('privacidad.app.alergias.ocultas'))).toBeOnTheScreen();
    expect(screen.getByLabelText(`${t('privacidad.app.seccion.pedidos')}: 2`)).toBeOnTheScreen();
    expect(screen.getByLabelText(`${t('privacidad.app.seccion.citas')}: 3`)).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.alergias.autorizar') }));
    expect(await screen.findByText(t('datosSensibles.app.casilla'))).toBeOnTheScreen();
    expect(screen.getByRole('checkbox', { name: t('datosSensibles.app.casilla') })).not.toBeChecked();

    await fireEvent.press(ultimoBoton(t('datosSensibles.app.ahoraNo')));
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.acceso.ocultar') }));
    expect(screen.queryByText('Clienta Ficticia')).not.toBeOnTheScreen();
  });

  it('con autorización muestra las alergias y al retirarla se ocultan de inmediato', async () => {
    const llamadas = servidor({
      [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(true),
      [`GET ${RUTA_MIS_DATOS}`]: () => respuestaMisDatos(perfilMisDatos(ALERGIAS_AUTORIZADAS)),
      [`POST ${RUTA_RETIRAR_SENSIBLES}`]: () => respuestaRetirada(),
    });
    await pintar();
    expect(await interruptor('privacidad.app.salud.titulo')).toBeChecked();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    expect(await screen.findByText(ALERGIA_FICTICIA)).toBeOnTheScreen();

    await fireEvent.press(await interruptor('privacidad.app.salud.titulo'));
    expect(await screen.findByText(t('privacidad.app.salud.retirarTexto'))).toBeOnTheScreen();
    await fireEvent.press(ultimoBoton(t('privacidad.app.salud.retirar')));

    expect(await screen.findByText(t('privacidad.app.salud.retirada'))).toBeOnTheScreen();
    expect(screen.queryByText(ALERGIA_FICTICIA)).not.toBeOnTheScreen();
    expect(screen.getByText(t('privacidad.app.alergias.ocultas'))).toBeOnTheScreen();
    expect(await interruptor('privacidad.app.salud.titulo')).not.toBeChecked();
    expect(llamadasA(llamadas, 'POST', RUTA_RETIRAR_SENSIBLES)[0].cuerpo).toEqual({ rutaOrigen: '/mis-datos' });
  });

  it('al autorizar desde Mis datos se vuelven a pedir y ya se muestran las alergias', async () => {
    let autorizada = false;
    const llamadas = servidor({
      [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(autorizada),
      [`GET ${RUTA_MIS_DATOS}`]: () => respuestaMisDatos(perfilMisDatos(autorizada ? ALERGIAS_AUTORIZADAS : {})),
      [`POST ${RUTA_SENSIBLES}`]: () => {
        autorizada = true;
        return respuestaAutorizada();
      },
    });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    await fireEvent.press(await screen.findByRole('button', { name: t('privacidad.app.alergias.autorizar') }));
    await fireEvent.press(await screen.findByRole('checkbox', { name: t('datosSensibles.app.casilla') }));
    await fireEvent.press(ultimoBoton(t('datosSensibles.app.autorizo')));
    expect(await screen.findByText(ALERGIA_FICTICIA)).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'GET', RUTA_MIS_DATOS)).toHaveLength(2);
    expect(await interruptor('privacidad.app.salud.titulo')).toBeChecked();
  });

  it('sin alergias guardadas no hay campo de alergias ni aviso', async () => {
    servidor({
      [`GET ${RUTA_SENSIBLES}`]: () => sinRed(),
      [`GET ${RUTA_MIS_DATOS}`]: () =>
        respuestaMisDatos(perfilMisDatos({ ...SIN_ALERGIAS, tratamientosQuimicos: false, tipoCabello: null, telefono: null })),
    });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    expect(await screen.findByText('Clienta Ficticia')).toBeOnTheScreen();
    expect(screen.queryByText(t('privacidad.app.campo.alergias'))).not.toBeOnTheScreen();
    expect(screen.queryByText(t('privacidad.app.alergias.ocultas'))).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: t('privacidad.app.alergias.autorizar') })).not.toBeOnTheScreen();
    expect(screen.getByLabelText(`${t('privacidad.app.campo.tratamientos')}: ${t('privacidad.app.valor.no')}`)).toBeOnTheScreen();
    expect(screen.getAllByText(t('privacidad.app.valor.sinDato')).length).toBeGreaterThanOrEqual(2);
  });

  it('tratamientos sin texto dicen Sí y sin respuesta dicen Sin dato', async () => {
    let vez = 0;
    servidor({
      [`GET ${RUTA_MIS_DATOS}`]: () => {
        vez += 1;
        return respuestaMisDatos(
          vez === 1
            ? perfilMisDatos({ tratamientos: null, recibePromociones: false })
            : perfilMisDatos({ tratamientosQuimicos: null, creadoEn: null, fechaNacimiento: null }),
        );
      },
    });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    expect(
      await screen.findByLabelText(`${t('privacidad.app.campo.tratamientos')}: ${t('privacidad.app.valor.si')}`),
    ).toBeOnTheScreen();
    expect(screen.getByText(t('privacidad.app.valor.noRecibe'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.acceso.ocultar') }));
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    expect(
      await screen.findByLabelText(`${t('privacidad.app.campo.tratamientos')}: ${t('privacidad.app.valor.sinDato')}`),
    ).toBeOnTheScreen();
  });

  it('retirar la salud con Mis datos cerrado solo cambia el interruptor', async () => {
    servidor({
      [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(true),
      [`POST ${RUTA_RETIRAR_SENSIBLES}`]: () => respuestaRetirada(),
    });
    await pintar();
    await fireEvent.press(await interruptor('privacidad.app.salud.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.salud.retirar')));
    expect(await screen.findByText(t('privacidad.app.salud.retirada'))).toBeOnTheScreen();
    expect(await interruptor('privacidad.app.salud.titulo')).not.toBeChecked();
    expect(screen.queryByText('Clienta Ficticia')).not.toBeOnTheScreen();
  });

  it('sin red: el texto de sin conexión y Reintentar vuelve a pedir', async () => {
    let vez = 0;
    servidor({
      [`GET ${RUTA_MIS_DATOS}`]: () => {
        vez += 1;
        return vez === 1 ? sinRed() : respuestaMisDatos();
      },
    });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    expect(await screen.findByText(MENSAJE_SIN_CONEXION)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.reintentar') }));
    expect(await screen.findByText('Clienta Ficticia')).toBeOnTheScreen();
  });

  it('429 con retryAfter: el message del backend y el reintento en espera', async () => {
    servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => limite429(30) });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    const reintentar = screen.getByRole('button', { name: t('errores.esperaLimite', { segundos: 30 }) });
    expect(reintentar).toBeDisabled();
    expect(fila('privacidad.app.acceso.titulo')).toBeDisabled();
  });

  it('5xx: el respaldo de la pantalla con la referencia, nunca el texto técnico', async () => {
    servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => error500('A1B2C3D4') });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    expect(await screen.findByText(new RegExp(escapar(t('errores.referencia', { referencia: 'A1B2C3D4' }))))).toBeOnTheScreen();
    expect(screen.queryByText(/Error interno ficticio/)).not.toBeOnTheScreen();
  });
});

describe('MisDatosView: oposición', () => {
  it('sin confirmar no envía nada; al confirmar manda la finalidad, avisa el folio y apaga promociones', async () => {
    const llamadas = servidor({
      [`POST ${RUTA_OPOSICION}`]: () => respuestaSolicitud({ folio: 'ARCO-2026-000043', tipo: 'oposicion', estado: 'atendida' }),
    });
    await pintar();
    expect(await interruptor('privacidad.app.promociones.titulo')).toBeChecked();

    await fireEvent.press(fila('privacidad.app.oposicion.titulo'));
    expect(await screen.findByText(t('privacidad.app.oposicion.confirmarTexto'))).toBeOnTheScreen();
    await fireEvent.press(ultimoBoton(t('privacidad.app.cancelar')));
    expect(llamadasA(llamadas, 'POST', RUTA_OPOSICION)).toHaveLength(0);

    const antes = llamadasA(llamadas, 'GET', RUTA_MIAS).length;
    await fireEvent.press(fila('privacidad.app.oposicion.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.oposicion.confirmar')));
    expect(
      await screen.findByText(t('privacidad.app.oposicion.lista', { folio: 'ARCO-2026-000043' })),
    ).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'POST', RUTA_OPOSICION).map((l) => l.cuerpo)).toEqual([{ finalidad: 'promociones' }]);
    expect(await interruptor('privacidad.app.promociones.titulo')).not.toBeChecked();
    await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_MIAS).length).toBe(antes + 1));
  });

  it('429: el message del backend y la fila en espera', async () => {
    servidor({ [`POST ${RUTA_OPOSICION}`]: () => limite429(20) });
    await pintar();
    await fireEvent.press(fila('privacidad.app.oposicion.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.oposicion.confirmar')));
    expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    expect(fila('privacidad.app.oposicion.titulo')).toBeDisabled();
    expect(screen.getByText(t('errores.esperaLimite', { segundos: 20 }))).toBeOnTheScreen();
  });

  it('sin red: el texto de sin conexión', async () => {
    servidor({ [`POST ${RUTA_OPOSICION}`]: () => sinRed() });
    await pintar();
    await fireEvent.press(fila('privacidad.app.oposicion.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.oposicion.confirmar')));
    expect(await screen.findByText(MENSAJE_SIN_CONEXION)).toBeOnTheScreen();
  });
});

describe('MisDatosView: mis solicitudes', () => {
  it('lista folio, tipo, estado legible, fechas locales y la respuesta', async () => {
    servidor({ [`GET ${RUTA_MIAS}`]: () => respuestaMias([solicitudCruda(), RESPONDIDA, OPOSICION_ATENDIDA]) });
    await pintar();
    expect(await screen.findByText(t('privacidad.app.solicitudes.folio', { folio: 'ARCO-2026-000041' }))).toBeOnTheScreen();
    expect(screen.getByLabelText('Estado: Recibida')).toBeOnTheScreen();
    expect(screen.getByLabelText('Estado: Respondida')).toBeOnTheScreen();
    expect(screen.getByLabelText('Estado: Atendida')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Acceso, Folio ARCO-2026-000041, Recibida' })).toBeOnTheScreen();

    // 03:30 UTC del 20: en UTC es el martes 20 y en la Ciudad de México todavía el lunes 19.
    const enviada = t('privacidad.app.solicitudes.enviada', { fecha: diaLocal('2026-10-20T03:30:00.000Z') });
    expect(screen.getByText(enviada)).toBeOnTheScreen();
    if (process.env.TZ === 'UTC') {
      expect(enviada).toContain('martes 20 de octubre');
    } else if (process.env.TZ === 'America/Mexico_City') {
      expect(enviada).toContain('lunes 19 de octubre');
    }
    expect(screen.getByText(/^Te respondemos a más tardar el /)).toBeOnTheScreen();
    expect(screen.getByText(/^Se aplica a más tardar el /)).toBeOnTheScreen();
    expect(screen.getAllByText(/^Atendida el /)).toHaveLength(1);
    expect(screen.getByText('Corregimos tu teléfono ficticio.')).toBeOnTheScreen();
    expect(screen.getByText('Mi teléfono ficticio cambió.')).toBeOnTheScreen();
  });

  it('error al cargar: el respaldo y Reintentar', async () => {
    let vez = 0;
    servidor({
      [`GET ${RUTA_MIAS}`]: () => {
        vez += 1;
        return vez === 1 ? error500() : respuestaMias([solicitudCruda()]);
      },
    });
    await pintar();
    expect(await screen.findByText(new RegExp(`^${escapar(t('privacidad.app.solicitudes.error'))}`))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.reintentar') }));
    expect(await screen.findByLabelText('Estado: Recibida')).toBeOnTheScreen();
  });
});

describe('MisDatosView: hoja de solicitud ARCO', () => {
  async function abrirHoja() {
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.solicitudes.nueva') }));
    expect(await screen.findByText(t('privacidad.app.hoja.texto'))).toBeOnTheScreen();
  }

  const enviar = () => screen.getByRole('button', { name: t('privacidad.app.hoja.enviar') });
  const opcion = (tipo: string) =>
    screen.getByRole('radio', { name: new RegExp(`^${escapar(t(`privacidad.app.tipo.${tipo}`))},`) });

  it('sin tipo elegido no deja enviar; con tipo manda el cuerpo exacto, avisa el folio y recarga', async () => {
    const llamadas = servidor({
      [`POST ${RUTA_SOLICITUDES}`]: () => respuestaSolicitud({ folio: 'ARCO-2026-000050', tipo: 'acceso' }),
    });
    await pintar();
    await abrirHoja();
    for (const tipo of ['acceso', 'rectificacion', 'cancelacion', 'oposicion', 'revocacion']) {
      expect(opcion(tipo)).not.toBeChecked();
    }
    expect(enviar()).toBeDisabled();
    await fireEvent.press(enviar());
    expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES)).toHaveLength(0);

    await fireEvent.press(opcion('acceso'));
    expect(opcion('acceso')).toBeChecked();
    expect(enviar()).toBeEnabled();
    await fireEvent.changeText(screen.getByLabelText(t('privacidad.app.hoja.descripcion')), '  Quiero una copia ficticia.  ');
    const antes = llamadasA(llamadas, 'GET', RUTA_MIAS).length;
    await fireEvent.press(enviar());

    expect(await screen.findByText(t('privacidad.app.hoja.lista', { folio: 'ARCO-2026-000050' }))).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES).map((l) => l.cuerpo)).toEqual([
      { tipo: 'acceso', descripcion: 'Quiero una copia ficticia.' },
    ]);
    await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_MIAS).length).toBe(antes + 1));
  });

  it('la descripción no pasa de 2000 caracteres', async () => {
    const llamadas = servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => respuestaSolicitud() });
    await pintar();
    await abrirHoja();
    await fireEvent.press(opcion('revocacion'));
    await fireEvent.changeText(screen.getByLabelText(t('privacidad.app.hoja.descripcion')), 'a'.repeat(2100));
    await fireEvent.press(enviar());
    await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES)).toHaveLength(1));
    expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES)[0].cuerpo).toEqual({ tipo: 'revocacion', descripcion: 'a'.repeat(2000) });
  });

  it('409 CANCELACION_ABIERTA: su texto, el folio de errors.folio en su propia línea y la lista se recarga', async () => {
    const llamadas = servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => cancelacionAbierta409() });
    await pintar();
    await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_MIAS)).toHaveLength(1));
    await abrirHoja();
    await fireEvent.press(opcion('cancelacion'));
    await fireEvent.press(enviar());
    expect(await screen.findByText(t('errores.cancelacionAbierta'))).toBeOnTheScreen();
    expect(screen.getByText(t('privacidad.arco.folioAbierta', { folio: FOLIO_ABIERTA }))).toBeOnTheScreen();
    // El message del servidor (con el folio dentro) nunca se muestra tal cual.
    expect(screen.queryByText(/con folio ARCO/)).not.toBeOnTheScreen();
    expect(screen.getByText(t('privacidad.app.hoja.texto'))).toBeOnTheScreen();
    await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_MIAS)).toHaveLength(2));
    // Al elegir otro tipo el folio se va con el error.
    await fireEvent.press(opcion('acceso'));
    expect(screen.queryByText(t('privacidad.arco.folioAbierta', { folio: FOLIO_ABIERTA }))).not.toBeOnTheScreen();
  });

  it('409 CANCELACION_ABIERTA sin errors.folio (backend anterior): solo su texto', async () => {
    servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => cancelacionAbierta409(null) });
    await pintar();
    await abrirHoja();
    await fireEvent.press(opcion('cancelacion'));
    await fireEvent.press(enviar());
    expect(await screen.findByText(t('errores.cancelacionAbierta'))).toBeOnTheScreen();
    expect(screen.queryByText(/ARCO-2026-000040/)).not.toBeOnTheScreen();
  });

  it('429 con retryAfter: el message del backend y Enviar en espera', async () => {
    servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => limite429(45) });
    await pintar();
    await abrirHoja();
    await fireEvent.press(opcion('oposicion'));
    await fireEvent.press(enviar());
    expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('errores.esperaLimite', { segundos: 45 }) })).toBeDisabled();
  });

  it.each([
    ['400', () => validacion400(), () => t('privacidad.app.hoja.error'), /no puede pasar de 2000/],
    ['5xx', () => error500('0F0F0F0F'), () => t('privacidad.app.hoja.error'), /Error interno ficticio/],
    ['sin red', () => sinRed(), () => MENSAJE_SIN_CONEXION, /Network request failed/],
  ])('%s: el texto para la clienta, nunca el del servidor', async (_caso, salida, esperado, tecnico) => {
    servidor({ [`POST ${RUTA_SOLICITUDES}`]: salida });
    await pintar();
    await abrirHoja();
    await fireEvent.press(opcion('rectificacion'));
    await fireEvent.press(enviar());
    expect(await screen.findByText(new RegExp(`^${escapar(esperado())}`))).toBeOnTheScreen();
    expect(screen.queryByText(tecnico)).not.toBeOnTheScreen();
  });

  it('Cancelar cierra la hoja sin enviar', async () => {
    const llamadas = servidor();
    await pintar();
    await abrirHoja();
    await fireEvent.press(opcion('acceso'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.cancelar')));
    await waitFor(() => expect(screen.queryByText(t('privacidad.app.hoja.texto'))).not.toBeOnTheScreen());
    expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES)).toHaveLength(0);
  });
});

describe('MisDatosView: mis permisos', () => {
  it('cada interruptor con su estado real; las fotos autorizadas, encendidas', async () => {
    servidor();
    await pintar();
    expect(await interruptor('privacidad.app.salud.titulo')).not.toBeChecked();
    expect(await interruptor('privacidad.app.promociones.titulo')).toBeChecked();
    expect(await interruptor('privacidad.app.fotos.titulo')).toBeChecked();
    expect(await interruptor('privacidad.app.fotos.titulo')).toHaveProp('accessibilityHint', t('privacidad.app.fotos.encendido'));
  });

  it('fotos retiradas: el interruptor sigue, apagado, con su texto', async () => {
    servidor({ [`GET ${RUTA_MIOS}`]: () => respuestaMios(FOTOS_REVOCADAS) });
    await pintar();
    const fotos = await interruptor('privacidad.app.fotos.titulo');
    expect(fotos).not.toBeChecked();
    expect(fotos).toBeEnabled();
    expect(fotos).toHaveProp('accessibilityHint', t('privacidad.app.fotos.apagado'));
  });

  it('fotos sin registro: no hay interruptor de fotos', async () => {
    servidor({ [`GET ${RUTA_MIOS}`]: () => respuestaMios([]), [`GET ${RUTA_ME}`]: () => respuestaMe(false) });
    await pintar();
    expect(await interruptor('privacidad.app.promociones.titulo')).not.toBeChecked();
    expect(screen.queryByRole('switch', { name: t('privacidad.app.fotos.titulo') })).not.toBeOnTheScreen();
  });

  it.each([
    ['promociones', 'privacidad.app.promociones.titulo', 'privacidad.app.promociones.retirarTexto', 'privacidad.app.promociones.retirada'],
    ['fotos_resultado', 'privacidad.app.fotos.titulo', 'privacidad.app.fotos.retirarTexto', 'privacidad.app.fotos.retirada'],
  ])('retirar %s: pide confirmar, sin confirmar no envía y al confirmar manda el cuerpo exacto', async (tipo, titulo, textoHoja, listo) => {
    const espera = diferida();
    const llamadas = servidor({ [`POST ${RUTA_CONSENTIMIENTOS}`]: () => espera.promesa });
    await pintar();
    await fireEvent.press(await interruptor(titulo));
    expect(await screen.findByText(t(textoHoja))).toBeOnTheScreen();
    await fireEvent.press(ultimoBoton(t('privacidad.app.cancelar')));
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(0);
    expect(await interruptor(titulo)).toBeChecked();

    await fireEvent.press(await interruptor(titulo));
    await fireEvent.press(ultimoBoton(t('privacidad.app.permisos.retirarPermiso')));
    // Hasta que el backend confirma, el interruptor no cambia (y queda deshabilitado).
    await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(1));
    expect(await interruptor(titulo)).toBeChecked();
    expect(await interruptor(titulo)).toBeDisabled();

    await act(async () => {
      espera.soltar(respuestaRevocado(tipo));
    });
    expect(await screen.findByText(t(listo))).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)[0].cuerpo).toEqual({
      items: [{ tipo, accion: 'revocado' }],
      formulario: 'perfil_privacidad',
      rutaOrigen: '/mis-datos',
    });
    // Apagado: las fotos se pueden volver a autorizar desde aquí, así que su interruptor se queda.
    expect(await interruptor(titulo)).not.toBeChecked();
  });

  it('volver a autorizar las fotos: confirma en una hoja, manda el cuerpo exacto y cambia al confirmar el backend', async () => {
    const espera = diferida();
    const llamadas = servidor({
      [`GET ${RUTA_MIOS}`]: () => respuestaMios(FOTOS_REVOCADAS),
      [`POST ${RUTA_CONSENTIMIENTOS}`]: () => espera.promesa,
    });
    await pintar();
    await fireEvent.press(await interruptor('privacidad.app.fotos.titulo'));
    expect(await screen.findByText(t('privacidad.app.fotos.autorizarTitulo'))).toBeOnTheScreen();
    expect(screen.getByText(t('privacidad.app.fotos.autorizarTexto'))).toBeOnTheScreen();
    await fireEvent.press(ultimoBoton(t('privacidad.app.cancelar')));
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(0);
    expect(await interruptor('privacidad.app.fotos.titulo')).not.toBeChecked();

    await fireEvent.press(await interruptor('privacidad.app.fotos.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.fotos.autorizar')));
    // Autorizando: hasta que el backend confirma, sigue apagado y deshabilitado.
    await waitFor(() => expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)).toHaveLength(1));
    expect(await interruptor('privacidad.app.fotos.titulo')).not.toBeChecked();
    expect(await interruptor('privacidad.app.fotos.titulo')).toBeDisabled();
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)[0].cuerpo).toEqual({
      items: [{ tipo: 'fotos_resultado', accion: 'aceptado' }],
      formulario: 'perfil_privacidad',
      rutaOrigen: '/mis-datos',
    });

    await act(async () => {
      espera.soltar(respuesta({ success: true, data: [{ id: '79', tipo: 'fotos_resultado', accion: 'aceptado' }] }, 201));
    });
    expect(await screen.findByText(t('privacidad.app.fotos.autorizada'))).toBeOnTheScreen();
    const fotos = await interruptor('privacidad.app.fotos.titulo');
    expect(fotos).toBeChecked();
    expect(fotos).toBeEnabled();
    expect(fotos).toHaveProp('accessibilityHint', t('privacidad.app.fotos.encendido'));
  });

  it.each<[string, () => Response | Promise<Response>, () => string, boolean]>([
    ['429', () => limite429(20), () => MENSAJE_LIMITE, true],
    ['sin red', () => sinRed(), () => MENSAJE_SIN_CONEXION, false],
    ['5xx', () => error500('FEDCBA98'), () => `${t('privacidad.app.permisos.errorCambio')} ${t('errores.referencia', { referencia: 'FEDCBA98' })}`, false],
  ])('volver a autorizar las fotos con %s: el aviso claro y el interruptor sigue apagado', async (_caso, falla, mensaje, enEspera) => {
    servidor({ [`GET ${RUTA_MIOS}`]: () => respuestaMios(FOTOS_REVOCADAS), [`POST ${RUTA_CONSENTIMIENTOS}`]: falla });
    await pintar();
    await fireEvent.press(await interruptor('privacidad.app.fotos.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.fotos.autorizar')));
    expect(await screen.findByText(mensaje())).toBeOnTheScreen();
    const fotos = await interruptor('privacidad.app.fotos.titulo');
    expect(fotos).not.toBeChecked();
    expect(fotos.props.accessibilityState.disabled).toBe(enEspera);
  });

  it('encender promociones es un opt in con PATCH /api/auth/me y cambia solo al confirmar', async () => {
    const espera = diferida();
    const llamadas = servidor({
      [`GET ${RUTA_ME}`]: () => respuestaMe(false),
      [`PATCH ${RUTA_ME}`]: () => espera.promesa,
    });
    await pintar();
    await fireEvent.press(await interruptor('privacidad.app.promociones.titulo'));
    await waitFor(() => expect(llamadasA(llamadas, 'PATCH', RUTA_ME)).toHaveLength(1));
    expect(llamadasA(llamadas, 'PATCH', RUTA_ME)[0].cuerpo).toEqual({ recibePromociones: true });
    expect(await interruptor('privacidad.app.promociones.titulo')).not.toBeChecked();
    await act(async () => {
      espera.soltar(respuesta({ success: true, data: {} }));
    });
    expect(await screen.findByText(t('privacidad.app.promociones.activada'))).toBeOnTheScreen();
    expect(await interruptor('privacidad.app.promociones.titulo')).toBeChecked();
  });

  it('encender salud abre la autorización completa y cambia al autorizar', async () => {
    const llamadas = servidor({ [`POST ${RUTA_SENSIBLES}`]: () => respuestaAutorizada() });
    await pintar();
    await fireEvent.press(await interruptor('privacidad.app.salud.titulo'));
    const casilla = await screen.findByRole('checkbox', { name: t('datosSensibles.app.casilla') });
    expect(casilla).not.toBeChecked();
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)).toHaveLength(0);
    await fireEvent.press(casilla);
    await fireEvent.press(ultimoBoton(t('datosSensibles.app.autorizo')));
    expect(await screen.findByText(t('privacidad.app.salud.autorizada'))).toBeOnTheScreen();
    expect(await interruptor('privacidad.app.salud.titulo')).toBeChecked();
    expect(llamadasA(llamadas, 'POST', RUTA_SENSIBLES)[0].cuerpo).toMatchObject({ rutaOrigen: '/mis-datos' });
  });

  it('429 al retirar: el message del backend y el interruptor en espera, sin cambiar', async () => {
    servidor({ [`POST ${RUTA_CONSENTIMIENTOS}`]: () => limite429(15) });
    await pintar();
    await fireEvent.press(await interruptor('privacidad.app.promociones.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.permisos.retirarPermiso')));
    expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    const promociones = await interruptor('privacidad.app.promociones.titulo');
    expect(promociones).toBeChecked();
    expect(promociones).toBeDisabled();
    // Las fotos comparten el límite de POST /api/consentimientos.
    expect(await interruptor('privacidad.app.fotos.titulo')).toBeDisabled();
  });

  it('5xx al retirar: el respaldo con la referencia', async () => {
    servidor({ [`POST ${RUTA_RETIRAR_SENSIBLES}`]: () => error500('ABCDEF12'), [`GET ${RUTA_SENSIBLES}`]: () => respuestaEstadoSensibles(true) });
    await pintar();
    await fireEvent.press(await interruptor('privacidad.app.salud.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.salud.retirar')));
    expect(await screen.findByText(new RegExp(`^${escapar(t('privacidad.app.permisos.errorCambio'))}.*ABCDEF12`))).toBeOnTheScreen();
    expect(await interruptor('privacidad.app.salud.titulo')).toBeChecked();
  });

  it('al salir de la pantalla, las respuestas que llegan tarde no escriben nada', async () => {
    const mias = diferida();
    const mios = diferida();
    const datos = diferida();
    const llamadas = servidor({
      [`GET ${RUTA_MIAS}`]: () => mias.promesa,
      [`GET ${RUTA_MIOS}`]: () => mios.promesa,
      [`GET ${RUTA_MIS_DATOS}`]: () => datos.promesa,
    });
    await pintar();
    await fireEvent.press(fila('privacidad.app.acceso.titulo'));
    const errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await cleanup();
    await act(async () => {
      mias.soltar(respuestaMias([solicitudCruda()]));
      mios.soltar(respuestaMios(FOTOS_ACEPTADAS));
      datos.soltar(respuestaMisDatos());
    });
    expect(errores).not.toHaveBeenCalled();
    errores.mockRestore();
    expect(llamadasA(llamadas, 'GET', RUTA_MIS_DATOS)).toHaveLength(1);
  });

  it('salir mientras se envía un retiro o una solicitud no escribe al volver la respuesta', async () => {
    const retiro = diferida();
    const solicitud = diferida();
    servidor({
      [`POST ${RUTA_CONSENTIMIENTOS}`]: () => retiro.promesa,
      [`POST ${RUTA_SOLICITUDES}`]: () => solicitud.promesa,
    });
    await pintar();
    await fireEvent.press(await interruptor('privacidad.app.promociones.titulo'));
    await fireEvent.press(ultimoBoton(t('privacidad.app.permisos.retirarPermiso')));
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.solicitudes.nueva') }));
    await fireEvent.press(screen.getByRole('radio', { name: new RegExp(`^${escapar(t('privacidad.app.tipo.acceso'))},`) }));
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.hoja.enviar') }));
    // Mientras se envía, Cancelar no cierra la hoja.
    await fireEvent.press(ultimoBoton(t('privacidad.app.cancelar')));
    expect(screen.getByText(t('privacidad.app.hoja.texto'))).toBeOnTheScreen();
    const errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    await cleanup();
    await act(async () => {
      retiro.soltar(limite429(10));
      solicitud.soltar(respuestaSolicitud());
    });
    expect(errores).not.toHaveBeenCalled();
    errores.mockRestore();
  });

  it('sin red al cargar: el error y Reintentar muestra los interruptores', async () => {
    let vez = 0;
    servidor({
      [`GET ${RUTA_MIOS}`]: () => {
        vez += 1;
        return vez === 1 ? sinRed() : respuestaMios(FOTOS_ACEPTADAS);
      },
    });
    await pintar();
    expect(await screen.findByText(MENSAJE_SIN_CONEXION)).toBeOnTheScreen();
    expect(screen.queryByRole('switch')).not.toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('privacidad.app.reintentar') }));
    expect(await interruptor('privacidad.app.fotos.titulo')).toBeChecked();
  });
});
