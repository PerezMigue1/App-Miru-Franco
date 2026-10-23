/// <reference types="jest" />

import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { TestInstance } from 'test-renderer';

import { consecuenciaNoAsistir, conUnidad, reglasDeCita } from '@/features/citas/models/formaPagoModel';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  AHORA,
  citaCruda,
  cuerpoCita,
  cuerpoMisCitas,
  DIA_CITA,
  DIA_SABADO,
  HOY,
  ID_CITA,
  isoMexico,
  MIS_CITAS_CRUDAS,
  RETENIDO_EN_ISO,
  rutaCancelar,
  rutaCita,
  rutaReprogramar,
  RUTA_MIS_CITAS,
  simularServidorMisCitas,
  VENCE_ANTICIPO_ISO,
  type CitaCruda,
} from './citasFicticias';
import { abrirApp, cerrarIntroSiAparece, ultimoBoton, type App } from './pantallas';
import {
  abrirReserva,
  diaConMayuscula,
  esperarRuta,
  horaEnTelefono,
  plazoEsperado,
  type PantallaReserva,
} from './pantallasReserva';
import { enSecuencia, errorDelServidor } from './pantallasServicios';
import { ESPECIALISTA_UNO } from './serviciosFicticios';
import { respuesta, type Llamada, type Manejador } from './servidorSimulado';

/**
 * Pasos comunes de las pruebas de integración de GP-06.3 (Mis citas, detalle, cancelar y
 * reprogramar) con las pantallas reales: el servidor con memoria de las citas de la clienta, abrir
 * la app con sesión (o sin ella) y el reloj en AHORA, leer las tarjetas por su accessibilityLabel y
 * manejar la hoja de cancelar. Las horas que dependen del teléfono se calculan con la zona con la
 * que corre Jest (horaEnTelefono); los días, con fechas de calendario (diaConMayuscula).
 */

// ── Textos del catálogo (GP-07.4) ────────────────────────────────────────────────────────────

/**
 * Lo que ve la clienta en Mis citas y el detalle con el catálogo de respaldo y las reglas de omisión
 * (las citas ficticias no guardan reglas).
 */
export const TEXTOS_DETALLE = {
  /** Título de la lista de próximas vacía (citas.lista.vacia). */
  listaVacia: RESPALDO_TEXTOS['citas.lista.vacia'],
  /** Etiqueta del monto del anticipo en la forma de pago. */
  etiquetaAnticipo: RESPALDO_TEXTOS['citas.formaPago.anticipoEtiqueta'],
  botonLinea: RESPALDO_TEXTOS['anticipos.botonMercadoPago'],
  botonSalon: RESPALDO_TEXTOS['anticipos.botonSalon'],
  pagado: RESPALDO_TEXTOS['anticipos.pagado'],
  /** Qué pasa si no llega, con las reglas de omisión. */
  consecuencia: consecuenciaNoAsistir(reglasDeCita(null)),
  /** Casilla obligatoria de la Política de anticipos. */
  casilla: RESPALDO_TEXTOS['citas.politicaAnticipos.casilla'],
  /** Anticipo no pagado a tiempo (la barrida canceló la cita). */
  liberada: RESPALDO_TEXTOS['anticipos.liberada'],
  /** Confirmación con el anticipo pendiente en línea: las dos formas de pago y el plazo de omisión. */
  pendienteConfirmacion: obtenerTexto('anticipos.pendiente', {
    formasPago: 'en línea o en el salón',
    plazoAnticipo: conUnidad(reglasDeCita(null).plazoAnticipoHoras, 'hora', 'horas'),
  }),
} as const;

/** Marca la casilla de la Política de anticipos (antes de pagar con el botón o cambiar a pago en el salón). */
export async function marcarCasillaPolitica(): Promise<void> {
  await fireEvent.press(screen.getByRole('checkbox', { name: TEXTOS_DETALLE.casilla }));
}

/** Plazo del anticipo en el salón en la forma de pago del detalle, con el límite en el teléfono. */
export function plazoSalonEnDetalle(limite: string, minutos = reglasDeCita(null).minutosAntesPagoSalon): string {
  return `${obtenerTexto('citas.anticipoSalon.plazo', { limite, minutosAntesPagoSalon: minutos })} ${RESPALDO_TEXTOS['anticipos.salonSeLibera']}`;
}

/** "Anticipo para apartar tu cita: $360" del detalle. */
export const etiquetaMontoAnticipo = (monto: string) => `${TEXTOS_DETALLE.etiquetaAnticipo}: ${monto}`;

