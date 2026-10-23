/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { render } from '@testing-library/react-native';
import { screen } from 'expo-router/testing-library';

import { SeccionFormaPago } from '@/features/citas/components/SeccionFormaPago';
import { formaPagoReserva, type OpcionAnticipo } from '@/features/citas/viewmodels/formaPagoReserva';
import { normalizarConfiguracion, type MetodoPagoSalon } from '@/shared/api/configuracionPublica';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { citaCancelada, citaCruda, citaEnSalon, type CitaCruda } from '../../helpers/citasFicticias';
import { CLABE_FICTICIA, CLABE_FICTICIA_CON_ESPACIOS } from '../../helpers/configuracionFicticia';
import { conReglas, reiniciarRepositorios } from '../../helpers/gestionCitas';
import { LIMITE_MS } from '../../helpers/pantallas';
import { abrirConfirmar, prepararPruebasFormaPago } from '../../helpers/pantallasFormaPago';
import { abrirConCitas, esperarDetalle } from '../../helpers/pantallasMisCitas';
import { elegirOpcionPago, prepararPruebasReserva } from '../../helpers/pantallasReserva';
import { configuracionReserva } from '../../helpers/reservaFicticia';
import { respuesta } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.5: los datos de transferencia del salón en citas, donde la web los muestra (FormaPagoCita y
 * PagoEnSalonCita). En la "Forma de pago" de la reserva: sin anticipo, y con anticipo solo si se
 * elige pagar en el salón. En el detalle de una cita vigente, debajo de los métodos del salón. Si la
 * transferencia está apagada (metodosSalon sin 'transferencia') o incompleta (null), no aparece
 * ninguna cuenta. Datos ficticios; fetch simulado y reloj fijo de las pantallas.
 */

const BANCO = 'Banco Ficticio';
const TITULAR = 'Titular Ficticia';
const ETIQUETA_BANCO = `Banco: ${BANCO}`;
const COPIAR = RESPALDO_TEXTOS['pagos.transferencia.copiar'];
const CON_TRANSFERENCIA: MetodoPagoSalon[] = ['efectivo', 'transferencia'];

type Caso = 'activa' | 'apagada' | 'incompleta';

/**
 * Cuerpo de GET /api/configuracion-publica con los anticipos activos y la transferencia según el
 * caso: activa (método y cuenta, con la CLABE con espacios como la manda el servidor), apagada (la
 * cuenta llega, pero el salón no acepta transferencia) o incompleta (sin titular).
 */
function cuerpoConTransferencia(caso: Caso): Record<string, unknown> {
  const base = configuracionReserva({ metodosSalon: caso === 'apagada' ? ['efectivo'] : CON_TRANSFERENCIA });
  const reglas = base.reglas as { pagos: Record<string, unknown> };
  const cuenta = { banco: BANCO, titular: caso === 'incompleta' ? '' : TITULAR, clabe: CLABE_FICTICIA_CON_ESPACIOS };
  return { ...base, reglas: { ...reglas, pagos: { ...reglas.pagos, transferencia: cuenta } } };
}

const rutaConfiguracion = (caso: Caso) => ({
  'GET /api/configuracion-publica': () => respuesta(cuerpoConTransferencia(caso)),
});

/** La cuenta completa a la vista, con su botón para copiar. */
function seVeLaCuenta(): void {
  expect(screen.getByLabelText(ETIQUETA_BANCO)).toBeOnTheScreen();
  expect(screen.getByLabelText(`Titular: ${TITULAR}`)).toBeOnTheScreen();
  expect(screen.getByText(CLABE_FICTICIA)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: COPIAR })).toBeOnTheScreen();
}

function noSeVeLaCuenta(): void {
  expect(screen.queryByLabelText(ETIQUETA_BANCO)).not.toBeOnTheScreen();
  expect(screen.queryByText(CLABE_FICTICIA)).not.toBeOnTheScreen();
  expect(screen.queryByRole('button', { name: COPIAR })).not.toBeOnTheScreen();
}

describe('SeccionFormaPago con los datos de transferencia', () => {
  const pintar = (caso: Caso, anticipo: string | null, opcion: OpcionAnticipo) => {
    const config = normalizarConfiguracion(cuerpoConTransferencia(caso));
    return render(
      <SeccionFormaPago
        formaPago={formaPagoReserva({ precio: '$1,200' }, anticipo, config, opcion)}
        opcion={opcion}
        onElegir={jest.fn()}
        deshabilitada={false}
      />,
    );
  };

  it.each<[string, string | null]>([
    ['sin anticipo', null],
    ['con anticipo y la opción de pagar en el salón', '$360'],
  ])('%s y la transferencia activa: banco, titular y CLABE debajo de los métodos', async (_caso, anticipo) => {
    await pintar('activa', anticipo, 'salon');

    expect(screen.getByText('En el salón puedes pagar con efectivo o transferencia.')).toBeOnTheScreen();
    seVeLaCuenta();
  });

  it.each<[string, Caso, string | null, OpcionAnticipo]>([
    ['con anticipo en línea', 'activa', '$360', 'linea'],
    ['sin anticipo y la transferencia apagada', 'apagada', null, 'linea'],
    ['con anticipo en el salón y la transferencia incompleta', 'incompleta', '$360', 'salon'],
  ])('%s: ninguna cuenta', async (_caso, caso, anticipo, opcion) => {
    await pintar(caso, anticipo, opcion);

    expect(screen.getByText(/puedes pagar con/)).toBeOnTheScreen();
    noSeVeLaCuenta();
  });
});

describe('Reserva: la cuenta sigue a la opción elegida (GP-07.5)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it(
    'con anticipo aparece al elegir pagar en el salón y se va al volver a pagar en línea',
    async () => {
      await abrirConfirmar({ rutas: rutaConfiguracion('activa') });
      noSeVeLaCuenta();

      await elegirOpcionPago('salon');
      expect(await screen.findByLabelText(ETIQUETA_BANCO)).toBeOnTheScreen();
      seVeLaCuenta();

      await elegirOpcionPago('linea');
      noSeVeLaCuenta();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});

describe('Detalle de la cita con los datos de transferencia (GP-07.5)', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();
  reiniciarRepositorios();

  async function abrirDetalle(cita: CitaCruda, caso: Caso) {
    const abierta = await abrirConCitas(`/cita/${cita.id}`, { citas: [cita], rutas: rutaConfiguracion(caso) });
    await esperarDetalle(abierta.app, cita.id);
    expect(await screen.findByRole('header', { name: 'Forma de pago' })).toBeOnTheScreen();
  }

  it.each<[string, CitaCruda]>([
    ['sin anticipo (todo se paga en el salón)', citaCruda()],
    ['con el anticipo apartado para pagar en el salón', conReglas(citaEnSalon())],
  ])(
    'cita vigente %s y la transferencia activa: la cuenta en la forma de pago',
    async (_caso, cita) => {
      await abrirDetalle(cita, 'activa');

      expect(screen.getByText(/puedes pagar con efectivo o transferencia/)).toBeOnTheScreen();
      seVeLaCuenta();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, CitaCruda, Caso]>([
    ['la transferencia apagada', citaCruda(), 'apagada'],
    ['la transferencia incompleta', citaCruda(), 'incompleta'],
    ['una cita cancelada', conReglas(citaCancelada()), 'activa'],
  ])(
    'con %s: ninguna cuenta',
    async (_caso, cita, caso) => {
      await abrirDetalle(cita, caso);

      noSeVeLaCuenta();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
