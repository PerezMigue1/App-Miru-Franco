/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { FORMULARIO_ANTICIPO_CITA } from '@/features/citas/models/gestionCitaModel';
import { RUTA_ORIGEN_DETALLE } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { MENSAJES_ANTICIPO_EN_SALON } from '@/features/citas/models/citaModel';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  citaAnticipoPagado,
  citaConAnticipo,
  cuerpoCita,
  cuerpoErrorFiltro,
  INICIO_CITA_ISO,
  masMinutos,
  rutaCita,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { documentoCrudo } from '../../helpers/documentosFicticios';
import { anticipoEnSalonOk, conReglas, horas, REGLAS_CITA, rutaAnticipoEnSalon, turnos } from '../../helpers/gestionCitas';
import { abrirDetalleCon, cuerpoUnico, limiteOtroDia } from '../../helpers/integracionCitas';
import { LIMITE_MS } from '../../helpers/pantallas';
import { prepararPruebasFormaPago } from '../../helpers/pantallasFormaPago';
import { marcarCasillaPolitica, plazoSalonEnDetalle, revisarInsignias, TEXTOS_DETALLE } from '../../helpers/pantallasMisCitas';
import { sinTextos, vecesEn, type PantallaReserva } from '../../helpers/pantallasReserva';
import { escrituras, REGLAS_FICTICIAS, RUTA_CONSENTIMIENTOS } from '../../helpers/reservaFicticia';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: el detalle de una cita con anticipo en línea pendiente cuyas reglas guardadas (REGLAS_CITA)
 * son distintas de las vigentes de la configuración ficticia (REGLAS_FICTICIAS), con las pantallas
 * reales y el servidor simulado. El plazo y los minutos que ve la clienta son los de la cita; cambiar
 * a "Pagar en el salón" pide la casilla, registra la política, hace el PATCH y recarga la cita, que ya
 * se paga en el salón. Un 409 y un 503 dan su mensaje claro, sin texto técnico.
 */

const PENDIENTE = conReglas(citaConAnticipo());
/** Plazo del anticipo en el salón con los minutos que guardó la cita. */
const VENCE_EN_SALON = masMinutos(INICIO_CITA_ISO, -REGLAS_CITA.minutosAntesPagoSalon).toISOString();
const EN_SALON = conReglas(citaConAnticipo({ anticipoEnSalon: true, anticipoVenceEn: VENCE_EN_SALON }));
const PATCH = rutaAnticipoEnSalon();
const GET_CITA = rutaCita();
const DOCUMENTO = documentoCrudo('anticipos');

/**
 * La cita en el servidor: PENDIENTE hasta que llega el PATCH, que responde con `patch` y desde
 * entonces GET devuelve `despues` (como quedó la cita en el backend).
 */
function servidorDelCambio(patch: Manejador, despues: CitaCruda): Record<string, Manejador> {
  let actual = PENDIENTE;
  return {
    [GET_CITA]: () => respuesta(cuerpoCita(actual)),
    [PATCH]: (cuerpo) => {
      actual = despues;
      return patch(cuerpo);
    },
  };
}

/** Marca la casilla y toca "Pagar en el salón". */
async function pagarEnSalon(): Promise<void> {
  await marcarCasillaPolitica();
  await fireEvent.press(screen.getByRole('button', { name: TEXTOS_DETALLE.botonSalon }));
}

const lecturasDeLaCita = (abierta: PantallaReserva) => vecesEn(abierta, GET_CITA);

