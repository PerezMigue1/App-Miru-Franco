/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen } from 'expo-router/testing-library';

import { FORMULARIO_FOTOS, RUTA_ORIGEN_RESERVA } from '@/features/citas/models/consentimientosReserva';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { ID_CITA, RUTA_CREAR_CITA, SERVICIO_CON_ANTICIPO, SERVICIO_SIN_ANTICIPO } from '../../helpers/citasFicticias';
import { creacionConReglas, cuerpoUnico, monto, RUTA_DOCUMENTO_ANTICIPOS, secuencia } from '../../helpers/integracionCitas';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirConfirmar,
  CASILLA_FOTOS,
  FORMA_PAGO,
  prepararPruebasFormaPago,
  type OpcionesConfirmar,
} from '../../helpers/pantallasFormaPago';
import { BOTON, CASILLA_POLITICA, esperarRuta, sinTextos, tocar } from '../../helpers/pantallasReserva';
import { consentimientosEnviados, escrituras, RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import type { ServicioCrudo } from '../../helpers/serviciosFicticios';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: reservar sin anticipo con las pantallas reales y la configuración ficticia: un servicio
 * que no pide anticipo, o uno con monto cuando el panel tiene los anticipos apagados. La forma de pago
 * dice cuánto se paga en el salón y con qué métodos, sin opciones ni la casilla de la política; la
 * cita se crea con "Confirmar cita" sin registrar ningún consentimiento, salvo la autorización de
 * fotos si la clienta la marca. Reloj en el lunes 19 de octubre de 2026 a las 10:00 de México.
 */

const METODOS = ['efectivo', 'transferencia'];
const TEXTO_METODOS = obtenerTexto('citas.formaPago.metodosSalon', { metodosSalon: 'efectivo o transferencia' });

interface CasoSinAnticipo {
  servicio: ServicioCrudo;
  confirmar: OpcionesConfirmar;
  /** El backend crea la cita sin anticipo (con los anticipos apagados no lo pide). */
  anticiposActivos: boolean;
}

const CASOS: [string, CasoSinAnticipo][] = [
  [
    'un servicio sin anticipo',
    {
      servicio: SERVICIO_SIN_ANTICIPO,
      confirmar: { conAnticipo: false, configuracion: { metodosSalon: METODOS } },
      anticiposActivos: true,
    },
  ],
  [
    'un servicio con monto y los anticipos apagados en el panel',
    {
      servicio: SERVICIO_CON_ANTICIPO,
      confirmar: { conAnticipo: true, configuracion: { anticiposActivos: false, metodosSalon: METODOS } },
      anticiposActivos: false,
    },
  ],
];

const CON_MONTO_SIN_ANTICIPOS = CASOS[1][1];

/** Abre Confirmar del caso con el backend que guarda la cita como la crearía. */
const abrirCaso = ({ confirmar, anticiposActivos }: CasoSinAnticipo) =>
  abrirConfirmar({ ...confirmar, rutas: creacionConReglas({ anticiposActivos }) });

describe('Reservar sin anticipo (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it.each(CASOS)(
    'con %s: cuánto paga en el salón y con qué métodos, sin opciones ni política, y "Confirmar cita" no registra consentimientos',
    async (_caso, caso) => {
      const { app, llamadas } = await abrirCaso(caso);

      expect(screen.getByRole('header', { name: FORMA_PAGO })).toBeOnTheScreen();
      expect(
        screen.getByText(obtenerTexto('citas.formaPago.sinAnticipoPrecio', { precio: monto(caso.servicio.precio) })),
      ).toBeOnTheScreen();
      expect(screen.getByText(TEXTO_METODOS)).toBeOnTheScreen();
      expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
      expect(screen.queryByRole('checkbox', { name: CASILLA_POLITICA })).not.toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Anticipo para apartar/)).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: BOTON.pagarEnLinea })).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: BOTON.apartarEnSalon })).not.toBeOnTheScreen();

      await tocar(BOTON.confirmar);
      await esperarRuta(app, `/cita-confirmada/${ID_CITA}`);
      expect(await screen.findByRole('header', { name: 'Tu cita está reservada' })).toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Anticipo: /)).not.toBeOnTheScreen();
      sinTextos('Tu horario está apartado');
      expect(escrituras(llamadas)).toEqual([RUTA_CREAR_CITA]);
      expect(secuencia(llamadas, RUTA_DOCUMENTO_ANTICIPOS)).toEqual([]);
      expect(cuerpoUnico(llamadas, RUTA_CREAR_CITA)).not.toHaveProperty('pagoAnticipo');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con los anticipos apagados y la casilla de fotos marcada, solo registra la autorización de fotos antes de crear la cita',
    async () => {
      const { app, llamadas } = await abrirCaso(CON_MONTO_SIN_ANTICIPOS);

      await fireEvent.press(screen.getByRole('checkbox', { name: CASILLA_FOTOS }));
      expect(screen.getByRole('checkbox', { name: CASILLA_FOTOS })).toBeChecked();
      await tocar(BOTON.confirmar);

      await esperarRuta(app, `/cita-confirmada/${ID_CITA}`);
      expect(escrituras(llamadas)).toEqual([RUTA_CONSENTIMIENTOS, RUTA_CREAR_CITA]);
      expect(consentimientosEnviados(llamadas)).toEqual([
        { items: [{ tipo: 'fotos_resultado', accion: 'aceptado' }], formulario: FORMULARIO_FOTOS, rutaOrigen: RUTA_ORIGEN_RESERVA },
      ]);
      expect(secuencia(llamadas, RUTA_DOCUMENTO_ANTICIPOS)).toEqual([]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
