# App Miru Franco

Para arrancar la app: `npm install` y luego `npx expo start --go --tunnel -c`.

## Arquitectura y patrones

### MVVM por feature

Cada feature vive en `src/features/<feature>/` (auth, inicio, citas, tienda, salon, notificaciones) con cuatro carpetas. La referencia es `src/features/auth`. La feature `salon` tiene la pantalla El salón (`SalonView` con `useSalonViewModel`: sobre nosotros, contacto, horario y días sin servicio) y el contenido público del salón que también pinta Inicio (`contenidoSalonModel.ts` y `useListaContenido.ts`).

- `models/`: tipos y llamadas a la API. Toda petición pasa por `src/shared/api/apiClient.ts` (`apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`) y la respuesta se normaliza a los tipos de la feature. Ejemplos: `auth/models/authService.ts`, `citas/models/citaModel.ts`, `tienda/models/productoModel.ts`.
- `viewmodels/`: estado y lógica en hooks (`useLoginViewModel`, `useMisCitasViewModel`, `useCarritoViewModel`...). Llaman a las funciones de `models/` y entregan a la vista datos listos para pintar. Ningún viewmodel hace peticiones directas con `apiGet`, `apiPost`, `apiPut`, `apiPatch` o `apiDelete`: de `apiClient` solo toman `ApiError` y, en `auth/viewmodels/useAuth.tsx`, las funciones de manejo de sesión (`renovarSesion`, `alExpirarSesion`...). El perfil tras el inicio con Google lo pide `obtenerPerfilConToken` de `auth/models/authService.ts`.
- `views/`: solo pintan; toman todo de su viewmodel (por ejemplo, `LoginView.tsx` usa `useLoginViewModel`). En auth, `AuthContainer.tsx` y las vistas de acceso no importan nada de `models/`: los tipos y las opciones (como `tiposCabello`) les llegan de `useRegistroViewModel`. La prueba `test/unit/gp-05/reglas-auth.test.ts` vigila esto y que `useAuth.tsx` no haga peticiones directas.
- `components/`: piezas visuales propias de la feature (`TarjetaCita`, `SelectorHorario`, `FilaCarrito`...).

Fuera de las features:

- `src/app`: solo rutas de Expo Router; cada archivo reexporta una vista (por ejemplo, `src/app/(auth)/login.tsx` exporta `LoginView`).
- `src/shared/api`: cliente HTTP con renovación de sesión (`apiClient.ts`), sesión en SecureStore (`tokenStorage.ts`), subida multipart (`subirMultipart.ts`), flujo de eventos del servidor (`flujoEventos.ts`: `abrirFlujoEventos` abre un SSE con el fetch de `expo/fetch`, que entrega el cuerpo por trozos, y el token solo en el encabezado `Authorization`) y configuración pública del salón (`configuracionPublica.ts` con su hook `useConfiguracionPublica.ts`), documentos legales vigentes (`documentosLegales.ts` con su hook `useDocumentoLegal.ts`) y consentimientos (`consentimientos.ts`).
- `src/shared/ui`: colores (`colores.ts`), tokens (`tokens.ts`), tema (`useTheme.ts`, `apariencia.tsx`) y componentes compartidos (entre ellos `Casilla.tsx` y `VisorDocumentoLegal.tsx`).

Regla: shared no depende de features. `src/shared` no importa nada de `src/features`; cuando una pieza compartida necesita algo de una feature, se lo inyecta la raíz `src/app/_layout.tsx`. Ejemplo: `AccionesCabecera` recibe la sesión con `SesionCabeceraProvider`, y la implementación real vive en `features/auth/viewmodels/sesionCabecera.ts`. La prueba `test/unit/gp-04/reglas-diseno.test.ts` lo vigila.

### Patrones de diseño

**Singleton (estado de módulo único)**
- `src/shared/api/apiClient.ts`: el módulo guarda una sola `renovacionEnCurso`; `renovarEnVuelo()` la crea solo si no existe (`renovacionEnCurso ??= ...`), así varias peticiones a la vez comparten una sola renovación. `renovarTrasRechazo(token)` deja que una conexión que no pasa por `request` (el flujo en vivo de avisos) use esa misma renovación tras un 401; si el token rechazado ya no es el guardado, responde `'renovada'` sin enviar nada. También guarda un único `manejadorSesionExpirada` y el último `refreshConsumido`.
- `src/shared/api/tokenStorage.ts`: un solo contador `generacion` (`generacionActual()`, `nuevaGeneracion()`) y una sola cola `cola` (`enCola()`) por la que pasan, una tras otra, todas las lecturas y escrituras de la sesión en SecureStore.
- `src/shared/api/configuracionPublica.ts`: un solo `estado` en memoria con la configuración pública para toda la app y una sola petición `enVuelo`.
- `src/features/notificaciones/viewmodels/avisosEstado.ts` y `useAvisosEnVivo.ts`: un solo estado de avisos para toda la app (con su carga `enVuelo`) y una sola conexión en vivo (`conexionUnica()`), que `src/app/_layout.tsx` monta una sola vez.
- `src/shared/api/documentosLegales.ts`: una sola caché de documentos legales vigentes para toda la app.

