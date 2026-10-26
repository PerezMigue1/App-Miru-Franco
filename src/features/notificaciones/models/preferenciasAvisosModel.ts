import { ApiError, apiGet, apiPatch } from '@/shared/api/apiClient';

/**
 * Preferencias de avisos de la cuenta (Ronda 9 del backend, con la sesión):
 * - GET   /api/notificaciones/preferencias: una entrada por cada par (tipo, canal) que se puede
 *   configurar, en el orden del backend: { tipo, etiqueta, canal, activo }.
 * - PATCH /api/notificaciones/preferencias { preferencias: [{ tipo, canal, activo }] } (de 1 a 50, 30
 *   por minuto): guarda todo o nada y responde la lista completa ya actualizada.
 * La lista sale siempre del GET: la app no escribe qué avisos se pueden configurar. Canales: in_app y
 * email. La respuesta a una solicitud ARCO (arco_respuesta) no viene: la ley obliga a comunicarla y la
 * pantalla la muestra fija y encendida. Estas preferencias son de la cuenta; "Avisos en la app" de
 * Perfil (preferenciaAvisos.ts) solo decide si este teléfono muestra los avisos al momento.
 */

export const RUTA_PREFERENCIAS = '/api/notificaciones/preferencias';

/** Canales que se pueden configurar, en el orden en que se muestran. */
export const CANALES_AVISO = ['in_app', 'email'] as const;
export type CanalAviso = (typeof CANALES_AVISO)[number];

/** Máximo de cambios por PATCH (ArrayMaxSize del DTO del backend). */
export const MAXIMO_CAMBIOS = 50;

/** Aviso que la ley no deja apagar: se pinta fijo y nunca se manda. */
export const TIPO_ARCO_RESPUESTA = 'arco_respuesta';

export interface PreferenciaAviso {
  tipo: string;
  /** Nombre del aviso que da el backend ("Cita agendada"). */
  etiqueta: string;
  canal: CanalAviso;
  activo: boolean;
}

export interface CambioPreferencia {
  tipo: string;
  canal: CanalAviso;
  activo: boolean;
}

/** Un tipo de aviso con el valor guardado de cada canal que tiene (un canal ausente no aplica). */
export interface GrupoAviso {
  tipo: string;
  etiqueta: string;
  canales: Partial<Record<CanalAviso, boolean>>;
}

/** Cambios sin guardar: "tipo:canal" con el valor elegido (solo los que difieren de lo guardado). */
export type Borrador = Readonly<Record<string, boolean>>;

type Objeto = Record<string, unknown>;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);

/** Tipo como los del catálogo del backend: minúsculas, dígitos y guion bajo. */
const TIPO = /^[a-z][a-z0-9_]{0,59}$/;

const esCanal = (valor: unknown): valor is CanalAviso => CANALES_AVISO.includes(valor as CanalAviso);

export const claveDe = (tipo: string, canal: CanalAviso): string => `${tipo}:${canal}`;

/**
 * Las entradas válidas del servidor, en su orden. Se descarta la que no trae tipo, etiqueta, un canal
 * conocido o activo booleano (nunca se supone un valor), un par repetido (gana el primero) y
 * arco_respuesta, que no se configura.
 */
export function normalizarPreferencias(crudo: unknown): PreferenciaAviso[] {
  if (!Array.isArray(crudo)) {
    return [];
  }
  const vistos = new Set<string>();
  const lista: PreferenciaAviso[] = [];
  for (const entrada of crudo) {
    if (!esObjeto(entrada)) {
      continue;
    }
    const tipo = typeof entrada.tipo === 'string' ? entrada.tipo.trim() : '';
    const etiqueta = typeof entrada.etiqueta === 'string' ? entrada.etiqueta.trim() : '';
    const { canal, activo } = entrada;
    if (!TIPO.test(tipo) || tipo === TIPO_ARCO_RESPUESTA || !etiqueta || !esCanal(canal) || typeof activo !== 'boolean') {
      continue;
    }
    const clave = claveDe(tipo, canal);
    if (!vistos.has(clave)) {
      vistos.add(clave);
      lista.push({ tipo, etiqueta, canal, activo });
    }
  }
  return lista;
}

function listaDe(respuesta: unknown): PreferenciaAviso[] {
  if (!esObjeto(respuesta) || !Array.isArray(respuesta.data)) {
    throw new ApiError(500, 'La respuesta del servidor no trae las preferencias de avisos.');
  }
  return normalizarPreferencias(respuesta.data);
}

