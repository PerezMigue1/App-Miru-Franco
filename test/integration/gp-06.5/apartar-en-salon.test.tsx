/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import {
  avisoEnSalonEsperado,
  citaCanceladaPorAnticipo,
  citaDesdeCuerpo,
  citaEnSalon,
  citaPagadaEnSalon,
  cuerpoMisCitas,
  DIA_CITA,
  ID_CITA,
  INICIO_CITA_ISO,
  initPointFicticio,
  llamadasDeRuta,
  rutaPreferencia,
  RUTA_CREAR_CITA,
  RUTA_MIS_CITAS,
  SERVICIO_CON_ANTICIPO,
  VENCE_EN_SALON_ISO,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { abrirSesionSimulada } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirConCitas,
  abrirTarjeta,
  esperarTarjetas,
  revisarInsignias,
  verPestana,
  type TarjetaEsperada,
} from '../../helpers/pantallasMisCitas';
import {
  abrirReserva,
  AVISO_APARTADA,
  BOTON,
  diaLegible,
  esperarRuta,
  horaEnTelefono,
  llegarAlResumen,
  navegadorQuedaAbierto,
  prepararPruebasReserva,
  retener,
  revisarCheckout,
  revisarDatos,
  sinTextos,
  tocar,
  tocarYEsperar,
  vecesEn,
} from '../../helpers/pantallasReserva';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.5: apartar la cita y pagar el anticipo en el salón, con las pantallas reales, el reloj fijo
 * el lunes 19 de octubre de 2026 a las 10:00 de México y el servidor simulado. Lo que vive la clienta
 * de punta a punta: el paso 3 con los dos caminos, apartar sin abrir Mercado Pago, la confirmación
 * con la hora límite en el salón, la cita en Mis citas y su detalle, la pantalla del anticipo de una
 * cita apartada en el salón, y la cita ya pagada en efectivo o cancelada por no pagar a tiempo.
 */

/** Nota del paso 3 debajo de "Apartar y pagar en el salón". */
const NOTA_SALON =
  'Llega entre 20 y 15 minutos antes para pagarlo. Si a 15 minutos de tu cita no se ha pagado, se cancela.';

/** Hora límite de la cita del martes a las 11:00 de México pagando en el salón (10:45), en la hora del teléfono. */
const LIMITE_EN_SALON = `antes del ${diaLegible(DIA_CITA)}, ${horaEnTelefono(VENCE_EN_SALON_ISO)}`;
const AVISO_SALON = avisoEnSalonEsperado(LIMITE_EN_SALON);

/** Mensajes de la confirmación con el anticipo pendiente en línea (no deben salir en el salón). */
const MENSAJES_EN_LINEA = [
  'Tu cita está reservada',
  'Tu lugar queda apartado mientras pagas el anticipo.',
  'Págalo en línea o en el salón. Si no se paga a tiempo, el horario se libera.',
];

/** Lo común de la tarjeta del alaciado del martes a las 11:00 en Mis citas. */
const ALACIADO_DEL_MARTES = { servicio: 'Alaciado keratínico', dia: DIA_CITA, inicio: INICIO_CITA_ISO };

/**
 * La cita que se crea en la prueba también aparece en Mis citas: envuelve la creación del servidor
 * simulado para recordar la cita creada (citaDesdeCuerpo con id 501) y la lista la devuelve.
 */
function listaConLaCitaCreada(): { crear: (comoServidor: Manejador) => Manejador; rutas: Record<string, Manejador> } {
  let creadas: CitaCruda[] = [];
  return {
    crear: (comoServidor) => (cuerpo) => {
      creadas = [{ ...citaDesdeCuerpo(cuerpo), id: ID_CITA }];
      return comoServidor(cuerpo);
    },
    rutas: { [RUTA_MIS_CITAS]: () => respuesta(cuerpoMisCitas(creadas)) },
  };
}