**Factory (función fábrica)**
- `src/shared/api/apiClient.ts`: `crearErrorApi(datos)` es la única función que crea los errores del cliente HTTP; recibe un tipo y decide la clase, el mensaje, el status y el `code`:
  - `{ tipo: 'red' }`: `ErrorDeRed` ("Sin conexión con el servidor.") cuando no hay red o no llega respuesta dentro del límite de 15 s; nunca cierra la sesión.
  - `{ tipo: 'respuesta', status, cuerpo }`: `ApiError` de una respuesta con error del backend, con el `message` (o `error`) y el `code` del cuerpo, o "Error en la solicitud (status)." si no vienen.
  - `{ tipo: 'sesionTerminada', code? }`: `ApiError` 401 de sesión terminada, con mensaje fijo para la clienta y `code` `SESION_VENCIDA` si el servidor no mandó otro.
- La usan `fetchWithTimeout` (sin red o tiempo agotado), `leer` (respuestas con error), `pedirRenovacionMovil` (falla al renovar), `prepararSalidaMovil`, `reintentarMovil` y `cerrarTrasRechazo` (sesión terminada), en lugar de armar cada uno su error. Sus sobrecargas dan el tipo exacto: `ErrorDeRed` para `'red'` y `ApiError` para los demás.
- Uso: `throw crearErrorApi({ tipo: 'respuesta', status: response.status, cuerpo: data })`.

**Repository**
- `src/features/*/models/*Model.ts` y `src/features/auth/models/authService.ts`: funciones como `listarMisCitas`, `obtenerCita`, `crearCita` y `cancelarCita` (`citaModel.ts`), `obtenerCatalogo` (`productoModel.ts`) u `obtenerCarrito` (`carritoModel.ts`) ocultan la ruta HTTP y convierten la respuesta cruda en tipos de la feature (`normalizarCita`, `normalizarProducto`, `normalizarItem`). Los viewmodels piden datos a estas funciones sin saber de dónde salen. En `authService.ts`, `obtenerPerfilConToken` pide `GET /api/auth/me` con el token recién emitido tras el inicio con Google.
- `src/shared/api/configuracionPublica.ts`: lee `GET /api/configuracion-publica` sin sesión (`{ publica: true }`) y la convierte con `normalizarConfiguracion` en `ConfiguracionPublica`; las pantallas no saben si llegó de la red, del archivo o del respaldo. Además del salón, el horario y las reglas, trae el contenido de las pantallas (`contenido.inicio`, `contenido.sobreNosotros` con sus valores y `contenido.contacto`) y los textos del sitio (`textos`); lo que falte o venga con otro tipo toma el respaldo campo por campo. `cargarConfiguracion()` sigue este orden: memoria vigente (`VIGENCIA_CONFIGURACION_MS`, 5 minutos), red, archivo guardado y `RESPALDO_CONFIGURACION` (los valores que la app tenía fijos). El archivo usa expo-file-system en `Paths.document` y no SecureStore, porque SecureStore limita el tamaño por valor y estos datos no son secretos. Dos refrescos a la vez comparten una sola petición. Inicio y El salón llaman a `refrescar()` al deslizar para actualizar.
- `src/shared/api/textosSitio.ts`: catálogo de textos. `obtenerTexto(clave, contexto)` no hace peticiones: lee la misma caché en memoria de la configuración pública. Usa el texto del servidor (`textos`) si viene completo y, si no, el de `RESPALDO_TEXTOS`; llena las variables de reglas (`variablesDeReglas`, por ejemplo `{minutosLlegadaAntes}` o `{nombreSalon}`) y las de contexto que pasa la pantalla (`{fecha}`, `{motivo}`...), y nunca devuelve llaves: si falta una variable, usa el respaldo o quita lo que sobra.
- `src/features/salon/models/contenidoSalonModel.ts`: `obtenerPromociones`, `obtenerPreguntasFrecuentes`, `obtenerEquipo` y `obtenerGaleria` leen sin sesión las promociones, las preguntas frecuentes, el equipo y la galería, y las normalizan (`normalizarPromociones`, `normalizarPreguntas`, `normalizarEquipo`, `normalizarGaleria`): descartan lo que no trae los campos obligatorios, recortan los textos y solo dejan URLs https.
- `src/shared/api/documentosLegales.ts`: lee `GET /api/documentos-legales/:slug/vigente` con caché en memoria y en archivo. Sin red usa lo guardado y nunca inventa una versión.
- `src/features/auth/models/perfilCompartido.ts` (GP-07.6): Repository de `GET /api/auth/me` sin React. Al entrar con una sesión guardada, `useAuth` y la foto de la cabecera comparten una sola petición (solo dentro de la misma generación de sesión). Cerrar sesión y guardar cambios del perfil o de la foto lo olvidan todo; nada se guarda en disco.

