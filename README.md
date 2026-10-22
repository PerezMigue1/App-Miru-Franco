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
- `src/shared/api`: cliente HTTP con renovación de sesión (`apiClient.ts`), sesión en SecureStore (`tokenStorage.ts`), subida multipart (`subirMultipart.ts`) y configuración pública del salón (`configuracionPublica.ts` con su hook `useConfiguracionPublica.ts`).
- `src/shared/ui`: colores (`colores.ts`), tokens (`tokens.ts`), tema (`useTheme.ts`, `apariencia.tsx`) y componentes compartidos.

Regla: shared no depende de features. `src/shared` no importa nada de `src/features`; cuando una pieza compartida necesita algo de una feature, se lo inyecta la raíz `src/app/_layout.tsx`. Ejemplo: `AccionesCabecera` recibe la sesión con `SesionCabeceraProvider`, y la implementación real vive en `features/auth/viewmodels/sesionCabecera.ts`. La prueba `test/unit/gp-04/reglas-diseno.test.ts` lo vigila.

### Patrones de diseño

**Singleton (estado de módulo único)**
- `src/shared/api/apiClient.ts`: el módulo guarda una sola `renovacionEnCurso`; `renovarEnVuelo()` la crea solo si no existe (`renovacionEnCurso ??= ...`), así varias peticiones a la vez comparten una sola renovación. También guarda un único `manejadorSesionExpirada` y el último `refreshConsumido`.
- `src/shared/api/tokenStorage.ts`: un solo contador `generacion` (`generacionActual()`, `nuevaGeneracion()`) y una sola cola `cola` (`enCola()`) por la que pasan, una tras otra, todas las lecturas y escrituras de la sesión en SecureStore.
- `src/shared/api/configuracionPublica.ts`: un solo `estado` en memoria con la configuración pública para toda la app y una sola petición `enVuelo`.

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

**Observer**
- `src/features/tienda/viewmodels/usePiezasCarrito.ts`: estado en memoria con un `Set` de `oyentes`; `suscribir()` agrega y quita oyentes, `fijar()` les avisa cuando cambia el número de piezas y `usePiezasCarrito()` se conecta con `useSyncExternalStore(suscribir, leerPiezas)`. Otras pantallas publican cambios con `avisarCambioCarrito()` y `publicarPiezasCarrito()`.
- `src/features/auth/viewmodels/useFotoClienta.ts`: el mismo esquema (`oyentes`, `suscribir`, `fijar`, `useSyncExternalStore`) para la foto de la cabecera; Perfil avisa con `fijarFotoClienta()`.
- `src/shared/api/apiClient.ts`: `alExpirarSesion(manejador)` registra a quien se entera cuando la sesión expira (un solo manejador) y devuelve la función para quitarlo; `AuthProvider` en `useAuth.tsx` se registra ahí para quedar sin sesión y avisarle a la clienta.
- `src/shared/api/useTextos.ts`: `useTextos()` se conecta con `useSyncExternalStore(suscribir, obtenerConfiguracion)` y devuelve la función `texto`, que cambia solo cuando llega otra configuración. Así Inicio (`usePantallaInicio` y `useContenidoInicio`), El salón (`useSalonViewModel`) y el calendario de citas (`useCalendarioCitas`) se vuelven a pintar con los textos, el contenido, el horario y los días sin servicio nuevos sin pedir nada por su cuenta. Al deslizar para actualizar, Inicio pide a la vez la configuración, las cuatro listas de contenido y los dos catálogos; El salón pide la configuración; si falla la red, se queda lo que ya estaba a la vista.
- `src/shared/api/configuracionPublica.ts` y `useConfiguracionPublica.ts`: `suscribir()` registra oyentes que se enteran cuando llega una versión nueva, y `useConfiguracionPublica()` se conecta con `useSyncExternalStore(suscribir, estadoConfiguracion)`. Al volver la app a primer plano, el hook refresca solo si la caché ya venció (`cacheVencida()`).

**Pantalla de carga**
- `src/app/_layout.tsx`: mantiene el splash nativo hasta que están las fuentes, la sesión, la apariencia y la carga inicial de la configuración pública (`cargarConLimite()`), con un tope de `TIEMPO_MAXIMO_CARGA_MS` (3 segundos). Si se vence el tope o falla la red, abre con lo guardado en el archivo o con el respaldo, y la red termina en segundo plano. Nunca se queda en el splash.

## Pruebas

```bash
npm test               # corre Jest
npm run test:coverage  # Jest con cobertura
npm run typecheck      # tsc --noEmit
```

Estructura de `test/`:

- `test/setup.ts`: configuración global. Mocks de `expo-secure-store` (en memoria, se vacía antes de cada prueba), `expo-font`, `expo-splash-screen`, `react-native-reanimated` y `react-native-worklets`; `fetch` simulado que rechaza si la prueba no lo configura; variables de entorno de prueba con la API en `http://api.test`.
- `test/helpers/`: utilidades compartidas, como `secureStore.ts` para limpiar y leer el almacén simulado de SecureStore.
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
