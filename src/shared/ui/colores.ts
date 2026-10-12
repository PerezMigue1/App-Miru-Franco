/**
 * Colores del sistema "Atelier cálido" (DESIGN.md). Es el ÚNICO archivo del código donde se escribe
 * un color (hex, rgb/rgba o un nombre como transparent). Cada valor sale de una variable de
 * globals.css, sistema.css o cliente.css de la web. Las pantallas los toman por nombre con
 * useTheme(); tokens.ts los vuelve a exportar para que los imports existentes sigan funcionando.
 * Un color nuevo se agrega aquí, con su valor en claro y en oscuro.
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
  marfil16: 'rgba(242, 241, 237, 0.16)', // cliente.css .mf-menu-pildora activa: fondo de la pastilla
  marfil12: 'rgba(242, 241, 237, 0.12)', // cliente.css .mf-menu-pildora: presionada
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
  /** Barra inferior = franja de navegación de la web: --botones-principales, vino en los dos temas. */
  barraFondo: string;
  /** Ícono de la pestaña activa: --marfil fijo, como el texto de la franja (cliente.css). */
  iconoActivo: string;
  /** Ícono y etiqueta de las pestañas inactivas: también --marfil fijo. */
  iconoInactivo: string;
  /**
   * Pastilla de la pestaña activa: rosa --hover de fondo y de anillo, en los dos temas. El ícono
   * marfil encima da 4.88:1. Contra la franja vino la pastilla da 2.22:1, así que la activa también
   * se distingue por el peso de la etiqueta (marfil sobre vino, 10.85:1).
   */
  franjaPastilla: string;
  franjaAnillo: string;
  /** Pestaña presionada: marfil al 12 %. */
  franjaPresionada: string;
  /** Contador (carrito, campana): círculo vino con número --texto-fondo-oscuro y contorno marfil. */
  contadorFondo: string;
  contadorTexto: string;
  contadorContorno: string;
  /** Pastilla de filtro activa: --hover con texto blanco en los dos temas. */
  chipActivo: string;
  textoChipActivo: string;
  /** Pastilla de filtro inactiva: contorno de 1px y texto (vino en claro, marfil en oscuro). */
  chipInactivo: string;
  /** Cuadrito del ícono de las filas del perfil: --badge-base. */
  cuadritoIcono: string;
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
  /** Etiqueta de la pestaña activa: --marfil fijo sobre la franja vino. */
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
  barraFondo: paleta.vino,
  iconoActivo: paleta.crema,
  iconoInactivo: paleta.crema,
  franjaPastilla: paleta.hover,
  franjaAnillo: paleta.hover,
  franjaPresionada: transparencias.marfil12,
  contadorFondo: paleta.vino,
  contadorTexto: paleta.crema,
  contadorContorno: paleta.crema,
  chipActivo: paleta.hover,
  textoChipActivo: paleta.blanco,
  chipInactivo: paleta.vinoProfundo,
  cuadritoIcono: paleta.crema,
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
  textoActivo: paleta.crema,
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
  barraFondo: paleta.vino,
  iconoActivo: paleta.crema,
  iconoInactivo: paleta.crema,
  franjaPastilla: paleta.hover,
  franjaAnillo: paleta.hover,
  franjaPresionada: transparencias.marfil12,
  contadorFondo: paleta.vino,
  contadorTexto: paleta.blanco,
  contadorContorno: paleta.crema,
  chipActivo: paleta.hover,
  textoChipActivo: paleta.blanco,
  chipInactivo: paleta.crema,
  cuadritoIcono: paleta.carbonMedio,
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
  textoActivo: paleta.crema,
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

/** Colores de los stickers del hero (papel y tinta de StickersSalon de la web). */
export const colorSticker = {
  tijeras: { fondo: paleta.vino, tinta: paleta.papel },
  destello: { fondo: paleta.oro, tinta: paleta.papel },
  gota: { fondo: colorFluido.hialuronico, tinta: paleta.vino },
  peine: { fondo: paleta.lino, tinta: paleta.vino },
  papel: paleta.papel,
} as const;

/**
 * Fondo del hero de Inicio (.hero-bg-gradient de globals.css): un degradado vertical con dos
 * resplandores elípticos. Aquí solo los colores; la geometría vive en tokens.ts (fondoHero).
 */
export const coloresFondoHero = {
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
} as const;

/**
 * Insignias de estado (DESIGN.md: base clara teñida del color del estado con texto oscuro de su
 * familia). Igual que `.mf-badge` de la web (sistema.css): el color del estado al 16 % sobre la
 * base de insignia (crema en claro, carbón medio en oscuro), ya mezclado porque React Native no
 * tiene color-mix. Contraste del texto: 7:1 o más en claro y 4.7:1 o más en oscuro.
 */
export const coloresInsignia = {
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
} as const;