**Observer**
- `src/features/tienda/viewmodels/usePiezasCarrito.ts`: estado en memoria con un `Set` de `oyentes`; `suscribir()` agrega y quita oyentes, `fijar()` les avisa cuando cambia el número de piezas y `usePiezasCarrito()` se conecta con `useSyncExternalStore(suscribir, leerPiezas)`. Otras pantallas publican cambios con `avisarCambioCarrito()` y `publicarPiezasCarrito()`.
- `src/features/auth/viewmodels/useFotoClienta.ts`: el mismo esquema (`oyentes`, `suscribir`, `fijar`, `useSyncExternalStore`) para la foto de la cabecera; Perfil avisa con `fijarFotoClienta()`.
- `src/shared/api/apiClient.ts`: `alExpirarSesion(manejador)` registra a quien se entera cuando la sesión expira (un solo manejador) y devuelve la función para quitarlo; `AuthProvider` en `useAuth.tsx` se registra ahí para quedar sin sesión y avisarle a la clienta.
- `src/shared/api/useTextos.ts`: `useTextos()` se conecta con `useSyncExternalStore(suscribir, obtenerConfiguracion)` y devuelve la función `texto`, que cambia solo cuando llega otra configuración. Así Inicio (`usePantallaInicio` y `useContenidoInicio`), El salón (`useSalonViewModel`) y el calendario de citas (`useCalendarioCitas`) se vuelven a pintar con los textos, el contenido, el horario y los días sin servicio nuevos sin pedir nada por su cuenta. Al deslizar para actualizar, Inicio pide a la vez la configuración, las cuatro listas de contenido y los dos catálogos; El salón pide la configuración; si falla la red, se queda lo que ya estaba a la vista.
- `src/shared/api/configuracionPublica.ts` y `useConfiguracionPublica.ts`: `suscribir()` registra oyentes que se enteran cuando llega una versión nueva, y `useConfiguracionPublica()` se conecta con `useSyncExternalStore(suscribir, estadoConfiguracion)`. Al volver la app a primer plano, el hook refresca solo si la caché ya venció (`cacheVencida()`).
- `src/features/notificaciones/viewmodels/avisosEstado.ts`: estado de los avisos internos con un `Set` de `oyentes` de la lista y del contador; `suscribir()` los agrega y quita, `fijar()` les avisa y `useAvisos()` y `useNoLeidos()` se conectan con `useSyncExternalStore`. La bandeja (`useNotificaciones`) y la campana (`useNoLeidos`, que la raíz inyecta en `AccionesCabecera`) se suscriben ahí. `alLlegarAviso()` es un canal aparte solo para los avisos nuevos que llegan en vivo: lo escucha el aviso en pantalla (`useAvisoEnPantalla`). La conexión en vivo (`models/conexionAvisos.ts`) publica cada aviso con `agregarAviso()` y no conoce a las pantallas.
- `src/shared/api/useDocumentoLegal.ts`: las pantallas se suscriben al documento legal vigente y se vuelven a pintar cuando llega.
- `src/shared/api/eventosSesion.ts` (GP-07.6): `alCerrarSesion(oyente)` registra a quien guarda en memoria datos de la clienta y `avisarCierreSesion(motivo)` les avisa una sola vez en cada cierre, con su motivo (`'salida'`, `'vencida'` o `'cambioContrasena'`). Se suscriben la verificación del pago y la memoria del carrito de la tienda, el perfil compartido y la reserva pendiente (esta se conserva solo con `'vencida'`). Así auth no depende de las features que limpian y shared no depende de ninguna feature.

**Pantalla de carga**
- `src/app/_layout.tsx`: mantiene el splash nativo hasta que están las fuentes, la sesión, la apariencia y la carga inicial de la configuración pública (`cargarConLimite()`), con un tope de `TIEMPO_MAXIMO_CARGA_MS` (3 segundos). Si se vence el tope o falla la red, abre con lo guardado en el archivo o con el respaldo, y la red termina en segundo plano. Nunca se queda en el splash.

### Avisos internos

La app no usa notificaciones push. Los avisos (recordatorios de citas, estado de pedidos) son internos: la campana con el número de avisos sin leer, la bandeja de Notificaciones y un aviso breve arriba de la pantalla. Solo llegan con sesión y con la app abierta en primer plano; con la app cerrada no llega nada, y lo que se haya creado mientras tanto aparece en la bandeja la próxima vez que se pida la lista.

