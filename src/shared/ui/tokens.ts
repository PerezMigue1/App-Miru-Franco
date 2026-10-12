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
  oroGrande: '#865a17', // --oro-grande (claro): oro para texto grande (3.7:1 sobre lino)
  hover: '#A64B63', // --hover: vino claro del botón presionado (crema encima 4.9:1)
  salvia: '#758764', // --boton-acento-bg: botón de acento (carbón encima 4.7:1)
  giganteOscuro: '#c9a585', // --mf-gigante (oscuro), cliente.css: texto gigante del hero (7.9:1)
  papel: '#f6efe6', // papel y tinta de los stickers del hero (StickersSalon de la web)
  oroCalidoHero: '#a36b1f', // rgba(163, 107, 31) del radial de abajo de .hero-bg-gradient (claro)
  iconografia: '#BFA181', // --iconografia: solo decorativo (1.5:1 sobre lino)
  cafeSombra: '#3A1C0A', // rgba(58, 28, 10) de --mf-sombra-1 (claro): sombra tintada de café
  oroFoco: '#c4954d', // --mf-foco, --oro-sobre-carbon, --nav-activo-icono (oscuro)
  oroSobreCarbon: '#b07a28', // --oro-sobre-carbon (claro)
  carbon: '#161616', // --header-footer, --fondo-general (oscuro)
  carbonMedio: '#1f1f1f', // --fondos-suaves, --input-bg, --mf-banda (oscuro)
  carbonClaro: '#2a2a2a', // --texto-cuerpo, --encabezados-alterno (claro), --tarjetas-paneles (oscuro)
  crema: '#F2F1ED', // --input-bg, --texto-fondo-oscuro (claro), --btn-secundario-texto (oscuro)
  blanco: '#ffffff', // --menu-texto-principal, --texto-fondo-oscuro (oscuro)
  textoSecundario: '#4a4541', // --texto-secundario (claro)
  bordeCampoClaro: '#7a6658', // --campo-borde (claro): 4.8:1 contra el fondo del campo
  bordeCampoOscuro: '#787878', // --campo-borde (oscuro): 3.25:1 sobre la tarjeta #2a2a2a
  placeholderClaro: '#6f6a66', // --campo-placeholder-texto (claro), el de .mf-campo: 4.7:1
  placeholderOscuro: '#8c8885', // --campo-placeholder-texto (oscuro), el de .mf-campo: 4.7:1
  esqueletoOscuro: '#787878', // --skeleton-bg (oscuro)
  infoClaro: '#1f4466', // --info-texto (claro)
  infoOscuro: '#8fb6d9', // --info-texto (oscuro)
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
  lineaFuerteClaro: 'rgba(42, 42, 42, 0.22)', // --mf-linea-fuerte (claro)
  lineaFuerteOscuro: 'rgba(255, 255, 255, 0.16)', // --mf-linea-fuerte (oscuro)
  focoHaloClaro: 'rgba(113, 0, 20, 0.22)', // halo del foco del campo: --mf-foco al 22 % (claro)
  focoHaloOscuro: 'rgba(196, 149, 77, 0.22)', // halo del foco del campo: --mf-foco al 22 % (oscuro)
  activoClaro: 'rgba(113, 0, 20, 0.1)', // --nav-activo-bg (claro)
  activoOscuro: 'rgba(255, 255, 255, 0.08)', // --nav-activo-bg (oscuro)
  marfil70: 'rgba(242, 241, 237, 0.7)', // --texto-fondo-oscuro-70 (claro) = --marfil-70
  blanco70: 'rgba(255, 255, 255, 0.7)', // --texto-fondo-oscuro-70 (oscuro)
  blanco07: 'rgba(255, 255, 255, 0.07)', // --blanco-07: filete sobre el cromo carbón
  lemaHeroOscuro: 'rgba(242, 241, 237, 0.85)', // --hero-tagline-color (oscuro)
  velo: 'rgba(22, 22, 22, 0.55)', // .mf-velo: detrás de hojas y diálogos
  veloVisor: 'rgba(22, 22, 22, 0.92)', // --carbon-92: visor de fotos y botones sobre foto
  // --segmentado-borde (claro) y fondos que no se pintan (pressable en reposo, botón con borde).
  transparente: 'transparent',
} as const;

