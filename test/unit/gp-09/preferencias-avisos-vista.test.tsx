/// <reference types="jest" />

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import PreferenciasAvisosView from '@/features/notificaciones/views/PreferenciasAvisosView';
import { refrescar, reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { obtenerTexto as t } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { configuracionTienda, rutaConfiguracionTienda } from '../../helpers/checkoutFicticio';
import { RUTA_CONFIGURACION } from '../../helpers/configuracionFicticia';
import { MENSAJE_LIMITE, limite429 } from '../../helpers/limitesRed';
import { error500 } from '../../helpers/misDatos';
import {
  PREFERENCIAS,
  RUTA_PREFERENCIAS,
  conCambio,
  preferenciaNoDisponible400,
  respuestaPreferencias,
  sinFuncion404,
} from '../../helpers/preferenciasAvisos';
import { llamadasA } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import {
  diferida,
  enSecuencia,
  intentarSalir,
  navegacionSimulada,
  reiniciarSimulaciones,
  routerSimulado,
  servidorVm,
  sinRed,
  type LlamadaVm,
  type ManejadorVm,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque C (Ronda 9 del backend): Perfil > Preferencias de avisos pintada con su viewmodel
 * real. La lista sale del GET (un grupo por tipo, un interruptor por canal), la respuesta ARCO va fija
 * y bloqueada, Guardar manda solo los cambios y cada estado (cargando, lista, guardando, guardado,
 * errores de carga y de guardado, no disponible, espera por 429 y salir sin guardar) se ve y se anuncia.
 * expo-router simulado (con beforeRemove) y fetch simulado en http://api.test con datos ficticios.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);
jest.mock('react-native/Libraries/Utilities/useColorScheme', () => ({
  __esModule: true,
  default: jest.fn(() => 'light'),
}));

const esquema = jest.requireMock<{ default: jest.Mock<'light' | 'dark', []> }>(
  'react-native/Libraries/Utilities/useColorScheme',
).default;

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const CLIENTA = { id: 'clienta-pref-2', nombre: 'Clienta Avisos', email: 'avisos2@ejemplo.test', rol: 'cliente' };
const GUARDAR = () => t('preferenciasAvisos.guardar');

beforeEach(async () => {
  reiniciarSimulaciones();
  reiniciarConfiguracionPublica();
  limpiarArchivos();
  esquema.mockReturnValue('light');
  await sembrarSesion(CLIENTA);
});

afterEach(async () => {
  await cleanup();
});

function servidor(rutas: Record<string, ManejadorVm> = {}): LlamadaVm[] {
  return servidorVm({ [`GET ${RUTA_PREFERENCIAS}`]: () => respuestaPreferencias(), ...rutas });
}

async function pintar(): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <PreferenciasAvisosView />
    </SafeAreaProvider>,
  );
}

const escapar = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Los interruptores de un aviso, en el orden de sus canales: su nombre es "aviso, canal". */
const interruptores = (etiqueta: string) => screen.getAllByRole('switch', { name: new RegExp(`^${escapar(etiqueta)}, `) });

/** Nombre accesible de un interruptor: el aviso y el canal. */
const nombre = (etiqueta: string, canal: 'canalApp' | 'canalCorreo') => `${etiqueta}, ${t(`preferenciasAvisos.${canal}`)}`;

async function lista(): Promise<void> {
  expect(await screen.findByRole('switch', { name: nombre('Cita agendada', 'canalApp') })).toBeOnTheScreen();
}

const guardar = () => screen.getByRole('button', { name: GUARDAR() });

