# Product

<!-- impeccable:product-schema 1 -->

## Platform

mobile (Android, React Native con Expo SDK 57 y Expo Router). Solo Android en la v1. Sin iOS ni web.

## Users
- **Clientas del salón**: ven el inicio con los productos y el trabajo del salón, reservan servicios, pagan el anticipo de su cita, compran productos de la tienda, consultan sus citas, pedidos y perfil, y reciben recordatorios por notificación push. Usan el celular como dispositivo principal de la app.
- La app de la v1 es solo para el rol cliente. Personal del salón y administración siguen usando el sitio web (`/operacion` y `/admin`).

## Product Purpose
Mirú Franco Beauty Salón (Huejutla de Reyes, Hidalgo, México) ya opera un sistema web completo. La app móvil es un segundo cliente del mismo backend para que una clienta reserve, pague su anticipo o compre sin fricción desde su teléfono, con la misma identidad de marca que el sitio. El éxito es que una clienta agende una cita o complete una compra en pocos toques y llegue puntual gracias a los recordatorios.

## Operating Context
- Horario del salón: lunes a sábado de 9:00 a 20:00. Contacto: contacto@mirufranco.com.
- Backend propio NestJS ya desplegado sobre Neon PostgreSQL con datos reales de clientas. La app no crea backend nuevo ni modifica contratos de API.
- Autenticación con JWT Bearer. El token se guarda en el almacenamiento seguro del dispositivo, nunca en texto plano ni en el bundle.
- Pagos con Mercado Pago Checkout Pro, que se abre en un navegador interno y se confirma consultando el estado al volver a la app.
- Anticipo de cita: si el servicio lo requiere, la cita queda pendiente y se paga en un máximo de 2 horas; si no, el backend la cancela sola. La interfaz debe mostrar el estado pendiente y su vencimiento.
- Imágenes de servicios y productos en Cloudinary, servidas por las mismas URLs que usa la web. Los renders del hero (frascos y secuencia de giro) son archivos propios de la marca incluidos en la app.
- El esquema de enlaces de la app es `appmirufranco`.

## Capabilities and Constraints
- Alcance de la v1: inicio (hero de fluidos y galería), autenticación (correo y Google), citas (disponibilidad, registrar, cancelar, reprogramar, pago del anticipo), perfil (editar datos y foto desde galería), tienda (comprar y pagar), notificaciones push y operación con manejo de falta de conexión.
- Lecturas públicas de solo lectura, sin sesión: `GET /api/productos` (nombre y precio de los cuatro fluidos del hero) y `GET /api/servicios` (fotos de la galería).
- Fuera de la v1: roles admin, operación y especialista, punto de venta, inventario, empleados, marketing y promociones, WhatsApp, iOS y web.
- Solo contenido real: servicios, productos y fotos salen de la API. Sin datos de relleno ni mocks en pantallas de producción; si el API no devuelve un dato, se deja vacío.
- Ningún secreto ni llave va en la app. Toda validación de permisos vive en el backend.
- El trabajo de la app no cambia lógica de negocio, contratos de API, permisos ni el backend.

## Brand Commitments
Misma identidad que el sitio web, elevada y no reemplazada: terracota y lino, vino `#710014`, dorado `#9f6d1f`, Playfair Display para títulos, Great Vibes solo como acento manuscrito de la marca y monograma dorado "MF". Salón cálido y elegante, no estética SaaS. Íconos de una librería de íconos vectoriales, nunca emojis. Las piezas de marca del sitio (intro de la grieta, acceso animado, hero de fluidos y galería) existen también en la app, adaptadas al celular.

## Evidence on Hand
- Renders propios del hero en el repo de la web, carpeta `public/hero/web`: cuatro frascos (argan, goji, hialuronico, platino) y 24 cuadros de giro del Goji (`giro-00` a `giro-23`), en WebP.
- Fotos reales: las de servicios y productos en Cloudinary. No hay testimonios ni fotos de portafolio adicionales; no se inventan.

## Product Principles
1. Reservar y comprar primero: cada pantalla de la clienta tiene una acción principal clara.
2. Pocos toques: lo frecuente (ver mis citas, reservar, pagar el anticipo) a una o dos pantallas de distancia.
3. Solo contenido real, con estados vacíos honestos.
4. La marca vive en los detalles (tipografía, oro, monograma) y en cuatro piezas bien hechas, no en el ruido.
5. Estados de red visibles: cargando, sin conexión con opción de reintentar, y error con mensaje claro.

## Accessibility & Inclusion
Contraste AA en modo claro y oscuro, objetivos táctiles de al menos 48dp, respeto a la preferencia del sistema de reducir movimiento (las piezas de marca quedan estáticas), lectura cómoda en pantallas de 360dp de ancho y soporte del tamaño de fuente del sistema.
