/**
 * Tokens del sistema "Atelier cálido" (DESIGN.md). Es el único lugar del código donde se escriben
 * colores y medidas: las pantallas y componentes solo leen de aquí.
 */

/**
 * Paleta: cada valor sale de una variable del sitio web (.referencia-web/src/app/styles), que es la
 * fuente de verdad. Entre paréntesis, la variable de origen.
 */
export const paleta = {
  lino: '#DCC8B6', // --fondo-general (claro)
  terracota: '#B38E6F', // --tarjetas-paneles (claro), --texto-secundario (oscuro)
  arena: '#d0b29c', // --fondos-suaves (claro)
  vino: '#710014', // --botones-principales, --mf-foco (claro)
  vinoProfundo: '#600011', // --menu-texto-principal, --danger-texto (claro)
  oro: '#9f6d1f', // --logo-branding
  oroFoco: '#c4954d', // --mf-foco, --oro-sobre-carbon, --nav-activo-icono (oscuro)
  oroSobreCarbon: '#b07a28', // --oro-sobre-carbon (claro)
  carbon: '#161616', // --header-footer, --fondo-general (oscuro)
  carbonMedio: '#1f1f1f', // --fondos-suaves, --input-bg, --mf-banda (oscuro)
  carbonClaro: '#2a2a2a', // --texto-cuerpo, --encabezados-alterno (claro), --tarjetas-paneles (oscuro)
  crema: '#F2F1ED', // --input-bg, --texto-fondo-oscuro (claro), --btn-secundario-texto (oscuro)
  blanco: '#ffffff', // --menu-texto-principal, --texto-fondo-oscuro (oscuro)
  textoSecundario: '#4a4541', // --texto-secundario (claro)
  bordeCampoClaro: '#8a7667', // --campo-borde (claro)
  bordeCampoOscuro: '#6e6e6e', // --campo-borde (oscuro)
  placeholderClaro: '#6b5a4e', // --campo-placeholder (claro)
  placeholderOscuro: '#b8a597', // --campo-placeholder (oscuro)
  peligroOscuro: '#e0748f', // --danger-texto (oscuro)
  exitoClaro: '#242d1b', // --success-texto (claro)
  exitoOscuro: '#82a163', // --success-texto (oscuro)
  avisoClaro: '#37280b', // --warning-texto = --oro-texto (claro)
  avisoOscuro: '#D98E04', // --warning-texto = --warning (oscuro)
} as const;

/** Resplandor detrás de cada frasco del hero (solo para eso). Valores de fluidosHero.ts de la web. */
export const colorFluido = {
  goji: '#7a1a1f',
  argan: '#d99a4e',
  platino: '#5b3fd6',
  hialuronico: '#d9728f',
} as const;

/** Colores con transparencia, también tomados de la web. */
const transparencias = {
  cremaCuerpo: 'rgba(242, 241, 237, 0.88)', // --texto-cuerpo (oscuro)
  cremaSobreCarbon: 'rgba(242, 241, 237, 0.8)', // --texto-fondo-oscuro-80 (claro)
  blancoSobreCarbon: 'rgba(255, 255, 255, 0.8)', // --texto-fondo-oscuro-80 (oscuro)
  lineaClaro: 'rgba(113, 0, 20, 0.14)', // --mf-linea (claro)
  lineaOscuro: 'rgba(255, 255, 255, 0.08)', // --mf-linea (oscuro)
  presionadoClaro: 'rgba(113, 0, 20, 0.05)', // --nav-hover-bg (claro)
  presionadoOscuro: 'rgba(255, 255, 255, 0.04)', // --nav-hover-bg (oscuro)
  // Sin variable equivalente en la web (se conserva y se reporta): velo del visor y de las hojas.
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
  /** Botón secundario. */
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
  /** Errores de formulario y acciones destructivas. */
  peligro: string;
  /** Fondo de una fila mientras se presiona. */
  presionado: string;
  /** Confirmación de un estado (por ejemplo, "Correo disponible"). */
  exito: string;
  /** Estado en espera o que pide atención sin ser error. */
  aviso: string;
  /** Enlaces de texto. */
  enlace: string;
}

