/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen, waitFor } from 'expo-router/testing-library';

import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import {
  CITA_CON_ANTICIPO,
  conError,
  cuerpoCita,
  cuerpoError,
  DIA_CITA,
  DIA_DOMINGO,
  disponibilidadCerrada,
  disponibilidadComoServidor,
  disponibilidadCruda,
  disponibilidadesDe,
  ERRORES,
  HOY,
  isoMexico,
  llamadasDeRuta,
  masMinutos,
  MENSAJES_BACKEND,
  rutaCita,
  rutaDisponibilidad,
  RUTA_CREAR_CITA,
  RUTA_RENOVAR_MOVIL,
  SERVICIO_CON_ANTICIPO,
  SERVICIO_SIN_ANTICIPO,
  sinRedEnRuta,
  type DisponibilidadCruda,
} from '../../helpers/citasFicticias';
import { abrirSesionSimulada } from '../../helpers/google';
import {
  rutaCalendario,
  SALON_ABRE_DIARIO,
  TEXTO_CERRADO,
  type OpcionesCalendario,
} from '../../helpers/calendarioFicticio';
import { LIMITE_MS, type App } from '../../helpers/pantallas';
import {
  abrirReserva,
  BOTON,
  elegirDia,
  elegirEspecialista,
  elegirHorario,
  esperarPaso,
  esperarRuta,
  horaDelServidor,
  llegarAlResumen,
  PASO,
  prepararPruebasReserva,
  sinTextos,
  tocar,
  vecesEn,
} from '../../helpers/pantallasReserva';
import { enSecuencia, errorDelServidor } from '../../helpers/pantallasServicios';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { sesionGuardada } from '../../helpers/sesionGuardada';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.2: lo que ve la clienta cuando algo sale mal al reservar, con las pantallas reales y el
 * servidor simulado: el horario se ocupó (400 del backend, no 409), otros errores al confirmar, días
 * sin horarios o cerrados, la sesión que vence a mitad del flujo, sin red en los horarios y errores
 * al cargar el pago del anticipo o la confirmación. Nunca se muestra el texto técnico del servidor.
 */

const OCUPADO = 'Ese horario se acaba de ocupar. Elige otro.';
const ERROR_RESERVA = 'No pudimos reservar tu cita. Intenta de nuevo.';
const SIN_CONEXION = 'Sin conexión. Revisa tu internet e intenta de nuevo';
const SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';

/** Disponibilidad del corte (servicio 1) con la primera especialista ese día. */
function rutaCorte(fecha: string): string {
  return rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, fecha, SERVICIO_SIN_ANTICIPO.id);
}

function conDisponibilidad(disponibilidad: DisponibilidadCruda): Manejador {
  return () => respuesta(disponibilidad);
}

/** El corte del martes con la primera especialista, como lo calcula el servidor. */
function corteDelMartes(ocupadas: { inicio: string; fin: string }[] = []): DisponibilidadCruda {
  return disponibilidadComoServidor({
    fecha: DIA_CITA,
    duracionMinutos: SERVICIO_SIN_ANTICIPO.duracionMinutos,
    especialistaId: ESPECIALISTA_UNO.usuarioId,
    servicioId: SERVICIO_SIN_ANTICIPO.id,
    ocupadas,
  });
}

