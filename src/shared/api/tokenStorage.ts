import * as SecureStore from 'expo-secure-store';

/** Token, momento de emisión y usuario en una sola entrada: se guardan o se borran juntos. */
const CLAVE_SESION = 'auth_sesion';
/** Formato anterior (tres entradas separadas). Si aparece, se borra y la sesión se da por cerrada. */
const CLAVES_ANTERIORES = ['auth_token', 'auth_token_emitido', 'auth_usuario'] as const;

/** Datos básicos de la clienta que se guardan junto al token (nunca la contraseña). */
export interface UsuarioGuardado {
  id: string;
  nombre: string;
  email: string;
  rol: string;
}

export interface SesionGuardada {
  token: string;
  /** Momento (ms) en que la app recibió el token: con él se decide cuándo renovarlo. */
  emitidoEn: number;
  usuario: UsuarioGuardado;
}

/**
 * Generación de sesión: cambia al iniciar, al cerrar y al expirar la sesión. Una operación
 * asíncrona (renovación, /me, reintento) guarda la generación al empezar; si al terminar cambió,
 * su resultado se descarta sin escribir.
 */
let generacion = 0;

export function generacionActual(): number {
  return generacion;
}

/** Abre una generación nueva: todo lo que siga en curso de la anterior se descartará. */
export function nuevaGeneracion(): number {
  generacion += 1;
  return generacion;
}

/**
 * Cola de acceso a SecureStore: las operaciones corren una tras otra, así que comprobar la
 * generación (o el token) y escribir ocurre sin que otra operación se meta en medio.
 */
let cola: Promise<unknown> = Promise.resolve();

function enCola<T>(operacion: () => Promise<T>): Promise<T> {
  const resultado = cola.then(operacion);
  cola = resultado.catch(() => undefined);
  return resultado;
}

function esTexto(valor: unknown): valor is string {
  return typeof valor === 'string';
}

function aUsuario(valor: unknown): UsuarioGuardado | null {
  if (typeof valor !== 'object' || valor === null) {
    return null;
  }
  const { id, nombre, email, rol } = valor as Record<string, unknown>;
  if (!esTexto(id) || !esTexto(nombre) || !esTexto(email) || !esTexto(rol)) {
    return null;
  }
  return { id, nombre, email, rol };
}

function aSesion(valor: unknown): SesionGuardada | null {
  if (typeof valor !== 'object' || valor === null) {
    return null;
  }
  const { token, emitidoEn, usuario } = valor as Record<string, unknown>;
  const datos = aUsuario(usuario);
  if (!esTexto(token) || !token || typeof emitidoEn !== 'number' || !Number.isFinite(emitidoEn)) {
    return null;
  }
  return emitidoEn > 0 && datos ? { token, emitidoEn, usuario: datos } : null;
}

/** El formato anterior se revisa una vez por arranque: la app ya no lo escribe. */
let anterioresRevisadas = false;

async function hayClavesAnteriores(): Promise<boolean> {
  if (anterioresRevisadas) {
    return false;
  }
  // Se esperan todas las lecturas (sin cortar a medias); una que no se pudo leer no cuenta.
  const lecturas = await Promise.allSettled(CLAVES_ANTERIORES.map((clave) => SecureStore.getItemAsync(clave)));
  if (lecturas.some((lectura) => lectura.status === 'fulfilled' && lectura.value !== null)) {
    return true;
  }
  anterioresRevisadas = true;
  return false;
}

/**
 * Borra la sesión. Su resultado depende solo de la entrada de la sesión; las claves del formato
 * anterior se intentan borrar después, esperando a todas, sin que un fallo deje operaciones a medias.
 */
async function borrarTodo(): Promise<void> {
  await SecureStore.deleteItemAsync(CLAVE_SESION);
  await Promise.allSettled(CLAVES_ANTERIORES.map((clave) => SecureStore.deleteItemAsync(clave)));
}

/** Borra la sesión con un reintento. Devuelve si quedó borrada. */
async function borrarConReintento(): Promise<boolean> {
  try {
    await borrarTodo();
    return true;
  } catch {
    try {
      await borrarTodo();
      return true;
    } catch {
      return false;
    }
  }
}

