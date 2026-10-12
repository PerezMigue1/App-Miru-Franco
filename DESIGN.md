# Design System: Mirú Franco App Móvil, "Atelier cálido"

Alcance: la app Android de la clienta. Hereda la identidad del sitio web (mismo sistema "Atelier cálido") y adapta a pantalla táctil también sus piezas de marca. Los colores viven SOLO en `src/shared/ui/colores.ts` (paleta, transparencias y los temas claro y oscuro) y las medidas, la tipografía y el movimiento en `src/shared/ui/tokens.ts`. Ningún componente ni vista escribe un color (ni hex, ni rgb/rgba, ni nombres como transparent): los toma por nombre con `useTheme()`. Un color nuevo se agrega primero en `colores.ts`, con su valor en claro y en oscuro, y debe existir en las hojas de estilo de la web.

## 1. Atmósfera
Un salón de autor, no un SaaS: superficies de terracota y lino, vino profundo como voz, oro solo como detalle de joyería. La app prioriza claridad y rapidez donde se opera (reserva, pago, compra) y se permite expresión de marca donde se persuade (intro, inicio, galería, acceso). Estructura estable en reserva, pago y compra.

## 2. Paleta y roles (identidad existente, sin colores nuevos de marca)
- **Lino** `#DCC8B6`: lienzo de pantalla.
- **Terracota** `#B38E6F`: superficie de tarjeta, siempre con sombra tintada.
- **Arena** `#d0b29c`: superficies secundarias, marcos de imagen y skeletons.
- **Vino** `#710014`: único acento de acción. Un botón primario por pantalla.
- **Oro** `#9f6d1f`: ornamento. Nunca texto largo. En modo oscuro, los íconos activos y el foco usan `#c4954d`.
- **Carbón** `#161616`: barras, panel de marca y placeholders. Sin negro puro.
- **Modo oscuro** (sigue la preferencia del sistema): fondo `#161616`, tarjetas `#2a2a2a` y superficies suaves y campos `#1f1f1f`, con el mismo vino y oro.
- **Campos de formulario:** fondo `#F2F1ED` (claro) o `#1f1f1f` (oscuro), texto `#600011` (claro) o `#ffffff` (oscuro), borde de 1px `#7a6658` (claro) o `#787878` (oscuro) (`--campo-borde`), placeholder `#6f6a66` (claro) o `#8c8885` (oscuro), etiqueta de 15px en `#600011` / `#ffffff` y halo de foco de 3px con el color de foco al 22 %.
- **Oro de texto y de marca:** `--oro-texto` `#37280b` / `#c4954d` para texto en oro; `--oro-grande` `#865a17` / `#c4954d` para "MIRÚ" y "Franco" (solo texto grande); `--iconografia` `#BFA181` solo para ornamento.
- **Superficies de capa:** hojas y diálogos en `--superficie-modal` (lino / `#2a2a2a`) sobre un velo carbón al 55 %; el visor de fotos y los botones sobre foto usan carbón al 92 %. Sombra de tarjeta tintada de café `rgba(58, 28, 10)` en claro y carbón en oscuro.
- **Foco y selección:** vino `#710014` en claro y oro `#c4954d` en oscuro.
- **Oro sobre carbón** para texto pequeño: `#b07a28` en claro (4.9:1) y `#c4954d` en oscuro. El oro de marca queda para ornamento, íconos y texto grande.
- **Texto, líneas y estados** (variables del sitio web, claro / oscuro): texto principal `#600011` / `#ffffff` (`--menu-texto-principal`, también en títulos), texto secundario `#2A2A2A` / `#b38e6f` (`--encabezados-alterno`, también sobre terracota), texto de diálogo `#2a2a2a` / crema al 88 %, líneas vino al 14 % / blanco al 8 %, error `#600011` / `#e0748f`, éxito `#242d1b` / `#82a163`, aviso `#37280b` / `#D98E04` y enlaces `#600011` / `#ffffff`.
- **Colores de los fluidos del hero** (solo para el resplandor detrás de cada frasco): Goji `#7a1a1f`, Argán `#d99a4e`, Platino `#5b3fd6`, Hialurónico `#d9728f`.

## 3. Tipografía
- **Títulos:** Playfair Display, con espaciado de letra ligeramente cerrado.
- **Texto y datos:** Geist, interlineado 1.5 a 1.6.
- **Cifras:** alineadas tabulares en precios, anticipos y totales.
- **Acento manuscrito:** Great Vibes solo para "Franco" en la marca y para "que se" en la frase del hero ("Brillo" y "nota" en Playfair 700).
- **Títulos de pantalla:** en el contenido, no en la cabecera: Playfair 700, -0.02em, interlineado 1.15, vino en claro y blanco en oscuro, con subtítulo opcional en el texto secundario.
- **Tarjetas de producto y de servicio:** nombre en Playfair, datos en Geist con el texto secundario y precios con cifras tabulares (ver sección 4).
- Sin eyebrows ni etiquetas pequeñas sobre los títulos de pantalla. La única excepción es la categoría en mayúsculas pequeñas de las tarjetas, como en la web.
- Íconos: `lucide-react-native`, nunca emojis.

