/**
 * Tokens del sistema "Atelier cálido" (DESIGN.md). Es el único lugar del código donde se escriben
 * colores y medidas: las pantallas y componentes solo leen de aquí.
 */

/** Paleta de marca. Sin colores nuevos: todos salen de DESIGN.md sección 2. */
export const paleta = {
  lino: '#DCC8B6',
  terracota: '#B38E6F',
  arena: '#d0b29c',
  vino: '#710014',
  oro: '#9f6d1f',
  oroFoco: '#c4954d',
  oroSobreCarbon: '#b07a28',
  carbon: '#161616',
  carbonMedio: '#1f1f1f',
  carbonClaro: '#2a2a2a',
  crema: '#F2F1ED',
  bordeCampoClaro: '#8a7667',
  bordeCampoOscuro: '#6e6e6e',
  placeholderClaro: '#6b5a4e',
  placeholderOscuro: '#b8a597',
} as const;

/** Resplandor detrás de cada frasco del hero (solo para eso). */
export const colorFluido = {
  goji: '#7a1a1f',
  argan: '#d99a4e',
  platino: '#5b3fd6',
  hialuronico: '#d9728f',
} as const;

/** Variantes con transparencia de la paleta (texto secundario, velos y sombras tintadas). */
const transparencias = {
  carbonTexto: 'rgba(22, 22, 22, 0.78)',
  carbonTenue: 'rgba(22, 22, 22, 0.12)',
  cremaTexto: 'rgba(242, 241, 237, 0.74)',
  cremaTenue: 'rgba(242, 241, 237, 0.12)',
  oroHairline: 'rgba(159, 109, 31, 0.45)',
  velo: 'rgba(22, 22, 22, 0.94)',
} as const;

export interface Colores {
  /** Lienzo de pantalla. */
  fondo: string;
  /** Superficie de tarjeta. */
  superficie: string;
  /** Superficies secundarias, marcos de imagen y skeletons. */
  superficieSecundaria: string;
  texto: string;
  textoSuave: string;
  /** Único acento de acción. */
  accion: string;
  textoSobreAccion: string;
  /** Botón secundario: texto oscuro sobre terracota. */
  secundario: string;
  textoSobreSecundario: string;
  foco: string;
  hairline: string;
  campoFondo: string;
  campoBorde: string;
  campoTexto: string;
  campoPlaceholder: string;
  barraFondo: string;
  iconoActivo: string;
  iconoInactivo: string;
  /** Panel de marca, placeholders de imagen y visor. */
  panel: string;
  textoSobrePanel: string;
  textoSuaveSobrePanel: string;
  oro: string;
  oroTextoPequeno: string;
  sombra: string;
  velo: string;
}

export const temaClaro: Colores = {
  fondo: paleta.lino,
  superficie: paleta.terracota,
  superficieSecundaria: paleta.arena,
  texto: paleta.carbon,
  textoSuave: transparencias.carbonTexto,
  accion: paleta.vino,
  textoSobreAccion: paleta.crema,
  secundario: paleta.terracota,
  textoSobreSecundario: paleta.carbon,
  foco: paleta.vino,
  hairline: transparencias.oroHairline,
  campoFondo: paleta.crema,
  campoBorde: paleta.bordeCampoClaro,
  campoTexto: paleta.carbon,
  campoPlaceholder: paleta.placeholderClaro,
  barraFondo: paleta.lino,
  iconoActivo: paleta.vino,
  iconoInactivo: transparencias.carbonTexto,
  panel: paleta.carbon,
  textoSobrePanel: paleta.crema,
  textoSuaveSobrePanel: transparencias.cremaTexto,
  oro: paleta.oro,
  oroTextoPequeno: paleta.oroSobreCarbon,
  sombra: paleta.vino,
  velo: transparencias.velo,
};