- Conexión: `GET /api/notificaciones/stream` (SSE) con `abrirFlujoEventos` de `src/shared/api/flujoEventos.ts`. El token va solo en el encabezado `Authorization`, nunca en la URL. Ante un 401 renueva una vez con `renovarTrasRechazo` y reabre con el token nuevo.
- Si el flujo se corta o no hay red, reconecta con espera creciente (1 s, 2 s, 4 s... hasta 30 s). Desde el tercer fallo seguido pide la lista cada 30 s como respaldo hasta que el flujo vuelve a abrir.
- `useAvisosEnVivo` corta la conexión al pasar a segundo plano y al cerrar sesión (y vacía los avisos). Al volver a primer plano reconecta y pide la lista una sola vez.
- Interruptor "Avisos en la app" en Perfil (GP-07.6, `components/FilaAvisosEnApp.tsx`): la preferencia se guarda en el teléfono por clienta (`models/preferenciaAvisos.ts`, clave con el id de la clienta en SecureStore; no se borra al cerrar sesión, y si SecureStore falla quedan encendidos) y vive en un solo estado en memoria (`viewmodels/preferenciaAvisosEstado.ts`, Singleton con Observer). Apagado no abre `GET /api/notificaciones/stream`, no hace la consulta de respaldo de 30 s y no muestra el aviso en pantalla; la campana sigue abriendo la bandeja, que pide la lista cada vez que se abre. Al encenderlo vuelve a abrir una sola conexión.
- Pendiente del backend: un endpoint de preferencias de la clienta (por ejemplo, `GET` y `PATCH /api/notificaciones/preferencias` con `{ enApp }`). Mientras no exista, la preferencia vale solo en ese teléfono.

### Mensajes de error para la clienta (GP-07.6)

`src/shared/api/mensajesError.ts` es la única traducción de errores a texto para la clienta; todas las features pasan por ahí y ninguna pantalla muestra el `message` del servidor.

- `tipoDeError(error)`: clasifica sin leer nunca el texto del servidor: sin conexión o tiempo agotado (`ErrorDeRed`), y por estado HTTP sesión terminada (401), sin permiso (403), no encontrado (404), conflicto (409), demasiado grande (413), demasiadas solicitudes (429, incluido el ThrottlerException), servidor (5xx), solicitud (otros 4xx) o desconocido.
- `mensajeParaClienta(error, { respaldo, porCode })`: elige el texto en este orden: el `code` estable del backend (primero el de la feature en `porCode` y luego los comunes), después el tipo de error y al final el respaldo de la pantalla o el texto general del tipo. Sin red, tiempo agotado, sesión terminada y límite de solicitudes ganan al respaldo. Un 5xx con `referencia` (8 caracteres hexadecimales) agrega la frase para compartirla con el salón.
- `mensajeSinContexto(error)`: solo lo que no depende de la pantalla (un `code` conocido o sin red, tiempo agotado, sesión terminada o límite de solicitudes); `null` si no es nada de eso y la feature decide el resto (por ejemplo, la bandeja de avisos y la tienda).
- `MENSAJE_SIN_CONEXION` es el único texto de sin conexión de la app.
- Los textos viven en el catálogo con las claves `errores.*` de `textosSitio.ts` (con respaldo en la app), así el salón los puede cambiar sin tocar código. Los textos propios de cada dominio (por ejemplo, "Ese horario ya se ocupó. Elige otro.") se quedan en su feature y llegan como respaldo o por `code`.

### Sesión: cierre y regreso a la reserva (GP-07.6)

- Cerrar sesión desde Perfil borra la sesión del teléfono, avisa por `alCerrarSesion` (la tienda olvida la verificación del pago y el carrito en memoria) y regresa a Inicio sin sesión. La revocación con `POST /api/auth/logout` (Bearer y `{ logoutAll: false, refreshToken }`) no bloquea: sin red el cierre local termina igual y no se muestra ningún error.
- Regreso a la reserva (`src/features/citas/viewmodels/useRegresoReserva.ts`, montado una sola vez en la raíz, con `models/reservaPendiente.ts`): si la sesión vence al confirmar una cita, lo elegido queda solo en memoria y la app queda en Inicio con el aviso. Cuando la misma clienta vuelve a iniciar sesión, la app abre sola la reserva en Confirmar con el servicio, la especialista, el día, la hora y las notas; si el horario ya no está libre, lo dice y deja elegir otro. Si entra otra cuenta, no se recupera nada.

### Documentos legales, consentimientos y forma de pago (GP-07.4)