describe('Preferencias de avisos: carga y lista', () => {
  it.each([
    ['claro', 'light' as const],
    ['oscuro', 'dark' as const],
  ])('(%s) mientras carga se anuncia y después pinta la lista del GET agrupada por tipo', async (_tema, valor) => {
    esquema.mockReturnValue(valor);
    const espera = diferida();
    servidor({ [`GET ${RUTA_PREFERENCIAS}`]: () => espera.promesa });
    await pintar();
    expect(screen.getByRole('header', { name: t('preferenciasAvisos.titulo') })).toBeOnTheScreen();
    expect(screen.getByText(t('preferenciasAvisos.intro'))).toBeOnTheScreen();
    expect(screen.getByText(t('preferenciasAvisos.app.diferenciaLocal'))).toBeOnTheScreen();
    const cargando = screen.getByLabelText(t('preferenciasAvisos.cargando'));
    expect(cargando.props.accessibilityState).toEqual({ busy: true });
    expect(screen.queryByRole('switch')).not.toBeOnTheScreen();

    await act(async () => {
      espera.soltar(respuestaPreferencias());
    });
    await lista();
    // Un solo canal: "Solo en la app"; con dos, uno por canal.
    const [cita] = interruptores('Cita agendada');
    expect(cita).toBeChecked();
    expect(cita).toHaveProp('accessibilityHint', t('preferenciasAvisos.canalSoloApp'));
    const [app, correo] = interruptores('Recordatorio de tu cita');
    expect(app).toBeChecked();
    expect(app).toHaveProp('accessibilityHint', t('preferenciasAvisos.canalApp'));
    expect(correo).not.toBeChecked();
    expect(correo).toHaveProp('accessibilityHint', t('preferenciasAvisos.canalCorreo'));
    expect(interruptores('Factura emitida')[0]).not.toBeChecked();
    expect(screen.queryByLabelText(t('preferenciasAvisos.cargando'))).not.toBeOnTheScreen();
    // Sin cambios, Guardar no se puede tocar.
    expect(guardar()).toBeDisabled();
  });

  it('la respuesta ARCO va fija: encendida y bloqueada en los dos canales, con su explicación', async () => {
    servidor();
    await pintar();
    await lista();
    const arco = interruptores(t('preferenciasAvisos.arcoRespuesta'));
    expect(arco).toHaveLength(2);
    for (const fila of arco) {
      expect(fila).toBeChecked();
      expect(fila).toBeDisabled();
      expect(fila.props.accessibilityState).toEqual({ checked: true, disabled: true });
    }
    expect(screen.getByText(t('preferenciasAvisos.arcoRespuestaExplicacion'))).toBeOnTheScreen();
    await fireEvent.press(arco[0]);
    expect(guardar()).toBeDisabled();
  });

  it('cada interruptor se anuncia con el aviso y su canal, también los fijos de ARCO', async () => {
    servidor();
    await pintar();
    await lista();
    expect(screen.getByRole('switch', { name: nombre('Recordatorio de tu cita', 'canalApp') })).toBeChecked();
    expect(screen.getByRole('switch', { name: nombre('Recordatorio de tu cita', 'canalCorreo') })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: nombre('Pedido listo para recoger', 'canalCorreo') })).toBeChecked();
    const arco = t('preferenciasAvisos.arcoRespuesta');
    expect(screen.getByRole('switch', { name: nombre(arco, 'canalApp') })).toBeDisabled();
    expect(screen.getByRole('switch', { name: nombre(arco, 'canalCorreo') })).toBeDisabled();
    // Ningún nombre se repite entre los interruptores.
    const nombres = screen.getAllByRole('switch').map((s) => s.props.accessibilityLabel as string);
    expect(new Set(nombres).size).toBe(nombres.length);
  });

  it('una recarga de la configuración (y de sus textos) no reinicia la pantalla ni borra lo elegido', async () => {
    const base = configuracionTienda() as { textos: Record<string, unknown> };
    const llamadas = servidor(
      rutaConfiguracionTienda({ ...base, textos: { ...base.textos, 'preferenciasAvisos.intro': 'Introducción ficticia nueva' } }),
    );
    await pintar();
    await lista();
    await fireEvent.press(interruptores('Factura emitida')[0]);
    expect(guardar()).toBeEnabled();
    await act(async () => {
      await refrescar();
    });
    // Los textos sí cambiaron (llegó la configuración nueva) y la pantalla siguió igual.
    expect(await screen.findByText('Introducción ficticia nueva')).toBeOnTheScreen();
    expect(llamadasA(llamadas, 'GET', RUTA_CONFIGURACION).length).toBeGreaterThan(0);
    expect(interruptores('Factura emitida')[0]).toBeChecked();
    expect(guardar()).toBeEnabled();
    expect(llamadasA(llamadas, 'GET', RUTA_PREFERENCIAS)).toHaveLength(1);
  });

  it('Volver regresa', async () => {
    servidor();
    await pintar();
    await lista();
    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
    expect(routerSimulado.back).toHaveBeenCalledTimes(1);
  });

  it('404 (el backend todavía no tiene la función): lo dice y no muestra interruptores', async () => {
    servidor({ [`GET ${RUTA_PREFERENCIAS}`]: () => sinFuncion404() });
    await pintar();
    expect(await screen.findByText(t('preferenciasAvisos.noDisponible'))).toBeOnTheScreen();
    expect(screen.queryByRole('switch')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Cannot GET/)).not.toBeOnTheScreen();
  });

  it('sin red al cargar: el texto de sin conexión y Reintentar vuelve a pedir la lista', async () => {
    const llamadas = servidor({ [`GET ${RUTA_PREFERENCIAS}`]: enSecuencia(sinRed, () => respuestaPreferencias()) });
    await pintar();
    expect(await screen.findByText(MENSAJE_SIN_CONEXION)).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('preferenciasAvisos.reintentar') }));
    await lista();
    expect(llamadasA(llamadas, 'GET', RUTA_PREFERENCIAS)).toHaveLength(2);
  });

  it('5xx al cargar: el texto del catálogo con la referencia, nunca el técnico', async () => {
    servidor({ [`GET ${RUTA_PREFERENCIAS}`]: () => error500('0A1B2C3D') });
    await pintar();
    expect(
      await screen.findByText(`${t('preferenciasAvisos.errorCarga')} ${t('errores.referencia', { referencia: '0A1B2C3D' })}`),
    ).toBeOnTheScreen();
    expect(screen.queryByText(/Error interno/)).not.toBeOnTheScreen();
  });

  it('429 al cargar: el message del backend y Reintentar en espera con su cuenta', async () => {
    servidor({ [`GET ${RUTA_PREFERENCIAS}`]: () => limite429(30) });
    await pintar();
    expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    const boton = screen.getByRole('button', { name: t('preferenciasAvisos.reintentarEspera', { segundos: 30 }) });
    expect(boton).toBeDisabled();
  });
});