// ── Citas de la lista ────────────────────────────────────────────────────────────────────────

/** Corte de dama de hoy a las 9:30 de México que ya empezó (en curso): sin anticipo ni cambios. */
export const CITA_EN_CURSO: CitaCruda = citaCruda({
  id: 505,
  estado: 'en_curso',
  fechaHoraInicio: isoMexico(HOY, '09:30'),
  fechaHoraFin: isoMexico(HOY, '10:15'),
});

/** Lo de MIS_CITAS_CRUDAS más la cita en curso: los cinco estados que ve la clienta en la lista. */
export const CITAS_DE_LA_LISTA: CitaCruda[] = [...MIS_CITAS_CRUDAS, CITA_EN_CURSO];

/** La cita con id de la lista (falla si no está). */
export function citaDeLista(id: number): CitaCruda {
  const cita = CITAS_DE_LA_LISTA.find((c) => c.id === id);
  if (!cita) {
    throw new Error(`No hay cita ${id} en CITAS_DE_LA_LISTA.`);
  }
  return cita;
}

// ── Servidor con memoria ─────────────────────────────────────────────────────────────────────

/**
 * Rutas de Mis citas que recuerdan los cambios, como el backend: la lista y el detalle devuelven la
 * cita como quedó; reprogramar la deja 'reprogramada' en el horario recibido; cancelar responde la
 * cita cancelada con el motivo y, como el backend, marca después el pago aprobado como retenido
 * (retenidoEn), así que solo la siguiente lectura del detalle lo trae.
 */
export function rutasConMemoria(citas: CitaCruda[] = CITAS_DE_LA_LISTA): Record<string, Manejador> {
  const actuales = new Map(citas.map((cita) => [cita.id, cita]));
  const rutas: Record<string, Manejador> = {
    [RUTA_MIS_CITAS]: () => respuesta(cuerpoMisCitas([...actuales.values()])),
  };
  for (const { id } of citas) {
    const guardar = (cita: CitaCruda) => {
      actuales.set(id, cita);
      return cita;
    };
    const actual = () => actuales.get(id) as CitaCruda;
    rutas[rutaCita(id)] = () => respuesta(cuerpoCita(actual()));
    rutas[rutaReprogramar(id)] = (cuerpo) => {
      const { fechaHoraInicio, fechaHoraFin } = cuerpo as { fechaHoraInicio: string; fechaHoraFin: string };
      return respuesta(cuerpoCita(guardar({ ...actual(), estado: 'reprogramada', fechaHoraInicio, fechaHoraFin })));
    };
    rutas[rutaCancelar(id)] = (cuerpo) => {
      const { motivoCancelacion } = cuerpo as { motivoCancelacion: string };
      const cancelada: CitaCruda = { ...actual(), estado: 'cancelada', motivoCancelacion };
      guardar({
        ...cancelada,
        pagos: cancelada.pagos.map((pago) => (pago.estado === 'aprobado' ? { ...pago, retenidoEn: RETENIDO_EN_ISO } : pago)),
      });
      return respuesta(cuerpoCita(cancelada));
    };
  }
  return rutas;
}

export type Rutas = Record<string, Manejador>;

/** GET de la cita que la primera vez falla con un 500 y después la devuelve (para Reintentar). */
export function citaTrasUnError(id: number = ID_CITA): Manejador {
  return enSecuencia(errorDelServidor, () => respuesta(cuerpoCita(citaDeLista(id))));
}

export interface OpcionesMisCitas {
  /** Citas de la clienta en el servidor con memoria (por omisión, CITAS_DE_LA_LISTA). */
  citas?: CitaCruda[];
  /**
   * Rutas de la prueba, encima del servidor con memoria. Como función recibe las rutas con memoria,
   * para envolver alguna (por ejemplo, un error antes de la respuesta que sí guarda el cambio).
   */
  rutas?: Rutas | ((memoria: Rutas) => Rutas);
  /** Con la apariencia oscura guardada. */
  oscuro?: boolean;
}

/**
 * Abre la app real en la ruta con la sesión de CLIENTA_CITAS, el reloj en AHORA y el servidor con
 * memoria de sus citas (más todo lo de la reserva de fondo).
 */
export function abrirConCitas(ruta: string, opciones: OpcionesMisCitas = {}): Promise<PantallaReserva> {
  const memoria = rutasConMemoria(opciones.citas);
  const encima = typeof opciones.rutas === 'function' ? opciones.rutas(memoria) : opciones.rutas;
  return abrirReserva(ruta, { rutas: { ...memoria, ...encima }, oscuro: opciones.oscuro });
}

