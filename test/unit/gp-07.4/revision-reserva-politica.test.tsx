/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { obtenerDocumentoVigente } from '@/shared/api/documentosLegales';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { AHORA, ID_CITA, llamadasDeRuta, rutaPreferencia, RUTA_CREAR_CITA } from '../../helpers/citasFicticias';
import { documentoCrudo, HASH_VIGENTE, rutaVigente } from '../../helpers/documentosFicticios';
import { abrirSesionSimulada } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import { abrirConfirmar, prepararPruebasFormaPago } from '../../helpers/pantallasFormaPago';
import { BOTON, CASILLA_POLITICA, confirmarConAnticipo, esperarRuta, marcarPolitica, tocar } from '../../helpers/pantallasReserva';
import { consentimientosEnviados } from '../../helpers/reservaFicticia';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * Revisión de GP-07.4, consentimiento de la Política de anticipos al reservar con las pantallas
 * reales: se registra la versión que la casilla mostraba al marcarla (no otra que llegue después),
 * la casilla se desmarca si la versión vigente cambia con ella marcada, y una cita que pide un
 * anticipo que la app no anunció no abre Mercado Pago sin la casilla.
 */

const RUTA_DOCUMENTO = `GET ${rutaVigente('anticipos')}`;
const HASH_NUEVO = 'c'.repeat(64);
// Desde la Ronda 9 la reserva usa el aviso común de los documentos legales junto a la casilla.
const ACTUALIZADA = RESPALDO_TEXTOS['legal.documentoActualizado'];
const FALTA = RESPALDO_TEXTOS['citas.politicaAnticipos.falta'];
const SEIS_MINUTOS = 6 * 60 * 1000;

/** El servidor publica la 2.3 hasta que la prueba llama a `publicarNueva` (2.4, otro hash). */
function politicaQueCambia(): { rutas: Record<string, Manejador>; publicarNueva: () => void } {
  let nueva = false;
  return {
    rutas: {
      [RUTA_DOCUMENTO]: () =>
        respuesta({
          success: true,
          data: nueva ? documentoCrudo('anticipos', { version: '2.4', hash: HASH_NUEVO }) : documentoCrudo('anticipos'),
        }),
    },
    publicarNueva: () => {
      nueva = true;
    },
  };
}

/** Versión y hash de la política en cada POST /api/consentimientos de tipo anticipos. */
function versionesRegistradas(llamadas: Parameters<typeof consentimientosEnviados>[0]): string[] {
  return consentimientosEnviados(llamadas)
    .flatMap((cuerpo) => (cuerpo as { items: { tipo: string; version?: string; hash?: string }[] }).items)
    .filter((item) => item.tipo === 'anticipos')
    .map((item) => `${item.version} ${item.hash}`);
}

const casilla = () => screen.getByRole('checkbox', { name: CASILLA_POLITICA });

describe('Revisión: versión de la política al reservar (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it(
    'registra la versión que la casilla mostraba al marcarla aunque la memoria venza y el servidor publique otra',
    async () => {
      const politica = politicaQueCambia();
      const { app, llamadas } = await abrirConfirmar({ rutas: politica.rutas });
      expect(await screen.findByText('Versión 2.3')).toBeOnTheScreen();
      await marcarPolitica();

      // Pasan más de los 5 minutos de la memoria y el panel publica la 2.4, que la clienta no vio.
      politica.publicarNueva();
      jest.setSystemTime(AHORA.getTime() + SEIS_MINUTOS);
      await confirmarConAnticipo('linea');
      await esperarRuta(app, `/anticipo/${ID_CITA}`);

      expect(versionesRegistradas(llamadas)).toEqual([`2.3 ${HASH_VIGENTE}`]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si la versión vigente cambia con la casilla marcada, la desmarca, lo avisa y no deja confirmar hasta marcarla otra vez',
    async () => {
      const politica = politicaQueCambia();
      const { app, llamadas } = await abrirConfirmar({ rutas: politica.rutas });
      expect(await screen.findByText('Versión 2.3')).toBeOnTheScreen();
      await marcarPolitica();
      expect(casilla()).toBeChecked();

      politica.publicarNueva();
      await act(async () => {
        await obtenerDocumentoVigente('anticipos', { forzarRed: true });
      });

      await waitFor(() => expect(casilla()).not.toBeChecked());
      expect(screen.getByText(ACTUALIZADA)).toBeOnTheScreen();
      expect(screen.getByText('Versión 2.4')).toBeOnTheScreen();

      await tocar(BOTON.pagarEnLinea);
      expect(await screen.findByText(FALTA)).toBeOnTheScreen();
      expect(consentimientosEnviados(llamadas)).toEqual([]);
      expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)).toHaveLength(0);

      // Al marcarla de nuevo se registra la versión nueva, la que ahora está a la vista.
      await fireEvent.press(casilla());
      await tocar(BOTON.pagarEnLinea);
      await esperarRuta(app, `/anticipo/${ID_CITA}`);
      expect(versionesRegistradas(llamadas)).toEqual([`2.4 ${HASH_NUEVO}`]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'una cita que pide un anticipo que la app no anunció va al anticipo sin abrir Mercado Pago y pide la casilla',
    async () => {
      // La app tiene los anticipos apagados, pero el backend sí pidió anticipo al crear la cita.
      const { app, llamadas } = await abrirConfirmar({ configuracion: { anticiposActivos: false } });
      await tocar(BOTON.confirmar);
      await esperarRuta(app, `/anticipo/${ID_CITA}`);

      // Sin ?pagar=1: la pantalla carga con la casilla sin marcar y no pide la preferencia.
      expect(await screen.findByRole('checkbox', { name: CASILLA_POLITICA })).not.toBeChecked();
      expect(consentimientosEnviados(llamadas)).toEqual([]);
      expect(llamadasDeRuta(llamadas, rutaPreferencia())).toHaveLength(0);
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
