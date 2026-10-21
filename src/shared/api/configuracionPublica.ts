import { File, Paths } from 'expo-file-system';

import { apiGet, ApiError, crearErrorApi, ErrorDeRed } from './apiClient';

/**
 * Configuración pública del salón (GET /api/configuracion-publica, sin sesión): datos de contacto,
 * horario, reglas de citas y tienda, métodos de pago, días inhábiles y textos del sitio.
 *
 * Patrón Repository: las pantallas piden la configuración aquí y no saben si llegó de la red, del
 * archivo guardado o del respaldo. Patrón Singleton: hay un solo estado en memoria para toda la app.
 * Patrón Observer: `suscribir` avisa cuando llega una versión nueva (lo usa useConfiguracionPublica).
 *
 * Nunca rechaza ni escribe en consola: los ApiError y ErrorDeRed de apiClient se atrapan y solo
 * viajan en el resultado de `refrescar`. No guarda datos personales: solo lo que normaliza.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────────────────────

export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type MetodoPagoSalon = 'efectivo' | 'tarjeta' | 'transferencia';

export interface DiaHorario {
  dia: DiaSemana;
  cerrado: boolean;
  /** 'HH:MM', o '' si el día está cerrado. */
  abre: string;
  cierra: string;
}

export interface DiaInhabil {
  /** 'YYYY-MM-DD'. */
  fecha: string;
  motivo: string;
}

export interface SalonPublico {
  nombre: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  whatsapp: string;
  mapaUrl: string;
  correoContacto: string;
}

export interface ReglasCitasPublicas {
  plazoAnticipoHoras: number;
  minutosAntesPagoSalon: number;
  minutosLlegadaAntes: number;
  toleranciaLlegadaMinutos: number;
  permitirAnticipoEnSalon: boolean;
  maxCitasPorPagarEnSalon: number;
  intervaloHorariosMinutos: number;
  horasAvisoCancelarReagendar: number;
}

export interface ReglasTiendaPublicas {
  plazoPagoLineaHoras: number;
  tiempoPreparacionTexto: string;
  diasResguardoPagado: number;
  diasCancelarNoRecogido: number;
  diasCambioProducto: number;
}

export interface PagosPublicos {
  mercadoPagoTienda: boolean;
  mercadoPagoAnticipos: boolean;
  metodosSalon: MetodoPagoSalon[];
}

/** Solo lo que la app usa: sin responsable, correo de privacidad, datos de transferencia ni redes. */
export interface ConfiguracionPublica {
  salon: SalonPublico;
  horario: { dias: DiaHorario[] };
  anticiposActivos: boolean;
  reglas: {
    citas: ReglasCitasPublicas;
    tienda: ReglasTiendaPublicas;
    pagos: PagosPublicos;
    diasInhabiles: DiaInhabil[];
  };
  textos: Record<string, string>;
}

/** De dónde salió la configuración que hay en memoria. */
export type OrigenConfiguracion = 'red' | 'archivo' | 'respaldo';

export interface EstadoConfiguracion {
  configuracion: ConfiguracionPublica;
  origen: OrigenConfiguracion;
  /** Momento (ms) de la lectura de red que dio esta configuración; null si nunca hubo una. */
  leidoEn: number | null;
}

export interface ResultadoRefresco {
  configuracion: ConfiguracionPublica;
  origen: OrigenConfiguracion;
  /** Por qué no se pudo leer de la red, si falló. Nunca se muestra a la clienta. */
  error?: ApiError | ErrorDeRed;
}

// ── Constantes ───────────────────────────────────────────────────────────────────────────────

/** Vigencia de la lectura de red en memoria (el backend guarda la suya 60 s). */
export const VIGENCIA_CONFIGURACION_MS = 5 * 60 * 1000;
/**
 * Lo más que la pantalla de carga espera a la red (apiClient espera hasta 15 s): después sigue
 * con el archivo guardado o el respaldo y la red termina en segundo plano.
 */
export const TIEMPO_MAXIMO_CARGA_MS = 3000;