describe('Errores y conflictos al reservar con las pantallas reales (GP-06.2)', () => {
  // La configuración que siembra una prueba se queda en memoria: cada prueba empieza con el respaldo.
  beforeEach(reiniciarConfiguracionPublica);
  const esperarConsolaLimpia = prepararPruebasReserva();

  it(
    'horario ocupado (400 del backend): regresa a Día y hora, recarga sin ese horario y deja reservar otro',
    async () => {
      const inicioOcupado = isoMexico(DIA_CITA, '11:00');
      const ocupada = { inicio: inicioOcupado, fin: masMinutos(inicioOcupado, 45).toISOString() };
      const abierta = await abrirReserva('/reservar/1', {
        crear: (comoServidor) => enSecuencia(conError(ERRORES.horarioOcupado), comoServidor),
        rutas: {
          [rutaCorte(DIA_CITA)]: enSecuencia(
            conDisponibilidad(corteDelMartes()),
            conDisponibilidad(corteDelMartes([ocupada])),
          ),
        },
      });
      await llegarAlResumen();

      await tocar(BOTON.confirmar);
      await esperarPaso(PASO.diaHora);
      expect(await screen.findByText(OCUPADO)).toBeOnTheScreen();
      expect(await screen.findByRole('button', { name: horaDelServidor(DIA_CITA, '12:00') })).toBeOnTheScreen();
      expect(vecesEn(abierta, rutaCorte(DIA_CITA))).toBe(2);
      sinTextos(horaDelServidor(DIA_CITA, '11:00'), horaDelServidor(DIA_CITA, '10:30'), /cita #/);

      await elegirHorario(DIA_CITA, '12:00');
      sinTextos(OCUPADO);
      await tocar(BOTON.confirmar);
      await esperarRuta(abierta.app, '/cita-confirmada/501');
      expect(await screen.findByRole('header', { name: 'Tu cita está reservada' })).toBeOnTheScreen();
      const creaciones = llamadasDeRuta(abierta.llamadas, RUTA_CREAR_CITA);
      expect(creaciones).toHaveLength(2);
      expect(creaciones[1].cuerpo).toMatchObject({ fechaHoraInicio: isoMexico(DIA_CITA, '12:00') });
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string, string]>([
    ['un 409 cualquiera', conError(cuerpoError(409, 'Conflicto ficticio del servidor')), ERROR_RESERVA, 'Conflicto ficticio del servidor'],
    [
      'el 400 de anticipo en línea no disponible (corrección GP-06.2, tal cual)',
      conError(ERRORES.anticipoEnLineaNoDisponible),
      MENSAJES_BACKEND.anticipoEnLineaNoDisponible,
      'Bad Request',
    ],
    ['un 500', conError(ERRORES.interno), ERROR_RESERVA, MENSAJES_BACKEND.interno],
    ['la red caída', sinRedEnRuta, SIN_CONEXION, 'Network request failed'],
  ])(
    'al confirmar con %s se queda en el paso 3 con su mensaje y sin el texto técnico',
    async (_caso, falla, mensaje, tecnico) => {
      const abierta = await abrirReserva(`/reservar/${SERVICIO_CON_ANTICIPO.id}`, { rutas: { [RUTA_CREAR_CITA]: falla } });
      await llegarAlResumen();

      await tocar(BOTON.pagarEnLinea);
      expect(await screen.findByText(mensaje)).toBeOnTheScreen();
      sinTextos(tecnico, OCUPADO);
      expect(screen.getByRole('header', { name: PASO.confirmar })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: BOTON.pagarEnLinea })).toBeEnabled();
      expect(abierta.app.getPathname()).toBe('/reservar/2');
      expect(abrirSesionSimulada()).not.toHaveBeenCalled();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  // GP-07.3: con la configuración del respaldo el domingo ya no se puede elegir (lo prueban
  // test/unit/gp-07.3/calendario-*); para seguir probando el motivo que manda el backend de un día
  // cerrado, esa fila siembra una configuración con el salón abierto los siete días.
  it.each<[string, string, DisponibilidadCruda | null, string, string, OpcionesCalendario | null]>([
    [
      'sin horarios libres',
      DIA_CITA,
      disponibilidadCruda({ ...corteDelMartes(), slots: [] }),
      'No hay horarios libres este día',
      'Prueba con otro día.',
      null,
    ],
    [
      'el domingo, con el salón cerrado',
      DIA_DOMINGO,
      null,
      MENSAJES_BACKEND.salonCerrado,
      'Elige otro día.',
      SALON_ABRE_DIARIO,
    ],
    [
      'un día cerrado sin motivo',
      DIA_CITA,
      disponibilidadCerrada({ ...corteDelMartes(), abierto: false, slots: [], motivo: null }),
      TEXTO_CERRADO,
      'Elige otro día.',
      null,
    ],
  ])(
    '%s lo dice y no ofrece horarios',
    async (_caso, fecha, disponibilidad, titulo, sugerencia, configuracion) => {
      await abrirReserva('/reservar/1', {
        rutas: {
          ...(configuracion ? rutaCalendario(configuracion) : {}),
          ...(disponibilidad ? { [rutaCorte(fecha)]: conDisponibilidad(disponibilidad) } : {}),
        },
      });
      await elegirEspecialista();
      await elegirDia(fecha);

      expect(await screen.findByText(titulo)).toBeOnTheScreen();
      expect(screen.getByText(sugerencia)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /m\.$/ })).not.toBeOnTheScreen();
      expect(screen.getByRole('header', { name: PASO.diaHora })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si la sesión vence a mitad del flujo (401 y la renovación también 401) queda en Inicio sin sesión y con el aviso',
    async () => {
      const abierta = await abrirReserva('/reservar/1', {
        rutas: {
          [RUTA_CREAR_CITA]: conError(ERRORES.noAutorizado),
          [RUTA_RENOVAR_MOVIL]: conError(ERRORES.sesionVencida),
        },
      });
      await llegarAlResumen();

      await tocar(BOTON.confirmar);
      await esperarRuta(abierta.app, '/inicio');
      expect(await screen.findByText(SESION_TERMINADA)).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Cerrar aviso' })).toBeOnTheScreen();
      expect(sesionGuardada()).toBeNull();
      expect(vecesEn(abierta, RUTA_CREAR_CITA)).toBe(1);
      const renovaciones = llamadasDeRuta(abierta.llamadas, RUTA_RENOVAR_MOVIL);
      expect(renovaciones).toHaveLength(1);
      expect(renovaciones[0].cuerpo).toEqual({ refreshToken: expect.stringMatching(/^refresh-ficticio-guardado-/) });
      sinTextos(ERROR_RESERVA, MENSAJES_BACKEND.sesionVencida, MENSAJES_BACKEND.noAutorizado);
      expect(screen.queryByRole('header', { name: PASO.confirmar })).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin red al cargar los horarios dice "Sin conexión" y "Reintentar" los carga',
    async () => {
      const abierta = await abrirReserva('/reservar/1', {
        rutas: {
          [rutaCorte(HOY)]: enSecuencia(sinRedEnRuta, conDisponibilidad(disponibilidadesDe(HOY, SERVICIO_SIN_ANTICIPO)[0])),
        },
      });
      await elegirEspecialista();

      expect(await screen.findByText(SIN_CONEXION)).toBeOnTheScreen();
      await tocar('Reintentar');
      expect(await screen.findByRole('button', { name: horaDelServidor(HOY, '10:30') })).toBeOnTheScreen();
      sinTextos(SIN_CONEXION);
      expect(vecesEn(abierta, rutaCorte(HOY))).toBe(2);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, string, Manejador, string, string, string, (app: App) => Promise<void>]>([
    [
      'el pago del anticipo falla (500)',
      '/anticipo/501',
      enSecuencia(errorDelServidor, () => respuesta(cuerpoCita(CITA_CON_ANTICIPO))),
      'No pudimos cargar tu cita',
      'Revisa tu conexión e intenta de nuevo.',
      'Reintentar',
      async () => {
        expect(await screen.findByLabelText('Anticipo a pagar: $360')).toBeOnTheScreen();
      },
    ],
    [
      'la confirmación falla (500)',
      '/cita-confirmada/501',
      enSecuencia(errorDelServidor, () => respuesta(cuerpoCita(CITA_CON_ANTICIPO))),
      'No pudimos cargar tu cita',
      'Tu reserva no se pierde. Revisa tu conexión e intenta de nuevo.',
      'Reintentar',
      async () => {
        expect(await screen.findByRole('header', { name: 'Tu cita está reservada' })).toBeOnTheScreen();
      },
    ],
    [
      'el pago del anticipo no encuentra la cita (404)',
      '/anticipo/501',
      conError(ERRORES.citaNoEncontrada),
      'No encontramos esta cita',
      'Puede que ya no esté disponible. Revisa tus citas para ver su estado.',
      BOTON.verMisCitas,
      (app) => esperarRuta(app, '/mis-citas'),
    ],
    [
      'la confirmación no encuentra la cita (404)',
      '/cita-confirmada/501',
      conError(ERRORES.citaNoEncontrada),
      'No encontramos esta cita',
      'Revisa tus citas para ver su estado.',
      BOTON.verMisCitas,
      (app) => esperarRuta(app, '/mis-citas'),
    ],
  ])(
    'si %s lo dice y su botón sigue',
    async (_caso, ruta, cita, titulo, mensaje, boton, despues) => {
      const abierta = await abrirReserva(ruta, { rutas: { [rutaCita()]: cita } });

      expect(await screen.findByRole('header', { name: titulo })).toBeOnTheScreen();
      expect(screen.getByText(mensaje)).toBeOnTheScreen();
      sinTextos(MENSAJES_BACKEND.citaNoEncontrada, 'Error interno ficticio');
      await tocar(boton);
      await despues(abierta.app);
      await waitFor(() => expect(screen.queryByRole('header', { name: titulo })).not.toBeOnTheScreen());
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