export interface Colores {
  /** Lienzo de pantalla. */
  fondo: string;
  /** Superficie de tarjeta. */
  superficie: string;
  /** Superficies secundarias, marcos de imagen y skeletons. */
  superficieSecundaria: string;
  /** Texto principal: el color del body de la web (--menu-texto-principal). */
  texto: string;
  /** Texto secundario (--encabezados-alterno): también sobre terracota (4.8:1). */
  textoSuave: string;
  /** Texto de cuerpo neutro (--texto-cuerpo): hojas, diálogos y chips del hero. */
  textoCuerpo: string;
  /** Único acento de acción. */
  accion: string;
  /** Fondo del botón primario mientras se presiona (--hover). */
  accionPresionado: string;
  /** Botón de acento (--boton-acento-bg) y su texto (--texto-sobre-acento). */
  acento: string;
  textoSobreAcento: string;
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
  /** Cromo (cabecera y barra inferior): --header-footer, carbón en los dos temas. */
  barraFondo: string;
  /** Ícono activo de la barra: oro sobre carbón (--oro-sobre-carbon). */
  iconoActivo: string;
  /** Ícono y etiqueta inactivos de la barra: marfil al 70 % (--texto-fondo-oscuro-70). */
  iconoInactivo: string;
  /** Filete superior de la barra inferior sobre el cromo (--blanco-07). */
  hairlineCromo: string;
  /** Fondo de un botón presionado sobre el cromo (--nav-hover-bg oscuro: blanco al 4 %). */
  presionadoCromo: string;
  /** Panel de marca, placeholders de imagen y visor. */
  panel: string;
  textoSobrePanel: string;
  textoSuaveSobrePanel: string;
  oro: string;
  oroTextoPequeno: string;
  /** --oro-texto: oro para texto de cualquier tamaño (8.8:1 sobre lino; 6.7:1 sobre carbón). */
  oroTexto: string;
  /** --oro-grande: "MIRÚ" y "Franco" de la marca; solo texto grande, nunca sobre terracota. */
  oroGrande: string;
  /** --iconografia: íconos y filetes decorativos (no lleva significado: 1.5:1 sobre lino). */
  iconografia: string;
  /** Sombra tintada del botón primario (vino en claro). */
  sombra: string;
  /** Sombra de tarjetas: café rgba(58, 28, 10) en claro (--mf-sombra-1); carbón en oscuro. */
  sombraTarjeta: string;
  /** Velo detrás de hojas y diálogos (.mf-velo, 55 %). */
  velo: string;
  /** Velo del visor de fotos y de los botones sobre una foto (--carbon-92). */
  veloVisor: string;
  /** --superficie-elevada: tarjeta interna sobre una tarjeta o un panel. */
  superficieElevada: string;
  /** --superficie-modal: fondo de hojas y diálogos. */
  superficieModal: string;
  /** --skeleton-bg. */
  esqueleto: string;
  /** --mf-linea-fuerte: borde de tarjetas con borde y encabezado de hojas. */
  hairlineFuerte: string;
  /** Halo del foco de un campo (--mf-foco al 22 %). */
  focoHalo: string;
  /** --info-texto. */
  info: string;
  /** Texto gigante del hero (--mf-gigante). */
  gigante: string;
  /** Lema y párrafo del hero (--hero-tagline-color). */
  lemaHero: string;
  /** --nav-activo-texto: etiqueta de la pestaña activa. */
  textoActivo: string;
  /** --nav-activo-bg: fondo de la opción de navegación activa. */
  fondoActivo: string;
  /** --segmentado-borde: borde del control segmentado (sin borde en claro). */
  segmentadoBorde: string;
  /** Fondo que no se pinta (pressable en reposo, botón con borde). */
  transparente: string;
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
  /** Borde y texto del botón con borde (--menu-texto-principal de la web): 8.6:1 en claro y 18:1 en oscuro. */
  contorno: string;
  /**
   * Relleno del día y del horario elegidos. Claro: vino (4.1:1 sobre terracota, 7.6:1 sobre lino).
   * Oscuro: el vino casi desaparece sobre carbón (1.2:1), así que se usa el oro de foco oscuro
   * (5.3:1 sobre la tarjeta #2a2a2a y 6.7:1 sobre el fondo #161616).
   */
  seleccion: string;
  /** Número sobre el relleno de selección: crema sobre vino (10.9:1) y carbón sobre oro (6.7:1). */
  textoSobreSeleccion: string;
}

