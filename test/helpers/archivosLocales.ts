/// <reference types="jest" />

/**
 * expo-file-system en memoria (API de clases: File y Paths). Nunca toca el disco. Se instala en
 * cada archivo de prueba que lo necesite con:
 *
 *   jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);
 *
 * y cada prueba empieza con limpiarArchivos() (vacía los archivos y quita las fallas). Las pruebas
 * que ya simulan expo-file-system a su manera (solo File con uri o size) no se ven afectadas.
 */

/** Carpeta simulada de Paths.document. */
export const DOCUMENTOS = 'file:///documentos';
/** Carpeta simulada de Paths.cache. */
export const CACHE = 'file:///cache';

/** Fallas que una prueba puede encender: acceso a Paths, lectura o escritura. */
export interface FallasArchivos {
  /** Paths.document y Paths.cache lanzan (como un simulador sin Paths). */
  acceso: boolean;
  /** text() y textSync() lanzan. */
  leer: boolean;
  /** create() y write() lanzan. */
  escribir: boolean;
}

const archivos = new Map<string, string>();
const fallas: FallasArchivos = { acceso: false, leer: false, escribir: false };

type Parte = string | { uri: string };

/** Une las partes de la ruta como lo hace File: carpeta + nombre, con una sola diagonal. */
function unir(partes: Parte[]): string {
  return partes
    .map((parte) => (typeof parte === 'string' ? parte : parte.uri))
    .map((parte, i) => (i === 0 ? parte.replace(/\/+$/, '') : parte.replace(/^\/+|\/+$/g, '')))
    .join('/');
}

class ArchivoSimulado {
  readonly uri: string;

  constructor(...partes: Parte[]) {
    this.uri = unir(partes);
  }

  get exists(): boolean {
    return archivos.has(this.uri);
  }

  get size(): number {
    return archivos.get(this.uri)?.length ?? 0;
  }

  textSync(): string {
    const contenido = archivos.get(this.uri);
    if (fallas.leer || contenido === undefined) {
      throw new Error('No se pudo leer el archivo simulado.');
    }
    return contenido;
  }

  text(): Promise<string> {
    try {
      return Promise.resolve(this.textSync());
    } catch (error) {
      return Promise.reject(error as Error);
    }
  }

  /** Crea el archivo vacío; como el real, lanza si ya existe. */
  create(): void {
    if (this.exists) {
      throw new Error('El archivo simulado ya existe.');
    }
    this.write('');
  }

  write(contenido: string): void {
    if (fallas.escribir) {
      throw new Error('No se pudo escribir el archivo simulado.');
    }
    archivos.set(this.uri, contenido);
  }

  delete(): void {
    archivos.delete(this.uri);
  }
}

function carpeta(uri: string): { uri: string } {
  if (fallas.acceso) {
    throw new Error('Paths no disponible en el simulador.');
  }
  return { uri };
}

/** Lo que devuelve el mock de 'expo-file-system'. */
export const moduloArchivos = {
  File: ArchivoSimulado,
  Paths: {
    get document() {
      return carpeta(DOCUMENTOS);
    },
    get cache() {
      return carpeta(CACHE);
    },
  },
};

/** Uri de un archivo dentro de Paths.document. */
export const enDocumentos = (nombre: string) => `${DOCUMENTOS}/${nombre}`;

/** Deja un archivo en Paths.document con ese contenido, como si la app lo hubiera guardado antes. */
export function sembrarArchivo(nombre: string, contenido: string): void {
  archivos.set(enDocumentos(nombre), contenido);
}

/** Contenido de un archivo de Paths.document, o undefined si no existe. */
export function leerArchivo(nombre: string): string | undefined {
  return archivos.get(enDocumentos(nombre));
}

/** Uris de todos los archivos que hay ahora. */
export function archivosGuardados(): string[] {
  return [...archivos.keys()];
}

/** Enciende o apaga fallas del disco simulado. */
export function fallarArchivos(cambios: Partial<FallasArchivos>): void {
  Object.assign(fallas, cambios);
}

/** Borra todos los archivos y apaga las fallas. */
export function limpiarArchivos(): void {
  archivos.clear();
  fallarArchivos({ acceso: false, leer: false, escribir: false });
}