export const temaOscuro: Colores = {
  fondo: paleta.carbon,
  superficie: paleta.carbonMedio,
  superficieSecundaria: paleta.carbonClaro,
  texto: paleta.crema,
  textoSuave: transparencias.cremaTexto,
  accion: paleta.vino,
  textoSobreAccion: paleta.crema,
  secundario: paleta.terracota,
  textoSobreSecundario: paleta.carbon,
  foco: paleta.oroFoco,
  hairline: transparencias.oroHairline,
  campoFondo: paleta.crema,
  campoBorde: paleta.bordeCampoOscuro,
  campoTexto: paleta.carbon,
  campoPlaceholder: paleta.placeholderOscuro,
  barraFondo: paleta.carbonMedio,
  iconoActivo: paleta.oro,
  iconoInactivo: transparencias.cremaTexto,
  panel: paleta.carbon,
  textoSobrePanel: paleta.crema,
  textoSuaveSobrePanel: transparencias.cremaTexto,
  oro: paleta.oro,
  oroTextoPequeno: paleta.oroSobreCarbon,
  sombra: paleta.carbon,
  velo: transparencias.velo,
};

/** Ritmo de 4px. */
export const espacio = {
  xxs: 2,
  xs: 4,
  s: 8,
  m: 12,
  l: 16,
  xl: 20,
  xxl: 24,
  x3: 32,
  x4: 40,
  x5: 48,
  x6: 64,
} as const;

export const radio = {
  campo: 10,
  tarjeta: 14,
  sticker: 17,
  pastilla: 999,
} as const;

export const borde = {
  hairline: 1,
  campo: 1.5,
  indicador: 2,
} as const;

/** Objetivo táctil mínimo (Android). */
export const toqueMinimo = 48;

export const icono = {
  tamano: 24,
  tamanoPequeno: 18,
  trazo: 1.75,
} as const;

/** Familias cargadas en src/app/_layout.tsx con @expo-google-fonts. */
export const fuente = {
  titulo: 'PlayfairDisplay_600SemiBold',
  tituloFuerte: 'PlayfairDisplay_700Bold',
  texto: 'Geist_400Regular',
  textoMedio: 'Geist_500Medium',
  textoFuerte: 'Geist_600SemiBold',
  manuscrita: 'GreatVibes_400Regular',
} as const;

/** Tamaño y alto de línea (texto en 1.5–1.6; títulos más cerrados). */
export const tipo = {
  etiqueta: { tamano: 13, linea: 20 },
  pequeno: { tamano: 14, linea: 22 },
  cuerpo: { tamano: 16, linea: 25 },
  subtitulo: { tamano: 20, linea: 28 },
  titulo: { tamano: 28, linea: 34 },
  marca: { tamano: 44, linea: 48 },
  marcaManuscrita: { tamano: 40, linea: 52 },
  gigante: { tamano: 52, linea: 54 },
  pestana: { tamano: 11, linea: 14 },
} as const;

/** Espaciado de letra: títulos ligeramente cerrados, lema abierto. */
export const tracking = {
  titulo: -0.4,
  gigante: -1.2,
  lema: 2.4,
  monograma: 1,
} as const;

/** Sombra tintada de tarjeta y botón (Android usa elevation). */
export const sombra = {
  tarjeta: { opacidad: 0.22, radio: 14, desplazamientoY: 8, elevacion: 4 },
  boton: { opacidad: 0.35, radio: 12, desplazamientoY: 6, elevacion: 3 },
} as const;

/** Curvas como puntos de control de cubic-bezier (DESIGN.md sección 7). */
export const curva = {
  salida: [0.23, 1, 0.32, 1],
  entradaSalida: [0.77, 0, 0.175, 1],
} as const;

/** Duraciones en milisegundos (DESIGN.md sección 7). */
export const duracion = {
  presionar: 140,
  pestana: 240,
  entrada: 520,
  escalonado: 60,
  acceso: 680,
  intro: 1300,
  /** Amortiguado del parallax: cada lectura del giroscopio se alcanza en este tiempo. */
  parallax: 600,
  /** Medio ciclo del pulso de los skeletons. */
  pulso: 900,
} as const;

/** Intervalo de lectura del giroscopio. */
export const intervaloSensor = 50;

/** Escala al presionar: se hunde sin animar desde escala 0. */
export const escalaPresionado = 0.97;

export const opacidad = {
  deshabilitado: 0.45,
  /** Pulso de los skeletons. */
  pulsoMinimo: 0.55,
} as const;

export const monograma = {
  pequeno: 40,
  mediano: 72,
  grande: 120,
  /** Proporción de la letra respecto al diámetro. */
  proporcionLetra: 0.36,
} as const;