export const temaClaro: Colores = {
  fondo: paleta.lino,
  superficie: paleta.terracota,
  superficieSecundaria: paleta.arena,
  texto: paleta.vinoProfundo,
  textoSuave: paleta.carbonClaro,
  textoCuerpo: paleta.carbonClaro,
  accion: paleta.vino,
  accionPresionado: paleta.hover,
  acento: paleta.salvia,
  textoSobreAcento: paleta.carbon,
  textoSobreAccion: paleta.crema,
  secundario: paleta.terracota,
  textoSobreSecundario: paleta.carbonClaro,
  foco: paleta.vino,
  hairline: transparencias.lineaClaro,
  campoFondo: paleta.crema,
  campoBorde: paleta.bordeCampoClaro,
  campoTexto: paleta.vinoProfundo,
  campoPlaceholder: paleta.placeholderClaro,
  barraFondo: paleta.carbon,
  iconoActivo: paleta.oroSobreCarbon,
  iconoInactivo: transparencias.marfil70,
  hairlineCromo: transparencias.blanco07,
  presionadoCromo: transparencias.presionadoOscuro,
  panel: paleta.carbon,
  textoSobrePanel: paleta.crema,
  textoSuaveSobrePanel: transparencias.cremaSobreCarbon,
  oro: paleta.oro,
  oroTextoPequeno: paleta.oroSobreCarbon,
  oroTexto: paleta.avisoClaro,
  oroGrande: paleta.oroGrande,
  iconografia: paleta.iconografia,
  // Sombra tintada de vino del botón primario (precedente en la web: indicador de pestañas, cliente.css).
  sombra: paleta.vino,
  sombraTarjeta: paleta.cafeSombra,
  velo: transparencias.velo,
  veloVisor: transparencias.veloVisor,
  superficieElevada: paleta.blanco,
  superficieModal: paleta.lino,
  esqueleto: paleta.arena,
  hairlineFuerte: transparencias.lineaFuerteClaro,
  focoHalo: transparencias.focoHaloClaro,
  info: paleta.infoClaro,
  gigante: paleta.vinoProfundo,
  lemaHero: paleta.carbonClaro,
  textoActivo: paleta.oroSobreCarbon,
  fondoActivo: transparencias.activoClaro,
  segmentadoBorde: transparencias.transparente,
  transparente: transparencias.transparente,
  peligro: paleta.vinoProfundo,
  presionado: transparencias.presionadoClaro,
  exito: paleta.exitoClaro,
  aviso: paleta.avisoClaro,
  enlace: paleta.vinoProfundo,
  contorno: paleta.vinoProfundo,
  seleccion: paleta.vino,
  textoSobreSeleccion: paleta.crema,
};

