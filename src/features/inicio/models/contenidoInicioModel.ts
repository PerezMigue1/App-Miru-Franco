/**
 * Reglas puras del contenido de Inicio que viene de la configuración y del contenido administrable
 * (GP-07.3): cómo se parte la frase grande del hero, el texto del botón del Fluido Di Goji y a dónde
 * lleva el enlace de una promoción. Sin React ni peticiones.
 */

/** Tipografía de una línea de la frase grande del hero. */
export type EstiloLinea = 'serif' | 'manuscrita';

export interface LineaDestacado {
  texto: string;
  estilo: EstiloLinea;
}

/** Botón del hero cuando el catálogo no trae el nombre del Fluido Di Goji. */
export const BOTON_GOJI_RESPALDO = 'Ver Fluido Di Goji';

/**
 * Frase grande del hero (contenido.inicio.heroDestacado), como .mf-fluidos__gigante de la web: con
 * tres palabras o más, la primera en serif, las del medio en manuscrita y la última en serif
 * ("Brillo / que se / nota"); con una o dos palabras, cada una en serif. Sin palabras, [].
 */
export function partirDestacado(texto: string): LineaDestacado[] {
  const palabras = texto.trim().split(/\s+/).filter(Boolean);
  if (palabras.length < 3) {
    return palabras.map((palabra) => ({ texto: palabra, estilo: 'serif' }));
  }
  return [
    { texto: palabras[0], estilo: 'serif' },
    { texto: palabras.slice(1, -1).join(' '), estilo: 'manuscrita' },
    { texto: palabras[palabras.length - 1], estilo: 'serif' },
  ];
}

/** "Ver {nombre}" con el nombre del catálogo; sin nombre, el texto de siempre. */
export function tituloBotonGoji(nombre: string | null | undefined): string {
  const limpio = nombre?.trim();
  return limpio ? `Ver ${limpio}` : BOTON_GOJI_RESPALDO;
}

/** A dónde lleva una promoción: una pantalla de la app o una página https externa. */
export type DestinoPromocion = { tipo: 'ruta'; ruta: string } | { tipo: 'url'; url: string };

/** Rutas del sitio web que tienen su pantalla en la app. */
const RUTAS_DEL_SITIO: { patron: RegExp; ruta: (coincidencia: RegExpExecArray) => string }[] = [
  { patron: /^\/cliente\/servicios-citas\/servicios\/([^/]+)\/?$/, ruta: (m) => `/servicio/${m[1]}` },
  { patron: /^\/cliente\/servicios-citas\/?$/, ruta: () => '/citas' },
  { patron: /^\/cliente\/tienda-online\/?$/, ruta: () => '/tienda' },
  { patron: /^\/(?:contacto|sobre-nosotros)\/?$/, ruta: () => '/salon' },
];

/** Rutas propias de la app que se aceptan tal cual. */
const RUTA_DE_LA_APP =
  /^\/(?:inicio|citas|tienda|carrito|perfil|salon|mis-citas|mis-pedidos|(?:servicio|producto)\/[\w-]+)$/;

/**
 * Destino del enlace de una promoción (ya normalizado por contenidoSalonModel: ruta interna o URL
 * https). Una URL https se abre fuera de la app; una ruta del sitio con pantalla en la app abre esa
 * pantalla; cualquier otra ruta no tiene destino (null) y la tarjeta queda sin enlace.
 */
export function destinoDePromocion(enlace: string | null): DestinoPromocion | null {
  if (!enlace) {
    return null;
  }
  if (enlace.startsWith('https://')) {
    return { tipo: 'url', url: enlace };
  }
  const camino = enlace.split(/[?#]/)[0];
  for (const { patron, ruta } of RUTAS_DEL_SITIO) {
    const coincidencia = patron.exec(camino);
    if (coincidencia) {
      return { tipo: 'ruta', ruta: ruta(coincidencia) };
    }
  }
  return RUTA_DE_LA_APP.test(camino) ? { tipo: 'ruta', ruta: camino } : null;
}
