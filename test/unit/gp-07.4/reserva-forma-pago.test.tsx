/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { render } from '@testing-library/react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { SeccionFormaPago } from '@/features/citas/components/SeccionFormaPago';
import { formaPagoReserva } from '@/features/citas/viewmodels/formaPagoReserva';
import { normalizarConfiguracion } from '@/shared/api/configuracionPublica';

import { citaDesdeCuerpo, cuerpoCita, ID_CITA, llamadasDeRuta, RUTA_CREAR_CITA } from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirConfirmar,
  CASILLA_FOTOS,
  FORMA_PAGO,
  prepararPruebasFormaPago,
  seVen,
} from '../../helpers/pantallasFormaPago';
import {
  BOTON,
  CASILLA_POLITICA,
  elegirOpcionPago,
  esperarRuta,
  marcarPolitica,
  OPCION_PAGO,
  PASO,
  revisarDatos,
  sinTextos,
  tocar,
} from '../../helpers/pantallasReserva';
import {
  configuracionReserva,
  escrituras,
  REGLAS_FICTICIAS,
  type ReglasCitasFicticias,
} from '../../helpers/reservaFicticia';
import { respuesta } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: la sección "Forma de pago" del paso Confirmar de la reserva con las pantallas reales, la
 * configuración pública ficticia y el reloj fijo (lunes 19 de octubre de 2026). Con anticipo: montos,
 * opciones activas con su plazo, consecuencias, aviso para reagendar, métodos del salón y la casilla
 * obligatoria de la política; sin anticipo (o con los anticipos apagados en el panel), cuánto se
 * paga en el salón. Las cifras de los textos salen de las reglas de cada prueba.
 */

const FALTA_POLITICA = 'Para continuar marca que leíste la Política de anticipos y cancelación.';
const METODOS = 'En el salón puedes pagar con efectivo o tarjeta.';
const PIERDE = 'Si no llegas a tu cita y no avisas, el anticipo no se devuelve.';

/** Otras reglas: sin aviso para reagendar y sin pedir llegar antes del plazo del salón. */
const OTRAS_REGLAS: Required<ReglasCitasFicticias> = {
  ...REGLAS_FICTICIAS,
  plazoAnticipoHoras: 4,
  minutosAntesPagoSalon: 20,
  minutosLlegadaAntes: 10,
  horasAvisoCancelarReagendar: 0,
  diasHabilesExcepcionAnticipo: 9,
  diasHabilesCancelarConReembolso: 7,
};

