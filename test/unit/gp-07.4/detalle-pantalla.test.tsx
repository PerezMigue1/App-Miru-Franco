/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { consecuenciaNoAsistir, textoMetodosSalon } from '@/features/citas/models/formaPagoModel';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaAnticipoPagado,
  citaConAnticipo,
  citaCruda,
  ID_CITA,
  masMinutos,
  rutaCancelar,
  rutaEstadoAnticipo,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { HASH_VIGENTE } from '../../helpers/documentosFicticios';
import {
  anticipoEnSalonOk,
  configVigente,
  conReglas,
  enPausa,
  errorCon,
  estadoConPolitica,
  horas,
  REGLAS_CITA,
  reiniciarRepositorios,
  rutaAnticipoEnSalon,
  turnos,
} from '../../helpers/gestionCitas';
import { LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import {
  abrirConCitas,
  esperarDetalle,
  marcarCasillaPolitica,
  TEXTOS_DETALLE,
  TITULO_HOJA,
} from '../../helpers/pantallasMisCitas';
import { esperarRuta, prepararPruebasReserva, sinTextos, vecesEn } from '../../helpers/pantallasReserva';
import { consentimientosEnviados, REGLAS_FICTICIAS, rutaConfiguracionReserva } from '../../helpers/reservaFicticia';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4, detalle de la cita con las pantallas reales: la forma de pago con la regla guardada en la
 * cita (la configuración vigente ficticia tiene otras cifras), cambiar a pago en el salón con la
 * casilla y el consentimiento, el enlace a la política y la hoja de cancelar con el aviso del
 * anticipo pagado (botón desactivado mientras carga). Reloj fijo en AHORA y fetch simulado.
 */

/** La cita del martes 11:00 con anticipo en línea pendiente y las reglas de REGLAS_CITA. */
const PENDIENTE = conReglas(citaConAnticipo());
const PAGADA = conReglas(citaAnticipoPagado());
const VIGENTE = configVigente();

/** Abre el detalle de la cita (con la configuración vigente ficticia) y espera que cargue. */
async function abrirDetalle(cita: CitaCruda, rutas: Record<string, Manejador> = {}) {
  const abierta = await abrirConCitas(`/cita/${cita.id}`, { citas: [cita], rutas: { ...rutaConfiguracionReserva(), ...rutas } });
  await esperarDetalle(abierta.app, cita.id);
  return abierta;
}

describe('Detalle de la cita con la forma de pago (GP-07.4)', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();
  reiniciarRepositorios();

  it(
    'muestra la forma de pago con la regla de la cita y cambia a pago en el salón con la casilla',
    async () => {
      const plazo = masMinutos(AHORA, 600).toISOString();
      const abierta = await abrirDetalle(PENDIENTE, {
        [rutaAnticipoEnSalon()]: turnos(anticipoEnSalonOk(plazo)),
      });

      expect(await screen.findByRole('header', { name: 'Forma de pago' })).toBeOnTheScreen();
      expect(screen.getByText(RESPALDO_TEXTOS['citas.detalle.enLinea'])).toBeOnTheScreen();
      expect(screen.getByText(obtenerTexto('citas.pagoSalon.saldo', { saldo: '$840' }))).toBeOnTheScreen();
      expect(screen.getByText(consecuenciaNoAsistir(REGLAS_CITA, VIGENTE))).toBeOnTheScreen();
      expect(screen.getByText(new RegExp(`Tienes ${horas(REGLAS_CITA.plazoAnticipoHoras)} para pagarlo en línea`))).toBeOnTheScreen();
      sinTextos(new RegExp(`Tienes ${horas(REGLAS_FICTICIAS.plazoAnticipoHoras)} `));
      expect(screen.getByText(textoMetodosSalon(VIGENTE) ?? '')).toBeOnTheScreen();
      expect(screen.getByText(new RegExp(`al menos ${horas(REGLAS_CITA.horasAvisoCancelarReagendar)} de anticipación`))).toBeOnTheScreen();
      expect(screen.getByText(RESPALDO_TEXTOS['citas.recordatorio'])).toBeOnTheScreen();

      // Sin la casilla no cambia nada.
      await fireEvent.press(screen.getByRole('button', { name: TEXTOS_DETALLE.botonSalon }));
      expect(await screen.findByText(RESPALDO_TEXTOS['citas.politicaAnticipos.falta'])).toBeOnTheScreen();
      expect(vecesEn(abierta, rutaAnticipoEnSalon())).toBe(0);

      await marcarCasillaPolitica();
      await fireEvent.press(screen.getByRole('button', { name: TEXTOS_DETALLE.botonSalon }));
      expect(await screen.findByLabelText(RESPALDO_TEXTOS['citas.anticipoSalon.listo'])).toBeOnTheScreen();
      expect(consentimientosEnviados(abierta.llamadas)).toEqual([
        expect.objectContaining({ items: [expect.objectContaining({ hash: HASH_VIGENTE })], formulario: 'anticipo-cita' }),
      ]);
      expect(vecesEn(abierta, rutaAnticipoEnSalon())).toBe(1);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin anticipo: lo que se paga en el salón, sin política ni botones de pago',
    async () => {
      await abrirDetalle(conReglas(citaCruda()));
      expect(await screen.findByText(obtenerTexto('citas.formaPago.sinAnticipoPrecio', { precio: '$350' }))).toBeOnTheScreen();
      sinTextos(RESPALDO_TEXTOS['anticipos.enlacePolitica'], TEXTOS_DETALLE.botonSalon);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'solo con pago en el salón (Mercado Pago apagado): un 409 lo dice y recarga; una cita terminada sin anticipo no lleva forma de pago',
    async () => {
      const mensaje = 'Tienes un pago en línea en proceso para este anticipo. Espera su confirmación antes de cambiar a pago en el salón.';
      const abierta = await abrirDetalle(PENDIENTE, {
        ...rutaConfiguracionReserva({ mercadoPagoAnticipos: false }),
        [rutaAnticipoEnSalon()]: turnos(errorCon(409, mensaje)),
      });
      expect(screen.queryByRole('button', { name: TEXTOS_DETALLE.botonLinea })).not.toBeOnTheScreen();
      await marcarCasillaPolitica();
      await fireEvent.press(screen.getByRole('button', { name: TEXTOS_DETALLE.botonSalon }));
      expect(await screen.findByLabelText(mensaje)).toBeOnTheScreen();
      await waitFor(() => expect(vecesEn(abierta, `GET /api/citas/${ID_CITA}?propios=true`)).toBeGreaterThanOrEqual(2));
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'una cita completada sin anticipo no lleva la sección de forma de pago',
    async () => {
      await abrirDetalle(citaCruda({ estado: 'completada' }));
      sinTextos('Forma de pago', TEXTOS_DETALLE.botonSalon);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'el enlace "Leer la Política de anticipos y cancelación" abre el visor',
    async () => {
      const abierta = await abrirDetalle(PENDIENTE);
      await fireEvent.press(screen.getByRole('link', { name: RESPALDO_TEXTOS['anticipos.enlacePolitica'] }));
      await esperarRuta(abierta.app, '/legal/anticipos');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'cancelar con anticipo pagado: confirmar espera la política, dice si se devuelve y la hoja enlaza la política',
    async () => {
      const estado = enPausa();
      const abierta = await abrirDetalle(PAGADA, { [rutaEstadoAnticipo(PAGADA.id)]: turnos(estado.turno) });
      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar cita' }));
      expect(await screen.findByRole('header', { name: TITULO_HOJA })).toBeOnTheScreen();
      expect(screen.getByText(RESPALDO_TEXTOS['citas.detalle.cancelarRevisando'])).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('radio', { name: 'Cambio de planes' }));
      expect(ultimoBoton('Cancelar cita')).toBeDisabled();

      const hasta = masMinutos(AHORA, 3 * 24 * 60).toISOString();
      await estado.soltar(await estadoConPolitica({ reembolsable: true, reembolsableHasta: hasta, diasHabilesHastaCita: 12 })());
      expect(await screen.findByText(/te devolvemos completo tu anticipo de \$360/)).toBeOnTheScreen();
      expect(ultimoBoton('Cancelar cita')).toBeEnabled();
      expect(screen.getAllByRole('link', { name: RESPALDO_TEXTOS['anticipos.enlacePolitica'] }).length).toBeGreaterThan(0);
      expect(screen.getByRole('button', { name: 'Prefiero reprogramar' })).toBeOnTheScreen();
      expect(vecesEn(abierta, rutaCancelar(PAGADA.id))).toBe(0);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'mientras se cancela, el botón de pagar del detalle queda desactivado',
    async () => {
      const cancelar = enPausa();
      await abrirDetalle(PENDIENTE, { [rutaCancelar()]: turnos(cancelar.turno) });
      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar cita' }));
      expect(await screen.findByRole('header', { name: TITULO_HOJA })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('radio', { name: 'Cambio de planes' }));
      await fireEvent.press(ultimoBoton('Cancelar cita'));
      await waitFor(() => expect(screen.getByRole('button', { name: TEXTOS_DETALLE.botonLinea })).toBeDisabled());
      await cancelar.soltar(respuesta({ success: true, data: { ...PENDIENTE, estado: 'cancelada', motivoCancelacion: 'Cambio de planes' } }));
      await waitFor(() => expect(screen.queryByRole('header', { name: TITULO_HOJA })).not.toBeOnTheScreen());
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'dentro de las horas de aviso, la hoja no ofrece reprogramar',
    async () => {
      const pronto = masMinutos(AHORA, 5 * 60).toISOString();
      await abrirDetalle(conReglas(citaCruda({ fechaHoraInicio: pronto, fechaHoraFin: masMinutos(pronto, 45).toISOString() })));
      await fireEvent.press(screen.getByRole('button', { name: 'Cancelar cita' }));
      expect(await screen.findByRole('header', { name: TITULO_HOJA })).toBeOnTheScreen();
      expect(screen.getByText(new RegExp(`Faltan menos de ${horas(REGLAS_CITA.horasAvisoCancelarReagendar)}`))).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Prefiero reprogramar' })).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