/** GET /api/notificaciones/preferencias. */
export async function leerPreferencias(): Promise<PreferenciaAviso[]> {
  return listaDe(await apiGet<unknown>(RUTA_PREFERENCIAS));
}

/**
 * PATCH /api/notificaciones/preferencias con los cambios, en lotes de MAXIMO_CAMBIOS (hoy el catálogo
 * tiene 20 pares: siempre es uno). Devuelve la lista que respondió el último lote.
 */
export async function guardarPreferencias(cambios: readonly CambioPreferencia[]): Promise<PreferenciaAviso[]> {
  return guardarLotesDesde(cambios, 0, []);
}

/**
 * Manda el lote que empieza en `inicio` y, cuando responde, el siguiente: uno tras otro y nunca en
 * paralelo, para que la lista devuelta sea la del último PATCH que aplicó el backend.
 */
async function guardarLotesDesde(
  cambios: readonly CambioPreferencia[],
  inicio: number,
  lista: PreferenciaAviso[],
): Promise<PreferenciaAviso[]> {
  if (inicio >= cambios.length) {
    return lista;
  }
  const preferencias = cambios.slice(inicio, inicio + MAXIMO_CAMBIOS).map(({ tipo, canal, activo }) => ({ tipo, canal, activo }));
  const respondida = listaDe(await apiPatch<unknown>(RUTA_PREFERENCIAS, { preferencias }));
  return guardarLotesDesde(cambios, inicio + MAXIMO_CAMBIOS, respondida);
}

/** 404: el backend todavía no tiene esta función. */
export function esPreferenciasNoDisponibles(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}

// ── Reglas puras de la pantalla ──────────────────────────────────────────────────────────────

/** Un grupo por tipo, en el orden del backend, con el valor guardado de cada canal. */
export function agruparPorTipo(preferencias: readonly PreferenciaAviso[]): GrupoAviso[] {
  const grupos: GrupoAviso[] = [];
  const porTipo = new Map<string, GrupoAviso>();
  for (const { tipo, etiqueta, canal, activo } of preferencias) {
    let grupo = porTipo.get(tipo);
    if (!grupo) {
      grupo = { tipo, etiqueta, canales: {} };
      porTipo.set(tipo, grupo);
      grupos.push(grupo);
    }
    grupo.canales[canal] = activo;
  }
  return grupos;
}

/** El valor que muestra el interruptor: el del borrador si se tocó; si no, el guardado. */
export function valorEnPantalla(guardado: boolean, borrador: Borrador, tipo: string, canal: CanalAviso): boolean {
  return borrador[claveDe(tipo, canal)] ?? guardado;
}

/** Cambia un interruptor. Volver al valor guardado lo quita del borrador; un par que no existe no cambia nada. */
export function alternar(preferencias: readonly PreferenciaAviso[], borrador: Borrador, tipo: string, canal: CanalAviso): Borrador {
  const guardada = preferencias.find((p) => p.tipo === tipo && p.canal === canal);
  if (!guardada) {
    return borrador;
  }
  const clave = claveDe(tipo, canal);
  const nuevo = !(borrador[clave] ?? guardada.activo);
  const resto: Record<string, boolean> = { ...borrador };
  delete resto[clave];
  return nuevo === guardada.activo ? resto : { ...resto, [clave]: nuevo };
}

/** Lo que va en el PATCH: los pares cuyo valor elegido difiere del guardado, en el orden del backend. */
export function cambiosPendientes(preferencias: readonly PreferenciaAviso[], borrador: Borrador): CambioPreferencia[] {
  return preferencias.flatMap(({ tipo, canal, activo }) => {
    const elegido = borrador[claveDe(tipo, canal)];
    return elegido === undefined || elegido === activo ? [] : [{ tipo, canal, activo: elegido }];
  });
}

/**
 * La lista que respondió el PATCH es la nueva verdad. Si llegara vacía (cuerpo raro), se aplican los
 * cambios guardados sobre la anterior para no dejar la pantalla sin interruptores.
 */
export function nuevaVerdad(
  respuesta: readonly PreferenciaAviso[],
  anterior: readonly PreferenciaAviso[],
  cambios: readonly CambioPreferencia[],
): PreferenciaAviso[] {
  if (respuesta.length > 0) {
    return [...respuesta];
  }
  return anterior.map((p) => {
    const cambio = cambios.find((c) => c.tipo === p.tipo && c.canal === p.canal);
    return cambio ? { ...p, activo: cambio.activo } : p;
  });
}
