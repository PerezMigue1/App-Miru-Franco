import { coloresFondoHero, coloresInsignia } from './colores';

/**
 * Tokens del sistema "Atelier cálido" (DESIGN.md): medidas, tipografía y movimiento. Los colores
 * viven solo en colores.ts y aquí se vuelven a exportar para que ningún import se rompa.
 */
export * from './colores';

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
  /** Precios, totales y contadores (Geist 700 de la web). */
  textoNegrita: 'Geist_700Bold',
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
  /** Categoría en mayúsculas sobre el título de una tarjeta ("SHAMPOO · AVYNA"). */
  categoria: { tamano: 12, linea: 16 },
  /** Título de tarjeta en Geist 600 (TarjetaCatalogo de la web: 18 con interlineado 1.375). */
  tituloTarjeta: { tamano: 18, linea: 25 },
  /** Descripción corta de una tarjeta (14 con interlineado 1.625). */
  descripcion: { tamano: 14, linea: 23 },
  /** Precio de una tarjeta en Geist 700. */
  precio: { tamano: 20, linea: 28 },
  /** Número de los contadores (Geist 700 12/16). */
  contador: { tamano: 12, linea: 16 },
  /** Logotipo de la cabecera: "Mirú" en Playfair 700, "Franco" en Great Vibes y "BEAUTY SALÓN". */
  logotipo: { tamano: 16, linea: 18 },
  logotipoFranco: { tamano: 20, linea: 24 },
  logotipoSalon: { tamano: 10, linea: 12 },
} as const;

/**
 * Espaciado de letra: títulos en Playfair con -0.02em como la web (em × tamaño en px), lema abierto.
 * `titulo`, `gigante` y `lema` los usa también el hero de fluidos, que no se toca: se conservan.
 */
