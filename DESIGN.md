# Design System: Mirú Franco App Móvil, "Atelier cálido"

Alcance: la app Android de la clienta. Hereda la identidad del sitio web (mismo sistema "Atelier cálido") y adapta a pantalla táctil también sus piezas de marca. Los tokens viven en un solo lugar del código (`src/shared/ui/tokens.ts`) y ningún color ni medida se escribe suelto en las pantallas.

## 1. Atmósfera
Un salón de autor, no un SaaS: superficies de terracota y lino, vino profundo como voz, oro solo como detalle de joyería. La app prioriza claridad y rapidez donde se opera (reserva, pago, compra) y se permite expresión de marca donde se persuade (intro, inicio, galería, acceso). Estructura estable en reserva, pago y compra.

## 2. Paleta y roles (identidad existente, sin colores nuevos de marca)
- **Lino** `#DCC8B6`: lienzo de pantalla.
- **Terracota** `#B38E6F`: superficie de tarjeta, siempre con sombra tintada.
- **Arena** `#d0b29c`: superficies secundarias, marcos de imagen y skeletons.
- **Vino** `#710014`: único acento de acción. Un botón primario por pantalla.
- **Oro** `#9f6d1f`: hairlines, ornamento e íconos activos en modo oscuro. Nunca texto largo.
- **Carbón** `#161616`: barras, panel de marca y placeholders. Sin negro puro.
- **Modo oscuro** (sigue la preferencia del sistema): grises neutros `#161616`, `#1f1f1f` y `#2a2a2a` con el mismo vino y oro.
- **Campos de formulario:** fondo `#F2F1ED`, borde `#8a7667` (claro) o `#6e6e6e` (oscuro), placeholder `#6b5a4e` (claro) o `#b8a597` (oscuro).
- **Foco y selección:** vino `#710014` en claro y oro `#c4954d` en oscuro.
- **Oro sobre carbón** para texto pequeño: `#b07a28` (4.9:1). El oro de marca queda para ornamento, íconos y texto grande.
- **Colores de los fluidos del hero** (solo para el resplandor detrás de cada frasco): Goji `#7a1a1f`, Argán `#d99a4e`, Platino `#5b3fd6`, Hialurónico `#d9728f`.

## 3. Tipografía
- **Títulos:** Playfair Display, con espaciado de letra ligeramente cerrado.
- **Texto y datos:** Geist, interlineado 1.5 a 1.6.
- **Cifras:** alineadas tabulares en precios, anticipos y totales.
- **Acento manuscrito:** Great Vibes solo para "Franco" en la marca.
- Sin eyebrows ni etiquetas pequeñas sobre los títulos.
- Íconos: `lucide-react-native`, nunca emojis.

## 4. Componentes
- **Card:** radio 14px, sombra tintada, nunca borde y sombra a la vez. Las tarjetas tocables se hunden ligeramente al presionarlas.
- **Button:** colores por token, altura mínima de 48dp, retroalimentación al presionar de unos 140 ms. El secundario lleva texto oscuro sobre terracota.
- **Input:** etiqueta siempre visible, borde con contraste mínimo 3:1, foco con borde vino u oro, error en texto de peligro con mensaje legible por lector de pantalla.
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
- **Hero de fluidos (pestaña Inicio):** los cuatro fluidos AVYNA del catálogo flotan en capas de profundidad con parallax amortiguado, que sigue la inclinación del teléfono (giroscopio) y el scroll. Stickers vectoriales (tijeras, peine, gota, destello) con aparición escalonada. Nombre y precio salen del catálogo real; si el API no los trae, quedan vacíos, nunca inventados. Las imágenes son los renders propios de la marca, no las del API. Al hacer scroll el escenario se queda fijo bajo la barra superior mientras el Fluido Di Goji viaja girando (secuencia de 24 cuadros) hasta quedar sobre la tipografía grande en Playfair ("Brillo que se nota", texto provisional).
- **Galería:** solo fotos reales de los servicios activos. Mosaico editorial por bloques de 7 fotos que llena una cuadrícula exacta de 4 columnas por 3 filas, y visor a pantalla completa con deslizamiento horizontal, contador y cierre. Sin fotos: estado vacío con monograma, nunca relleno.
- **Reglas comunes de rendimiento:** las animaciones solo corren con la pantalla visible; se pausa el giroscopio al salir de la pestaña; las imágenes del hero se precargan; ninguna pieza bloquea la carga de la pantalla.

## 6. Layout
- Una sola columna, ritmo de 4px, márgenes laterales consistentes.
- Navegación principal por pestañas inferiores del cliente: Inicio, Citas, Tienda, Notificaciones y Perfil.
- Respetar las áreas seguras del dispositivo (barra de estado y barra de navegación).
- Objetivos táctiles de al menos 48dp. Sin scroll horizontal de pantalla.

## 7. Movimiento
- Curvas: salida suave `cubic-bezier(0.23, 1, 0.32, 1)`, entrada y salida `cubic-bezier(0.77, 0, 0.175, 1)`.
- Duraciones: presionar 140 ms, cambio de pestaña 240 ms, entradas de sección hasta 520 ms con escalonado de 60 ms, acceso 680 ms, intro hasta 1.3 s.
- Fuera de las piezas de marca, solo animaciones que comunican estado: presionar, entrada de pantalla, cambio de pestaña, confirmación de cita y de compra.
- Nunca animar desde escala 0.
- Si el sistema pide reducir movimiento, se conservan opacidad y color, se elimina el desplazamiento y las piezas de marca quedan en su composición estática.

## 8. Prohibido
Emojis o glifos Unicode como íconos, eyebrows, texto con gradiente, brillos de neón, negro puro, bordes laterales de color de más de 1px en tarjetas o avisos, filas de tres tarjetas iguales como estructura de marketing, imágenes de relleno, animar desde escala 0, colores o medidas escritos fuera de los tokens, y datos inventados en pantallas de producción.