**Visor de documentos legales**
- `src/shared/api/documentosLegales.ts` (Repository y Singleton): `GET /api/documentos-legales/:slug/vigente` con caché en memoria y en archivo, sin inventar versiones sin red.
- `src/shared/api/useDocumentoLegal.ts` (Observer), `src/shared/ui/VisorDocumentoLegal.tsx` y la ruta `src/app/legal/[slug].tsx`.
- En la app muestra el título, la versión y la fecha de vigencia, y abre el texto completo con expo-web-browser en la página pública de la web (`EXPO_PUBLIC_WEB_URL` + `ruta`). El contenido es HTML de página completa (índice, tablas, secciones desplegables) que no se puede mostrar bien con componentes nativos sin agregar dependencias.
- Lo reutilizan la tienda (GP-07.5) y el registro (GP-10).

**Consentimientos de citas**
- `src/shared/api/consentimientos.ts`: `POST /api/consentimientos`.
- Al confirmar una cita con anticipo se registra primero la aceptación de la Política de anticipos y cancelación con la versión vigente y su hash. Si la clienta marcó la casilla opcional de fotos del resultado, se registra después. Solo entonces se crea la cita; si un registro falla, la cita no se crea.
- La casilla (`src/shared/ui/Casilla.tsx` y `src/features/citas/components/CasillaPoliticaAnticipos.tsx`) empieza sin marcar.

**Forma de pago de citas**
- `src/features/citas/models/formaPagoModel.ts`: textos y opciones de la forma de pago con las reglas de la configuración o con las guardadas en cada cita.

### Tienda: pagos, pedidos y devoluciones (GP-07.5)

**Checkout**
- `src/features/tienda/models/compraLegal.ts`, `viewmodels/useCheckoutViewModel.ts`, `viewmodels/checkoutTienda.ts` y `views/CheckoutView.tsx`, con los componentes `DatosRecogerSalon.tsx`, `InformacionCompra.tsx` y `CasillasCompra.tsx`.
- Solo se ofrecen los métodos activos en `reglas.pagos` de la configuración pública: pagar en línea si `mercadoPagoTienda` está encendido y pagar al recoger si `metodosSalon` trae alguno. Si queda uno solo, ya viene elegido; si no queda ninguno, el checkout explica que llame al salón y no deja continuar.
- Los datos para recoger (salón, domicilio, horario, mapa y teléfono), los plazos (pago en línea, preparar el apartado, recordatorio, cancelación y resguardo) y los textos salen de la configuración y del catálogo de textos, nunca fijos en el código.
- El último paso trae la información de la compra: quién vende, precios en pesos con IVA, entrega solo en el salón, cambios y revocación con los días de las reglas, y quejas ante Profeco con su teléfono y su sitio.
- Dos casillas sin marcar: Términos de venta y Política de reembolsos, cambios y cancelaciones, con enlace al visor `/legal/[slug]` (se apila encima y al volver el checkout sigue igual). Sin las dos no se envía nada.
- Al confirmar se registra primero `POST /api/consentimientos` (`terminos_venta` con el documento `terminos` y `reembolsos` con `reembolsos`, cada uno con la versión y el hash vigentes) y solo después `POST /api/pedidos?propios=true`. Si el consentimiento falla, el pedido no se crea; con la versión cambiada, las casillas se desmarcan y se traen los documentos nuevos.

**Datos de transferencia**
- `src/shared/ui/DatosTransferencia.tsx` y `src/shared/ui/portapapeles.ts` (expo-clipboard): banco, titular y CLABE (leída dígito por dígito) con el botón Copiar CLABE; si no se puede copiar, lo avisa y la CLABE queda seleccionable. Se muestran en el checkout, en el detalle de un apartado listo para pagar en el salón y en el detalle de una cita que se paga en el salón.
- Vienen de `reglas.pagos.transferencia` y solo si la transferencia está activa y completa. Viven solo en memoria y solo desde la red: el archivo de la configuración se guarda sin ellos, y sin red la app no los muestra.

**Verificación del pago en línea**
- `src/features/tienda/models/verificacionPago.ts` (Singleton y Observer, sin React) y `viewmodels/useVerificacionPago.ts`: un solo registro por pedido con el último estado conocido del pago y si hay una verificación en curso. Lo comparten la confirmación (`usePedidoConfirmadoViewModel.ts`), el detalle y Mis pedidos.
- Una sola verificación por pedido a la vez; los reintentos tienen tope (`MAXIMO_CONSULTAS_PAGO` y `MAXIMO_CONSULTAS_SIN_PAGO`) y espera creciente. Se detiene en segundo plano y, al volver a primer plano, revisa los pedidos con el pago pendiente. Si cambia la sesión, olvida todo.
- Al volver de Mercado Pago la confirmación dice "Verificando tu pago" hasta tener respuesta: aprobado, en proceso, en revisión, rechazado o "Todavía no vemos tu pago" con los reintentos agotados (ahí lo primero es Revisar mi pago).
- Sin cobros dobles: el registro solo consulta el estado (GET), nunca pide una preferencia. Antes de abrir otro pago se consulta el estado y, si está en proceso, en revisión o aprobado, no se abre Mercado Pago.