describe('Detalle con la regla guardada en la cita (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasFormaPago();

  it(
    'muestra el plazo de la cita y, con la casilla, cambia a pago en el salón: consentimiento, PATCH y la cita recargada con sus minutos',
    async () => {
      const abierta = await abrirDetalleCon(PENDIENTE, servidorDelCambio(turnos(anticipoEnSalonOk(VENCE_EN_SALON)), EN_SALON));

      expect(screen.getByRole('header', { name: 'Forma de pago' })).toBeOnTheScreen();
      expect(screen.getByText(RESPALDO_TEXTOS['citas.detalle.enLinea'])).toBeOnTheScreen();
      expect(screen.getByText(new RegExp(`^Tienes ${horas(REGLAS_CITA.plazoAnticipoHoras)} para pagarlo en línea`))).toBeOnTheScreen();
      sinTextos(new RegExp(`Tienes ${horas(REGLAS_FICTICIAS.plazoAnticipoHoras)} `));

      // Sin la casilla no registra nada ni cambia la forma de pago.
      await fireEvent.press(screen.getByRole('button', { name: TEXTOS_DETALLE.botonSalon }));
      expect(await screen.findByText(RESPALDO_TEXTOS['citas.politicaAnticipos.falta'])).toBeOnTheScreen();
      expect(escrituras(abierta.llamadas)).toEqual([]);

      await pagarEnSalon();
      expect(await screen.findByLabelText(RESPALDO_TEXTOS['citas.anticipoSalon.listo'])).toBeOnTheScreen();
      expect(escrituras(abierta.llamadas)).toEqual([RUTA_CONSENTIMIENTOS, PATCH]);
      expect(cuerpoUnico(abierta.llamadas, RUTA_CONSENTIMIENTOS)).toEqual({
        items: [
          { tipo: 'anticipos', documentoSlug: 'anticipos', version: DOCUMENTO.version, hash: DOCUMENTO.hash, accion: 'aceptado' },
        ],
        formulario: FORMULARIO_ANTICIPO_CITA,
        rutaOrigen: RUTA_ORIGEN_DETALLE,
      });
      expect(lecturasDeLaCita(abierta)).toBe(2);

      // La cita recargada ya se paga en el salón, con los minutos que guardó (no los vigentes).
      expect(await screen.findByText(RESPALDO_TEXTOS['citas.detalle.enSalon'])).toBeOnTheScreen();
      expect(
        screen.getByText(plazoSalonEnDetalle(limiteOtroDia(VENCE_EN_SALON), REGLAS_CITA.minutosAntesPagoSalon)),
      ).toBeOnTheScreen();
      sinTextos(RESPALDO_TEXTOS['citas.detalle.enLinea'], new RegExp(`\\(${REGLAS_FICTICIAS.minutosAntesPagoSalon} minutos antes`));
      expect(screen.queryByRole('button', { name: TEXTOS_DETALLE.botonSalon })).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: TEXTOS_DETALLE.botonLinea })).toBeEnabled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, number, string, CitaCruda, number, () => Promise<void>]>([
    [
      '409 (el anticipo ya se pagó en línea): lo dice y recarga la cita, que ya está pagada',
      409,
      MENSAJES_ANTICIPO_EN_SALON[409][1],
      conReglas(citaAnticipoPagado()),
      2,
      async () => {
        await waitFor(() => revisarInsignias('Anticipo pagado'));
        expect(screen.queryByRole('button', { name: TEXTOS_DETALLE.botonSalon })).not.toBeOnTheScreen();
      },
    ],
    [
      '503 (Mercado Pago no confirmó el pago): lo dice y la cita sigue como estaba',
      503,
      MENSAJES_ANTICIPO_EN_SALON[503][0],
      PENDIENTE,
      1,
      async () => {
        expect(screen.getByRole('button', { name: TEXTOS_DETALLE.botonSalon })).toBeEnabled();
      },
    ],
  ])(
    '%s',
    async (_caso, status, mensaje, despues, lecturas, revisarDespues) => {
      const error = cuerpoErrorFiltro(status, mensaje, `/api/citas/${PENDIENTE.id}/anticipo-en-salon`);
      const abierta = await abrirDetalleCon(PENDIENTE, servidorDelCambio(() => respuesta(error, status), despues));

      await pagarEnSalon();
      expect(await screen.findByLabelText(mensaje)).toBeOnTheScreen();
      expect(escrituras(abierta.llamadas)).toEqual([RUTA_CONSENTIMIENTOS, PATCH]);
      await waitFor(() => expect(lecturasDeLaCita(abierta)).toBe(lecturas));
      await revisarDespues();
      sinTextos(String(error.error), RESPALDO_TEXTOS['citas.anticipoSalon.listo']);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