describe('Preferencias de avisos: guardar', () => {
  it('manda solo lo que cambió, muestra Guardando y al confirmar el backend avisa que se guardó', async () => {
    const espera = diferida();
    const llamadas = servidor({ [`PATCH ${RUTA_PREFERENCIAS}`]: () => espera.promesa });
    await pintar();
    await lista();
    const correo = () => interruptores('Recordatorio de tu cita')[1];
    await fireEvent.press(correo());
    expect(correo()).toBeChecked();
    // Volver al valor guardado quita el cambio; otra vez, lo pone.
    await fireEvent.press(correo());
    expect(guardar()).toBeDisabled();
    await fireEvent.press(correo());
    expect(guardar()).toBeEnabled();

    await fireEvent.press(guardar());
    const guardando = screen.getByRole('button', { name: t('preferenciasAvisos.guardando') });
    expect(guardando.props.accessibilityState).toEqual({ disabled: true, busy: true });
    expect(correo()).toBeDisabled();
    // Mientras se guarda, tocar otro interruptor no cambia nada.
    await fireEvent.press(interruptores('Cita agendada')[0]);
    expect(interruptores('Cita agendada')[0]).toBeChecked();
    expect(llamadasA(llamadas, 'PATCH', RUTA_PREFERENCIAS).map((l) => l.cuerpo)).toEqual([
      { preferencias: [{ tipo: 'cita_recordatorio', canal: 'email', activo: true }] },
    ]);

    await act(async () => {
      espera.soltar(respuestaPreferencias(conCambio('cita_recordatorio', 'email', true)));
    });
    expect(await screen.findByText(t('preferenciasAvisos.guardado'))).toBeOnTheScreen();
    expect(correo()).toBeChecked();
    expect(correo()).toBeEnabled();
    expect(guardar()).toBeDisabled();
    // Ya guardado, salir no pide confirmar.
    expect(intentarSalir()).toBe(false);
  });

  it('PREFERENCIA_NO_DISPONIBLE: el texto del catálogo, la lista se vuelve a pedir y lo elegido se queda', async () => {
    const llamadas = servidor({ [`PATCH ${RUTA_PREFERENCIAS}`]: () => preferenciaNoDisponible400() });
    await pintar();
    await lista();
    await fireEvent.press(interruptores('Recordatorio de tu cita')[1]);
    await fireEvent.press(guardar());
    expect(await screen.findByText(t('preferenciasAvisos.errorGuardado'))).toBeOnTheScreen();
    expect(screen.queryByText(/no se puede configurar/)).not.toBeOnTheScreen();
    await waitFor(() => expect(llamadasA(llamadas, 'GET', RUTA_PREFERENCIAS)).toHaveLength(2));
    expect(interruptores('Recordatorio de tu cita')[1]).toBeChecked();
    expect(guardar()).toBeEnabled();
  });

  it('PREFERENCIA_NO_DISPONIBLE con un par que ya no existe: se quita del borrador al releer la lista', async () => {
    const sinRecordatorioCorreo = PREFERENCIAS.filter((p) => !(p.tipo === 'cita_recordatorio' && p.canal === 'email'));
    servidor({
      [`GET ${RUTA_PREFERENCIAS}`]: enSecuencia(
        () => respuestaPreferencias(),
        () => respuestaPreferencias(sinRecordatorioCorreo),
      ),
      [`PATCH ${RUTA_PREFERENCIAS}`]: () => preferenciaNoDisponible400(),
    });
    await pintar();
    await lista();
    await fireEvent.press(interruptores('Recordatorio de tu cita')[1]);
    await fireEvent.press(guardar());
    await waitFor(() => expect(interruptores('Recordatorio de tu cita')).toHaveLength(1));
    expect(guardar()).toBeDisabled();
  });

  it('429 al guardar: el message del backend y Guardar en espera; lo elegido sigue en pantalla', async () => {
    servidor({ [`PATCH ${RUTA_PREFERENCIAS}`]: () => limite429(12) });
    await pintar();
    await lista();
    await fireEvent.press(interruptores('Factura emitida')[0]);
    await fireEvent.press(guardar());
    expect(await screen.findByText(MENSAJE_LIMITE)).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: t('preferenciasAvisos.guardarEspera', { segundos: 12 }) })).toBeDisabled();
    expect(interruptores('Factura emitida')[0]).toBeChecked();
  });

  it.each<[string, () => Promise<Response> | Response, () => string]>([
    ['sin red', () => sinRed(), () => MENSAJE_SIN_CONEXION],
    ['5xx', () => error500('ABCD1234'), () => `${t('preferenciasAvisos.errorGuardado')} ${t('errores.referencia', { referencia: 'ABCD1234' })}`],
  ])('%s al guardar: el aviso claro y el botón dice Reintentar, que vuelve a mandar lo mismo', async (_caso, falla, mensaje) => {
    const llamadas = servidor({
      [`PATCH ${RUTA_PREFERENCIAS}`]: enSecuencia(falla, () => respuestaPreferencias(conCambio('factura_emitida', 'in_app', true))),
    });
    await pintar();
    await lista();
    await fireEvent.press(interruptores('Factura emitida')[0]);
    await fireEvent.press(guardar());
    expect(await screen.findByText(mensaje())).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: t('preferenciasAvisos.reintentar') }));
    expect(await screen.findByText(t('preferenciasAvisos.guardado'))).toBeOnTheScreen();
    const cuerpos = llamadasA(llamadas, 'PATCH', RUTA_PREFERENCIAS).map((l) => l.cuerpo);
    expect(cuerpos).toEqual([cuerpos[0], cuerpos[0]]);
  });

  it('un cambio después de un error lo quita y el botón vuelve a decir Guardar', async () => {
    servidor({ [`PATCH ${RUTA_PREFERENCIAS}`]: () => error500('ABCD1234') });
    await pintar();
    await lista();
    await fireEvent.press(interruptores('Factura emitida')[0]);
    await fireEvent.press(guardar());
    expect(await screen.findByRole('button', { name: t('preferenciasAvisos.reintentar') })).toBeOnTheScreen();
    await fireEvent.press(interruptores('Cita agendada')[0]);
    expect(guardar()).toBeEnabled();
    expect(screen.queryByText(/ABCD1234/)).not.toBeOnTheScreen();
  });

  it('404 al guardar: el backend dejó de tener la función y se dice', async () => {
    servidor({ [`PATCH ${RUTA_PREFERENCIAS}`]: () => sinFuncion404() });
    await pintar();
    await lista();
    await fireEvent.press(interruptores('Factura emitida')[0]);
    await fireEvent.press(guardar());
    expect(await screen.findByText(t('preferenciasAvisos.noDisponible'))).toBeOnTheScreen();
    expect(intentarSalir()).toBe(false);
  });
});