export const temaOscuro: Colores = {
  fondo: paleta.carbon,
  superficie: paleta.carbonClaro,
  superficieSecundaria: paleta.carbonMedio,
  texto: paleta.blanco,
  textoSuave: paleta.terracota,
  textoCuerpo: transparencias.cremaCuerpo,
  accion: paleta.vino,
  accionPresionado: paleta.hover,
  acento: paleta.salvia,
  textoSobreAcento: paleta.carbon,
  textoSobreAccion: paleta.blanco,
  secundario: paleta.carbonClaro,
  textoSobreSecundario: paleta.crema,
  foco: paleta.oroFoco,
  hairline: transparencias.lineaOscuro,
  campoFondo: paleta.carbonMedio,
  campoBorde: paleta.bordeCampoOscuro,
  campoTexto: paleta.blanco,
  campoPlaceholder: paleta.placeholderOscuro,
  barraFondo: paleta.carbon,
  iconoActivo: paleta.oroFoco,
  iconoInactivo: transparencias.blanco70,
  hairlineCromo: transparencias.blanco07,
  presionadoCromo: transparencias.presionadoOscuro,
  panel: paleta.carbon,
  textoSobrePanel: paleta.blanco,
  textoSuaveSobrePanel: transparencias.blancoSobreCarbon,
  oro: paleta.oro,
  oroTextoPequeno: paleta.oroFoco,
  oroTexto: paleta.oroFoco,
  oroGrande: paleta.oroFoco,
  iconografia: paleta.iconografia,
  // La web usa negro puro en sombras oscuras; DESIGN.md lo prohíbe, así que se conserva carbón.
  sombra: paleta.carbon,
  sombraTarjeta: paleta.carbon,
  velo: transparencias.velo,
  veloVisor: transparencias.veloVisor,
  superficieElevada: paleta.carbonClaro,
  superficieModal: paleta.carbonClaro,
  esqueleto: paleta.esqueletoOscuro,
  hairlineFuerte: transparencias.lineaFuerteOscuro,
  focoHalo: transparencias.focoHaloOscuro,
  info: paleta.infoOscuro,
  gigante: paleta.giganteOscuro,
  lemaHero: transparencias.lemaHeroOscuro,
  textoActivo: paleta.oroFoco,
  fondoActivo: transparencias.activoOscuro,
  segmentadoBorde: paleta.esqueletoOscuro,
  transparente: transparencias.transparente,
  peligro: paleta.peligroOscuro,
  presionado: transparencias.presionadoOscuro,
  exito: paleta.exitoOscuro,
  aviso: paleta.avisoOscuro,
  enlace: paleta.blanco,
  contorno: paleta.blanco,
  seleccion: paleta.oroFoco,
  textoSobreSeleccion: paleta.carbon,
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
  /** Botón con borde, anillos y casillas (--btn-borde 1.5px). */
  campo: 1.5,
  /** Borde del campo de texto (.mf-campo: 1px). */
  entrada: 1,
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
  /** Títulos: Playfair 700 como .mf-titulo-pagina de la web. */
  titulo: 'PlayfairDisplay_700Bold',
  /** Letras "MF" del monograma y de la intro de la grieta: se conservan en 600. */
  monograma: 'PlayfairDisplay_600SemiBold',
  tituloFuerte: 'PlayfairDisplay_700Bold',
  texto: 'Geist_400Regular',
  textoMedio: 'Geist_500Medium',
  textoFuerte: 'Geist_600SemiBold',
  manuscrita: 'GreatVibes_400Regular',
} as const;

/** Tamaño y alto de línea (texto en 1.5–1.6; títulos más cerrados). */
export const tipo = {
  etiqueta: { tamano: 13, linea: 20 },
  /** Etiqueta de un campo de formulario (.mf-etiqueta: 15px, peso 500). */
  etiquetaCampo: { tamano: 15, linea: 22 },
  pequeno: { tamano: 14, linea: 21 },
  /** Cuerpo: line-height 1.5 como el body de la web. */
  cuerpo: { tamano: 16, linea: 24 },
  /** Párrafos largos (descripciones, avisos extensos): line-height 1.625 de la web. */
  parrafo: { tamano: 16, linea: 26 },
  subtitulo: { tamano: 20, linea: 28 },
  /** .mf-titulo-pagina: clamp(30px…) con interlineado 1.15; a 360dp mide 30. */
  titulo: { tamano: 30, linea: 35 },
  marca: { tamano: 44, linea: 48 },
  marcaManuscrita: { tamano: 40, linea: 52 },
  gigante: { tamano: 52, linea: 54 },
  /** 10sp: "Notificaciones" mide 69 dp en Geist y cada pestaña tiene 72 dp a 360 dp de ancho. */
  pestana: { tamano: 10, linea: 13 },
} as const;

/**
 * Espaciado de letra: títulos en Playfair con -0.02em como la web (em × tamaño en px), lema abierto.
 * `titulo`, `gigante` y `lema` los usa también el hero de fluidos, que no se toca: se conservan.
 */
