/// <reference types="jest" />

/**
 * Servidor simulado para las pruebas con pantallas reales: respuestas falsas y un fetch que responde
 * por "MÉTODO /ruta". Nunca sale a la red.
 */

/** Base de la API en las pruebas (la fijan test/setup.ts y jest.config.js). */
export const API = 'http://api.test';

/** Respuesta mínima con lo que lee apiClient (ok, status y text()), más json() y headers. */
export function respuesta(cuerpo: unknown, status = 200): Response {
  const textoCuerpo = JSON.stringify(cuerpo);
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'Content-Type': 'application/json' }),
    text: () => Promise.resolve(textoCuerpo),
    json: () => Promise.resolve(JSON.parse(textoCuerpo) as unknown),
  } as unknown as Response;
}

function urlDe(entrada: unknown): string {
  if (typeof entrada === 'string') {
    return entrada;
  }
  if (entrada instanceof URL) {
    return entrada.href;
  }
  return (entrada as { url: string }).url;
}

/** Petición que recibió el fetch simulado. */
export interface Llamada {
  metodo: string;
  url: string;
  /** La url sin la base de la API. */
  ruta: string;
  cuerpo: unknown;
  cabeceras: Record<string, string>;
}

/** Lee lo que la app pasó a fetch: método, url, ruta, cuerpo JSON y cabeceras. */
export function leerLlamada(entrada: unknown, init?: RequestInit): Llamada {
  const url = urlDe(entrada);
  return {
    metodo: init?.method ?? 'GET',
    url,
    ruta: url.startsWith(API) ? url.slice(API.length) : url,
    cuerpo: typeof init?.body === 'string' ? (JSON.parse(init.body) as unknown) : undefined,
    cabeceras: (init?.headers ?? {}) as Record<string, string>,
  };
}

export type Manejador = (cuerpo: unknown) => Response;

/** Lista pública vacía con la forma del backend ({ success, data }). */
const listaVacia: Manejador = () => respuesta({ success: true, data: [] });

/**
 * Catálogos públicos vacíos que piden las pantallas de fondo. Desde GP-07.3 Inicio también pide el
 * contenido del salón (galería, promociones, equipo y preguntas frecuentes): vacío, cada sección se
 * oculta y la galería muestra su estado vacío, sin errores de fondo.
 */
export const CATALOGOS_VACIOS: Record<string, Manejador> = {
  'GET /api/servicios': listaVacia,
  'GET /api/productos': () => respuesta({ success: true, count: 0, data: [] }),
  'GET /api/galeria': listaVacia,
  'GET /api/contenido/promociones': listaVacia,
  'GET /api/contenido/equipo': listaVacia,
  'GET /api/contenido/preguntas-frecuentes': listaVacia,
};

/**
 * Arma simularServidor sobre unas rutas de fondo. simularServidor responde por "MÉTODO /ruta" (las
 * de la prueba encima de las de fondo) y 404 a todo lo demás, y devuelve la lista de llamadas para
 * revisar qué se envió.
 */
export function servidorConRutas(
  base: Record<string, Manejador>,
): (rutas: Record<string, Manejador>) => Llamada[] {
  return (rutas) => {
    const llamadas: Llamada[] = [];
    const todas = { ...base, ...rutas };
    globalThis.fetch = jest.fn((entrada: unknown, init?: RequestInit) => {
      const llamada = leerLlamada(entrada, init);
      llamadas.push(llamada);
      const manejador = todas[`${llamada.metodo} ${llamada.ruta}`];
      return Promise.resolve(
        manejador ? manejador(llamada.cuerpo) : respuesta({ message: 'No encontrado' }, 404),
      );
    }) as unknown as typeof fetch;
    return llamadas;
  };
}

export function llamadasA(llamadas: Llamada[], metodo: string, ruta: string): Llamada[] {
  return llamadas.filter((l) => l.metodo === metodo && l.url === `${API}${ruta}`);
}
