/// <reference types="jest" />

import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { AccessibilityInfo, AppState } from 'react-native';

import {
  AHORA,
  CITA_CON_ANTICIPO,
  citaDesdeCuerpo,
  CLIENTA_CITAS,
  cuerpoCita,
  DIA_CITA,
  DIA_DOMINGO,
  diaDeLaSemana,
  disponibilidadesDe,
  estadoAnticipoCrudo,
  HOY,
  ID_CITA,
  rutaCita,
  RUTA_CREAR_CITA,
  rutasReserva,
  SERVICIO_CON_ANTICIPO,
  SERVICIO_SIN_ANTICIPO,
  horaLocalServidor,
  isoMexico,
  llamadasDeRuta,
  VENCE_ANTICIPO_ISO,
  type CitaCruda,
  type EstadoAnticipoBackend,
} from './citasFicticias';
import { abrirSesionSimulada } from './google';
import { RUTAS_DE_FONDO } from './datosClienta';
import { abrirApp, cerrarIntroSiAparece, prepararPruebasDePantalla, type App } from './pantallas';
import { enSecuencia } from './pantallasServicios';
import { CATALOGO_CRUDO, ESPECIALISTA_DOS, ESPECIALISTA_UNO, rutasServicios } from './serviciosFicticios';
import { respuesta, servidorConRutas, type Llamada, type Manejador } from './servidorSimulado';
import { sembrarSesion } from './sesionGuardada';

/**
 * Pasos comunes de las pruebas de integración de GP-06.2 (reservar cita con anticipo en línea) con
 * las pantallas reales: abrir la app con la sesión de CLIENTA_CITAS y el reloj fijo en AHORA, los
 * tres pasos de la reserva, el resumen, la confirmación y los regresos de Mercado Pago. Los textos
 * que dependen de la hora del teléfono (horas de la cita y plazo del anticipo) se calculan con la
 * zona con la que corre Jest; los días del calendario no dependen de ella.
 */

// ── Textos de la pantalla ────────────────────────────────────────────────────────────────────

/** accessibilityLabel del IndicadorPasos en cada paso. */
export const PASO = {
  especialista: 'Paso 1 de 3: Especialista',
  diaHora: 'Paso 2 de 3: Día y hora',
  confirmar: 'Paso 3 de 3: Confirmar',
} as const;

/** Tarjetas de la agenda: la primera con puesto (y foto), la segunda solo con su nombre. */
export const TARJETA_UNO = `${ESPECIALISTA_UNO.nombre}, Estilista`;
export const TARJETA_DOS = ESPECIALISTA_DOS.nombre;

/** Uñas acrílicas (id 3): sin precio ("0.00") y sin anticipo. */
export const SERVICIO_SIN_PRECIO = CATALOGO_CRUDO[2];

/** Botones del paso 3 y de la confirmación. */
export const BOTON = {
  confirmar: 'Confirmar cita',
  pagarEnLinea: 'Pagar anticipo con Mercado Pago',
  apartarEnSalon: 'Apartar y pagar en el salón',
  verMisCitas: 'Ver mis citas',
  volverAlInicio: 'Volver al inicio',
  volver: 'Volver',
} as const;

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

/** 'martes 20 de octubre' de un 'YYYY-MM-DD' de calendario (no depende de la zona). */
export function diaLegible(fecha: string): string {
  const [, mes, dia] = fecha.split('-').map(Number);
  return `${DIAS[diaDeLaSemana(fecha)]} ${dia} de ${MESES[mes - 1]}`;
}