export const tracking = {
  titulo: -0.4,
  /** Título de pantalla (tipo.titulo, 30): -0.02em. */
  tituloPagina: -0.6,
  /** Subtítulo y título de hoja (tipo.subtitulo, 20): -0.02em. */
  subtitulo: -0.4,
  /** Título de tarjeta en Playfair (tipo.cuerpo, 16): -0.02em. */
  tituloTarjeta: -0.32,
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
  /** Hojas inferiores: arranque rápido y asentamiento largo, sin rebote. */
  hoja: [0.32, 0.72, 0, 1],
} as const;

/** Duraciones en milisegundos (DESIGN.md sección 7). */
export const duracion = {
  presionar: 140,
  pestana: 240,
  /** Aparición de listas, secciones y estados vacíos (opacidad y desplazamiento corto). */
  aparecer: 220,
  /** Hoja inferior: sube en este tiempo y baja más rápido de lo que sube. */
  hojaEntrada: 240,
  hojaSalida: 200,
  entrada: 520,
  escalonado: 60,
  acceso: 680,
  intro: 1300,
  /** Amortiguado del parallax: cada lectura del giroscopio se alcanza en este tiempo. */
  parallax: 600,
  /** Con movimiento reducido, hojas y diálogos solo se funden en este tiempo (sistema.css). */
  reducido: 160,
  /** Medio ciclo del pulso de los skeletons. */
  pulso: 900,
  /** Cambio de estado de un campo (verificando, disponible, requisito cumplido): igual que presionar. */
  estadoCampo: 140,
  /** Espera tras dejar de escribir el correo antes de verificar si ya está registrado. */
  verificarCorreo: 600,
  /** Si la verificación del correo no responde en este tiempo, deja de bloquear el registro. */
  limiteVerificacionCorreo: 6000,
  /** Espera antes de poder pedir otro código de verificación (cambio de contraseña). */
  esperaReenvioCodigo: 60000,
  /** Paso de una cuenta regresiva visible (un segundo). */
  cuentaRegresiva: 1000,
  /** Sesión móvil: el acceso se renueva antes de salir si le falta menos que esto para vencer. */
  margenRenovacion: 60000,
  /** Confirmación del pedido: cada cuánto se consulta el estado del pago mientras está pendiente. */
  consultaPago: 3000,
  /** Confirmación del pedido: tiempo máximo de consultas seguidas del estado del pago. */
  limiteConsultaPago: 45000,
  /**
   * Tras volver de Mercado Pago, cuánto se sigue consultando un pago que todavía no aparece
   * (sin_pago): tres consultas. Un pago aprobado aparece casi siempre en la primera.
   */
  limiteConsultaSinPago: 9000,
} as const;

/** Intervalo de lectura del giroscopio. */
export const intervaloSensor = 50;

/** Escala al presionar un botón u opción: se hunde sin animar desde escala 0 (sistema.css: 0.97). */
export const escalaPresionado = 0.97;

/** Escala al presionar una tarjeta tocable completa (sistema.css: .mf-tarjeta-tocable 0.99). */
export const escalaPresionadoTarjeta = 0.99;

/** Escala desde la que entra un ícono de estado (nunca desde 0). */
export const escalaEntrada = 0.9;

export const opacidad = {
  /** Botón deshabilitado (Button de la web: 0.5). */
  deshabilitado: 0.5,
  /** Campo deshabilitado (.mf-campo:disabled 0.55). */
  deshabilitadoCampo: 0.55,
  /** Pulso de los skeletons. */
  pulsoMinimo: 0.55,
  /** Respuesta al presionar con movimiento reducido: baja la opacidad en lugar de hundirse. */
  presionadoReducido: 0.7,
} as const;

/** Desplazamiento corto de las apariciones (sin él con movimiento reducido). */
export const movimiento = {
  desplazamiento: espacio.s,
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

/** Indicador de pasos de un flujo (registro): diámetro del círculo con el número. */
export const pasoFlujo = {
  circulo: 28,
} as const;

/**
 * Reintentos de la verificación del correo cuando no hubo respuesta (o no hubo red): esperas
 * antes de cada uno, en ms. Con el correo sin cambios; al agotarse, el registro decide con su 409.
 */
export const reintentosCorreo = [5000, 10000, 20000] as const;

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
  tijeras: { fondo: paleta.vino, tinta: paleta.papel },
  destello: { fondo: paleta.oro, tinta: paleta.papel },
  gota: { fondo: colorFluido.hialuronico, tinta: paleta.vino },
  peine: { fondo: paleta.lino, tinta: paleta.vino },
  papel: paleta.papel,
} as const;