## 4. Componentes
- **Card:** radio 14px, sombra tintada, nunca borde y sombra a la vez. Las tarjetas tocables se hunden ligeramente al presionarlas.
- **Tarjeta de servicio:** fila con la miniatura cuadrada a la izquierda (monograma mientras carga), nombre en Playfair, categoría y duración (con reloj) en el texto secundario, precio con cifras tabulares y chevron. Las de Servicios van en lista vertical.
- **Tarjeta de producto:** en cuadrícula de dos columnas: foto cuadrada arriba (monograma mientras carga y "Agotado" sobre la foto cuando no hay existencias), nombre en Playfair, marca o categoría en el texto secundario y precio con cifras tabulares ("Desde $X" si hay varias presentaciones). Toda la tarjeta es el área táctil. Las mismas tarjetas se usan en los carruseles de Inicio.
- **Filtros** (Productos y Servicios): un botón "Filtros" junto al buscador, con el número de filtros activos, abre una hoja con los campos de la web. Servicios: precio y duración mínimos y máximos, y "Solo servicios que requieren evaluación previa". Productos: precio, descuentos, marca, otras características y, según la categoría, color, acabado, formato de labial, unidades por pack, tipo de piel, textura y protección solar. Lo elegido en la hoja solo cuenta al tocar "Aplicar"; "Limpiar filtros" los quita al instante y cierra la hoja.
- **Paginación** (catálogo de Productos): 16 productos por página (8 filas de dos), con "Mostrando X a Y de N productos", botones "Anterior" y "Siguiente" y "Página X de Y". Al cambiar de página la lista vuelve arriba; al cambiar búsqueda, categoría o filtros regresa a la página 1.
- **Pastillas de filtro** (categorías de Productos y Servicios): rectángulo de radio 10, no píldora. La activa va rellena del rosa de selección (`--hover`) con texto blanco en los dos temas; las inactivas solo llevan contorno de 1px, vino con texto vino en claro y marfil con texto marfil en oscuro. Área táctil de 48dp.
- **Contador de cantidad:** dos botones cuadrados de radio 10 con contorno y la cantidad en una caja aparte, como el carrito de la web.
- **Contador de piezas y avisos:** círculo vino con número claro y contorno marfil fino, para que se vea sobre la franja vino y sobre el carbón.
- **Filas del perfil:** dentro de una tarjeta con divisores; cada fila con el ícono en un cuadrito de radio 10, título en el texto principal, una línea de descripción y chevron. Títulos de sección en Geist 600 en el texto secundario.
- **Cabecera:** carbón y compacta (56dp de contenido), igual en todas las pestañas. A la izquierda, el logotipo real de la web (la imagen de `assets/logo-miru.jpg`) con el nombre al lado: "Mirú" en Playfair, "Franco" en Great Vibes y "BEAUTY SALÓN" debajo, en oro sobre carbón. A la derecha, siempre la campana de notificaciones y la foto de la clienta en un círculo, que abre Perfil; sin foto, sus iniciales; sin sesión, "Iniciar sesión" en su lugar. En las pantallas de la pila, el botón Volver va a la izquierda del logotipo. Inicio no lleva buscador en la cabecera.
- **Button:** colores por token, altura mínima de 48dp, retroalimentación al presionar de unos 140 ms. El secundario lleva texto oscuro sobre terracota.
- **Input y buscador:** rectángulo de radio 10 como `.mf-campo` de la web (sin pastilla), etiqueta siempre visible, borde con contraste mínimo 3:1, foco con borde vino u oro y halo, error en texto de peligro con mensaje legible por lector de pantalla.
- **Badge de estado** (cita pendiente de pago, confirmada, cancelada, pago aprobado): base clara teñida del color del estado con texto oscuro de su familia.
- **Estados vacíos y de carga:** monograma más una acción, y skeleton en lugar de spinners.
- **Estado sin conexión:** mensaje claro y botón Reintentar.
- **Placeholders de imagen:** monograma dorado sobre carbón.
- **Pasos de flujo:** la reserva y la compra muestran en qué paso va la clienta.
- **Pago de anticipo:** muestra el monto, el vencimiento (2 horas desde que se agenda) y el estado actual.

## 5. Piezas de marca (adaptadas del sitio web al celular)
Se reconstruyen con las herramientas de React Native (Reanimated, Gesture Handler, react-native-svg, expo-image, expo-sensors). El código de la web no se copia: se toma de referencia.