/** Abre la app real en la ruta sin sesión (la bienvenida ya vista) y con el reloj en AHORA. */
export async function abrirSinSesion(ruta: string): Promise<{ app: App; llamadas: Llamada[] }> {
  jest.useFakeTimers({ now: AHORA });
  await SecureStore.setItemAsync('bienvenida_vista', '1');
  const llamadas = simularServidorMisCitas({});
  const app = await abrirApp(ruta);
  await cerrarIntroSiAparece();
  return { app, llamadas };
}

// ── Mis citas ────────────────────────────────────────────────────────────────────────────────

/** accessibilityHint de cada tarjeta de la lista (lo que la distingue de "Reservar lo mismo"). */
const PISTA_TARJETA = 'Abre el detalle de la cita';

/** accessibilityLabel de cada tarjeta, en el orden de la lista. */
export function etiquetasDeTarjetas(): string[] {
  return screen.queryAllByHintText(PISTA_TARJETA).map((tarjeta) => String(tarjeta.props.accessibilityLabel));
}

export interface TarjetaEsperada {
  servicio: string;
  /** Día de calendario de la cita (sus horas caen el mismo día en México y en UTC). */
  dia: string;
  inicio: string;
  estado: string;
  /** Insignia del anticipo, si la cita lo pide. */
  anticipo?: string;
  /** El anticipo pendiente se paga en el salón. */
  enSalon?: boolean;
  /** Plazo para pagar el anticipo pendiente. */
  plazo?: string;
  /** La cita no trae especialista (por omisión, ESPECIALISTA_UNO). */
  sinEspecialista?: boolean;
}

