/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen } from 'expo-router/testing-library';

import {
  conError,
  DIA_CITA,
  ERRORES,
  errorVariasPorPagarEnSalon,
  ID_CITA,
  llamadasDeRuta,
  MENSAJES_BACKEND,
  RUTA_CREAR_CITA,
  RUTA_RENOVAR_MOVIL,
  SERVICIO_CON_ANTICIPO,
  SERVICIO_SIN_ANTICIPO,
  sinRedEnRuta,
  type CuerpoError,
} from '../../helpers/citasFicticias';
import { abrirSesionSimulada } from '../../helpers/google';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirReserva,
  BOTON,
  esperarRuta,
  horaDelServidor,
  llegarAlResumen,
  PASO,
  prepararPruebasReserva,
  revisarDatos,
  sinTextos,
  tocar,
  vecesEn,
  type OpcionesReserva,
  type PantallaReserva,
} from '../../helpers/pantallasReserva';
import { enSecuencia } from '../../helpers/pantallasServicios';
import type { Manejador } from '../../helpers/servidorSimulado';
import { sesionGuardada } from '../../helpers/sesionGuardada';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.5: lo que ve la clienta cuando no se puede apartar la cita para pagar el anticipo en el
 * salón, con las pantallas reales y el servidor simulado: los 400 del backend con su mensaje claro
 * (sin invitar a reintentar), el 503 y la falta de red con reintento, la sesión vencida y el servicio
 * que no pide anticipo porque la configuración no lo aplica. Nunca sale el texto técnico del servidor.
 */

const NOTAS = 'Traigo foto de referencia';
const NOTA_SALON =
  'Llega entre 20 y 15 minutos antes para pagarlo. Si a 15 minutos de tu cita no se ha pagado, se cancela.';
const ERROR_RESERVA = 'No pudimos reservar tu cita. Intenta de nuevo.';
const SIN_CONEXION = 'Sin conexión. Revisa tu internet e intenta de nuevo';
const SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';

/** Textos técnicos de los cuerpos de error (campo `error` del filtro, el 503 y la red caída). */
const TECNICOS = [
  'Solicitud inválida',
  'Bad Request',
  'Servicio no disponible',
  MENSAJES_BACKEND.servicioNoDisponible,
  'Network request failed',
];

/** Abre la reserva del alaciado (con anticipo), llega al paso 3, escribe notas y toca apartar en el salón. */
async function apartarEnSalon(opciones: OpcionesReserva): Promise<PantallaReserva> {
  const abierta = await abrirReserva(`/reservar/${SERVICIO_CON_ANTICIPO.id}`, opciones);
  await llegarAlResumen();
  await fireEvent.changeText(screen.getByLabelText('Notas para el salón (opcional)'), NOTAS);
  await tocar(BOTON.apartarEnSalon);
  return abierta;
}

/**
 * La clienta sigue en el paso 3 con lo que eligió y escribió, los dos botones disponibles otra vez,
 * sin Mercado Pago abierto y sin texto técnico.
 */
function sigueEnElPaso3(abierta: PantallaReserva): void {
  expect(screen.getByRole('header', { name: PASO.confirmar })).toBeOnTheScreen();
  expect(abierta.app.getPathname()).toBe(`/reservar/${SERVICIO_CON_ANTICIPO.id}`);
  revisarDatos({ Servicio: 'Alaciado keratínico', Hora: horaDelServidor(DIA_CITA, '11:00'), Anticipo: '$360' });
  expect(screen.getByDisplayValue(NOTAS)).toBeOnTheScreen();
  expect(screen.getByText(NOTA_SALON)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: BOTON.apartarEnSalon })).toBeEnabled();
  expect(screen.getByRole('button', { name: BOTON.pagarEnLinea })).toBeEnabled();
  expect(abrirSesionSimulada()).not.toHaveBeenCalled();
  sinTextos(...TECNICOS);
}

/** Cuerpos que recibió POST /api/citas: todos con el pago en el salón y las notas. */
function revisarCreaciones(abierta: PantallaReserva, veces: number): void {
  const creaciones = llamadasDeRuta(abierta.llamadas, RUTA_CREAR_CITA);
  expect(creaciones).toHaveLength(veces);
  for (const { cuerpo } of creaciones) {
    expect(cuerpo).toMatchObject({ servicioId: SERVICIO_CON_ANTICIPO.id, pagoAnticipo: 'salon', notas: NOTAS });
  }
}