const RUTA = '/api/configuracion-publica';
const NOMBRE_ARCHIVO = 'configuracion-publica.json';
const VERSION_ARCHIVO = 1;
const DIAS: readonly DiaSemana[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const METODOS: readonly MetodoPagoSalon[] = ['efectivo', 'tarjeta', 'transferencia'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

/** Congela un objeto y todo lo que contiene: la configuración en memoria no se puede modificar. */
function congelar<T>(valor: T): T {
  if (valor && typeof valor === 'object') {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

const abierto = (dia: DiaSemana, abre: string, cierra: string): DiaHorario => ({ dia, cerrado: false, abre, cierra });

/**
 * Valores que la app tenía fijos antes de leer la configuración, para que sin red ni archivo nada
 * cambie de comportamiento. Salón y horario: SALON_RECOGER de tienda/models/pedidoModel. Citas:
 * textos de citas/views/ReservarCitaView y límites de citas/models/citaModel (2 horas en línea, 15
 * minutos antes en el salón, llegar 20 minutos antes, horarios cada 30). Tienda, pagos y lo demás:
 * valores por omisión del backend (reglas-negocio.ts).
 */
export const RESPALDO_CONFIGURACION: ConfiguracionPublica = congelar({
  salon: {
    nombre: 'Mirú Franco Beauty Salón',
    direccion: '',
    ciudad: 'Huejutla de Reyes, Hidalgo',
    telefono: '+52 771 268 1432',
    whatsapp: '',
    mapaUrl: '',
    correoContacto: '',
  },
  horario: {
    dias: [
      ...DIAS.slice(0, 5).map((dia) => abierto(dia, '09:30', '19:30')),
      abierto('sabado', '09:30', '19:00'),
      { dia: 'domingo', cerrado: true, abre: '', cierra: '' },
    ],
  },
  anticiposActivos: true,
  reglas: {
    citas: {
      plazoAnticipoHoras: 2,
      minutosAntesPagoSalon: 15,
      minutosLlegadaAntes: 20,
      toleranciaLlegadaMinutos: 15,
      permitirAnticipoEnSalon: true,
      maxCitasPorPagarEnSalon: 1,
      intervaloHorariosMinutos: 30,
      horasAvisoCancelarReagendar: 0,
    },
    tienda: {
      plazoPagoLineaHoras: 24,
      tiempoPreparacionTexto: 'Suele estar listo en 24 a 48 horas hábiles',
      diasResguardoPagado: 15,
      diasCancelarNoRecogido: 7,
      diasCambioProducto: 7,
    },
    pagos: { mercadoPagoTienda: true, mercadoPagoAnticipos: true, metodosSalon: [...METODOS] },
    diasInhabiles: [],
  },
  textos: {},
});

// ── Normalización ────────────────────────────────────────────────────────────────────────────

type Objeto = Record<string, unknown>;
type Primitivo = string | number | boolean;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const objeto = (valor: unknown): Objeto => (esObjeto(valor) ? valor : {});
const esEnteroNoNegativo = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) >= 0;
const esHora = (valor: unknown): valor is string => typeof valor === 'string' && HORA.test(valor.trim());

/** Un campo con el tipo de su respaldo: entero >= 0, booleano o texto recortado; si no, el respaldo. */
function campo<V extends Primitivo>(valor: unknown, respaldo: V): V {
  if (typeof respaldo === 'number') {
    return (esEnteroNoNegativo(valor) ? valor : respaldo) as V;
  }
  if (typeof respaldo === 'boolean') {
    return (typeof valor === 'boolean' ? valor : respaldo) as V;
  }
  return (typeof valor === 'string' ? valor.trim() : respaldo) as V;
}

/** Solo las claves del respaldo, cada una con `campo`: lo que sobra en el servidor no entra. */
function porCampos<T extends { [K in keyof T]: Primitivo }>(crudo: unknown, respaldo: T): T {
  const fuente = objeto(crudo);
  const limpio = { ...respaldo };
  for (const clave of Object.keys(respaldo) as (keyof T & string)[]) {
    limpio[clave] = campo(fuente[clave], respaldo[clave]);
  }
  return limpio;
}

function diaHorario(crudo: unknown, dia: DiaSemana): DiaHorario | null {
  const d = objeto(crudo);
  if (d.cerrado === true) {
    return { dia, cerrado: true, abre: '', cierra: '' };
  }
  return esHora(d.abre) && esHora(d.cierra) ? abierto(dia, d.abre.trim(), d.cierra.trim()) : null;
}

/** Los siete días con nombre conocido y horas HH:MM (o cerrado); si falta algo, el horario del respaldo. */
function horario(crudo: unknown): ConfiguracionPublica['horario'] {
  const lista = objeto(crudo).dias;
  if (!Array.isArray(lista) || lista.length !== DIAS.length) {
    return RESPALDO_CONFIGURACION.horario;
  }
  const dias = DIAS.map((dia) => diaHorario(lista.find((d) => objeto(d).dia === dia), dia));
  return dias.every((d): d is DiaHorario => d !== null) ? { dias } : RESPALDO_CONFIGURACION.horario;
}

function diasInhabiles(crudo: unknown): DiaInhabil[] {
  return (Array.isArray(crudo) ? crudo : [])
    .map(objeto)
    .filter((d) => typeof d.fecha === 'string' && FECHA.test(d.fecha) && typeof d.motivo === 'string')
    .map((d) => ({ fecha: d.fecha as string, motivo: (d.motivo as string).trim() }));
}

/** Los métodos conocidos que trae la lista, sin repetir y en orden fijo. */
function metodosSalon(crudo: unknown): MetodoPagoSalon[] {
  return Array.isArray(crudo)
    ? METODOS.filter((metodo) => crudo.includes(metodo))
    : [...RESPALDO_CONFIGURACION.reglas.pagos.metodosSalon];
}

function textos(crudo: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(objeto(crudo))
      .filter((par): par is [string, string] => typeof par[1] === 'string')
      .map(([clave, valor]) => [clave, valor.trim()]),
  );
}

/**
 * Convierte la respuesta del servidor (o lo guardado en el archivo) en una ConfiguracionPublica,
 * campo por campo: lo que falte o venga con otro tipo toma el valor del respaldo sin romper el resto.
 * Pura: no lee ni escribe nada. Devuelve un objeto congelado.
 */
export function normalizarConfiguracion(cuerpo: unknown): ConfiguracionPublica {
  if (!esObjeto(cuerpo)) {
    return RESPALDO_CONFIGURACION;
  }
  const respaldo = RESPALDO_CONFIGURACION.reglas;
  const reglas = objeto(cuerpo.reglas);
  const pagos = objeto(reglas.pagos);
  return congelar({
    salon: porCampos(cuerpo.salon, RESPALDO_CONFIGURACION.salon),
    horario: horario(cuerpo.horario),
    anticiposActivos: campo(cuerpo.anticiposActivos, RESPALDO_CONFIGURACION.anticiposActivos),
    reglas: {
      citas: porCampos(reglas.citas, respaldo.citas),
      tienda: porCampos(reglas.tienda, respaldo.tienda),
      pagos: {
        mercadoPagoTienda: campo(pagos.mercadoPagoTienda, respaldo.pagos.mercadoPagoTienda),
        mercadoPagoAnticipos: campo(pagos.mercadoPagoAnticipos, respaldo.pagos.mercadoPagoAnticipos),
        metodosSalon: metodosSalon(pagos.metodosSalon),
      },
      diasInhabiles: diasInhabiles(reglas.diasInhabiles),
    },
    textos: textos(cuerpo.textos),
  });
}

// ── Archivo en disco ─────────────────────────────────────────────────────────────────────────

/**
 * Se guarda con expo-file-system y no con SecureStore: SecureStore limita cada valor a unos 2 KB en
 * Android (los textos del sitio lo pasan) y estos datos no son secretos. Va en Paths.document y no
 * en la caché para que el sistema no lo borre. El File y Paths solo se tocan aquí dentro de
 * try/catch: si el acceso falla (por ejemplo, un simulador sin Paths), se sigue sin disco.
 */
function archivo(): File {
  return new File(Paths.document, NOMBRE_ARCHIVO);
}

/** Lo guardado en el archivo, ya normalizado; null si no hay, no se puede leer o está dañado. */
async function leerArchivo(): Promise<EstadoConfiguracion | null> {
  try {
    const guardado = archivo();
    if (!guardado.exists) {
      return null;
    }
    const datos: unknown = JSON.parse(await guardado.text());
    if (!esObjeto(datos) || datos.version !== VERSION_ARCHIVO || !esObjeto(datos.configuracion)) {
      return null;
    }
    return {
      configuracion: normalizarConfiguracion(datos.configuracion),
      origen: 'archivo',
      leidoEn: esEnteroNoNegativo(datos.leidoEn) ? datos.leidoEn : null,
    };
  } catch {
    return null;
  }
}

/** Guarda la configuración normalizada y la fecha de la lectura. Si falla, la app sigue igual. */
function escribirArchivo({ configuracion, leidoEn }: EstadoConfiguracion): void {
  try {
    const destino = archivo();
    if (!destino.exists) {
      destino.create();
    }
    destino.write(JSON.stringify({ version: VERSION_ARCHIVO, leidoEn, configuracion }));
  } catch {
    // Sin disco: la próxima apertura usará el respaldo.
  }
}

// ── Estado en memoria (Singleton) y suscriptores (Observer) ──────────────────────────────────

const ESTADO_INICIAL: EstadoConfiguracion = Object.freeze({
  configuracion: RESPALDO_CONFIGURACION,
  origen: 'respaldo',
  leidoEn: null,
});

let estado: EstadoConfiguracion = ESTADO_INICIAL;
const oyentes = new Set<() => void>();
let enVuelo: Promise<ResultadoRefresco> | null = null;

function fijar(nuevo: EstadoConfiguracion): void {
  estado = Object.freeze(nuevo);
  for (const oyente of [...oyentes]) {
    try {
      oyente();
    } catch {
      // Un oyente que falla no impide avisar a los demás.
    }
  }
}

/** Si en memoria solo está el respaldo, sube lo guardado en el archivo (y avisa). */
async function subirArchivoSiNoHayNada(): Promise<void> {
  if (estado.origen !== 'respaldo') {
    return;
  }
  const guardado = await leerArchivo();
  if (guardado && estado.origen === 'respaldo') {
    fijar(guardado);
  }
}

// ── API pública ──────────────────────────────────────────────────────────────────────────────

/** La configuración que hay en memoria (o el respaldo), al instante. Está congelada. */
export function obtenerConfiguracion(): ConfiguracionPublica {
  return estado.configuracion;
}

/** Estado completo para useSyncExternalStore: el mismo objeto mientras no cambie. */
export function estadoConfiguracion(): EstadoConfiguracion {
  return estado;
}

/** true si la memoria no viene de la red o si ya pasó VIGENCIA_CONFIGURACION_MS desde la lectura. */
export function cacheVencida(ahora: number = Date.now()): boolean {
  return estado.origen !== 'red' || estado.leidoEn === null || ahora - estado.leidoEn >= VIGENCIA_CONFIGURACION_MS;
}

/** Registra un oyente que se llama cada vez que llega una versión nueva. Devuelve cómo quitarlo. */
export function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

async function ejecutarRefresco(): Promise<ResultadoRefresco> {
  try {
    const cuerpo = await apiGet<unknown>(RUTA, { publica: true });
    if (!esObjeto(cuerpo)) {
      // Un 200 sin objeto JSON (por ejemplo, el portal de un wifi público) no pisa lo guardado.
      throw crearErrorApi({ tipo: 'red' });
    }
    const nuevo: EstadoConfiguracion = { configuracion: normalizarConfiguracion(cuerpo), origen: 'red', leidoEn: Date.now() };
    escribirArchivo(nuevo);
    fijar(nuevo);
    return { configuracion: nuevo.configuracion, origen: 'red' };
  } catch (causa) {
    // Solo llegan ApiError o ErrorDeRed; otro error (por ejemplo, sin URL de la API) cuenta como sin red.
    const error = causa instanceof ApiError || causa instanceof ErrorDeRed ? causa : crearErrorApi({ tipo: 'red' });
    await subirArchivoSiNoHayNada();
    return { configuracion: estado.configuracion, origen: estado.origen, error };
  }
}

/**
 * Pide la configuración a la red. Si falla, conserva lo que haya en memoria; si no había nada,
 * usa el archivo guardado y por último el respaldo. Dos llamadas a la vez comparten una sola
 * petición. Nunca rechaza.
 */
export function refrescar(): Promise<ResultadoRefresco> {
  enVuelo ??= ejecutarRefresco().finally(() => {
    enVuelo = null;
  });
  return enVuelo;
}

/**
 * La configuración en este orden: memoria vigente, red, archivo guardado y respaldo. Nunca rechaza.
 */
export async function cargarConfiguracion(): Promise<ConfiguracionPublica> {
  if (!cacheVencida()) {
    return estado.configuracion;
  }
  return (await refrescar()).configuracion;
}

/**
 * Para la pantalla de carga: como cargarConfiguracion, pero si en `ms` no terminó resuelve con el
 * archivo guardado (o el respaldo) y deja que la red siga; cuando llega, avisa a los suscriptores.
 */
export function cargarConLimite(ms: number = TIEMPO_MAXIMO_CARGA_MS): Promise<ConfiguracionPublica> {
  let limite: ReturnType<typeof setTimeout> | undefined;
  const alVencer = new Promise<ConfiguracionPublica>((resolve) => {
    limite = setTimeout(() => {
      resolve(subirArchivoSiNoHayNada().then(obtenerConfiguracion));
    }, ms);
  });
  return Promise.race([cargarConfiguracion(), alVencer]).finally(() => clearTimeout(limite));
}

/**
 * Solo para pruebas: vuelve al respaldo y olvida suscriptores y la petición en vuelo. Los módulos
 * se comparten entre las pruebas de un archivo, así que cada prueba empieza con esto.
 */
export function reiniciarConfiguracionPublica(): void {
  estado = ESTADO_INICIAL;
  oyentes.clear();
  enVuelo = null;
}
