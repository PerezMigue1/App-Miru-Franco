/// <reference types="jest" />

import { act, renderHook, waitFor } from '@testing-library/react-native';
import { AppState } from 'react-native';

import { MENSAJE_SIN_CONEXION } from '@/features/auth/models/AuthModel';
import { MENSAJE_SESION_RESERVA } from '@/features/citas/models/consentimientosReserva';
import { useAnticipoViewModel } from '@/features/citas/viewmodels/useAnticipoViewModel';
import {
  useCitaConfirmadaViewModel,
  type AnticipoConfirmacion,
} from '@/features/citas/viewmodels/useCitaConfirmadaViewModel';
import { useDetalleCitaViewModel } from '@/features/citas/viewmodels/useDetalleCitaViewModel';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';
import { useReservarCitaViewModel } from '@/features/citas/viewmodels/useReservarCitaViewModel';

import {
  avisoEnSalonEsperado,
  citaCanceladaPorAnticipo,
  citaEnSalon,
  citaPagadaEnSalon,
  CLIENTA_CITAS,
  cuerpoCita,
  cuerpoErrorFiltro,
  DIA_CITA,
  disponibilidadesDe,
  ERRORES,
  errorVariasPorPagarEnSalon,
  estadoAnticipoCrudo,
  HOY,
  ID_CITA,
  isoMexico,
  llamadasDeRuta,
  pagoEnSalon,
  respuestaError,
  RUTA_CREAR_CITA,
  RUTA_RENOVAR_MOVIL,
  rutaCita,
  rutaEstadoAnticipo,
  rutaPreferencia,
  rutasDisponibilidad,
  SERVICIO_CON_ANTICIPO,
  SERVICIO_SIN_ANTICIPO,
  simularServidorMisCitas,
  usarRelojFijo,
  VENCE_EN_SALON_ISO,
  type CitaCruda,
  type CuerpoError,
  type EstadoAnticipoBackend,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { diaLegible, horaEnTelefono } from '../../helpers/pantallasReserva';
import { ESPECIALISTA_UNO, type ServicioCrudo } from '../../helpers/serviciosFicticios';
import { rutasConsentimientos } from '../../helpers/reservaFicticia';
import { sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';
import { respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import {
  authSimulada,
  cerrarConTemporizadores,
  diferida,
  enSecuencia,
  espiarAtras,
  reiniciarSimulaciones,
  routerSimulado as router,
  sinRed,
  type Salida,
} from '../../helpers/viewmodelsAuth';

/**
 * GP-06.5 (pago del anticipo en el salón), viewmodels con renderHook en caja blanca: apartar en el
 * salón con useReservarCitaViewModel (envío, doble toque entre botones, servicio sin anticipo y los
 * errores con su reintento), la confirmación, el detalle y la pantalla del anticipo de una cita en
 * el salón. Lo que ya prueban GP-06.2 y GP-06.3 no se repite. Solo se simulan fetch
 * (http://api.test), expo-router, useAuth, expo-web-browser, AppState y BackHandler; citaModel y
 * apiClient son los reales. Reloj fijo en AHORA; pasa con TZ=UTC y con TZ=America/Mexico_City.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

const UNO = ESPECIALISTA_UNO.usuarioId;
const RUTA_CONFIRMADA = `/cita-confirmada/${ID_CITA}`;
const RUTA_ANTICIPO_PAGAR = `/anticipo/${ID_CITA}?pagar=1`;

const ERROR_RESERVA = 'No pudimos reservar tu cita. Intenta de nuevo.';
// GP-07.4: los avisos de cancelar y del plazo salen del catálogo con la regla de la cita (estas citas
// no guardan reglas: las de omisión, 10 días de excepción y 5 de reembolso).
const RECOMENDACION = RESPALDO_TEXTOS['citas.cancelar.sinAnticipo'];
const AVISO_PAGADO = `${obtenerTexto('citas.cancelar.anticipoSinDatos', { anticipo: '$360', diasExcepcion: 10, diasReembolso: 5 })} ${RESPALDO_TEXTOS['citas.cancelar.reprogramar']}`;
const MENSAJE_VENCIDO = RESPALDO_TEXTOS['anticipos.liberada'];
const MENSAJE_NO_REVISO = 'No pudimos revisar tu pago. Si ya pagaste, no pagues de nuevo: toca Revisar mi pago.';

/** Plazo de citaEnSalon() (martes, 15 minutos antes de las 11:00 de México) en la hora del teléfono. */
const LIMITE_SALON = `antes del ${diaLegible(DIA_CITA)}, ${horaEnTelefono(VENCE_EN_SALON_ISO)}`;
const AVISO_SALON = avisoEnSalonEsperado(LIMITE_SALON);

// ── Andamiaje ────────────────────────────────────────────────────────────────────────────────

type Turno = () => Salida;

/** Cada llamada a la ruta toma el siguiente turno (el último se repite); puede ser una promesa. */
const turnos = (...salidas: Turno[]): Manejador => enSecuencia(...salidas) as unknown as Manejador;
const falla = (cuerpo: CuerpoError): Turno => () => respuestaError(cuerpo);
const citaComo = (cita: CitaCruda, status = 200): Turno => () => respuesta(cuerpoCita(cita), status);
/** Estado del anticipo de una cita en el salón, como lo manda GET /api/pagos-en-linea/citas/:id/estado. */
const estadoSalon = (estado: EstadoAnticipoBackend): Turno => () =>
  respuesta(estadoAnticipoCrudo(estado, { anticipoEnSalon: true, anticipoVenceEn: VENCE_EN_SALON_ISO }));

/** Disponibilidad de hoy y del martes para el alaciado y el corte. */
const RUTAS_HORARIOS = rutasDisponibilidad(
  [HOY, DIA_CITA].flatMap((dia) => [SERVICIO_CON_ANTICIPO, SERVICIO_SIN_ANTICIPO].flatMap((s) => disponibilidadesDe(dia, s))),
);

function servidor(rutas: Record<string, Manejador> = {}): Llamada[] {
  // GP-07.4: con anticipo, la reserva registra la Política de anticipos vigente antes de crear la cita.
  return simularServidorMisCitas({ ...rutasConsentimientos(), ...RUTAS_HORARIOS, ...rutas });
}

const veces = (llamadas: Llamada[], ruta: string) => llamadasDeRuta(llamadas, ruta).length;
const cuerposCrear = (llamadas: Llamada[]) =>
  llamadasDeRuta(llamadas, RUTA_CREAR_CITA).map((l) => l.cuerpo as Record<string, unknown>);

/** Corre una acción del viewmodel dentro de act. */
const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });

/**
 * GP-07.4: el paso Confirmar tiene un solo botón; antes de tocarlo, la clienta elige la opción y
 * marca la Política de anticipos (sin anticipo no cambian nada).
 */
async function confirmarCon(result: { current: ReturnType<typeof useReservarCitaViewModel> }, opcion: 'linea' | 'salon') {
  await hacer(() => {
    result.current.elegirOpcion(opcion);
    result.current.cambiarAceptaPolitica(true);
  });
  await hacer(() => result.current.confirmar());
}

/** Un turno que no responde hasta que la prueba lo suelta. */
function enPausa(): { turno: Turno; soltar: (r: Response) => Promise<void> } {
  const pendiente = diferida();
  return { turno: () => pendiente.promesa, soltar: (r) => act(async () => pendiente.soltar(r)) };
}

let atras: ReturnType<typeof espiarAtras>;
let espiaApp: jest.SpyInstance;

beforeEach(() => {
  reiniciarSimulaciones();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
  atras = espiarAtras();
  // El pago abre Mercado Pago y escucha el regreso a primer plano: el oyente no hace nada aquí.
  espiaApp = jest.spyOn(AppState, 'addEventListener').mockImplementation(() => ({ remove: jest.fn() }));
});

afterEach(() => {
  espiaApp.mockRestore();
  atras.restaurar();
});

// Sin avisos de act() ni errores en consola; al final se desmonta con los temporizadores falsos y
// después usarRelojFijo vuelve a los reales.
espiarConsola(cerrarConTemporizadores, true);
usarRelojFijo();

// ── useReservarCitaViewModel: apartar en el salón ────────────────────────────────────────────

/** Abre la reserva del servicio, elige a la especialista UNO, el martes y su primer horario. */
async function hastaConfirmar(servicio: ServicioCrudo = SERVICIO_CON_ANTICIPO) {
  const hook = await renderHook(() => useReservarCitaViewModel(String(servicio.id)));
  const r = hook.result;
  await waitFor(() => expect(r.current.estado).toBe('listo'));
  const uno = r.current.especialistas.find((e) => e.id === UNO);
  if (!uno) throw new Error('Sin la especialista UNO');
  await hacer(() => r.current.elegirEspecialista(uno));
  await waitFor(() => expect(r.current.estadoHorarios).toBe('listo'));
  await hacer(() => r.current.elegirDia(DIA_CITA));
  await waitFor(() => expect(r.current.estadoHorarios).toBe('listo'));
  const slot = r.current.disponibilidad?.slots[0];
  if (!slot) throw new Error('Sin horarios el martes');
  await hacer(() => r.current.elegirHorario(slot));
  return hook;
}

/**
 * Aparta en el salón con el primer POST respondiendo `primero`: revisa el mensaje y que el botón
 * quede libre; un segundo toque sí envía y llega a la confirmación.
 */
async function fallaYReintenta(primero: Turno, mensaje: string, rutas: Record<string, Manejador> = {}) {
  const llamadas = servidor({ [RUTA_CREAR_CITA]: turnos(primero, citaComo(citaEnSalon(), 201)), ...rutas });
  const { result } = await hastaConfirmar();
  await confirmarCon(result, 'salon');
  await waitFor(() => expect(result.current.errorEnvio).toBe(mensaje));
  expect(result.current).toMatchObject({ paso: 3, enviando: false, modoEnvio: null, horarioOcupado: false });
  expect(router.replace).not.toHaveBeenCalled();
  await hacer(() => result.current.confirmar());
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
  expect(result.current.errorEnvio).toBeNull();
  expect(cuerposCrear(llamadas).map((c) => c.pagoAnticipo)).toEqual(['salon', 'salon']);
  return llamadas;
}

describe('useReservarCitaViewModel: apartar y pagar en el salón', () => {
  it("mientras aparta: enviando y modoEnvio 'salon'; elegir pagar en línea no envía otra cita y al terminar va a la confirmación, nunca al anticipo", async () => {
    const post = enPausa();
    const llamadas = servidor({ [RUTA_CREAR_CITA]: turnos(post.turno) });
    const { result } = await hastaConfirmar();
    await confirmarCon(result, 'salon');
    expect(result.current).toMatchObject({ enviando: true, modoEnvio: 'salon', errorEnvio: null });
    // Mientras aparta, elegir pagar en línea y volver a tocar el botón no hacen nada.
    await hacer(() => result.current.elegirOpcion('linea'));
    await hacer(() => result.current.confirmar());
    expect(result.current).toMatchObject({ modoEnvio: 'salon', opcionPago: 'salon' });
    // La cita creada sigue pidiendo el anticipo (en el salón): aun así no se abre Mercado Pago.
    await post.soltar(respuesta(cuerpoCita(citaEnSalon()), 201));
    await waitFor(() => expect(router.replace).toHaveBeenCalledTimes(1));
    expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA);
    expect(cuerposCrear(llamadas)).toEqual([expect.objectContaining({ pagoAnticipo: 'salon' })]);
  });

  it('servicio sin anticipo con el botón único: no manda pagoAnticipo y va a la confirmación', async () => {
    const llamadas = servidor();
    const { result } = await hastaConfirmar(SERVICIO_SIN_ANTICIPO);
    expect(result.current.servicio?.anticipo).toBeNull();
    await hacer(() => result.current.confirmar());
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith(RUTA_CONFIRMADA));
    const [cuerpo] = cuerposCrear(llamadas);
    expect(cuerpo).not.toHaveProperty('pagoAnticipo');
    expect(cuerpo.servicioId).toBe(SERVICIO_SIN_ANTICIPO.id);
  });

  it.each<[string, Turno, string]>([
    ['la regla del salón apagada', falla(ERRORES.anticipoSalonNoPermitido), 'El anticipo se paga en línea.'],
    [
      'ya tiene 2 citas por pagar en el salón',
      falla(errorVariasPorPagarEnSalon(2)),
      'Ya tienes 2 citas por pagar en el salón. Paga su anticipo o elige pagar en línea.',
    ],
    ['el 503 genérico del servidor', falla(ERRORES.servicioNoDisponible), ERROR_RESERVA],
    ['un 409 genérico', falla(cuerpoErrorFiltro(409, 'Conflicto ficticio del servidor')), ERROR_RESERVA],
    ['sin red', sinRed, MENSAJE_SIN_CONEXION],
  ])('error al apartar en el salón (%s): errorEnvio exacto y se puede volver a intentar', async (_caso, primero, mensaje) => {
    await fallaYReintenta(primero, mensaje);
  });

  // GP-07.4: el mensaje ya no es el genérico; dice que la sesión terminó y qué hacer.
  it('sesión vencida al apartar: renueva una vez, el servidor la rechaza, la sesión se borra y se pide iniciar sesión de nuevo', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = await fallaYReintenta(falla(ERRORES.noAutorizado), MENSAJE_SESION_RESERVA, {
      [RUTA_RENOVAR_MOVIL]: turnos(falla(ERRORES.sesionVencida)),
    });
    expect(veces(llamadas, RUTA_RENOVAR_MOVIL)).toBe(1);
    expect(sesionGuardada()).toBeNull();
  });
});