export const tracking = {
  /** Categoría en mayúsculas de las tarjetas (0.05em de 12). */
  categoria: 0.6,
  /** "BEAUTY SALÓN" del logotipo (0.18em de 10). */
  logotipoSalon: 1.8,
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
  /** La foto de la cabecera no se vuelve a leer de /me al enfocar una pestaña antes de este tiempo. */
  refrescoFotoCabecera: 60000,
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
  /** Aviso interno en pantalla (GP-07.2): tiempo que se queda a la vista si nadie lo toca. */
  avisoEnPantalla: 5000,
  /**
   * Verificación del pago de un pedido (GP-07.5): espera antes de la segunda consulta; cada
   * reintento espera el doble, hasta verificacionPagoEsperaMaxima.
   */
  verificacionPagoEspera: 2000,
  /** Verificación del pago de un pedido: tope de la espera entre dos consultas. */
  verificacionPagoEsperaMaxima: 8000,
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



/**
 * Fondo del hero de Inicio (.hero-bg-gradient de globals.css): colores de colores.ts más la
 * geometría de los dos resplandores, en fracción del ancho y alto del escenario.
 */
export const fondoHero = {
  ...coloresFondoHero,
  /** ellipse 80% 50% at 50% 0% y ellipse 60% 35% at 50% 70%; el color se apaga al 60 %. */
  arriba: { cx: 0.5, cy: 0, rx: 0.8, ry: 0.5 },
  abajo: { cx: 0.5, cy: 0.7, rx: 0.6, ry: 0.35 },
  apagado: 0.6,
} as const;

/** Tienda (GP-06.4): catálogo, carrito y pedidos. */
export const tienda = {
  /** Columnas de la cuadrícula de productos. */
  columnas: 2,
  /** Productos por página del catálogo: 8 filas de dos. */
  porPagina: 16,
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


/** Insignias de estado: colores de colores.ts (coloresInsignia) más sus rellenos. */
export const insignia = {
  ...coloresInsignia,
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
  /** Caracteres máximos del motivo opcional al revocar una compra (el tope del backend, GP-07.5). */
  largoMotivoRevocacion: 500,
} as const;

/** Controles compartidos: pastillas de filtro, buscadores y contador de cantidad (sin colores). */
export const controles = {
  /** Alto visual de la pastilla de filtro (Button sm de la web: min-h-9); el área táctil sigue en 48. */
  pastillaAlto: 36,
  /** Relleno vertical de la pastilla (py-1.5 de la web); el horizontal es espacio.m. */
  pastillaRellenoVertical: 6,
  /** Texto de la pastilla: Geist 600 14/20 (text-sm de la web). */
  textoPastilla: { tamano: 14, linea: 20 },
  /** Halo del foco de un campo (.mf-campo:focus: 0 0 0 3px). */
  halo: 3,
  /** Ancho de la caja de la cifra del contador de cantidad (w-16 del carrito de la web). */
  cajaCantidad: 64,
  /** Separación entre los botones del contador y la caja de la cifra. */
  separacionCantidad: 6,
  /** Ícono de menos y más del contador (16 como el carrito de la web). */
  iconoCantidad: 16,
} as const;

/**
 * Cabecera compacta de todas las pantallas (Header.tsx de la web en móvil): cromo carbón con el
 * logotipo a la izquierda y las acciones a la derecha; el título de la pantalla baja al lienzo.
 */
export const cabeceraCompacta = {
  /** Alto del contenido bajo la barra de estado (sin el área segura). */
  alto: 56,
  /** Relleno derecho: un botón de 48 deja su ícono a 20 del borde, igual que pantalla.margen. */
  rellenoDerecho: espacio.s,
  /** Relleno izquierdo cuando la fila empieza con el botón Volver (mismo cálculo). */
  rellenoVolver: espacio.s,
  /** Separación entre el monograma y el texto del logotipo, y entre botones. */
  separacion: espacio.s,
  separacionAcciones: espacio.xs,
  /** Fila del buscador de Inicio, dentro del cromo: el campo de 48 más su relleno inferior. */
  filaBuscador: toqueMinimo + espacio.s,
  /**
   * Bajo este ancho la web quita el monograma para que el logotipo quepa junto a las acciones
   * (Header.tsx: min-[384px]). En Inicio sin sesión, con "Iniciar sesión" y la campana, se aplica igual.
   */
  anchoConMonograma: 384,
  /** El logotipo crece con la fuente del sistema solo hasta este factor: la barra mide 56. */
  escalaMaximaLogotipo: 1.2,
  /** "BEAUTY SALÓN": 11 en lugar de 10 para que se lea en el teléfono (0.18em de espaciado). */
  salon: { tamano: 11, linea: 13 },
  trackingSalon: 2,
  /** Bloque del título de la pantalla en el lienzo (PageHeader de la web). */
  tituloArriba: espacio.xxl,
  /**
   * El título de 30 crece con la fuente del sistema hasta este factor (45): en las pantallas de la
   * pila queda fijo sobre el scroll y a más tamaño se comería la mitad de la pantalla.
   */
  escalaMaximaTitulo: 1.5,
  /** Título a subtítulo: mt-2 de la web. */
  separacionSubtitulo: espacio.s,
  /**
   * Debajo del bloque: la web deja 32 (mb-8); aquí 16, porque cada vista ya suma su propio relleno
   * superior (16 a 24) y así el contenido no cambia de lugar respecto a antes.
   */
  tituloAbajo: espacio.l,
  /** Cifra más alta del contador de la campana; arriba de ella se lee "9+". */
  maximoAvisosVisibles: 9,
  /** Contador sobre la campana: a 4 del borde de arriba y de la derecha del área de 48. */
  contadorCampana: espacio.xs,
} as const;

/**
 * Tarjetas de producto, servicio, carrito, pedidos y citas (TarjetaCatalogo y TarjetaServicio de
 * la web). Solo medidas: los colores salen de colores.ts por useTheme().
 */
export const tarjetas = {
  /** Relleno del cuerpo de las tarjetas de producto y servicio (p-5 de la web). */
  rellenoCuerpo: espacio.xl,
  /** De la categoría al título (mt-1.5 de la web). */
  separacionTitulo: 6,
  /** Del título a la descripción (mt-2 de la web). */
  separacionDescripcion: espacio.s,
  /** Espacio sobre el pie con precio y acción (pt-5 de la web). */
  separacionPie: espacio.xl,
  /** Entre el texto y su ícono en la acción y la duración (gap-1.5 de la web). */
  separacionIcono: 6,
  /** Entre la duración y el precio de un servicio (mt-1 de la web). */
  separacionPrecio: espacio.xs,
  /** Flecha de "Ver detalles" y "Ver y agendar" (ArrowRight 16 de la web). */
  iconoAccion: 16,
  /** Reloj de la duración del servicio (Clock3 14 de la web). */
  iconoDato: 14,
  /** Acción de la tarjeta: Geist 600 14/20 (text-sm de la web). */
  tipoAccion: { tamano: 14, linea: 20 },
  /** Precio original tachado: 14/20 (text-sm de la web). */
  tipoTachado: { tamano: 14, linea: 20 },
  /** Total de una línea del carrito y de un pedido: Geist 700 18 (text-lg de la web). */
  tipoTotal: { tamano: 18, linea: 26 },
} as const;

/**
 * Barra inferior como la franja vino de la web (PestanaFranja.tsx) y contador de piezas y avisos
 * (Contador.tsx).
 */
export const franja = {
  /** Alto de la barra sin el área segura de abajo: pastilla 32 + 4 + etiqueta 13 con aire. */
  altoBarra: 64,
  /** Pastilla de la pestaña activa: envuelve al ícono de 24 y cabe en los 72 dp de cada pestaña. */
  pastillaAncho: 56,
  pastillaAlto: 32,
  /** De la pastilla a la etiqueta. */
  separacionEtiqueta: espacio.xs,
  /** Tope de crecimiento de la etiqueta con la fuente del sistema: la barra tiene alto fijo. */
  escalaMaximaEtiqueta: 1.5,
  /** Diámetro mínimo del contador (min-w-[18px] h-[18px] de la web). */
  contadorMinimo: 18,
  /** Contador sobre el ícono: desde el borde de arriba de la pastilla y a la derecha del centro. */
  contadorArriba: 0,
  contadorDesfase: espacio.xs,
} as const;

/** Perfil: tarjeta de filas como .mf-perfil-fila y títulos de sección del portal de clientas. */
export const perfil = {
  /** Alto mínimo de una fila (min-height 4.25rem de la web). */
  altoFila: 68,
  /** Relleno vertical de la fila (0.85rem); el horizontal es espacio.xl (1.25rem). */
  rellenoFila: 14,
  /** Cuadrito del ícono (2.75rem) y el ícono dentro de él. */
  cuadrito: 44,
  icono: 20,
  /** Título de sección: Geist 600 14/20. */
  tituloSeccion: { tamano: 14, linea: 20 },
} as const;

/** Hoja de filtros de la Tienda y su botón junto al buscador (space-y-6 del panel de la web). */
export const filtrosTienda = {
  /** Entre un grupo de filtros y el siguiente dentro de la hoja (space-y-6 de la web). */
  separacionSecciones: espacio.xxl,
  /** Entre el buscador y el botón "Filtros" en la misma fila. */
  separacionBoton: espacio.s,
  /** Ancho del esqueleto del botón "Filtros" mientras carga el catálogo. */
  anchoBotonEsqueleto: 104,
} as const;

/**
 * Cabecera de las pestañas: logotipo de imagen (Header.tsx de la web: w-8 h-8 en móvil) y la foto de
 * la clienta en un círculo a la derecha, dentro de un área táctil de 48. Solo medidas.
 */
export const cabeceraFoto = {
  /** Lado de la imagen del logotipo (logo-miru, cuadrada): el alto útil de la cabecera de 56. */
  logotipo: 48,
  /** Diámetro visual del círculo de la foto o de las iniciales. */
  circulo: 36,
  /** Anillo del círculo sobre el carbón (como el contorno del contador). */
  anillo: borde.campo,
  /** Iniciales: Geist 600 14/18 dentro del círculo de 36. */
  iniciales: { tamano: 14, linea: 18 },
  /** Las iniciales crecen con la fuente del sistema solo hasta este factor: el círculo mide 36. */
  escalaMaximaIniciales: 1.2,
} as const;

/**
 * Carruseles de Inicio (productos y servicios al azar, debajo del hero). Solo medidas: los colores
 * salen de colores.ts por useTheme().
 */
export const carruselInicio = {
  /**
   * Tarjetas que se ven a la vez en el ancho de la pantalla (sin el margen de la izquierda): la
   * fracción hace que siempre asome parte de la siguiente y se note que la fila sigue. A 360 dp la
   * de producto mide 197 y la de servicio 293; a 412 dp, 229 y 340.
   */
  productosVisibles: 1.6,
  serviciosVisibles: 1.1,
  /** Entre tarjetas del carrusel: más cerrado que el gap-6 (24) de la web para que asome la siguiente. */
  separacion: espacio.l,
  /**
   * Relleno de arriba y abajo de la fila: la lista horizontal recorta lo que sale de ella y sin
   * este aire se cortaría la sombra de las tarjetas (desplazamiento 8 + difuminado).
   */
  rellenoSombra: espacio.l,
  /** Tarjetas del skeleton mientras carga: las que llenan el ancho de la pantalla. */
  esqueletos: 2,
  /** "VER TODOS": Geist 600 14 en mayúsculas con 0.05em de espaciado (tracking-wider de la web). */
  trackingVerTodos: 0.7,
  /** Flecha de "Ver todos" (ArrowRight 16 de la web). */
  iconoVerTodos: 16,
} as const;

/** Avisos internos (GP-07.2): bandeja de Notificaciones y aviso en pantalla. Solo medidas. */
export const avisosInternos = {
  /** Diámetro del punto que marca un aviso no leído. */
  punto: 8,
  /** Del borde de abajo de la barra de estado al aviso en pantalla. */
  separacionArriba: espacio.s,
  /** Filas que dibuja el skeleton mientras carga la bandeja. */
  esqueletos: 3,
} as const;