/** 'Martes 20 de octubre': la fecha del resumen. */
export function diaConMayuscula(fecha: string): string {
  const texto = diaLegible(fecha);
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Texto del horario como lo manda el servidor (horaLocal): '11:00 a.m.' para las 11:00 de México. */
export function horaDelServidor(fecha: string, hora: string): string {
  return horaLocalServidor(isoMexico(fecha, hora));
}

/** Partes de un instante en la hora local del teléfono: '6:00 p. m.' y la hora de 0 a 23. */
function horaDelTelefono(iso: string): { texto: string; horas: number } {
  const fecha = new Date(iso);
  const horas = fecha.getHours();
  const hora12 = horas % 12 === 0 ? 12 : horas % 12;
  const minutos = String(fecha.getMinutes()).padStart(2, '0');
  return { texto: `${hora12}:${minutos} ${horas < 12 ? 'a. m.' : 'p. m.'}`, horas };
}

/** '11:00 a. m.' con la hora local del teléfono. */
export function horaEnTelefono(iso: string): string {
  return horaDelTelefono(iso).texto;
}

/** '11:00 a. m. a 11:45 a. m.' con la hora local del teléfono (ResumenCita). */
export function horarioEnTelefono(inicio: string, fin: string): string {
  return `${horaEnTelefono(inicio)} a ${horaEnTelefono(fin)}`;
}

/** 'YYYY-MM-DD' local de un instante. */
function diaLocal(fecha: Date): string {
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${fecha.getFullYear()}-${dos(fecha.getMonth() + 1)}-${dos(fecha.getDate())}`;
}

/**
 * "Paga antes de las 6:00 p. m." de un plazo que vence el mismo día local que AHORA, con 'la' para
 * la 1 y 'las' para las demás, en la hora local del teléfono.
 */
export function plazoEsperado(venceEn: string): string {
  if (diaLocal(new Date(venceEn)) !== diaLocal(AHORA)) {
    throw new Error('plazoEsperado solo arma plazos que vencen el mismo día que AHORA.');
  }
  const { texto, horas } = horaDelTelefono(venceEn);
  return `Paga antes de ${horas % 12 === 1 ? 'la' : 'las'} ${texto}`;
}

// ── Servidor ─────────────────────────────────────────────────────────────────────────────────

/** Lista de Mis citas (la pide la pantalla al llegar con "Ver mis citas"). */
export const RUTA_MIS_CITAS = 'GET /api/citas?propios=true&orden=fechaHoraInicio&limit=100';

/** Disponibilidad como el servidor de hoy, del martes y del domingo para los servicios de estas pruebas. */
const DISPONIBILIDADES = [SERVICIO_SIN_ANTICIPO, SERVICIO_CON_ANTICIPO, SERVICIO_SIN_PRECIO].flatMap(
  (servicio) => [HOY, DIA_CITA, DIA_DOMINGO].flatMap((fecha) => disponibilidadesDe(fecha, servicio)),
);

const simularServidor = servidorConRutas({
  ...RUTAS_DE_FONDO,
  ...rutasServicios(),
  ...rutasReserva({ disponibilidades: DISPONIBILIDADES }),
  [RUTA_MIS_CITAS]: () => respuesta({ success: true, count: 0, data: [] }),
});

export interface OpcionesReserva {
  /** Rutas de la prueba, encima de todo lo demás. */
  rutas?: Record<string, Manejador>;
  /** Lo que responde GET /api/citas/501 mientras no se crea ninguna cita (por omisión, CITA_CON_ANTICIPO). */
  cita?: CitaCruda;
  /** Envuelve la creación que imita al servidor (errores antes de crearla o respuesta retenida). */
  crear?: (comoServidor: Manejador) => Manejador;
  /** Con la apariencia oscura guardada. */
  oscuro?: boolean;
}

export interface PantallaReserva {
  app: App;
  /** Peticiones que recibió el servidor simulado (se van agregando durante la prueba). */
  llamadas: Llamada[];
  /** Cuántos oyentes de AppState había al abrir: los de esta prueba van después. */
  oyentesPrevios: number;
}

/**
 * Rutas de la cita con memoria: POST /api/citas crea la cita con lo que mandó la app
 * (citaDesdeCuerpo, id 501) y desde entonces GET /api/citas/501 la devuelve.
 */
function rutasDeCita(inicial: CitaCruda, crear: OpcionesReserva['crear']): Record<string, Manejador> {
  let actual = inicial;
  const comoServidor: Manejador = (cuerpo) => {
    actual = { ...citaDesdeCuerpo(cuerpo), id: ID_CITA };
    return respuesta(cuerpoCita(actual), 201);
  };
  return {
    [RUTA_CREAR_CITA]: crear ? crear(comoServidor) : comoServidor,
    [rutaCita()]: () => respuesta(cuerpoCita(actual)),
  };
}

function oyentesAppState(): jest.Mock {
  return AppState.addEventListener as unknown as jest.Mock;
}

/**
 * Abre la app real en la ruta con el reloj en AHORA (antes de sembrar la sesión y de renderRouter,
 * que conserva Date.now()), la sesión de CLIENTA_CITAS y el servidor de la reserva.
 */
export async function abrirReserva(ruta: string, opciones: OpcionesReserva = {}): Promise<PantallaReserva> {
  jest.useFakeTimers({ now: AHORA });
  if (opciones.oscuro) {
    await SecureStore.setItemAsync('preferencia_apariencia', 'oscuro');
  }
  await sembrarSesion(CLIENTA_CITAS);
  const oyentesPrevios = oyentesAppState().mock.calls.length;
  const llamadas = simularServidor({
    ...rutasDeCita(opciones.cita ?? CITA_CON_ANTICIPO, opciones.crear),
    ...opciones.rutas,
  });
  const app = await abrirApp(ruta);
  await cerrarIntroSiAparece();
  return { app, llamadas, oyentesPrevios };
}

/**
 * prepararPruebasDePantalla más el reinicio del navegador simulado (cancel por omisión) y del
 * movimiento reducido antes de cada prueba. Va dentro del describe.
 */
export function prepararPruebasReserva(): () => void {
  beforeEach(() => {
    abrirSesionSimulada().mockReset().mockResolvedValue({ type: 'cancel' });
    movimientoReducido(false);
  });
  return prepararPruebasDePantalla();
}

/** El sistema pide (o no) reducir el movimiento. */
export function movimientoReducido(activo: boolean): void {
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockImplementation(() => Promise.resolve(activo));
}

/**
 * Respuesta que no llega hasta soltar(): mientras tanto la pantalla sigue cargando o enviando. El
 * manejador envuelto entrega una promesa, que servidorConRutas pasa con Promise.resolve (la adopta).
 */
export interface Retenida {
  envolver: (manejador: Manejador) => Manejador;
  soltar: () => Promise<void>;
}

export function retener(): Retenida {
  let liberar: () => void = () => undefined;
  const llegada = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  return {
    envolver: (manejador) => (cuerpo) => llegada.then(() => manejador(cuerpo)) as unknown as Response,
    soltar: async () => {
      await act(async () => {
        liberar();
      });
    },
  };
}

// ── Pasos de la reserva ──────────────────────────────────────────────────────────────────────

/** Espera el paso indicado en el IndicadorPasos. */
export async function esperarPaso(paso: string): Promise<void> {
  expect(await screen.findByRole('header', { name: paso })).toBeOnTheScreen();
}

/** Espera la ruta indicada. */
export async function esperarRuta(app: App, ruta: string): Promise<void> {
  await waitFor(() => expect(app.getPathname()).toBe(ruta));
}

/** Toca el botón con ese nombre. */
export async function tocar(nombre: string): Promise<void> {
  await fireEvent.press(await screen.findByRole('button', { name: nombre }));
}

/** En el paso 1 toca la tarjeta de la especialista y espera el paso 2. */
export async function elegirEspecialista(tarjeta: string = TARJETA_UNO): Promise<void> {
  await esperarPaso(PASO.especialista);
  await tocar(tarjeta);
  await esperarPaso(PASO.diaHora);
}

/** Botón del calendario para ese día ('Hoy, lunes 19 de octubre' si es hoy). */
export function botonDia(fecha: string) {
  const legible = diaLegible(fecha);
  return screen.getByRole('button', { name: fecha === HOY ? `Hoy, ${legible}` : legible });
}

/** Toca ese día del calendario. */
export async function elegirDia(fecha: string): Promise<void> {
  await fireEvent.press(botonDia(fecha));
}

/** Toca el horario (hora de México) de ese día y espera el paso 3. */
export async function elegirHorario(fecha: string, hora: string): Promise<void> {
  await tocar(horaDelServidor(fecha, hora));
  await esperarPaso(PASO.confirmar);
}

export interface Eleccion {
  tarjeta?: string;
  fecha?: string;
  hora?: string;
}

/** De la elección de especialista al resumen: especialista, día (si no es hoy) y horario. */
export async function llegarAlResumen({
  tarjeta = TARJETA_UNO,
  fecha = DIA_CITA,
  hora = '11:00',
}: Eleccion = {}): Promise<void> {
  await elegirEspecialista(tarjeta);
  if (fecha !== HOY) {
    await elegirDia(fecha);
  }
  await elegirHorario(fecha, hora);
}

/** Cada dato visible por su accessibilityLabel "Etiqueta: valor". */
export function revisarDatos(datos: Record<string, string>): void {
  for (const [etiqueta, valor] of Object.entries(datos)) {
    expect(screen.getByLabelText(`${etiqueta}: ${valor}`)).toBeOnTheScreen();
  }
}

/** Ninguno de estos textos ni botones en la pantalla. */
export function sinTextos(...textos: (string | RegExp)[]): void {
  for (const texto of textos) {
    expect(screen.queryByText(texto)).not.toBeOnTheScreen();
  }
}

/** Toca el botón y espera la ruta. */
export async function tocarYEsperar(app: App, nombre: string, ruta: string): Promise<void> {
  await tocar(nombre);
  await esperarRuta(app, ruta);
}

// ── Anticipo y Mercado Pago ──────────────────────────────────────────────────────────────────

/** El navegador de Mercado Pago queda abierto: openAuthSessionAsync no regresa. */
export function navegadorQuedaAbierto(): void {
  abrirSesionSimulada().mockReturnValueOnce(new Promise(() => undefined));
}

/** No hay navegador: openAuthSessionAsync falla. */
export function navegadorFalla(): void {
  abrirSesionSimulada().mockRejectedValueOnce(new Error('Sin navegador ficticio'));
}

/**
 * Respaldo del regreso sin deep link: la app pasa a segundo plano y vuelve a estar activa. Avisa a
 * los oyentes de AppState que se registraron en esta prueba.
 */
export async function appVuelveAPrimerPlano(abierta: PantallaReserva): Promise<void> {
  const oyentes = oyentesAppState()
    .mock.calls.slice(abierta.oyentesPrevios)
    .filter(([evento]) => evento === 'change')
    .map(([, oyente]) => oyente as (estado: string) => void);
  expect(oyentes.length).toBeGreaterThan(0);
  for (const estado of ['background', 'active']) {
    await act(async () => {
      for (const oyente of oyentes) {
        oyente(estado);
      }
    });
  }
}

/** Mercado Pago se abrió con la initPoint indicada y el regreso a la app. */
export function revisarCheckout(veces: number, initPoint: string): void {
  const abrir = abrirSesionSimulada();
  expect(abrir).toHaveBeenCalledTimes(veces);
  for (const llamada of abrir.mock.calls) {
    expect(llamada).toEqual([initPoint, 'appmirufranco://anticipo']);
  }
}

/** GET /api/pagos-en-linea/citas/501/estado responde con ese estado del backend. */
export function conEstado(estado: EstadoAnticipoBackend): Manejador {
  return () => respuesta(estadoAnticipoCrudo(estado));
}

/** GET /api/citas/501 responde con cada cita en orden (la última se repite). */
export function citasEnOrden(...citas: CitaCruda[]): Manejador {
  return enSecuencia(...citas.map((cita) => () => respuesta(cuerpoCita(cita))));
}

/** Espera la pantalla del anticipo de la cita 501 con su título y el monto. */
export async function esperarPantallaDePago(abierta: PantallaReserva): Promise<void> {
  await esperarRuta(abierta.app, `/anticipo/${ID_CITA}`);
  expect(await screen.findByRole('header', { name: 'Paga tu anticipo' })).toBeOnTheScreen();
  expect(await screen.findByLabelText('Anticipo a pagar: $360')).toBeOnTheScreen();
}

/**
 * Reserva el alaciado (con anticipo) a las 11:00 del martes con "Pagar anticipo con Mercado Pago"
 * y espera la pantalla del anticipo, que llega con ?pagar=1 y abre el checkout sola. Es el único
 * camino a ?pagar=1: +native-intent.tsx lo quita de cualquier URL que llegue de fuera.
 */
export async function reservarYPagar(opciones: OpcionesReserva = {}): Promise<PantallaReserva> {
  const abierta = await abrirReserva(`/reservar/${SERVICIO_CON_ANTICIPO.id}`, opciones);
  await llegarAlResumen();
  await tocar(BOTON.pagarEnLinea);
  await esperarPantallaDePago(abierta);
  return abierta;
}

/** La cita sigue por pagar: insignia, plazo del anticipo y aviso de que se cancela sola. */
export function revisarPagoPendiente(): void {
  expect(screen.getByLabelText('Estado: Pendiente de pago')).toBeOnTheScreen();
  expect(screen.getByLabelText(plazoEsperado(VENCE_ANTICIPO_ISO))).toBeOnTheScreen();
  expect(screen.getByText(AVISO_APARTADA)).toBeOnTheScreen();
}

/** Introducción de la pantalla del anticipo. */
export const AVISO_APARTADA =
  'Tu cita queda apartada mientras pagas. Si el anticipo no se paga a tiempo, la cita se cancela sola.';

/** Cuántas peticiones recibió el servidor en esa ruta "MÉTODO /ruta". */
export function vecesEn(abierta: PantallaReserva, ruta: string): number {
  return llamadasDeRuta(abierta.llamadas, ruta).length;
}
