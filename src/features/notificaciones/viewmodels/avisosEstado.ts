import { useSyncExternalStore } from 'react';

import {
  borrarAviso,
  esAvisoInexistente,
  listarAvisos,
  marcarAvisoLeido,
  marcarTodosLeidos,
  mensajeErrorAvisos,
  type Aviso,
} from '../models/avisoModel';

/**
 * Avisos internos de la clienta: un solo estado en memoria para toda la app (Singleton) que comparten
 * la campana, la pantalla de avisos y la conexión en vivo. Patrón Observer: `suscribir` avisa de
 * cada cambio (useAvisos y useNoLeidos se conectan con useSyncExternalStore) y `alLlegarAviso` es un
 * canal aparte solo para los avisos nuevos que llegan en vivo (el aviso en pantalla).
 *
 * El mensaje de error sale de mensajeErrorAvisos (avisoModel, el mismo repositorio que ya se usa,
 * así que no agrega acoplamiento): amable, en español y nunca el texto técnico del servidor (sin red
 * y sesión terminada usan los mensajes comunes de la app).
 */

export type EstadoCargaAvisos = 'inicial' | 'cargando' | 'listo' | 'error';

export interface EstadoAvisos {
  avisos: Aviso[];
  /** Siempre se calcula de la lista. */
  noLeidos: number;
  estado: EstadoCargaAvisos;
  /** Mensaje amable para la clienta si la última carga falló; null si no. */
  error: string | null;
}

const ESTADO_INICIAL: EstadoAvisos = Object.freeze({ avisos: [], noLeidos: 0, estado: 'inicial', error: null });

let estado: EstadoAvisos = ESTADO_INICIAL;
const oyentes = new Set<() => void>();
const oyentesAvisoNuevo = new Set<(aviso: Aviso) => void>();
/** Cambia al limpiar (cierre de sesión): lo que venga de antes ya no escribe. */
let generacion = 0;
let enVuelo: Promise<void> | null = null;
/** Ids de los avisos que llegaron en vivo mientras la carga en vuelo esperaba; null sin carga. */
let llegadosEnCarga: Set<string> | null = null;
/**
 * Ids de todos los avisos que ya entraron en esta sesión (en vivo o con la lista). Un aviso
 * recuperado puede repetirse por el flujo (GP-09): si ya se vio, aunque la clienta lo haya borrado o
 * el servidor ya no lo traiga, no vuelve a entrar ni a salir en pantalla. Se vacía al cerrar sesión.
 */
let vistos = new Set<string>();

/** Llama a cada oyente; uno que falla no impide avisar a los demás. */
function avisarA<T extends unknown[]>(lista: Set<(...args: T) => void>, ...args: T): void {
  for (const oyente of [...lista]) {
    try {
      oyente(...args);
    } catch {
      // Se sigue con los demás.
    }
  }
}

function fijar(cambios: Partial<Omit<EstadoAvisos, 'noLeidos'>>): void {
  const avisos = cambios.avisos ?? estado.avisos;
  estado = Object.freeze({
    ...estado,
    ...cambios,
    avisos,
    noLeidos: avisos.filter((aviso) => !aviso.leida).length,
  });
  avisarA(oyentes);
}

/** Cambia `leida` de los avisos con esos ids (sin tocar los demás). */
function fijarLeida(ids: ReadonlySet<string>, leida: boolean): void {
  fijar({ avisos: estado.avisos.map((aviso) => (ids.has(aviso.id) ? { ...aviso, leida } : aviso)) });
}

// ── Observer ─────────────────────────────────────────────────────────────────────────────────

/** Registra un oyente de cualquier cambio. Devuelve cómo quitarlo. */
export function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

/** Registra un oyente de los avisos nuevos que llegan en vivo. Devuelve cómo quitarlo. */
export function alLlegarAviso(oyente: (aviso: Aviso) => void): () => void {
  oyentesAvisoNuevo.add(oyente);
  return () => {
    oyentesAvisoNuevo.delete(oyente);
  };
}

/** El estado actual: el mismo objeto mientras no cambie (para useSyncExternalStore). */
export function leerEstadoAvisos(): EstadoAvisos {
  return estado;
}

function leerNoLeidos(): number {
  return estado.noLeidos;
}

export function useAvisos(): EstadoAvisos {
  return useSyncExternalStore(suscribir, leerEstadoAvisos, leerEstadoAvisos);
}

export function useNoLeidos(): number {
  return useSyncExternalStore(suscribir, leerNoLeidos, leerNoLeidos);
}

// ── Acciones ─────────────────────────────────────────────────────────────────────────────────

/** La lista sin ids repetidos: se queda la primera vez que aparece cada uno (la más reciente). */
function sinRepetidos(avisos: Aviso[]): Aviso[] {
  const ids = new Set<string>();
  return avisos.filter((aviso) => {
    if (ids.has(aviso.id)) {
      return false;
    }
    ids.add(aviso.id);
    return true;
  });
}

/**
 * La lista del servidor más los avisos que llegaron en vivo mientras se pedía y que la respuesta no
 * trae (el servidor la armó antes): esos van primero, como están ahora en memoria. Sin ids repetidos,
 * aunque la respuesta traiga dos veces el mismo aviso.
 */
