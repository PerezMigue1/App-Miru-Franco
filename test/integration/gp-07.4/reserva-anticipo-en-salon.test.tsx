/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen } from 'expo-router/testing-library';

import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { ID_CITA, INICIO_CITA_ISO, llamadasDeRuta, masMinutos, rutaPreferencia, RUTA_CREAR_CITA } from '../../helpers/citasFicticias';
import { abrirSesionSimulada } from '../../helpers/google';
import { creacionConReglas, cuerpoUnico, limiteOtroDia } from '../../helpers/integracionCitas';
import { LIMITE_MS } from '../../helpers/pantallas';
import { revisarInsignias } from '../../helpers/pantallasMisCitas';
import { abrirConfirmar, prepararPruebasFormaPago } from '../../helpers/pantallasFormaPago';
import {
  BOTON,
  elegirOpcionPago,
  esperarRuta,
  marcarPolitica,
  navegadorQuedaAbierto,
  OPCION_PAGO,
  tocar,
} from '../../helpers/pantallasReserva';
import {
  consentimientosEnviados,
  escrituras,
  REGLAS_FICTICIAS,
  RUTA_CONSENTIMIENTOS,
  type ConfiguracionReservaFicticia,
} from '../../helpers/reservaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: reservar el alaciado pagando el anticipo en el salón, con las pantallas reales, la
 * configuración ficticia (REGLAS_FICTICIAS) y el reloj en el lunes 19 de octubre de 2026 a las 10:00
 * de México. El plazo que ve la clienta sale de los minutos de la regla; la app registra la política
 * antes de crear la cita con pagoAnticipo 'salon' y la confirmación dice hasta cuándo pagar en el
 * salón con los minutos que la cita guardó. Con una de las dos formas apagada en la configuración
 * solo se ofrece la otra.
 */

const { minutosAntesPagoSalon, minutosLlegadaAntes } = REGLAS_FICTICIAS;

/** Plazo bajo "Pagar anticipo en el salón" con los minutos de la regla ficticia. */
const PLAZO_SALON = [
  // La regla pide llegar antes del plazo del salón solo si sus minutos son más.
  ...(minutosLlegadaAntes > minutosAntesPagoSalon
    ? [obtenerTexto('citas.formaPago.llegadaSalon', { minutosLlegadaAntes, minutosAntesPagoSalon })]
    : []),
  obtenerTexto('citas.formaPago.plazoSalon', { minutosAntesPagoSalon }),
].join(' ');

/** Hasta cuándo pagar en el salón la cita del martes a las 11:00, con los minutos de la regla. */
const AVISO_CONFIRMACION = [
  obtenerTexto('citas.anticipoSalon.plazo', {
    limite: limiteOtroDia(masMinutos(INICIO_CITA_ISO, -minutosAntesPagoSalon).toISOString()),
    minutosAntesPagoSalon,
  }),
  RESPALDO_TEXTOS['citas.anticipoSalon.tambienEnLinea'],
].join(' ');

describe('Reservar con el anticipo en el salón (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it(
    'elige pagar en el salón, ve su plazo con los minutos de la regla, registra la política, aparta la cita y llega a la confirmación',
    async () => {
      const { app, llamadas } = await abrirConfirmar({ rutas: creacionConReglas() });

      await elegirOpcionPago('salon');
      expect(screen.getByRole('radio', { name: OPCION_PAGO.salon })).toBeChecked();
      expect(screen.getByText(PLAZO_SALON)).toBeOnTheScreen();
      await marcarPolitica();
      await tocar(BOTON.apartarEnSalon);

      await esperarRuta(app, `/cita-confirmada/${ID_CITA}`);
      expect(await screen.findByRole('header', { name: 'Tu horario está apartado' })).toBeOnTheScreen();
      expect(screen.getByText(AVISO_CONFIRMACION)).toBeOnTheScreen();
      revisarInsignias('Pendiente de pago');
      expect(escrituras(llamadas)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_CITA]);
      expect(consentimientosEnviados(llamadas)).toEqual([
        expect.objectContaining({ items: [expect.objectContaining({ documentoSlug: 'anticipos' })] }),
      ]);
      expect(cuerpoUnico(llamadas, RUTA_CREAR_CITA)).toMatchObject({ pagoAnticipo: 'salon' });
      expect(llamadasDeRuta(llamadas, rutaPreferencia())).toHaveLength(0);
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, ConfiguracionReservaFicticia, 'linea' | 'salon', 'linea' | 'salon', string, string]>([
    [
      'el pago en el salón apagado (permitirAnticipoEnSalon)',
      { citas: { permitirAnticipoEnSalon: false } },
      'linea',
      'salon',
      BOTON.pagarEnLinea,
      `/anticipo/${ID_CITA}`,
    ],
    [
      'Mercado Pago de anticipos apagado',
      { mercadoPagoAnticipos: false },
      'salon',
      'linea',
      BOTON.apartarEnSalon,
      `/cita-confirmada/${ID_CITA}`,
    ],
  ])(
    'con %s solo aparece la otra opción, ya elegida, y la cita se crea con ella',
    async (_caso, configuracion, visible, apagada, boton, destino) => {
      navegadorQuedaAbierto();
      const { app, llamadas } = await abrirConfirmar({ configuracion, rutas: creacionConReglas() });

      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(screen.getByRole('radio', { name: OPCION_PAGO[visible] })).toBeChecked();
      expect(screen.queryByRole('radio', { name: OPCION_PAGO[apagada] })).not.toBeOnTheScreen();

      await marcarPolitica();
      await tocar(boton);
      await esperarRuta(app, destino);
      expect(cuerpoUnico(llamadas, RUTA_CREAR_CITA)).toMatchObject({ pagoAnticipo: visible });
      expect(escrituras(llamadas).slice(0, 2)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_CITA]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