/** Lectura sin cola (solo dentro de una operación ya encolada). */
async function leer(): Promise<SesionGuardada | null> {
  if (await hayClavesAnteriores()) {
    // Una sesión del formato anterior no se migra: se borra y la clienta vuelve a entrar. Se
    // intenta una vez por arranque.
    anterioresRevisadas = true;
    await borrarTodo();
    return null;
  }
  let texto: string | null = null;
  try {
    texto = await SecureStore.getItemAsync(CLAVE_SESION);
  } catch {
    // Entrada ilegible (por ejemplo, cambió la llave del Keystore): se borra y no hay sesión.
    await SecureStore.deleteItemAsync(CLAVE_SESION).catch(() => undefined);
    return null;
  }
  if (!texto) {
    return null;
  }
  try {
    return aSesion(JSON.parse(texto));
  } catch {
    return null;
  }
}

function escribir(sesion: SesionGuardada): Promise<void> {
  return SecureStore.setItemAsync(CLAVE_SESION, JSON.stringify(sesion));
}

/** Sesión completa guardada, o null si no hay, está dañada o es del formato anterior. */
export function leerSesion(): Promise<SesionGuardada | null> {
  return enCola(leer);
}

export async function getToken(): Promise<string | null> {
  return (await leerSesion())?.token ?? null;
}

/** Guarda una sesión nueva si la generación sigue siendo la del inicio de sesión. */
export function guardarSesion(sesion: SesionGuardada, generacionEsperada: number): Promise<boolean> {
  return enCola(async () => {
    if (generacionEsperada !== generacion) {
      return false;
    }
    await escribir(sesion);
    return true;
  });
}

/**
 * Cambia el token renovado solo si la generación no cambió y el token guardado sigue siendo el que
 * se renovó (si no, alguien cerró o inició otra sesión mientras tanto).
 */
export function reemplazarToken(
  anterior: string,
  nuevo: string,
  emitidoEn: number,
  generacionEsperada: number,
): Promise<boolean> {
  return enCola(async () => {
    const actual = await leer();
    if (generacionEsperada !== generacion || actual?.token !== anterior) {
      return false;
    }
    await escribir({ ...actual, token: nuevo, emitidoEn });
    return true;
  });
}

/** Actualiza los datos de la clienta si la sesión sigue siendo la misma generación. */
export function guardarUsuario(usuario: UsuarioGuardado, generacionEsperada: number): Promise<boolean> {
  return enCola(async () => {
    const actual = await leer();
    if (generacionEsperada !== generacion || !actual) {
      return false;
    }
    await escribir({ ...actual, usuario });
    return true;
  });
}

/**
 * Borra la sesión guardada (y cualquier resto del formato anterior). Abre una generación nueva:
 * lo que siga en curso de la sesión borrada ya no escribe.
 */
export function borrarSesion(): Promise<void> {
  nuevaGeneracion();
  return enCola(borrarTodo);
}

/**
 * Cierra la sesión que recibió un rechazo: solo si sigue guardada la misma (misma generación y
 * mismo token). Abre una generación nueva para descartar lo que siga en curso. Devuelve si cerró.
 */
export function borrarSesionSi(token: string, generacionEsperada: number): Promise<boolean> {
  return enCola(async () => {
    const actual = await leer();
    if (generacionEsperada !== generacion || actual?.token !== token) {
      return false;
    }
    nuevaGeneracion();
    // La sesión ya fue rechazada por el servidor: la app sale aunque el borrado falle dos veces;
    // si quedó guardada, el siguiente 401 la vuelve a cerrar.
    await borrarConReintento();
    return true;
  });
}

/**
 * Cierra la sesión guardada si la generación sigue siendo la esperada, aunque una renovación haya
 * cambiado el token mientras tanto (renovar no cambia la generación). Devuelve el token cerrado,
 * para revocarlo en el servidor, o null si no cerró nada.
 */
export function cerrarSesionDeGeneracion(generacionEsperada: number): Promise<string | null> {
  return enCola(async () => {
    const actual = await leer();
    if (generacionEsperada !== generacion || !actual) {
      return null;
    }
    nuevaGeneracion();
    await borrarConReintento();
    return actual.token;
  });
}