- **Intro de la grieta:** al abrir la app en frío (no al navegar ni al volver con atrás), el monograma "MF" dorado sobre carbón se parte por una grieta irregular de papel rasgado y las dos mitades se separan para revelar la app. Dura 1.3 s como máximo, se salta tocando la pantalla, ocurre una sola vez por apertura y se omite con movimiento reducido.
- **Acceso (login y registro):** panel de marca carbón compacto en la parte superior con el monograma, y pestañas Acceso y Registro con indicador deslizante dorado. Ambos formularios están montados y el contenido se desliza horizontalmente en 680 ms con curva de entrada y salida. El cambio de vista no recarga la pantalla.
- **Hero de fluidos (pestaña Inicio):** los cuatro fluidos AVYNA del catálogo flotan en capas de profundidad con parallax amortiguado, que sigue la inclinación del teléfono (giroscopio) y el scroll. Stickers vectoriales (tijeras, peine, gota, destello) con aparición escalonada. Nombre y precio salen del catálogo real; si el API no los trae, quedan vacíos, nunca inventados. Las imágenes son los renders propios de la marca, no las del API. Al hacer scroll el escenario se queda fijo bajo la barra superior mientras el Fluido Di Goji viaja girando (secuencia de 12 cuadros) hasta quedar sobre la tipografía grande en Playfair ("Brillo que se nota", texto provisional).
- **Inicio:** hero de fluidos; debajo, los carruseles horizontales "Productos" (6 productos con existencias) y "Servicios" (6 servicios activos), elegidos al azar en cada carga y con "Ver todos" hacia su pestaña; al final, la Galería. El catálogo de productos se pide una sola vez y lo comparten el hero y el carrusel.
- **Galería:** solo fotos reales de los servicios activos. Mosaico editorial por bloques de 7 fotos que llena una cuadrícula exacta de 4 columnas por 3 filas, y visor a pantalla completa con deslizamiento horizontal, contador y cierre. Sin fotos: estado vacío con monograma, nunca relleno.
- **Reglas comunes de rendimiento:** las animaciones solo corren con la pantalla visible; se pausa el giroscopio al salir de la pestaña; las imágenes del hero se precargan; ninguna pieza bloquea la carga de la pantalla.

## 6. Layout
- Una sola columna, ritmo de 4px, márgenes laterales consistentes.
- Navegación principal por pestañas inferiores del cliente: Inicio (casa), Servicios (tijeras; la ruta sigue siendo `citas`), Carrito (al centro, con el número de piezas), Productos (spray; la ruta sigue siendo `tienda`) y Perfil. La barra toma el papel de la franja vino de navegación de la web: fondo vino en los dos temas, íconos y etiquetas en marfil, y el ícono de la pestaña activa dentro de una pastilla rosa (`--hover`, fondo y anillo): el ícono marfil sobre el rosa da 4.88:1 y la etiqueta marfil, debajo y sobre el vino, 10.85:1; la etiqueta activa además va en un peso mayor, porque el rosa contra el vino solo da 2.22:1. Notificaciones se abre con la campana de la cabecera como pantalla propia con Atrás. Mis citas se abre solo desde Perfil.
- Respetar las áreas seguras del dispositivo (barra de estado y barra de navegación).
- Objetivos táctiles de al menos 48dp. Sin scroll horizontal de pantalla.

## 7. Movimiento
- Curvas: salida suave `cubic-bezier(0.23, 1, 0.32, 1)`, entrada y salida `cubic-bezier(0.77, 0, 0.175, 1)`, hojas inferiores `cubic-bezier(0.32, 0.72, 0, 1)` (arranque rápido, sin rebote)..
- Duraciones: presionar 140 ms, aparición de listas y estados 220 ms, hoja inferior 240 ms al subir y 200 ms al bajar, cambio de pestaña 240 ms, entradas de sección hasta 520 ms con escalonado de 60 ms, acceso 680 ms, intro hasta 1.3 s.
- Fuera de las piezas de marca, solo animaciones que comunican estado: presionar, entrada de pantalla, cambio de pestaña, confirmación de cita y de compra.
- Nunca animar desde escala 0.
- Si el sistema pide reducir movimiento, se conservan opacidad y color, se elimina el desplazamiento y las piezas de marca quedan en su composición estática.

## 8. Prohibido
Emojis o glifos Unicode como íconos, eyebrows sobre títulos de pantalla, texto con gradiente, brillos de neón, negro puro, bordes laterales de color de más de 1px en tarjetas o avisos, filas de tres tarjetas iguales como estructura de marketing, imágenes de relleno, animar desde escala 0, colores escritos fuera de `colores.ts` o medidas fuera de `tokens.ts`, y datos inventados en pantallas de producción.