**Detalle del pedido**
- `viewmodels/useDetallePedidoViewModel.ts` y `viewmodels/detallePedido.ts`, con `components/HojaRevocarCompra.tsx` y `components/SeccionDevoluciones.tsx`.
- Revocación de compra (art. 56 de la LFPC) con `models/revocacionModel.ts`: el botón solo se ve si el backend dice `puedeRevocar` y `revocableHasta` no ha pasado. La hoja avisa el derecho con los días guardados en el pedido, cuánto se reintegra (`montoRevocable`), qué pasa con el pedido y hasta cuándo; el motivo es opcional y un candado evita el doble envío. Cada resultado (reembolsado, en revisión o por entregar en el salón) y cada error tiene su texto, sin mostrar el del servidor.
- Devoluciones y reembolsos con `models/devolucionesModel.ts`: cada devolución con su estado, tipo, monto, motivo sin la etiqueta del backend y la respuesta del salón; de cada pago solo el estado del reembolso, el monto y la fecha. Se ven al abrir el detalle, sin pasar por cancelar; si la consulta falla, el detalle se sigue viendo y la sección deja reintentar.
- Pedir un cambio o un reembolso con `models/solicitudDevolucionModel.ts`, `viewmodels/useSolicitudDevolucion.ts` y `components/HojaSolicitarDevolucion.tsx`, como la página de devoluciones de la web. Solo se ofrece lo que la política del backend acepta con el estado del pedido: cambio (sellado y sin abrir o defecto de fábrica) y reembolso por defecto o producto distinto en un pedido entregado; reembolso por falta de existencias o por cancelación antes de estar listo (solo pagado en línea) en un pedido cancelado que ya se pagó. Sin artículos libres o con una solicitud activa del pedido completo no se ofrece. La hoja pide el producto cuando la causa lo requiere y confirmar que está sellado; el detalle es opcional (hasta 500 caracteres). Nunca se manda estado ni monto: los calcula el backend. Un candado evita el doble envío y, tras un error de red, se busca la solicitud antes de dejar reintentar. Al terminar aparece pendiente en la sección.
- Retirar una solicitud pendiente con `components/HojaRetirarDevolucion.tsx`, siempre con confirmación previa. Una revocación no se retira desde la app: es renunciar a un derecho y a un reembolso, y se hace con el salón.

**Mis pedidos y carrito**
- Mis pedidos toma del registro de verificación los pagos en línea en proceso y los muestra así en lugar de "Pendiente de pago".
- `carritoModel.ts` (`obtenerCarritoRevisado` y `tomarAvisosCarrito`): compara cada lectura con la anterior de la sesión. Lo que desapareció sin que la clienta lo quitara y cuyo producto ya no está en la tienda, y lo que llega con la presentación no disponible, se quita con `DELETE /api/carrito/:id` antes de pagar y se avisa por su nombre en el carrito (`components/AvisoTienda.tsx`, región en vivo para TalkBack). El checkout hace la misma revisión y, si algo se retiró, regresa al carrito.

**Contratos del backend que usa**
- `GET /api/configuracion-publica` (`reglas.pagos`, `reglas.tienda`, `reglas.revocacion` y textos).
- `GET /api/documentos-legales/terminos/vigente` y `GET /api/documentos-legales/reembolsos/vigente`; `POST /api/consentimientos`.
- `GET /api/carrito`, `PUT /api/carrito/:id`, `DELETE /api/carrito/:id` y `GET /api/productos/:id`.
- `POST /api/pedidos?propios=true`, `GET /api/pedidos?propios=true&limit=100&sort=creadoEn:desc`, `GET /api/pedidos/:id?propios=true` (con `revocableHasta`, `puedeRevocar` y `montoRevocable`) y `PUT /api/pedidos/:id?propios=true` para cancelar.
- `POST /api/pedidos/:id/revocar` con `motivo` opcional.
- `GET /api/devoluciones/pedido/:pedidoId?propios=true` y `GET /api/pagos/pedido/:pedidoId?propios=true`.
- `POST /api/devoluciones?propios=true` con `pedidoId`, `tipo`, `causa`, `pedidoItemId` opcional, `sellado` (solo con la causa sellado y sin abrir) y `motivo` opcional; `POST /api/devoluciones/:id/cancelar` para retirar una pendiente.
- `POST /api/pagos-en-linea/mercadopago/preferencia?origen=app` y `GET /api/pagos-en-linea/mercadopago/estado/:pedidoId`.

**Pendientes del backend**
- Que la lista de pedidos traiga el estado del pago, para no depender del registro de verificación de la app.
- Que el carrito informe los productos desactivados en lugar de omitirlos (hoy la app los deduce comparando lecturas y consultando el producto).
- Códigos estables en los 409 de revocar y de cancelar, y en los 400 y 409 de las devoluciones: hoy la app distingue el motivo por el texto del mensaje.
- Que los pagos y las devoluciones que ve la clienta no expongan `payload`, `referenciaExterna` ni `errorMensaje` (la app los descarta, pero no deberían salir del servidor).