describe('Forma de pago en el paso Confirmar (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it.each<[string, Required<ReglasCitasFicticias>]>([
    ['las reglas de la prueba', REGLAS_FICTICIAS],
    ['otras reglas (sin aviso para reagendar ni llegada antes)', OTRAS_REGLAS],
  ])(
    'con anticipo y %s: montos, opciones con su plazo, consecuencias, métodos y la política con las cifras de las reglas',
    async (_caso, reglas) => {
      await abrirConfirmar({ configuracion: { citas: reglas } });

      expect(screen.getByRole('header', { name: FORMA_PAGO })).toBeOnTheScreen();
      revisarDatos({ 'Anticipo para apartar tu cita': '$360', 'Pagas en el salón el día de tu cita': '$840' });
      seVen('¿Cómo quieres pagar el anticipo?', PIERDE, METODOS);
      const plazoLinea = new RegExp(
        `Tienes ${reglas.plazoAnticipoHoras} horas para pagarlo, sin pasar de ${reglas.minutosAntesPagoSalon} minutos antes de tu cita`,
      );
      const plazoSalon = `Si a ${reglas.minutosAntesPagoSalon} minutos de tu cita no se ha pagado, la cita se cancela.`;
      const llegada = `Llega entre ${reglas.minutosLlegadaAntes} y ${reglas.minutosAntesPagoSalon} minutos antes para pagarlo.`;
      expect(screen.getByRole('radio', { name: OPCION_PAGO.linea })).toHaveAccessibleName(plazoLinea);
      expect(screen.getByRole('radio', { name: OPCION_PAGO.salon })).toHaveAccessibleName(new RegExp(plazoSalon));
      // Llegar antes solo se pide si es antes del plazo del salón; el aviso, solo si hay horas de aviso.
      const aviso = `avisa con al menos ${reglas.horasAvisoCancelarReagendar} horas de anticipación`;
      if (reglas.minutosLlegadaAntes > reglas.minutosAntesPagoSalon) {
        seVen(`${llegada} ${plazoSalon}`, new RegExp(aviso));
      } else {
        seVen(plazoSalon);
        sinTextos(new RegExp(llegada), /avisa con al menos/);
      }
      seVen(
        new RegExp(
          `faltan más de ${reglas.diasHabilesExcepcionAnticipo} días hábiles para tu cita, puedes cancelarla dentro de los ${reglas.diasHabilesCancelarConReembolso} días hábiles siguientes`,
        ),
      );
      const casilla = screen.getByRole('checkbox', { name: CASILLA_POLITICA });
      expect(casilla).not.toBeChecked();
      expect(screen.getByRole('link', { name: 'Política de anticipos y cancelación' })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'la opción inicial es en línea y el único botón cambia de texto con la opción elegida',
    async () => {
      await abrirConfirmar();

      const linea = screen.getByRole('radio', { name: OPCION_PAGO.linea });
      expect(linea).toBeChecked();
      expect(screen.getByRole('radio', { name: OPCION_PAGO.salon })).not.toBeChecked();
      expect(screen.getByRole('button', { name: BOTON.pagarEnLinea })).toBeEnabled();

      await elegirOpcionPago('salon');
      expect(screen.getByRole('radio', { name: OPCION_PAGO.salon })).toBeChecked();
      expect(screen.getByRole('radio', { name: OPCION_PAGO.linea })).not.toBeChecked();
      expect(screen.getByRole('button', { name: BOTON.apartarEnSalon })).toBeEnabled();
      expect(screen.queryByRole('button', { name: BOTON.pagarEnLinea })).not.toBeOnTheScreen();

      await elegirOpcionPago('linea');
      expect(screen.getByRole('button', { name: BOTON.pagarEnLinea })).toBeEnabled();
      expect(screen.getAllByRole('button', { name: /^Confirmar/ })).toHaveLength(1);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin marcar la política no llama a la red: el error sale en la casilla y se quita al marcarla',
    async () => {
      const { llamadas } = await abrirConfirmar();

      await tocar(BOTON.pagarEnLinea);
      expect(await screen.findByText(FALTA_POLITICA)).toBeOnTheScreen();
      const casilla = screen.getByRole('checkbox', { name: CASILLA_POLITICA });
      expect(casilla).toHaveProp('accessibilityHint', FALTA_POLITICA);
      expect(screen.getByRole('header', { name: PASO.confirmar })).toBeOnTheScreen();
      expect(escrituras(llamadas)).toEqual([]);

      await marcarPolitica();
      sinTextos(FALTA_POLITICA);
      expect(screen.getByRole('checkbox', { name: CASILLA_POLITICA })).toBeChecked();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con el pago en el salón apagado solo ofrece pagar en línea',
    async () => {
      await abrirConfirmar({ configuracion: { citas: { permitirAnticipoEnSalon: false } } });

      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(screen.getByRole('radio', { name: OPCION_PAGO.linea })).toBeChecked();
      expect(screen.getByRole('button', { name: BOTON.pagarEnLinea })).toBeEnabled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con Mercado Pago apagado para anticipos solo ofrece pagar en el salón y no promete pagar en línea tras una falta',
    async () => {
      await abrirConfirmar({
        configuracion: {
          mercadoPagoAnticipos: false,
          citas: { noAsistio: { pierdeAnticipo: true, mesesSoloPagoEnLinea: 3 } },
        },
      });

      expect(screen.getAllByRole('radio')).toHaveLength(1);
      expect(screen.getByRole('radio', { name: OPCION_PAGO.salon })).toBeChecked();
      expect(screen.getByRole('button', { name: BOTON.apartarEnSalon })).toBeEnabled();
      seVen(PIERDE);
      sinTextos(/se apartan pagando el anticipo en línea/);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'tras una falta (meses solo en línea) avisa que las próximas citas se apartan pagando en línea',
    async () => {
      const meses = 3;
      await abrirConfirmar({ configuracion: { citas: { noAsistio: { pierdeAnticipo: false, mesesSoloPagoEnLinea: meses } } } });

      seVen(
        `Si no llegas a tu cita, el salón revisa la devolución de tu anticipo. Durante ${meses} meses, tus próximas citas se apartan pagando el anticipo en línea.`,
      );
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin anticipo: cuánto se paga en el salón y con qué métodos, sin opciones, sin la política y con "Confirmar cita"',
    async () => {
      await abrirConfirmar({ conAnticipo: false, configuracion: { metodosSalon: ['efectivo', 'tarjeta', 'transferencia'] } });

      expect(screen.getByRole('header', { name: FORMA_PAGO })).toBeOnTheScreen();
      seVen('Pagas $350 en el salón el día de tu cita.', 'En el salón puedes pagar con efectivo, tarjeta o transferencia.');
      expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
      expect(screen.queryByRole('checkbox', { name: CASILLA_POLITICA })).not.toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Anticipo para apartar/)).not.toBeOnTheScreen();
      // La casilla de fotos sigue (opcional y sin marcar), como en la web.
      expect(screen.getByRole('checkbox', { name: CASILLA_FOTOS })).not.toBeChecked();
      expect(screen.getByRole('button', { name: BOTON.confirmar })).toBeEnabled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con los anticipos apagados en el panel no promete anticipo aunque el servicio traiga monto: crea la cita sin pagoAnticipo',
    async () => {
      // Como el backend sin fecha de anticipos: la cita se crea sin anticipo.
      const { app, llamadas } = await abrirConfirmar({
        configuracion: { anticiposActivos: false, metodosSalon: [] },
        crear: () => (cuerpo) =>
          respuesta(
            cuerpoCita({ ...citaDesdeCuerpo(cuerpo), id: ID_CITA, anticipoRequerido: null, anticipoVenceEn: null }),
            201,
          ),
      });

      seVen('Pagas $1,200 en el salón el día de tu cita.');
      sinTextos(/anticipo/i, /puedes pagar con/);
      expect(screen.queryByRole('radio')).not.toBeOnTheScreen();
      expect(screen.queryByRole('checkbox', { name: CASILLA_POLITICA })).not.toBeOnTheScreen();

      await tocar(BOTON.confirmar);
      await esperarRuta(app, '/cita-confirmada/501');
      expect(escrituras(llamadas)).toEqual([RUTA_CREAR_CITA]);
      expect(llamadasDeRuta(llamadas, RUTA_CREAR_CITA)[0].cuerpo).not.toHaveProperty('pagoAnticipo');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'la casilla de fotos con anticipo también está, opcional y sin marcar; se marca y desmarca',
    async () => {
      await abrirConfirmar();

      const fotos = screen.getByRole('checkbox', { name: CASILLA_FOTOS });
      expect(fotos).not.toBeChecked();
      await fireEvent.press(fotos);
      await waitFor(() => expect(screen.getByRole('checkbox', { name: CASILLA_FOTOS })).toBeChecked());
      await fireEvent.press(screen.getByRole('checkbox', { name: CASILLA_FOTOS }));
      expect(screen.getByRole('checkbox', { name: CASILLA_FOTOS })).not.toBeChecked();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});

describe('SeccionFormaPago sin precio conocido ni métodos del salón', () => {
  const sinMetodos = normalizarConfiguracion(configuracionReserva({ metodosSalon: [] }));
  const pintar = (anticipo: string | null) =>
    render(
      <SeccionFormaPago
        formaPago={formaPagoReserva({ precio: null }, anticipo, sinMetodos)}
        opcion="linea"
        onElegir={jest.fn()}
        deshabilitada={false}
      />,
    );

  it('con anticipo: sin saldo dice que se descuenta del total y no menciona métodos', async () => {
    await pintar('$360');

    expect(screen.getByLabelText('Anticipo para apartar tu cita: $360')).toBeOnTheScreen();
    expect(screen.getByText('Se descuenta del total el día de tu cita.')).toBeOnTheScreen();
    expect(screen.queryByLabelText(/^Pagas en el salón el día de tu cita/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/puedes pagar con/)).not.toBeOnTheScreen();
  });

  it('sin anticipo: el texto sin monto y sin métodos', async () => {
    await pintar(null);

    expect(screen.getByText('Pagas tu servicio en el salón el día de tu cita.')).toBeOnTheScreen();
    expect(screen.queryByText(/puedes pagar con/)).not.toBeOnTheScreen();
  });
});