describe('Errores al apartar la cita para pagar el anticipo en el salón (GP-06.5)', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();

  it.each<[string, CuerpoError]>([
    ['el salón apagó el pago en el salón', ERRORES.anticipoSalonNoPermitido],
    ['esta cita solo admite el pago en línea', ERRORES.soloEnLinea],
    ['ya no da tiempo de pagar en el salón', ERRORES.sinTiempoSalon],
    ['ya tiene una cita por pagar en el salón', ERRORES.unaPorPagarEnSalon],
    ['ya tiene 2 citas por pagar en el salón', errorVariasPorPagarEnSalon(2)],
  ])(
    'si %s, el 400 sale tal cual en el paso 3, sin invitar a reintentar, y la clienta conserva sus datos',
    async (_caso, error) => {
      const abierta = await apartarEnSalon({ rutas: { [RUTA_CREAR_CITA]: conError(error) } });

      expect(await screen.findByText(String(error.message))).toBeOnTheScreen();
      sigueEnElPaso3(abierta);
      sinTextos(/intenta de nuevo/i, ERROR_RESERVA);
      revisarCreaciones(abierta, 1);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string]>([
    ['un 503 del servidor', conError(ERRORES.servicioNoDisponible), ERROR_RESERVA],
    ['la red caída', sinRedEnRuta, SIN_CONEXION],
  ])(
    'con %s dice que no pudo y el segundo toque aparta la cita y llega a la confirmación',
    async (_caso, falla, mensaje) => {
      const abierta = await apartarEnSalon({ crear: (comoServidor) => enSecuencia(falla, comoServidor) });

      expect(await screen.findByText(mensaje)).toBeOnTheScreen();
      sigueEnElPaso3(abierta);

      await tocar(BOTON.apartarEnSalon);
      await esperarRuta(abierta.app, `/cita-confirmada/${ID_CITA}`);
      expect(await screen.findByRole('header', { name: 'Tu horario está apartado' })).toBeOnTheScreen();
      sinTextos(mensaje, ...TECNICOS);
      revisarCreaciones(abierta, 2);
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si la sesión venció al apartar (401 y la renovación rechazada) la cierra y lleva a Inicio con el aviso, sin texto técnico',
    async () => {
      const abierta = await apartarEnSalon({
        rutas: {
          [RUTA_CREAR_CITA]: conError(ERRORES.noAutorizado),
          [RUTA_RENOVAR_MOVIL]: conError(ERRORES.sesionVencida),
        },
      });

      await esperarRuta(abierta.app, '/inicio');
      expect(await screen.findByText(SESION_TERMINADA)).toBeOnTheScreen();
      expect(sesionGuardada()).toBeNull();
      revisarCreaciones(abierta, 1);
      expect(vecesEn(abierta, RUTA_RENOVAR_MOVIL)).toBe(1);
      sinTextos(MENSAJES_BACKEND.sesionVencida, MENSAJES_BACKEND.noAutorizado, ERROR_RESERVA, 'SESION_VENCIDA');
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con anticipoMonto pero anticipoAplica en false (sin anticipos configurados) solo ofrece "Confirmar cita" y no manda pagoAnticipo',
    async () => {
      // El corte de dama trae anticipoMonto '105.00' con anticipoAplica en false.
      const abierta = await abrirReserva(`/reservar/${SERVICIO_SIN_ANTICIPO.id}`);
      await llegarAlResumen();

      expect(screen.getByRole('button', { name: BOTON.confirmar })).toBeEnabled();
      expect(screen.queryByRole('button', { name: BOTON.apartarEnSalon })).not.toBeOnTheScreen();
      sinTextos(NOTA_SALON);

      await tocar(BOTON.confirmar);
      await esperarRuta(abierta.app, `/cita-confirmada/${ID_CITA}`);
      expect(await screen.findByRole('header', { name: 'Tu cita está reservada' })).toBeOnTheScreen();
      const [creacion] = llamadasDeRuta(abierta.llamadas, RUTA_CREAR_CITA);
      expect(creacion.cuerpo).not.toHaveProperty('pagoAnticipo');
      sinTextos('Tu horario está apartado', /Paga tu anticipo en el salón/);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