## Compilación y publicación (GP-08)

Perfiles de `eas.json`:

- `development`: development build (dev client) en APK de distribución interna.
- `preview`: APK de distribución interna contra producción, con `OFUSCAR_JS=1` para que sea igual al de producción.
- `production`: AAB para Google Play, con `autoIncrement` y `appVersionSource` `remote`.

Workflow `.github/workflows/compilacion-android.yml` ("Compilación Android"):

- Compila con EAS y el perfil `production` al hacer push o fusionar a `main` o `release`; también se corre a mano (`workflow_dispatch`) eligiendo `production` o `preview`.
- Los cambios solo de documentación (archivos `.md` y `LICENSE`) no compilan, y hay una sola compilación por push porque el plan gratuito de EAS tiene límite mensual.
- Necesita el secreto del repositorio `EXPO_TOKEN`: se crea en expo.dev y se guarda en Settings > Secrets and variables > Actions.

Protección del binario:

- Ofuscación del JavaScript por módulo dentro de Metro con javascript-obfuscator 4.2.1: solo si `OFUSCAR_JS=1`, `metro.config.js` cambia el transformer por `metro-transformador-ofuscacion.js`, que envuelve el worker de transformación de Expo y ofusca solo los módulos de `src` ya minificados y con sus dependencias resueltas, dentro del wrapper `__d` de Metro; después compila Hermes. Sin la variable la configuración es la de Expo, y el bundle de desarrollo, Expo Go y Jest quedan igual. `OFUSCAR_JS=1` está en los perfiles `preview` y `production`.
- No se usa `react-native-obfuscating-transformer` porque su versión 1.0.0 depende de Babel 6 (`babel-generator` 6, `@types/babel-core` 6) y de javascript-obfuscator 0.13.
- No se usa `obfuscator-io-metro-plugin` porque ofusca el bundle en un `beforeExit` asíncrono y Expo CLI fuerza `process.exit(0)` a los 4 segundos (`ensureProcessExitsAfterDelay`), así que el bundle quedaba sin ofuscar.
- R8: `expo-build-properties` activa la minificación con R8 y la reducción de recursos solo en release.
- Firma: la llave de carga la guarda EAS (credenciales administradas) y la firma final la hace Google Play App Signing.

Análisis del binario (`.github/scripts/analizar-binario.sh`):

- Revisa `targetSdk` 36, `minSdk`, `versionCode` y los permisos finales con aapt2; la alineación de 16 KB (zipalign y segmentos de las `.so` de `arm64-v8a`); secretos y URLs de desarrollo con JADX y en el bundle; la evidencia de ofuscación con 10 identificadores de `src` (5 nombres locales no exportados y 5 textos únicos), y el reporte de MobSF (informativo).
- Las apariciones de `localhost` que generan librerías conocidas (por ejemplo `http://localhost:8081` de `getDevServer` de React Native) se listan aparte como permitidas; cualquier otra hace fallar el job.
- En `resources/` solo se permiten, por archivo, nombre y valor exacto, los dos textos del menú de desarrollo de React Native (`catalyst_change_bundle_location_input_hint` y `catalyst_change_bundle_location_instructions` de `ReactAndroid/src/main/res/devsupport/values/strings.xml`). Un recurso con otro nombre o valor hace fallar el job, y el resumen muestra el nombre del recurso, nunca su valor.
- Con la ofuscación, los textos de `src` (incluidas `EXPO_PUBLIC_API_URL` y `EXPO_PUBLIC_WEB_URL`) quedan codificados en el bundle, así que esa búsqueda ya no ve una URL de desarrollo escrita en ellos.
- Lo compensa el paso "Verificar el perfil de compilación", que antes de `eas build` falla si el perfil de `eas.json` no trae las URLs de producción exactas y `OFUSCAR_JS=1`.
- Falla solo por hallazgos de JADX, un `localhost` o recurso no permitido, `targetSdk` distinto de 36, falta de `arm64-v8a`, alineación de 16 KB o, en `preview` y `production`, más de 2 de los 10 identificadores visibles en el bundle.
- Los reportes quedan como artefactos 14 días; nunca se sube el APK, el AAB ni el keystore desechable.
- `USE_BIOMETRIC` y `USE_FINGERPRINT` (de `androidx.biometric`, que trae `expo-secure-store`) están en `blockedPermissions` porque la app no usa `requireAuthentication`. Si algún día se usa, hay que quitarlos de la lista.

Hallazgos de MobSF aceptados (v4.5.3, build de production con versionCode 2):