/**
 * Fondo del hero de Inicio (.hero-bg-gradient de globals.css): un degradado vertical con dos
 * resplandores elípticos. Posiciones en fracción del ancho y alto del escenario.
 */
export const fondoHero = {
  claro: {
    lineal: [
      { posicion: 0, color: paleta.lino },
      { posicion: 0.55, color: paleta.arena },
      { posicion: 1, color: paleta.lino },
    ],
    base: paleta.lino,
    // rgba(191, 161, 129, 0.25) y rgba(163, 107, 31, 0.12): color opaco y su opacidad aparte.
    radialArriba: { color: paleta.iconografia, opacidad: 0.25 },
    radialAbajo: { color: paleta.oroCalidoHero, opacidad: 0.12 },
  },
  oscuro: {
    lineal: null,
    base: paleta.carbon,
    // rgba(113, 0, 20, 0.2) y rgba(113, 0, 20, 0.15).
    radialArriba: { color: paleta.vino, opacidad: 0.2 },
    radialAbajo: { color: paleta.vino, opacidad: 0.15 },
  },
  /** ellipse 80% 50% at 50% 0% y ellipse 60% 35% at 50% 70%; el color se apaga al 60 %. */
  arriba: { cx: 0.5, cy: 0, rx: 0.8, ry: 0.5 },
  abajo: { cx: 0.5, cy: 0.7, rx: 0.6, ry: 0.35 },
  apagado: 0.6,
} as const;