describe('Apartar la cita y pagar el anticipo en el salón con las pantallas reales (GP-06.5)', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();

  it(
    '"Apartar y pagar en el salón" aparta sin abrir Mercado Pago (un doble toque crea una sola cita) y la cita llega a Mis citas y su detalle',
    async () => {
      const retenida = retener();
      const lista = listaConLaCitaCreada();
      const abierta = await abrirReserva(`/reservar/${SERVICIO_CON_ANTICIPO.id}`, {
        crear: (comoServidor) => retenida.envolver(lista.crear(comoServidor)),
        rutas: lista.rutas,
      });
      await llegarAlResumen();

      // Paso 3: el anticipo, los dos caminos y cuándo llegar al salón para pagarlo.
      revisarDatos({ Anticipo: '$360' });
      expect(screen.getByRole('button', { name: BOTON.pagarEnLinea })).toBeEnabled();
      expect(screen.getByText(NOTA_SALON)).toBeOnTheScreen();

      const apartar = screen.getByRole('button', { name: BOTON.apartarEnSalon });
      await fireEvent.press(apartar);
      await fireEvent.press(apartar);
      expect(await screen.findByRole('button', { name: 'Apartando…' })).toBeBusy();
      expect(screen.getByRole('button', { name: BOTON.pagarEnLinea })).toBeDisabled();
      expect(vecesEn(abierta, RUTA_CREAR_CITA)).toBe(1);
      await retenida.soltar();

      // Confirmación: horario apartado con la hora límite en el salón, en lugar del pago en línea.
      await esperarRuta(abierta.app, `/cita-confirmada/${ID_CITA}`);
      expect(await screen.findByRole('header', { name: 'Tu horario está apartado' })).toBeOnTheScreen();
      expect(screen.getByText(AVISO_SALON)).toBeOnTheScreen();
      expect(screen.getByLabelText('Anticipo: $360')).toBeOnTheScreen();
      revisarInsignias('Pendiente de pago');
      sinTextos(...MENSAJES_EN_LINEA, /^Paga antes/);
      const creaciones = llamadasDeRuta(abierta.llamadas, RUTA_CREAR_CITA);
      expect(creaciones).toHaveLength(1);
      expect(creaciones[0].cuerpo).toMatchObject({ servicioId: SERVICIO_CON_ANTICIPO.id, pagoAnticipo: 'salon' });
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      expect(vecesEn(abierta, rutaPreferencia())).toBe(0);

      // Mis citas: la tarjeta anuncia el anticipo pendiente, que se paga en el salón, y su plazo.
      await tocarYEsperar(abierta.app, BOTON.verMisCitas, '/mis-citas');
      const tarjeta: TarjetaEsperada = {
        ...ALACIADO_DEL_MARTES,
        estado: 'Pendiente',
        anticipo: 'Anticipo pendiente',
        enSalon: true,
        plazo: `Paga ${LIMITE_EN_SALON}`,
      };
      await esperarTarjetas([tarjeta]);

      // Detalle: el aviso del salón con su plazo, el monto y la opción de pagarlo en línea.
      await abrirTarjeta(abierta.app, ID_CITA, tarjeta);
      expect(screen.getByText(AVISO_SALON)).toBeOnTheScreen();
      expect(screen.getByLabelText('Anticipo: $360')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Pagar anticipo' })).toBeEnabled();
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'la pantalla del anticipo de una cita apartada en el salón dice hasta cuándo pagar allá y "Pagar anticipo" abre Mercado Pago',
    async () => {
      navegadorQuedaAbierto();
      const abierta = await abrirReserva(`/anticipo/${ID_CITA}`, { cita: citaEnSalon() });

      expect(await screen.findByRole('header', { name: 'Tu horario está apartado' })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Paga tu anticipo' })).toBeOnTheScreen();
      expect(screen.getByText(AVISO_SALON)).toBeOnTheScreen();
      expect(screen.getByLabelText('Anticipo a pagar: $360')).toBeOnTheScreen();
      revisarInsignias('Pendiente de pago');
      expect(screen.queryByRole('button', { name: 'Pagar con Mercado Pago' })).not.toBeOnTheScreen();
      sinTextos(AVISO_APARTADA, /^Paga antes/);
      // Sin ?pagar=1 no abre nada hasta que la clienta lo pide.
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();

      await tocar('Pagar anticipo');
      await waitFor(() => revisarCheckout(1, initPointFicticio()));
      expect(vecesEn(abierta, rutaPreferencia())).toBe(1);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, CitaCruda, 'Próximas' | 'Historial', string, string, string]>([
    [
      'ya pagada en efectivo en el salón',
      citaPagadaEnSalon(),
      'Próximas',
      'Confirmada',
      'Anticipo pagado',
      'Recibimos tu anticipo. Si reprogramas tu cita con aviso, tu anticipo se respeta.',
    ],
    [
      'cancelada porque el anticipo no se pagó a tiempo',
      citaCanceladaPorAnticipo(),
      'Historial',
      'Cancelada',
      'Anticipo vencido',
      'No recibimos tu anticipo a tiempo y el horario quedó libre.',
    ],
  ])(
    'una cita del salón %s ya no pide pagar: ni "Paga en salón" ni plazo en Mis citas ni en el detalle',
    async (_caso, cita, pestana, estado, anticipo, explicacion) => {
      const { app } = await abrirConCitas('/mis-citas', { citas: [cita] });
      if (pestana === 'Historial') {
        expect(await screen.findByRole('header', { name: 'Aquí verás tus próximas citas' })).toBeOnTheScreen();
        await verPestana('Historial');
      }
      const tarjeta: TarjetaEsperada = { ...ALACIADO_DEL_MARTES, estado, anticipo };
      await esperarTarjetas([tarjeta]);

      await abrirTarjeta(app, ID_CITA, tarjeta);
      revisarInsignias(estado, anticipo);
      expect(screen.getByLabelText('Anticipo: $360')).toBeOnTheScreen();
      expect(screen.getByText(explicacion)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Pagar anticipo' })).not.toBeOnTheScreen();
      sinTextos(/Paga tu anticipo en el salón/, /^Paga antes/, 'Paga en salón', 'anticipo_no_pagado');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