export const temaClaro: Colores = {
  fondo: paleta.lino,
  superficie: paleta.terracota,
  superficieSecundaria: paleta.arena,
  texto: paleta.carbonClaro,
  textoSuave: paleta.textoSecundario,
  accion: paleta.vino,
  textoSobreAccion: paleta.crema,
  secundario: paleta.terracota,
  textoSobreSecundario: paleta.carbonClaro,
  foco: paleta.vino,
  hairline: transparencias.lineaClaro,
  campoFondo: paleta.crema,
  campoBorde: paleta.bordeCampoClaro,
  campoTexto: paleta.vinoProfundo,
  campoPlaceholder: paleta.placeholderClaro,
  barraFondo: paleta.lino,
  iconoActivo: paleta.vino,
  iconoInactivo: paleta.carbonClaro,
  panel: paleta.carbon,
  textoSobrePanel: paleta.crema,
  textoSuaveSobrePanel: transparencias.cremaSobreCarbon,
  oro: paleta.oro,
  oroTextoPequeno: paleta.oroSobreCarbon,
  // --shadow-brand de la web: sombra tintada de vino del botón primario.
  sombra: paleta.vino,
  velo: transparencias.velo,
  peligro: paleta.vinoProfundo,
  presionado: transparencias.presionadoClaro,
  exito: paleta.exitoClaro,
  aviso: paleta.avisoClaro,
  enlace: paleta.vinoProfundo,
};

export const temaOscuro: Colores = {
  fondo: paleta.carbon,
  superficie: paleta.carbonClaro,
  superficieSecundaria: paleta.carbonMedio,
  texto: transparencias.cremaCuerpo,
  textoSuave: paleta.terracota,
  accion: paleta.vino,
  textoSobreAccion: paleta.blanco,
  secundario: paleta.carbonClaro,
  textoSobreSecundario: paleta.crema,
  foco: paleta.oroFoco,
  hairline: transparencias.lineaOscuro,
  campoFondo: paleta.carbonMedio,
  campoBorde: paleta.bordeCampoOscuro,
  campoTexto: paleta.blanco,
  campoPlaceholder: paleta.placeholderOscuro,
  barraFondo: paleta.carbonMedio,
  iconoActivo: paleta.oroFoco,
  iconoInactivo: paleta.terracota,
  panel: paleta.carbon,
  textoSobrePanel: paleta.blanco,
  textoSuaveSobrePanel: transparencias.blancoSobreCarbon,
  oro: paleta.oro,
  oroTextoPequeno: paleta.oroFoco,
  // La web usa negro puro en sombras oscuras; DESIGN.md lo prohíbe, así que se conserva carbón.
  sombra: paleta.carbon,
  velo: transparencias.velo,
  peligro: paleta.peligroOscuro,
  presionado: transparencias.presionadoOscuro,
  exito: paleta.exitoOscuro,
  aviso: paleta.avisoOscuro,
  enlace: paleta.blanco,
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
  casilla: 6,
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
  /** Trazo más grueso para la marca "G" y la palomita de la casilla. */
  trazoMarca: 2.4,
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
  /** 10sp: "Notificaciones" mide 69 dp en Geist y cada pestaña tiene 72 dp a 360 dp de ancho. */
  pestana: { tamano: 10, linea: 13 },
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
  /** Cambio de estado de un campo (verificando, disponible, requisito cumplido): igual que presionar. */
  estadoCampo: 140,
  /** Espera tras dejar de escribir el correo antes de verificar si ya está registrado. */
  verificarCorreo: 600,
  /** Si la verificación del correo no responde en este tiempo, deja de bloquear el registro. */
  limiteVerificacionCorreo: 6000,
} as const;

/** Intervalo de lectura del giroscopio. */
export const intervaloSensor = 50;

/** Escala al presionar: se hunde sin animar desde escala 0. */
export const escalaPresionado = 0.97;

/** Escala desde la que entra un ícono de estado (nunca desde 0). */
export const escalaEntrada = 0.9;

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
  /** La etiqueta se encoge hasta este factor si el sistema agranda la fuente. */
  escalaMinimaEtiqueta: 0.8,
} as const;

/** Cabecera fija de Inicio: alto del contenido bajo la barra de estado. */
export const cabecera = {
  alto: toqueMinimo + espacio.s * 2,
  relleno: espacio.s,
} as const;

/** Filas de lista (Perfil). */
export const fila = {
  alto: 56,
} as const;

/** Hoja modal del selector: alto máximo de la lista antes de desplazarse. */
export const hoja = {
  altoLista: 320,
} as const;

/** Casillas del código de verificación (OtpInput). */
export const codigo = {
  ancho: toqueMinimo,
  alto: 56,
} as const;

/** Casilla de verificación. */
export const casilla = {
  tamano: 24,
} as const;

/** Skeletons: alto de las líneas de texto y ancho de la línea corta. */
export const esqueleto = {
  linea: 14,
  lineaGrande: 20,
  anchoCorto: '60%',
  anchoMedio: '80%',
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
  cuadros: 12,
  puntoLeyenda: 10,
  /** Base de ancho de las pastillas de la leyenda: dos por fila. */
  baseChip: '47%',
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

/** Tienda: columnas de la cuadrícula de productos. */
export const tienda = {
  columnas: 2,
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
