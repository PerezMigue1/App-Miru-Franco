/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen } from 'expo-router/testing-library';
import type { TestInstance } from 'test-renderer';

import { reanudarAvisos } from '@/features/notificaciones/viewmodels/useAvisosEnVivo';

import { AVISOS_FICTICIOS, avisoComprobante, ID_AVISO_COMPROBANTE, rutaAviso } from '../../helpers/avisosFicticios';
import { comprobanteMinimo, respuestaMio, rutaMio } from '../../helpers/comprobantesFicticios';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirBandeja,
  abrirConAvisos,
  cambiarAppState,
  enVivo,
  esperarCampana,
  esperarFlujo,
  filaSinLeer,
  ID_CITA_AVISO,
  ID_PEDIDO_AVISO,
  pedidasDeLista,
  prepararPruebasAvisos,
} from '../../helpers/pantallasAvisos';
import { esperarRuta } from '../../helpers/pantallasReserva';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { abrirFlujo, flujosVivos, llamadasFlujo } from '../../helpers/streamSimulado';

/**
 * GP-09, Bloque C, con las pantallas reales (renderRouter sobre src/app), el servidor simulado y el
 * flujo en vivo simulado (expo/fetch): el evento 'cierre' del servidor deja los avisos en pausa y la
 * app los reanuda cuando la clienta vuelve a usarla (un toque en la raíz o una pantalla nueva), sin
 * abrir nunca dos flujos; y el aviso "Te enviamos tu comprobante" abre la pantalla del comprobante de
 * su pedido o de su cita desde la bandeja y desde el aviso en pantalla. Datos ficticios; nada sale a la
 * red.
 */

const CAMPANA_DOS = 'Abrir notificaciones, 2 avisos sin leer';
const CAMPANA_TRES = 'Abrir notificaciones, 3 avisos sin leer';
const TITULO_COMPROBANTE = 'Te enviamos tu comprobante';
const TARJETA_COMPROBANTE = `Aviso nuevo: ${TITULO_COMPROBANTE}. Toca para abrirlo`;
const DIEZ_MINUTOS = 10 * 60_000;

/** Contenedor raíz de _layout.tsx: el que recibe onTouchStart para reanudar los avisos. */
function raizDeLaApp(): TestInstance {
  const raices = screen.container.queryAll(
    (nodo) => typeof nodo.type === 'string' && nodo.props.onTouchStart === reanudarAvisos,
  );
  expect(raices).toHaveLength(1);
  return raices[0];
}

/** La clienta toca la pantalla (el toque llega a la raíz, que solo se entera de él). */
async function tocarLaApp(): Promise<void> {
  await fireEvent(raizDeLaApp(), 'touchStart', { nativeEvent: { touches: [] } });
}

async function pasarTiempo(ms: number): Promise<void> {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
}

/** PUT del aviso de comprobante (lo marca leído al tocarlo). */
const MARCAR_COMPROBANTE = {
  [`PUT ${rutaAviso(ID_AVISO_COMPROBANTE)}`]: () => respuesta({ success: true }),
};

/** GET del comprobante de esa compra, con su folio y su compra. */
function comprobanteDe(tipo: 'pedido' | 'cita', id: number, folio: string, compra: string) {
  return { [rutaMio(tipo, id)]: () => respuestaMio(comprobanteMinimo({ tipo, folio, compra })) };
}

