/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import {
  admiteCambios,
  estadoAnticipo,
  etiquetaEstadoAnticipo,
  mensajeReprogramacion,
  motivoCancelacionParaClienta,
} from '@/features/citas/models/citaModel';
import { ApiError } from '@/shared/api/apiClient';

import {
  AHORA,
  AYER,
  citaConAnticipo,
  citaCruda,
  citaNormalizada,
  conError,
  cuerpoError,
  DIA_CITA,
  disponibilidadCruda,
  horaLocalServidor,
  ID_CITA,
  isoMexico,
  masMinutos,
  MENSAJES_BACKEND,
  rutaDisponibilidad,
  SERVICIO_SIN_ANTICIPO,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirReserva,
  esperarRuta,
  prepararPruebasReserva,
  RUTA_MIS_CITAS,
  sinTextos,
  tocar,
  vecesEn,
  type OpcionesReserva,
  type PantallaReserva,
} from '../../helpers/pantallasReserva';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.3: pruebas de regresión de las correcciones de Mis citas, cada una en rojo con el código
 * anterior. Las del modelo llaman a citaModel directo; las de pantalla abren la app real con
 * renderRouter, la sesión de CLIENTA_CITAS, el reloj fijo en AHORA y fetch simulado
 * (http://api.test).
 *
 * C. Una cita que el backend canceló porque el anticipo no se pagó a tiempo (motivoCancelacion
 *    'anticipo_no_pagado') sale como "Anticipo vencido" y el motivo se explica en palabras de la
 *    clienta; una vigente con el plazo vencido no ofrece pagar.
 * D. Los 400 de reprogramar por aviso mínimo y por horario que ya pasó dan un mensaje propio, y el
 *    horario pasado se limpia y recarga la disponibilidad.
 * E. Mis citas abierta sin pantalla anterior regresa a Perfil, de donde se abre.
 * F. Una cita que ya empezó no admite cambios aunque siga pendiente (como la web): sin Reprogramar
 *    ni Cancelar.
 * G. En una cita ya cancelada por anticipo no pagado, la explicación dice que el horario quedó libre
 *    y no que "se libera".
 */

const MOTIVO_DEL_SISTEMA = 'anticipo_no_pagado';
const MOTIVO_PARA_CLIENTA = 'No recibimos tu anticipo a tiempo y el horario quedó libre.';
const EXPLICACION_VENCIDO = 'El plazo para pagar el anticipo terminó. Sin el pago, el horario se libera.';
const EXPLICACION_VENCIDO_CANCELADA =
  'El plazo para pagar el anticipo terminó. Como el anticipo no llegó a tiempo, el horario quedó libre.';
const EXPLICACION_LIBERADA = 'La cita se canceló antes de pagar el anticipo, así que no hay nada que pagar.';
const MOTIVO_DE_LA_CLIENTA = 'Me surgió un viaje';

/** Cita con anticipo que el backend canceló al vencer el plazo sin pago. */
const CANCELADA_SIN_PAGO = citaConAnticipo({ estado: 'cancelada', motivoCancelacion: MOTIVO_DEL_SISTEMA });
/** Cita pendiente cuyo plazo venció hace 10 minutos (la barrida todavía no la cancela). */
const VIGENTE_VENCIDA = citaConAnticipo({ anticipoVenceEn: masMinutos(AHORA, -10).toISOString() });

const AVISO_CON_HORAS = (horas: number) =>
  `Para reagendar con menos de ${horas} horas de anticipación, comunícate con el salón.`;
const HORARIO_PASADO = 'Ese horario ya pasó. Elige otro.';
const ERROR_GENERICO = 'No pudimos cambiar tu cita. Intenta de nuevo en un momento.';

const error400 = (mensaje: string) => new ApiError(400, mensaje);

// ── C. Modelo ────────────────────────────────────────────────────────────────────────────────

describe('C. Anticipo no pagado a tiempo (modelo)', () => {
  it('la cita cancelada por el backend con anticipo_no_pagado tiene el anticipo vencido', () => {
    const cita = citaNormalizada({ estado: 'cancelada', motivoCancelacion: MOTIVO_DEL_SISTEMA });
    expect(estadoAnticipo(cita, AHORA)).toBe('vencido');
    expect(etiquetaEstadoAnticipo(estadoAnticipo(cita, AHORA)).texto).toBe('Anticipo vencido');
  });

  it('una cancelación de la clienta sin pago sigue como anticipo liberado', () => {
    const cita = citaNormalizada({ estado: 'cancelada', motivoCancelacion: MOTIVO_DE_LA_CLIENTA });
    expect(estadoAnticipo(cita, AHORA)).toBe('liberada');
  });

  it('motivoCancelacionParaClienta traduce el motivo del sistema y deja igual los demás', () => {
    expect(motivoCancelacionParaClienta(citaNormalizada({ motivoCancelacion: MOTIVO_DEL_SISTEMA }))).toBe(
      MOTIVO_PARA_CLIENTA,
    );
    expect(motivoCancelacionParaClienta(citaNormalizada({ motivoCancelacion: MOTIVO_DE_LA_CLIENTA }))).toBe(
      MOTIVO_DE_LA_CLIENTA,
    );
    expect(motivoCancelacionParaClienta(citaNormalizada({ motivoCancelacion: null }))).toBeNull();
  });
});

// ── D. Modelo ────────────────────────────────────────────────────────────────────────────────

describe('D. Mensajes de reprogramar (modelo)', () => {
  it.each([
    ['con 24 horas', AVISO_CON_HORAS(24), AVISO_CON_HORAS(24)],
    ['con 1 hora', AVISO_CON_HORAS(1), 'Para reagendar con menos de 1 hora de anticipación, comunícate con el salón.'],
    ['con texto de más del servidor', `${AVISO_CON_HORAS(6)} (regla del salón)`, AVISO_CON_HORAS(6)],
    [
      'sin número de horas',
      'Para reagendar con menos de  horas de anticipación, comunícate con el salón.',
      'Para reagendar con tan poco tiempo, comunícate con el salón.',
    ],
    ['horario que ya pasó', MENSAJES_BACKEND.horarioPasado, HORARIO_PASADO],
  ])('400 %s', (_caso, delServidor, esperado) => {
    expect(mensajeReprogramacion(error400(delServidor))).toBe(esperado);
  });

  it('cualquier otro 400 sigue en el mensaje genérico', () => {
    expect(mensajeReprogramacion(error400('La fecha de fin debe ser posterior a la de inicio'))).toBe(ERROR_GENERICO);
  });
});

// ── F. Modelo ────────────────────────────────────────────────────────────────────────────────

/** Cita pendiente que empezó ayer a las 11:00 de México y nadie cerró. */
const PENDIENTE_DE_AYER = citaCruda({
  fechaHoraInicio: isoMexico(AYER, '11:00'),
  fechaHoraFin: isoMexico(AYER, '11:45'),
});

describe('F. Una cita que ya empezó no admite cambios (modelo)', () => {
  it.each<[string, string, boolean]>([
    ['pendiente de ayer', isoMexico(AYER, '11:00'), false],
    ['confirmada que empezó hace 10 minutos', masMinutos(AHORA, -10).toISOString(), false],
    ['que empieza justo ahora', AHORA.toISOString(), false],
    ['que empieza en 10 minutos', masMinutos(AHORA, 10).toISOString(), true],
    ['de mañana', isoMexico(DIA_CITA, '11:00'), true],
    ['con inicio que no se puede leer', 'no es fecha', false],
  ])('cita %s: admite cambios %p', (_caso, fechaHoraInicio, esperado) => {
    const cita = citaNormalizada({ estado: 'confirmada', fechaHoraInicio });
    expect(admiteCambios(cita, AHORA)).toBe(esperado);
  });
});

// ── Pantallas ────────────────────────────────────────────────────────────────────────────────

/** GET de la lista de Mis citas con esas citas. */
function lista(...citas: CitaCruda[]): NonNullable<OpcionesReserva['rutas']> {
  return { [RUTA_MIS_CITAS]: () => respuesta({ success: true, count: citas.length, data: citas }) };
}

/**
 * Etiqueta de la única tarjeta de la lista (el Pressable anuncia todo en ella); empieza con el
 * servicio, a diferencia de "Reservar lo mismo" del historial.
 */
async function etiquetaDeTarjeta(): Promise<string> {
  const tarjeta = await screen.findByRole('button', { name: /^Alaciado keratínico, / });
  return String(tarjeta.props.accessibilityLabel);
}

describe('Pantallas de Mis citas', () => {
  const revisarConsola = prepararPruebasReserva();

  describe('C. Anticipo vencido en la lista y en el detalle', () => {
    it(
      'lista: la vigente con el plazo vencido sale como "Anticipo vencido" sin plazo para pagar',
      async () => {
        await abrirReserva('/mis-citas', { rutas: lista(VIGENTE_VENCIDA) });
        const etiqueta = await etiquetaDeTarjeta();
        expect(etiqueta).toContain('Pendiente, Anticipo vencido');
        expect(etiqueta).not.toMatch(/Paga antes/);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'lista: la cancelada por anticipo no pagado sale en Historial como "Anticipo vencido"',
      async () => {
        await abrirReserva('/mis-citas', { rutas: lista(CANCELADA_SIN_PAGO) });
        expect(await screen.findByText('Aquí verás tus próximas citas')).toBeOnTheScreen();
        await fireEvent.press(screen.getByRole('tab', { name: 'Historial' }));
        const etiqueta = await etiquetaDeTarjeta();
        expect(etiqueta).toContain('Cancelada, Anticipo vencido');
        expect(etiqueta).not.toMatch(/Anticipo liberado/);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'detalle: la cancelada por anticipo no pagado explica el plazo y el motivo sin texto técnico',
      async () => {
        await abrirReserva(`/cita/${ID_CITA}`, { cita: CANCELADA_SIN_PAGO });
        expect(await screen.findByLabelText('Estado: Anticipo vencido')).toBeOnTheScreen();
        expect(screen.getByLabelText('Estado: Cancelada')).toBeOnTheScreen();
        // G: ya canceló el backend, así que el horario quedó libre (no "se libera").
        expect(screen.getByText(EXPLICACION_VENCIDO_CANCELADA)).toBeOnTheScreen();
        expect(screen.getByRole('header', { name: 'Motivo de la cancelación' })).toBeOnTheScreen();
        expect(screen.getByText(MOTIVO_PARA_CLIENTA)).toBeOnTheScreen();
        sinTextos(MOTIVO_DEL_SISTEMA, 'Anticipo liberado', EXPLICACION_LIBERADA, /el horario se libera/);
        expect(screen.queryByRole('button', { name: 'Pagar anticipo' })).not.toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'detalle: la vigente con el plazo vencido explica el plazo y no ofrece pagar',
      async () => {
        await abrirReserva(`/cita/${ID_CITA}`, { cita: VIGENTE_VENCIDA });
        expect(await screen.findByLabelText('Estado: Anticipo vencido')).toBeOnTheScreen();
        expect(screen.getByText(EXPLICACION_VENCIDO)).toBeOnTheScreen();
        expect(screen.queryByRole('button', { name: 'Pagar anticipo' })).not.toBeOnTheScreen();
        sinTextos(/Paga antes/);
        expect(screen.getByRole('button', { name: 'Reprogramar' })).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'detalle: el motivo que escribió la clienta se muestra igual y el anticipo sale liberado',
      async () => {
        await abrirReserva(`/cita/${ID_CITA}`, {
          cita: citaConAnticipo({ estado: 'cancelada', motivoCancelacion: MOTIVO_DE_LA_CLIENTA }),
        });
        expect(await screen.findByLabelText('Estado: Anticipo liberado')).toBeOnTheScreen();
        expect(screen.getByText(MOTIVO_DE_LA_CLIENTA)).toBeOnTheScreen();
        expect(screen.getByText(EXPLICACION_LIBERADA)).toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('D. Reprogramar con un 400 que no se arregla reintentando', () => {
    const RUTA_HORARIOS = rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, DIA_CITA, SERVICIO_SIN_ANTICIPO.id);
    const RUTA_REPROGRAMAR = `PATCH /api/citas/${ID_CITA}/reprogramar?propios=true`;
    const HORARIOS = disponibilidadCruda({
      servicioId: SERVICIO_SIN_ANTICIPO.id,
      duracionMinutos: SERVICIO_SIN_ANTICIPO.duracionMinutos,
    });
    const NUEVA_HORA = horaLocalServidor(isoMexico(DIA_CITA, '12:30'));

    /** Abre la reprogramación de la cita sin anticipo, elige las 12:30 y confirma. */
    async function confirmarCambioCon(mensaje: string): Promise<PantallaReserva> {
      const abierta = await abrirReserva(`/cita/${ID_CITA}/reprogramar`, {
        cita: citaCruda(),
        rutas: {
          [RUTA_HORARIOS]: () => respuesta(HORARIOS),
          [RUTA_REPROGRAMAR]: conError(cuerpoError(400, mensaje)),
        },
      });
      await tocar(NUEVA_HORA);
      await tocar('Confirmar cambio');
      return abierta;
    }

    it(
      'horario que ya pasó: mensaje propio, se limpia el horario y se recargan los horarios',
      async () => {
        const abierta = await confirmarCambioCon(MENSAJES_BACKEND.horarioPasado);
        expect(await screen.findByText(HORARIO_PASADO)).toBeOnTheScreen();
        await waitFor(() => expect(vecesEn(abierta, RUTA_HORARIOS)).toBe(2));
        expect(await screen.findByRole('button', { name: NUEVA_HORA })).not.toBeSelected();
        expect(screen.getByRole('button', { name: 'Confirmar cambio' })).toBeDisabled();
        sinTextos(ERROR_GENERICO, MENSAJES_BACKEND.horarioPasado);
        expect(vecesEn(abierta, RUTA_REPROGRAMAR)).toBe(1);
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'aviso mínimo para reagendar: mensaje para comunicarse con el salón, sin invitar a reintentar',
      async () => {
        const abierta = await confirmarCambioCon(`${AVISO_CON_HORAS(24)} (regla del salón)`);
        expect(await screen.findByText(AVISO_CON_HORAS(24))).toBeOnTheScreen();
        sinTextos(ERROR_GENERICO);
        expect(vecesEn(abierta, RUTA_REPROGRAMAR)).toBe(1);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('F. Cita pendiente que ya empezó', () => {
    it(
      'detalle: sigue como Pendiente pero no ofrece Reprogramar ni Cancelar',
      async () => {
        await abrirReserva(`/cita/${ID_CITA}`, { cita: PENDIENTE_DE_AYER });
        expect(await screen.findByLabelText('Estado: Pendiente')).toBeOnTheScreen();
        expect(screen.queryByRole('button', { name: 'Reprogramar' })).not.toBeOnTheScreen();
        expect(screen.queryByRole('button', { name: 'Cancelar cita' })).not.toBeOnTheScreen();
        revisarConsola();
      },
      LIMITE_MS,
    );

    it(
      'reprogramar abierta directo: avisa que ya no se puede reprogramar y no pide horarios',
      async () => {
        const abierta = await abrirReserva(`/cita/${ID_CITA}/reprogramar`, { cita: PENDIENTE_DE_AYER });
        expect(await screen.findByText('Esta cita ya no se puede reprogramar')).toBeOnTheScreen();
        expect(abierta.llamadas.filter((l) => l.ruta.startsWith('/api/citas/disponibilidad'))).toEqual([]);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('E. Volver desde Mis citas', () => {
    it(
      'abierta sin pantalla anterior, Volver lleva a Perfil',
      async () => {
        const { app } = await abrirReserva('/mis-citas');
        expect(await screen.findByText('Aquí verás tus próximas citas')).toBeOnTheScreen();
        await tocar('Volver');
        await esperarRuta(app, '/perfil');
        revisarConsola();
      },
      LIMITE_MS,
    );
  });
});
