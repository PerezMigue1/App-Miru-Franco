import * as SecureStore from 'expo-secure-store';

const CLAVE_TOKEN = 'auth_token';
const CLAVE_EMISION = 'auth_token_emitido';
const CLAVE_USUARIO = 'auth_usuario';

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

export function getToken(): Promise<string | null> {
  return SecureStore.getItemAsync(CLAVE_TOKEN);
}

/** Guarda un token nuevo (login o renovación) con su momento de emisión. */
export async function guardarToken(token: string, emitidoEn: number): Promise<void> {
  await SecureStore.setItemAsync(CLAVE_TOKEN, token);
  await SecureStore.setItemAsync(CLAVE_EMISION, String(emitidoEn));
}

export async function guardarSesion({ token, emitidoEn, usuario }: SesionGuardada): Promise<void> {
  await guardarToken(token, emitidoEn);
  await SecureStore.setItemAsync(CLAVE_USUARIO, JSON.stringify(usuario));
}

export async function guardarUsuario(usuario: UsuarioGuardado): Promise<void> {
  await SecureStore.setItemAsync(CLAVE_USUARIO, JSON.stringify(usuario));
}

/** Milisegundos desde la emisión del token guardado, o null si no hay token. */
export async function edadDelToken(ahora: number = Date.now()): Promise<number | null> {
  const emitido = Number(await SecureStore.getItemAsync(CLAVE_EMISION));
  if (!Number.isFinite(emitido) || emitido <= 0) {
    return null;
  }
  return Math.max(0, ahora - emitido);
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

/** Sesión completa guardada, o null si falta alguna pieza o está dañada. */
export async function leerSesion(): Promise<SesionGuardada | null> {
  const token = await getToken();
  const textoUsuario = await SecureStore.getItemAsync(CLAVE_USUARIO);
  const emitidoEn = Number(await SecureStore.getItemAsync(CLAVE_EMISION));
  if (!token || !textoUsuario || !Number.isFinite(emitidoEn) || emitidoEn <= 0) {
    return null;
  }
  let usuario: UsuarioGuardado | null = null;
  try {
    usuario = aUsuario(JSON.parse(textoUsuario));
  } catch {
    usuario = null;
  }
  return usuario ? { token, emitidoEn, usuario } : null;
}

/** Borra token, momento de emisión y usuario. */
export async function borrarSesion(): Promise<void> {
  await SecureStore.deleteItemAsync(CLAVE_TOKEN);
  await SecureStore.deleteItemAsync(CLAVE_EMISION);
  await SecureStore.deleteItemAsync(CLAVE_USUARIO);
}