describe('Avisos en vivo: cierre del servidor y aviso de comprobante (GP-09)', () => {
  const revisarConsola = prepararPruebasAvisos();

  it(
    'tras el cierre no reconecta sola; un toque reabre un solo flujo y la raíz no captura toques',
    async () => {
      const { flujo, llamadas } = await abrirConAvisos();
      await esperarCampana(CAMPANA_DOS, '2');
      const vivo = await esperarFlujo(flujo);

      // El toque en la raíz no la vuelve responder: no bloquea los toques de las pantallas.
      const raiz = raizDeLaApp();
      expect(raiz.props.onStartShouldSetResponder).toBeUndefined();
      expect(raiz.props.onStartShouldSetResponderCapture).toBeUndefined();
      expect(raiz.props.onResponderGrant).toBeUndefined();

      // Con la conexión sana, un toque no la reinicia.
      await tocarLaApp();
      expect(llamadasFlujo()).toHaveLength(1);

      await enVivo(() => vivo.enviarCierre());
      expect(flujosVivos()).toBe(0);
      await pasarTiempo(DIEZ_MINUTOS);
      expect(llamadasFlujo()).toHaveLength(1);
      expect(pedidasDeLista(llamadas)).toHaveLength(1);

      const otro = abrirFlujo();
      await tocarLaApp();
      await tocarLaApp();
      await tocarLaApp();
      const reabierto = await esperarFlujo(otro);

      expect(llamadasFlujo()).toHaveLength(2);
      expect(flujosVivos()).toBe(1);
      // Al reabrir pide la lista una vez para ponerse al día.
      await screen.findByRole('button', { name: CAMPANA_DOS });
      expect(pedidasDeLista(llamadas)).toHaveLength(2);

      // El flujo reabierto entrega avisos.
      await enVivo(() => reabierto.enviarAviso(avisoComprobante()));
      await esperarCampana(CAMPANA_TRES, '3');
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'tras el cierre, una pantalla nueva reabre el flujo; con toque y primer plano juntos sigue siendo uno',
    async () => {
      const { app, flujo, oyentesPrevios } = await abrirConAvisos();
      await esperarCampana(CAMPANA_DOS, '2');
      const vivo = await esperarFlujo(flujo);
      await enVivo(() => vivo.enviarCierre());
      expect(flujosVivos()).toBe(0);

      const otro = abrirFlujo();
      await abrirBandeja(app, CAMPANA_DOS);
      await esperarFlujo(otro);
      await tocarLaApp();
      await cambiarAppState(oyentesPrevios, 'active');
      await tocarLaApp();

      expect(llamadasFlujo()).toHaveLength(2);
      expect(flujosVivos()).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'en segundo plano un toque no abre nada; al volver a primer plano abre un solo flujo',
    async () => {
      const { flujo, oyentesPrevios } = await abrirConAvisos();
      await esperarCampana(CAMPANA_DOS, '2');
      const vivo = await esperarFlujo(flujo);
      await enVivo(() => vivo.enviarCierre());

      await cambiarAppState(oyentesPrevios, 'background');
      await tocarLaApp();
      expect(llamadasFlujo()).toHaveLength(1);

      const otro = abrirFlujo();
      await cambiarAppState(oyentesPrevios, 'active');
      await esperarFlujo(otro);
      await tocarLaApp();

      expect(llamadasFlujo()).toHaveLength(2);
      expect(flujosVivos()).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'el aviso de comprobante de un pedido abre su comprobante desde la bandeja',
    async () => {
      const comprobante = avisoComprobante('pedido', ID_PEDIDO_AVISO);
      const { app, llamadas } = await abrirConAvisos('/', {
        lista: [comprobante, ...AVISOS_FICTICIOS],
        rutas: comprobanteDe('pedido', ID_PEDIDO_AVISO, 'P-000010', `Pedido #${ID_PEDIDO_AVISO}`),
      });
      await esperarCampana(CAMPANA_TRES, '3');
      await abrirBandeja(app, CAMPANA_TRES);

      await fireEvent.press(await filaSinLeer(TITULO_COMPROBANTE));

      await esperarRuta(app, '/comprobante');
      expect(await screen.findByText(`Folio: P-000010 (Pedido #${ID_PEDIDO_AVISO})`)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', `/api/comprobantes/mio?tipo=pedido&id=${ID_PEDIDO_AVISO}`)).toHaveLength(1);
      expect(llamadasA(llamadas, 'PUT', rutaAviso(ID_AVISO_COMPROBANTE))).toHaveLength(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'el aviso de comprobante de una cita que llega en vivo abre su comprobante desde el aviso en pantalla',
    async () => {
      const { app, flujo, llamadas } = await abrirConAvisos('/', {
        rutas: { ...MARCAR_COMPROBANTE, ...comprobanteDe('cita', ID_CITA_AVISO, 'A-000003', `Cita #${ID_CITA_AVISO}`) },
      });
      await esperarCampana(CAMPANA_DOS, '2');
      const vivo = await esperarFlujo(flujo);

      await enVivo(() => vivo.enviarAviso(avisoComprobante('cita', ID_CITA_AVISO)));
      await esperarCampana(CAMPANA_TRES, '3');
      // Repetido (recuperado) no se duplica en la campana.
      await enVivo(() => vivo.enviarAviso(avisoComprobante('cita', ID_CITA_AVISO)));
      await esperarCampana(CAMPANA_TRES, '3');

      await fireEvent.press(screen.getByRole('button', { name: TARJETA_COMPROBANTE }));

      await esperarRuta(app, '/comprobante');
      expect(await screen.findByText(`Folio: A-000003 (Cita #${ID_CITA_AVISO})`)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', `/api/comprobantes/mio?tipo=cita&id=${ID_CITA_AVISO}`)).toHaveLength(1);
      expect(llamadasA(llamadas, 'PUT', rutaAviso(ID_AVISO_COMPROBANTE))).toHaveLength(1);
      expect(screen.queryByRole('button', { name: TARJETA_COMPROBANTE })).not.toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );
});