// ── useCitaConfirmadaViewModel: cita en el salón ─────────────────────────────────────────────

async function abrirConfirmada(cita: CitaCruda, estado: Turno = estadoSalon('sin_pago')) {
  const llamadas = servidor({ [rutaCita()]: turnos(citaComo(cita)), [rutaEstadoAnticipo()]: turnos(estado) });
  const hook = await renderHook(() => useCitaConfirmadaViewModel(String(ID_CITA)));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return { ...hook, llamadas };
}

describe('useCitaConfirmadaViewModel: cita apartada en el salón', () => {
  it.each<[string, AnticipoConfirmacion, string | null, Turno]>([
    ["estado real 'sin_pago' (aún no paga en el salón)", 'pendiente', AVISO_SALON, estadoSalon('sin_pago')],
    ['error al consultar el estado', 'pendiente', AVISO_SALON, falla(ERRORES.interno)],
    ["estado real 'pendiente' (pagó en línea y se revisa)", 'enRevision', null, estadoSalon('pendiente')],
    ["estado real 'aprobado'", 'pagado', null, estadoSalon('aprobado')],
  ])('%s: anticipo %s, sin limite y el aviso del salón que corresponde', async (_caso, anticipo, avisoSalon, estado) => {
    const { result, llamadas } = await abrirConfirmada(citaEnSalon(), estado);
    expect(result.current).toMatchObject({ anticipo, limite: null, avisoSalon });
    expect(result.current.cita?.anticipoEnSalon).toBe(true);
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(1);
  });

  it('ya pagada en el salón: pagado, sin aviso ni limite y sin consultar el estado', async () => {
    const { result, llamadas } = await abrirConfirmada(citaPagadaEnSalon());
    expect(result.current).toMatchObject({ anticipo: 'pagado', limite: null, avisoSalon: null });
    expect(veces(llamadas, rutaEstadoAnticipo())).toBe(0);
  });

  it('pagar en línea desde la cita en el salón: un doble toque abre el anticipo con pagar=1 una sola vez', async () => {
    const { result } = await abrirConfirmada(citaEnSalon());
    await hacer(() => {
      result.current.pagarAnticipo();
      result.current.pagarAnticipo();
    });
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith(RUTA_ANTICIPO_PAGAR);
  });
});