export const pantalla = {
  margen: espacio.xl,
} as const;

/** Pestañas inferiores. */
export const pestanas = {
  altoItem: toqueMinimo,
  relleno: espacio.xs,
} as const;

/** Acceso: panel de marca compacto y pestañas Acceso / Registro. */
export const acceso = {
  rellenoPanel: espacio.x3,
} as const;

/** Intro de la grieta: tiempos parciales dentro de los 1300 ms y separación de las mitades. */
export const intro = {
  trazo: 380,
  apertura: 780,
  desvanecer: 140,
  /** Fracción del ancho de pantalla que se desplaza cada mitad. */
  separacion: 0.62,
  giro: 4,
  trazoGrosor: 1.5,
  letra: 76,
  /** Desplazamiento de la línea base para centrar "MF" en vertical, en proporción a la letra. */
  ajusteBase: 0.34,
  /** Capa por encima del Stack. */
  capa: 10,
} as const;

/** Hero de fluidos. */
export const hero = {
  /** Ancho / alto de los renders de frascos y de la secuencia de giro. */
  proporcionFrasco: 420 / 1364,
  proporcionGiro: 360 / 1164,
  /** Recorrido del scroll en el que el escenario queda fijo, como fracción del alto visible. */
  recorrido: 0.9,
  /** Alto final del Goji sobre la tipografía, como fracción del alto del escenario. */
  altoGojiDestino: 0.42,
  /** Amplitud del parallax en móvil (px y grados por unidad de profundidad). */
  parallaxX: 10,
  parallaxY: 7,
  parallaxGiro: 1.25,
  /** Desplazamiento de salida al hacer scroll. */
  salidaY: 48,
  /** Entrada de los stickers. */
  stickerDesde: 8,
  stickerEscala: 0.9,
  cuadros: 24,
  puntoLeyenda: 10,
  /** Opacidad del color del fluido en el centro del resplandor y su tamaño respecto al frasco. */
  resplandor: 0.32,
  resplandorAncho: 2.4,
  resplandorAlto: 0.62,
  resplandorArriba: 0.3,
  /** Progreso del scroll en el que el parallax ya volvió a cero. */
  reposo: 0.05,
  /** Por encima de este progreso el Goji fijo cede su lugar a la secuencia de giro. */
  umbralViaje: 0.002,
  /** Tramo del progreso en el que salen texto, leyenda y frascos de fondo. */
  finSalida: 0.35,
  /** Tramo del progreso en el que entra la tipografía grande. */
  destinoDesde: 0.22,
  destinoHasta: 0.67,
  escalaDestino: 0.94,
  /** Inclinación del teléfono: rango en grados para el máximo del parallax y postura de reposo. */
  rangoInclinacion: 30,
  inclinacionReposo: 45,
  /** Alto en px del render de 240: por encima se usa el de 420. */
  altoRenderChico: 779,
} as const;

/** Orden de capas del escenario del hero. */
export const capaHero = {
  stickers: 0,
  destino: 5,
  viaje: 6,
} as const;

/** Stickers vectoriales: posición en % de la composición, ancho en px y giro en grados. */
export const stickers = {
  tijeras: { x: -2, y: 0, ancho: 52, giro: -12, prof: 1.3 },
  destello: { x: 60, y: 0, ancho: 44, giro: 8, prof: 1.5 },
  gota: { x: 84, y: 4, ancho: 44, giro: 10, prof: 1.2 },
  peine: { x: 2, y: 80, ancho: 48, giro: -7, prof: 1.4 },
  trazo: 4,
  trazoInterior: 3.2,
} as const;

export const colorSticker = {
  tijeras: { fondo: paleta.vino, tinta: paleta.crema },
  destello: { fondo: paleta.oro, tinta: paleta.crema },
  gota: { fondo: colorFluido.hialuronico, tinta: paleta.vino },
  peine: { fondo: paleta.lino, tinta: paleta.vino },
  papel: paleta.crema,
} as const;

/** Galería: mosaico de 4 columnas por 3 filas por cada 7 fotos. */
export const galeria = {
  columnas: 4,
  filasPorBloque: 3,
  fotosPorBloque: 7,
  separacion: espacio.s,
} as const;

/** Visor de fotos. */
export const visor = {
  rellenoPie: espacio.l,
} as const;