describe('Preferencias de avisos: salir con cambios sin guardar', () => {
  it('sin cambios sale directo; con cambios pide confirmar, Seguir aquí se queda y Salir sin guardar sale', async () => {
    servidor();
    await pintar();
    await lista();
    expect(intentarSalir()).toBe(false);

    await fireEvent.press(interruptores('Cita agendada')[0]);
    const accion = { type: 'GO_BACK' };
    await act(async () => {
      expect(intentarSalir(accion)).toBe(true);
    });
    expect(await screen.findByText(t('preferenciasAvisos.sinGuardarTitulo'))).toBeOnTheScreen();
    expect(screen.getByText(t('preferenciasAvisos.sinGuardarTexto'))).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: t('preferenciasAvisos.sinGuardarQuedarse') }));
    expect(navegacionSimulada.dispatch).not.toHaveBeenCalled();
    // Se queda con lo que eligió.
    expect(interruptores('Cita agendada')[0]).not.toBeChecked();
    expect(guardar()).toBeEnabled();

    await act(async () => {
      expect(intentarSalir(accion)).toBe(true);
    });
    await fireEvent.press(await screen.findByRole('button', { name: t('preferenciasAvisos.sinGuardarSalir') }));
    expect(navegacionSimulada.dispatch).toHaveBeenCalledWith(accion);
  });

  it('salir sin guardar sin una salida pendiente solo cierra la hoja', async () => {
    servidor();
    await pintar();
    await lista();
    await fireEvent.press(interruptores('Cita agendada')[0]);
    await act(async () => {
      intentarSalir();
    });
    await fireEvent.press(await screen.findByRole('button', { name: t('preferenciasAvisos.sinGuardarSalir') }));
    expect(navegacionSimulada.dispatch).toHaveBeenCalledTimes(1);
    // Una segunda vez ya no hay acción guardada: no se despacha nada más.
    await act(async () => {
      intentarSalir();
    });
    expect(navegacionSimulada.dispatch).toHaveBeenCalledTimes(1);
  });

  it('una respuesta que llega después de salir no escribe nada (ni avisos de React)', async () => {
    const espera = diferida();
    const errores = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    servidor({ [`GET ${RUTA_PREFERENCIAS}`]: () => espera.promesa });
    await pintar();
    await cleanup();
    await act(async () => {
      espera.soltar(respuestaPreferencias());
    });
    expect(errores).not.toHaveBeenCalled();
    errores.mockRestore();
  });
});