// ── useDetalleCitaViewModel: cita en el salón ────────────────────────────────────────────────

async function abrirDetalle(cita: CitaCruda) {
  servidor({ [rutaCita()]: turnos(citaComo(cita)) });
  const hook = await renderHook(() => useDetalleCitaViewModel(String(ID_CITA)));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return hook;
}

describe('useDetalleCitaViewModel: cita en el salón', () => {
  it.each<[string, CitaCruda, string]>([
    ['sin pagar: recomienda reprogramar', citaEnSalon(), RECOMENDACION],
    ['pagada en el salón en efectivo: el anticipo de $360 no se devuelve', citaPagadaEnSalon(), AVISO_PAGADO],
    [
      'pagada y reembolsada (conserva anticipoPagadoEn): no dice que se pagó',
      citaPagadaEnSalon({ estado: 'cancelada', pagos: [pagoEnSalon({ estado: 'reembolsado' })] }),
      RECOMENDACION,
    ],
  ])('avisoCancelacion de una cita %s', async (_caso, cita, aviso) => {
    const { result } = await abrirDetalle(cita);
    expect(result.current.cita?.anticipoEnSalon).toBe(true);
    // Con anticipo pagado, el aviso final se arma al abrir la hoja con la política del backend
    // (aquí sin datos: el estado no trae `cancelacion`).
    await hacer(() => result.current.abrirCancelar());
    await waitFor(() => expect(result.current.avisoCancelacion).toBe(aviso));
  });

  it('sin pagar: el viewmodel arma para la vista el anticipo pendiente y el aviso con su plazo', async () => {
    const { result } = await abrirDetalle(citaEnSalon());
    expect(result.current.cita).toMatchObject({ anticipoEnSalon: true, anticipoVenceEn: VENCE_EN_SALON_ISO });
    const presentacion = result.current.presentacion;
    expect(presentacion?.insigniaAnticipo.texto).toBe('Anticipo pendiente');
    expect(presentacion?.cambios).toBe(true);
    // GP-07.4: el plazo del salón va en la forma de pago, sin la invitación a pagar en línea.
    expect(presentacion?.formaPago.avisos[0]).toContain(AVISO_SALON.replace(' También puedes pagarlo en línea.', ''));
  });
});