/** Tienda (GP-06.4): catálogo, carrito y pedidos. */
export const tienda = {
  /** Columnas de la cuadrícula de productos. */
  columnas: 2,
  /** Tarjetas que dibuja el skeleton mientras carga el catálogo. */
  tarjetasEsqueleto: 6,
  /** Lado de la foto cuadrada de una fila del carrito o de un pedido. */
  miniatura: 72,
  /** Ancho / alto de la foto de la tarjeta y de la galería del detalle (cuadradas). */
  proporcionFoto: 1,
  /** Diámetro del punto que marca la foto actual de la galería. */
  puntoGaleria: 8,
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

/** Catálogo y detalle de servicios. */
export const catalogo = {
  /** Lado de la miniatura cuadrada de cada tarjeta del catálogo. */
  miniatura: 88,
  /** Ancho / alto de la imagen del detalle. */
  proporcionImagen: 4 / 3,
} as const;

/** Campo de texto de varias líneas (por ejemplo, notas para el salón): alto mínimo de dos toques. */
export const campoMultilinea = {
  altoMinimo: toqueMinimo * 2,
} as const;

/** Reserva de cita (GP-06.2): calendario mensual, cuadrícula de horarios y notas. */
export const reserva = {
  /**
   * Diámetro del círculo de cada día del calendario. A 360dp cada columna mide unos 42dp
   * (320 de contenido menos el relleno de la tarjeta, entre 7), así que el círculo cabe sin scroll.
   */
  diaCalendario: espacio.x4,
  /** Relleno interior de la tarjeta del calendario. */
  rellenoCalendario: espacio.m,
  /** Grosor del anillo que marca hoy en el calendario (el mismo 1.5 que usa la web). */
  anilloHoy: borde.campo,
  /** Columnas de la cuadrícula de horarios: tres caben a 360dp con chips de 48dp de alto. */
  columnasHorario: 3,
  /** Chips que dibuja el skeleton mientras cargan los horarios. */
  horariosEsqueleto: 9,
  /** Tarjetas que dibuja el skeleton mientras cargan las especialistas. */
  especialistasEsqueleto: 3,
  /** Caracteres máximos de las notas para el salón. */
  largoNotas: 300,
} as const;

/**
 * Insignias de estado (DESIGN.md: base clara teñida del color del estado con texto oscuro de su
 * familia). Igual que `.mf-badge` de la web (sistema.css): el color del estado al 16 % sobre la
 * base de insignia (crema en claro, carbón medio en oscuro), ya mezclado porque React Native no
 * tiene color-mix. Contraste del texto: 7:1 o más en claro y 4.7:1 o más en oscuro.
 */
export const insignia = {
  claro: {
    /** --warning #D98E04 al 16 % sobre crema; texto --warning-texto. */
    aviso: { fondo: '#EEE1C8', texto: paleta.avisoClaro },
    /** --success #6E7D57 al 16 % sobre crema; texto --success-texto. */
    exito: { fondo: '#DDDED5', texto: paleta.exitoClaro },
    /** --logo-branding #9f6d1f al 16 % sobre crema; texto --oro-texto (10.5:1). */
    neutro: { fondo: '#E5DCCC', texto: paleta.avisoClaro },
    /** --danger #710014 al 16 % sobre crema; texto --danger-texto (8.9:1). */
    peligro: { fondo: '#DDCACA', texto: paleta.vinoProfundo },
    /** --enlaces-textos-interactivos #4A7BA7 al 16 % sobre crema; texto --info-texto (7.4:1). */
    info: { fondo: '#D7DEE2', texto: paleta.infoClaro },
  },
  oscuro: {
    /** --warning al 16 % sobre #1f1f1f; texto --warning-texto oscuro (4.7:1). */
    aviso: { fondo: '#3D311B', texto: paleta.avisoOscuro },
    /** --success al 16 % sobre #1f1f1f; texto --success-texto oscuro (4.7:1). */
    exito: { fondo: '#2C2E28', texto: paleta.exitoOscuro },
    /** --logo-branding al 16 % sobre #1f1f1f; texto oro sobre carbón (5.1:1). */
    neutro: { fondo: '#332B1F', texto: paleta.oroFoco },
    /** --danger al 16 % sobre #1f1f1f; texto --danger-texto oscuro (5.6:1). */
    peligro: { fondo: '#2C1A1D', texto: paleta.peligroOscuro },
    /** #4a7ba7 al 16 % sobre #1f1f1f; texto --info-texto oscuro (6.5:1). */
    info: { fondo: '#262E35', texto: paleta.infoOscuro },
  },
  /** Filete interior de 1px: el color del estado al 30 % (.mf-badge), igual en claro y oscuro. */
  borde: {
    aviso: 'rgba(217, 142, 4, 0.3)',
    exito: 'rgba(110, 125, 87, 0.3)',
    neutro: 'rgba(159, 109, 31, 0.3)',
    peligro: 'rgba(113, 0, 20, 0.3)',
    info: 'rgba(74, 123, 167, 0.3)',
  },
  rellenoHorizontal: espacio.m,
  rellenoVertical: espacio.xs,
} as const;

/** Anticipo y confirmación de cita (GP-06.2). */
export const confirmacion = {
  /** Ícono de check en círculo del momento de confirmación. */
  icono: 56,
} as const;

/** Cancelación de cita (GP-06.3). */
export const cancelacion = {
  /** Caracteres máximos del motivo escrito con la opción "Otro". */
  largoMotivo: 200,
} as const;

/** Catálogo y detalle de productos de la tienda (GP-06.4). */
export const tiendaCatalogo = {
  /** Ancho del punto de la foto actual de la galería: pastilla más larga que los demás puntos. */
  puntoActivo: 20,
  /** Diámetro de la viñeta de las características del producto. */
  vineta: 6,
  /** Cifra más alta del número de piezas de la pestaña Carrito; arriba de ella se lee "99+". */
  maximoPiezasVisibles: 99,
  /** Cifra del número de piezas de la pestaña Carrito: cabe en el círculo de 18dp de la barra. */
  cifraPastilla: { tamano: 11, linea: 14 },
} as const;

/** Carrito, checkout y confirmación del pedido (GP-06.4). */
export const tiendaCompra = {
  /** Diámetro del círculo de la opción de pago tipo radio. */
  radioOpcion: 22,
  /** Diámetro del punto que marca la opción de pago elegida. */
  puntoOpcion: 10,
} as const;