function combinarConLlegados(respuesta: Aviso[], llegados: ReadonlySet<string>): Aviso[] {
  const unicos = sinRepetidos(respuesta);
  const enRespuesta = new Set(unicos.map((aviso) => aviso.id));
  const vivos = estado.avisos.filter((aviso) => llegados.has(aviso.id) && !enRespuesta.has(aviso.id));
  for (const aviso of unicos) {
    vistos.add(aviso.id);
  }
  return [...vivos, ...unicos];
}

async function ejecutarCarga(gen: number): Promise<void> {
  const llegados = new Set<string>();
  llegadosEnCarga = llegados;
  fijar({ estado: 'cargando', error: null });
  try {
    const avisos = await listarAvisos();
    if (gen === generacion) {
      fijar({ avisos: combinarConLlegados(avisos, llegados), estado: 'listo', error: null });
    }
  } catch (causa) {
    if (gen === generacion) {
      fijar({ estado: 'error', error: mensajeErrorAvisos(causa, 'cargar') });
    }
  } finally {
    if (llegadosEnCarga === llegados) {
      llegadosEnCarga = null;
    }
  }
}

/**
 * Pide la lista y la reemplaza. Dos llamadas a la vez comparten una sola petición. Nunca rechaza:
 * un error queda en el estado ('error' con un mensaje amable) y se conserva la lista anterior.
 */
export function cargarAvisos(): Promise<void> {
  if (enVuelo) {
    return enVuelo;
  }
  const carga = ejecutarCarga(generacion).finally(() => {
    if (enVuelo === carga) {
      enVuelo = null;
    }
  });
  enVuelo = carga;
  return carga;
}

/**
 * Un aviso que llegó en vivo: entra al inicio sin pedir la lista y sin repetir su id. Uno que ya se
 * vio en esta sesión (repetido por el flujo o ya traído por la lista) no entra ni sale en pantalla.
 */
export function agregarAviso(aviso: Aviso): void {
  if (vistos.has(aviso.id) || estado.avisos.some((actual) => actual.id === aviso.id)) {
    return;
  }
  vistos.add(aviso.id);
  // Si hay una carga en vuelo, su respuesta no debe borrarlo al llegar.
  llegadosEnCarga?.add(aviso.id);
  fijar({ avisos: [aviso, ...estado.avisos] });
  avisarA(oyentesAvisoNuevo, aviso);
}

/**
 * Marca un aviso como leído al instante; si el servidor falla, lo regresa y relanza el error. Con
 * un 404 el aviso ya no existe: se quita de la lista en lugar de regresarlo a sin leer.
 */
export async function marcarLeido(id: string): Promise<void> {
  const gen = generacion;
  const aviso = estado.avisos.find((actual) => actual.id === id);
  if (!aviso || aviso.leida) {
    return;
  }
  const ids = new Set([id]);
  fijarLeida(ids, true);
  try {
    await marcarAvisoLeido(id);
  } catch (error) {
    if (gen === generacion && esAvisoInexistente(error)) {
      fijar({ avisos: estado.avisos.filter((actual) => actual.id !== id) });
    } else if (gen === generacion) {
      fijarLeida(ids, false);
    }
    throw error;
  }
}

/** Marca todos como leídos al instante; si el servidor falla, regresa solo los que cambió y relanza. */
export async function marcarTodos(): Promise<void> {
  const gen = generacion;
  const ids = new Set(estado.avisos.filter((aviso) => !aviso.leida).map((aviso) => aviso.id));
  fijarLeida(ids, true);
  try {
    await marcarTodosLeidos();
  } catch (error) {
    if (gen === generacion) {
      fijarLeida(ids, false);
    }
    throw error;
  }
}

/**
 * Quita un aviso al instante; si el servidor falla, lo regresa a su lugar y relanza el error. Con
 * un 404 el aviso ya no existe: no se regresa.
 */
export async function borrar(id: string): Promise<void> {
  const gen = generacion;
  const posicion = estado.avisos.findIndex((aviso) => aviso.id === id);
  const quitado = posicion === -1 ? null : estado.avisos[posicion];
  if (quitado) {
    fijar({ avisos: estado.avisos.filter((aviso) => aviso.id !== id) });
  }
  try {
    await borrarAviso(id);
  } catch (error) {
    const regresar = quitado && gen === generacion && !esAvisoInexistente(error);
    if (regresar && !estado.avisos.some((aviso) => aviso.id === id)) {
      const avisos = [...estado.avisos];
      avisos.splice(Math.min(posicion, avisos.length), 0, quitado);
      fijar({ avisos });
    }
    throw error;
  }
}

/**
 * Vacía todo (al cerrar sesión) y descarta las respuestas en vuelo de la sesión anterior. Los
 * oyentes se conservan: las pantallas montadas siguen escuchando.
 */
export function limpiarAvisos(): void {
  generacion += 1;
  enVuelo = null;
  llegadosEnCarga = null;
  vistos = new Set<string>();
  estado = ESTADO_INICIAL;
  avisarA(oyentes);
}