// ── useAnticipoViewModel: cita en el salón ───────────────────────────────────────────────────

async function abrirAnticipo(cita: CitaCruda, rutas: Record<string, Manejador> = {}, pagar = false) {
  const llamadas = servidor({ [rutaCita()]: turnos(citaComo(cita)), ...rutas });
  const hook = await renderHook(() => useAnticipoViewModel(String(ID_CITA), pagar));
  await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
  return { ...hook, llamadas };
}

describe('useAnticipoViewModel: cita en el salón', () => {
  it('cancelada por la barrida (anticipo_no_pagado) con el plazo vencido: cerrada, sin aviso del salón y sin abrir el pago', async () => {
    // Cita de hoy a las 10:10: su plazo en el salón (9:55) ya pasó.
    const cita = citaCanceladaPorAnticipo({ fechaHoraInicio: isoMexico(HOY, '10:10') });
    const { result, llamadas } = await abrirAnticipo(cita, {}, true);
    // Con la cita cerrada, AnticipoView no pinta limite; por eso aquí no se revisa.
    expect(result.current).toMatchObject({ pago: { tipo: 'cerrada', mensaje: MENSAJE_VENCIDO }, avisoSalon: null });
    expect(veces(llamadas, rutaPreferencia())).toBe(0);
  });

  it.each<[string, Turno, object]>([
    ["estado real 'sin_pago'", estadoSalon('sin_pago'), { tipo: 'noCompletado', enProceso: false }],
    ['error al revisar el pago', falla(ERRORES.interno), { tipo: 'errorRevision', mensaje: MENSAJE_NO_REVISO }],
  ])('intentó pagar en línea y vuelve (%s): el aviso del salón sigue, sin limite', async (_caso, estado, pago) => {
    const { result } = await abrirAnticipo(citaEnSalon(), { [rutaEstadoAnticipo()]: turnos(estado) });
    // GP-07.4: pagar con el botón pide antes la casilla de la Política de anticipos.
    await hacer(() => result.current.casilla.cambiar(true));
    await hacer(() => result.current.accionPrincipal());
    await waitFor(() => expect(result.current.pago).toEqual(pago));
    expect(result.current).toMatchObject({ avisoSalon: AVISO_SALON, limite: null });
  });
});