/** La etiqueta que debe anunciar la tarjeta: servicio, especialista, fecha, hora e insignias. */
export function etiquetaTarjeta(tarjeta: TarjetaEsperada): string {
  const { servicio, dia, inicio, estado, anticipo, enSalon, plazo, sinEspecialista } = tarjeta;
  return [
    servicio,
    sinEspecialista ? '' : `con ${ESPECIALISTA_UNO.nombre}`,
    `${diaConMayuscula(dia)}, ${horaEnTelefono(inicio)}`,
    estado,
    anticipo,
    enSalon ? 'Paga en salón' : '',
    plazo,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Lo que anuncia la tarjeta de cada cita de CITAS_DE_LA_LISTA. */
export const TARJETAS = {
  /** Alaciado del martes con el anticipo por pagar antes de las 12:00 de México. */
  501: {
    servicio: 'Alaciado keratínico',
    dia: DIA_CITA,
    inicio: citaDeLista(501).fechaHoraInicio,
    estado: 'Pendiente',
    anticipo: 'Anticipo pendiente',
    plazo: plazoEsperado(VENCE_ANTICIPO_ISO),
  },
  /** Alaciado del sábado ya pagado. */
  502: {
    servicio: 'Alaciado keratínico',
    dia: DIA_SABADO,
    inicio: citaDeLista(502).fechaHoraInicio,
    estado: 'Confirmada',
    anticipo: 'Anticipo pagado',
  },
  /** Corte del 10 de octubre ya terminado. */
  503: { servicio: 'Corte de dama', dia: '2026-10-10', inicio: citaDeLista(503).fechaHoraInicio, estado: 'Completada' },
  /** Alaciado del 12 de octubre cancelado antes de pagar. */
  504: {
    servicio: 'Alaciado keratínico',
    dia: '2026-10-12',
    inicio: citaDeLista(504).fechaHoraInicio,
    estado: 'Cancelada',
    anticipo: 'Anticipo liberado',
  },
  /** Corte de hoy en curso. */
  505: { servicio: 'Corte de dama', dia: HOY, inicio: CITA_EN_CURSO.fechaHoraInicio, estado: 'En curso' },
} satisfies Record<number, TarjetaEsperada>;

export type IdLista = keyof typeof TARJETAS;

/** Espera la lista ya cargada con esas tarjetas, en ese orden. */
export async function esperarTarjetas(esperadas: TarjetaEsperada[]): Promise<void> {
  await waitFor(() => expect(etiquetasDeTarjetas()).toEqual(esperadas.map(etiquetaTarjeta)));
}

/** Ancho del control Próximas/Historial en un teléfono de 390 puntos con sus márgenes. */
const ANCHO_CONTROL = 358;

/**
 * Toca la pestaña Próximas o Historial y la deja seleccionada. Antes le da al control su medida,
 * como en el teléfono (el renderizador de pruebas no mide), para que dibuje el indicador.
 */
export async function verPestana(nombre: 'Próximas' | 'Historial'): Promise<void> {
  const [control] = screen.container.queryAll((nodo) => nodo.props.accessibilityRole === 'tablist');
  await fireEvent(control, 'layout', { nativeEvent: { layout: { x: 0, y: 0, width: ANCHO_CONTROL, height: 48 } } });
  await fireEvent.press(screen.getByRole('tab', { name: nombre }));
  expect(screen.getByRole('tab', { name: nombre })).toBeSelected();
}

/** Toca la tarjeta de esa cita en la lista (por omisión, la de TARJETAS) y espera su detalle. */
export async function abrirTarjeta(
  app: App,
  id: number,
  tarjeta: TarjetaEsperada = TARJETAS[id as IdLista],
): Promise<void> {
  await fireEvent.press(await screen.findByRole('button', { name: etiquetaTarjeta(tarjeta) }));
  await esperarDetalle(app, id);
}

/**
 * La clienta desliza hacia abajo para actualizar la lista: el ScrollView simulado no dibuja su
 * RefreshControl, así que se llama al onRefresh que recibió, como lo haría el gesto. Solo cuenta la
 * lista de la pantalla visible: Inicio (que también se actualiza al deslizar) sigue montado debajo
 * de las pantallas apiladas, dentro de una pantalla con aria-hidden.
 */
export async function deslizarParaActualizar(): Promise<void> {
  const [lista] = screen.container.queryAll(
    (nodo) => nodo.props.refreshControl != null && !dentroDePantallaOculta(nodo),
  );
  const control = lista.props.refreshControl as { props: { onRefresh: () => void } };
  await act(async () => {
    control.props.onRefresh();
  });
}

/** true si algún contenedor del nodo está oculto para la clienta (aria-hidden), como la pantalla de abajo. */
function dentroDePantallaOculta(nodo: TestInstance): boolean {
  for (let padre = nodo.parent; padre; padre = padre.parent) {
    if (padre.props['aria-hidden'] === true) {
      return true;
    }
  }
  return false;
}

// ── Detalle y hoja de cancelar ───────────────────────────────────────────────────────────────

/** Espera la ruta del detalle y su encabezado con la cita ya cargada (sus insignias). */
export async function esperarDetalle(app: App, id: number | string): Promise<void> {
  await esperarRuta(app, `/cita/${id}`);
  expect(await screen.findByRole('header', { name: 'Tu cita' })).toBeOnTheScreen();
  await waitFor(() => expect(screen.queryByLabelText('Cargando tu cita')).not.toBeOnTheScreen());
}

/** Título de la hoja de cancelar. */
export const TITULO_HOJA = '¿Cancelar tu cita?';

/**
 * Toca "Cancelar cita" del detalle y espera la hoja con su aviso (con anticipo pagado, el aviso
 * final llega cuando el backend responde la política del anticipo).
 */
export async function abrirHojaCancelar(aviso: string): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: 'Cancelar cita' }));
  expect(await screen.findByRole('header', { name: TITULO_HOJA })).toBeOnTheScreen();
  expect(await screen.findByText(aviso)).toBeOnTheScreen();
}

/**
 * En la hoja elige el motivo (con "Otro" escribe `escrito`) y toca su "Cancelar cita", que sigue
 * deshabilitado mientras no hay motivo.
 */
export async function cancelarConMotivo(motivo: string, escrito?: string): Promise<void> {
  expect(ultimoBoton('Cancelar cita')).toBeDisabled();
  await fireEvent.press(screen.getByRole('radio', { name: motivo }));
  expect(screen.getByRole('radio', { name: motivo })).toBeChecked();
  if (escrito !== undefined) {
    await fireEvent.changeText(screen.getByLabelText('Cuéntanos el motivo'), escrito);
  }
  await fireEvent.press(ultimoBoton('Cancelar cita'));
}

/** Cierra la hoja como el botón Atrás de Android (onRequestClose del Modal) y espera que se vaya. */
export async function cerrarHoja(): Promise<void> {
  const [modal] = screen.container.queryAll((nodo) => typeof nodo.props.onRequestClose === 'function');
  await fireEvent(modal, 'requestClose');
  await waitFor(() => expect(screen.queryByRole('header', { name: TITULO_HOJA })).not.toBeOnTheScreen());
}

/** Cada insignia "Estado: ..." indicada, a la vista. */
export function revisarInsignias(...textos: string[]): void {
  for (const texto of textos) {
    expect(screen.getByLabelText(`Estado: ${texto}`)).toBeOnTheScreen();
  }
}