| Severidad | Hallazgo | Justificación |
|---|---|---|
| high | Se instala en Android 7.0 sin parches (minSdk 24) | Es el mínimo por omisión de Expo SDK 57; subirlo a 29 dejaría fuera a las clientas con Android 7 a 9. |
| high | Cifrado CBC con relleno PKCS5 | Es el CryptoObject de relleno de `androidx.biometric` (`CryptoObjectUtils`); SecureStore cifra con AES/GCM. |
| warning | `taskAffinity` en `BrowserProxyActivity` | Viene de `expo-web-browser`, no está exportada y la usa el inicio con Google. |
| warning | Receiver exportado protegido con `DUMP` | `ProfileInstallReceiver` de AndroidX; `DUMP` solo lo tienen adb y el sistema. |
| warning | Revelación de dirección IP | Texto de ayuda del servidor de desarrollo en `DebugServerException` de React Native. |
| warning | Crea archivos temporales | Cachés de Fresco y expo-image, subida multipart y recorte de fotos, en almacenamiento privado. |
| warning | Información sensible escrita en el código | Falsos positivos por nombres como `key` en Compose, Glide, Fresco, rnscreens y Expo; ninguna clase propia. |
| warning | Generador aleatorio inseguro | `kotlin.random` y OkHttp para ids y máscaras de WebSocket; PKCE usa `expo-crypto`. |
| warning | MD5 débil | Suma de verificación de archivos en `expo-file-system` y `expo-asset`, no seguridad. |
| warning | WebView con JavaScript | `DomWebView` de `@expo/dom-webview` (componentes DOM de Expo); la app no tiene ninguno. |
| warning | `allowFileAccessFromFileURLs` en WebView | El mismo `DomWebView`; nunca recibe URLs de la clienta. |
| warning | SHA-1 débil | UUID v5 de Expo (lo exige el RFC 4122) y llaves de caché de Fresco. |
| warning | Almacenamiento externo | Caché de Fresco y `FileProvider` de AndroidX y expo-clipboard; la app no guarda datos ahí. |
| warning | Posibles secretos en el código | Cadenas de las `.so` (tablas hex y símbolos C++); JADX con los patrones del CI no encuentra secretos. |

## Pruebas

```bash
npm test               # corre Jest
npm run test:coverage  # Jest con cobertura
npm run typecheck      # tsc --noEmit
```

Estructura de `test/`:

- `test/setup.ts`: configuración global. Mocks de `expo-secure-store` (en memoria, se vacía antes de cada prueba), `expo-font`, `expo-splash-screen`, `react-native-reanimated`, `react-native-worklets` y `expo/fetch` (la petición del flujo en vivo queda pendiente hasta que se aborta); `fetch` simulado que rechaza si la prueba no lo configura; variables de entorno de prueba con la API en `http://api.test`.
- `test/helpers/`: utilidades compartidas, como `secureStore.ts` para limpiar y leer el almacén simulado de SecureStore, o `streamSimulado.ts` y `pantallasAvisos.ts` para controlar el flujo en vivo de avisos simulado.
- `test/unit/<tarea>/` y `test/integration/<tarea>/`: pruebas unitarias y de integración agrupadas por tarea (por ejemplo, `test/unit/gp-02` y `test/integration/gp-02`).

Workflow `.github/workflows/pruebas.yml` (se dispara en `pull_request` y `push` hacia `main`, `develop` y `release`; no usa secretos):

- Job `pruebas` (Node 22): `npm ci`, `npm run typecheck` y `npx jest --ci --coverage`; publica el resumen de pruebas y cobertura en el resumen del job y sube la cobertura como artefacto.
- Job `sast`: Semgrep con las reglas `p/javascript`, `p/typescript`, `p/react` y `p/secrets`; resume los hallazgos por severidad y falla si hay alguno de severidad ERROR.

## Flujo de ramas

El repo usa GitHub Flow: cada tarea sale en una rama `feature/*` o `fix/*` desde `main` y regresa a `main` con un PR. Cada tarea lleva un solo commit con Conventional Commits en español y el número de issue (por ejemplo, `feat(citas): elegir día y hora (GP-06.2)`). Las ramas no se borran porque el profesor pide el historial.

GP-07.1 (pantalla de carga y configuración pública) se hizo una sola vez con GitFlow:

1. `develop` sale de `main`.
2. `feature/pantalla-de-carga` sale de `develop` y se integra a `develop`.
3. De `develop` sale una rama release (por ejemplo, `release/v0.3.0`) que se integra a `main` con el tag `v0.3.0`.
4. `main` regresa a `develop` para que las dos queden iguales.

```text
main      o---------------------------o v0.3.0
           \                         / \
release     \              o--------o   \
             \            /              \
develop       o----o-----o----------------o
                    \   /
feature              o-o
```

Después de GP-07.1 se sigue con GitHub Flow.
