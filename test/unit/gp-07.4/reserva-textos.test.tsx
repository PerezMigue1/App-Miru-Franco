/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen } from 'expo-router/testing-library';

import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import { LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { abrirEn } from '../../helpers/pantallasServicios';
import { configuracionReserva } from '../../helpers/reservaFicticia';
import { respuesta } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: los textos del anticipo en el detalle de un servicio salen del catálogo de textos y de la
 * configuración pública: con los anticipos apagados en el panel no se anuncia anticipo ni se promete
 * pagarlo desde la app; con un texto del panel, se ve ese texto con el monto como cifra.
 */

const INVITACION_SIN_ANTICIPO = 'Con tu cuenta eliges día y hora desde la app.';

/** Abre el detalle del alaciado (anticipo de $360) sin sesión con esa configuración y toca Reservar. */
async function abrirAlaciado(configuracion: Record<string, unknown>): Promise<void> {
  await abrirEn('/servicio/2', { 'GET /api/configuracion-publica': () => respuesta(configuracion) });
  expect(await screen.findByRole('header', { name: 'Alaciado keratínico' })).toBeOnTheScreen();
  await fireEvent.press(screen.getByRole('button', { name: 'Reservar' }));
  expect(await screen.findByRole('header', { name: 'Inicia sesión para reservar' })).toBeOnTheScreen();
}

describe('Textos del anticipo en el detalle del servicio (GP-07.4)', () => {
  beforeEach(reiniciarConfiguracionPublica);
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'con los anticipos apagados no anuncia el anticipo ni promete pagarlo',
    async () => {
      await abrirAlaciado(configuracionReserva({ anticiposActivos: false }));

      expect(screen.getByText(INVITACION_SIN_ANTICIPO)).toBeOnTheScreen();
      expect(screen.queryByText(/anticipo/i)).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con un texto del panel muestra ese texto con el monto del servicio',
    async () => {
      const textos = {
        'citas.servicios.anticipo': 'Aparta con {anticipo} y el resto lo pagas en el salón.',
        'citas.servicios.invitacion': 'Entra para apartar con tu anticipo.',
      };
      await abrirAlaciado({ ...configuracionReserva(), textos });

      expect(screen.getByText('Aparta con $360 y el resto lo pagas en el salón.')).toBeOnTheScreen();
      expect(screen.getByText('$360')).toBeOnTheScreen();
      expect(screen.getByText('Entra para apartar con tu anticipo.')).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
