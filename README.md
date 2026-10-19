# App Miru Franco

Para arrancar la app: `npm install` y luego `npx expo start --go --tunnel -c`.

## Arquitectura y patrones

### MVVM por feature

Cada feature vive en `src/features/<feature>/` (auth, inicio, citas, tienda, notificaciones) con cuatro carpetas. La referencia es `src/features/auth`.

- `models/`: tipos y llamadas a la API. Toda petición pasa por `src/shared/api/apiClient.ts` (`apiGet`, `apiPost`, `apiPut`, `apiPatch`, `apiDelete`) y la respuesta se normaliza a los tipos de la feature. Ejemplos: `auth/models/authService.ts`, `citas/models/citaModel.ts`, `tienda/models/productoModel.ts`.
- `viewmodels/`: estado y lógica en hooks (`useLoginViewModel`, `useMisCitasViewModel`, `useCarritoViewModel`...). Llaman a las funciones de `models/` y entregan a la vista datos listos para pintar. Ningún viewmodel hace peticiones directas con `apiGet`, `apiPost`, `apiPut`, `apiPatch` o `apiDelete`: de `apiClient` solo toman `ApiError` y, en `auth/viewmodels/useAuth.tsx`, las funciones de manejo de sesión (`renovarSesion`, `alExpirarSesion`...). El perfil tras el inicio con Google lo pide `obtenerPerfilConToken` de `auth/models/authService.ts`.
- `views/`: solo pintan; toman todo de su viewmodel (por ejemplo, `LoginView.tsx` usa `useLoginViewModel`). En auth, `AuthContainer.tsx` y las vistas de acceso no importan nada de `models/`: los tipos y las opciones (como `tiposCabello`) les llegan de `useRegistroViewModel`. La prueba `test/unit/gp-05/reglas-auth.test.ts` vigila esto y que `useAuth.tsx` no haga peticiones directas.
- `components/`: piezas visuales propias de la feature (`TarjetaCita`, `SelectorHorario`, `FilaCarrito`...).

Fuera de las features:

- `src/app`: solo rutas de Expo Router; cada archivo reexporta una vista (por ejemplo, `src/app/(auth)/login.tsx` exporta `LoginView`).
- `src/shared/api`: cliente HTTP con renovación de sesión (`apiClient.ts`), sesión en SecureStore (`tokenStorage.ts`) y subida multipart (`subirMultipart.ts`).
- `src/shared/ui`: colores (`colores.ts`), tokens (`tokens.ts`), tema (`useTheme.ts`, `apariencia.tsx`) y componentes compartidos.

Regla: shared no depende de features. `src/shared` no importa nada de `src/features`; cuando una pieza compartida necesita algo de una feature, se lo inyecta la raíz `src/app/_layout.tsx`. Ejemplo: `AccionesCabecera` recibe la sesión con `SesionCabeceraProvider`, y la implementación real vive en `features/auth/viewmodels/sesionCabecera.ts`. La prueba `test/unit/gp-04/reglas-diseno.test.ts` lo vigila.

### Patrones de diseño

**Singleton (estado de módulo único)**
- `src/shared/api/apiClient.ts`: el módulo guarda una sola `renovacionEnCurso`; `renovarEnVuelo()` la crea solo si no existe (`renovacionEnCurso ??= ...`), así varias peticiones a la vez comparten una sola renovación. También guarda un único `manejadorSesionExpirada` y el último `refreshConsumido`.
- `src/shared/api/tokenStorage.ts`: un solo contador `generacion` (`generacionActual()`, `nuevaGeneracion()`) y una sola cola `cola` (`enCola()`) por la que pasan, una tras otra, todas las lecturas y escrituras de la sesión en SecureStore.

**Factory (función fábrica)**
- `src/shared/api/apiClient.ts`: `crearErrorApi(datos)` es la única función que crea los errores del cliente HTTP; recibe un tipo y decide la clase, el mensaje, el status y el `code`:
  - `{ tipo: 'red' }`: `ErrorDeRed` ("Sin conexión con el servidor.") cuando no hay red o no llega respuesta dentro del límite de 15 s; nunca cierra la sesión.
  - `{ tipo: 'respuesta', status, cuerpo }`: `ApiError` de una respuesta con error del backend, con el `message` (o `error`) y el `code` del cuerpo, o "Error en la solicitud (status)." si no vienen.
  - `{ tipo: 'sesionTerminada', code? }`: `ApiError` 401 de sesión terminada, con mensaje fijo para la clienta y `code` `SESION_VENCIDA` si el servidor no mandó otro.
- La usan `fetchWithTimeout` (sin red o tiempo agotado), `leer` (respuestas con error), `pedirRenovacionMovil` (falla al renovar), `prepararSalidaMovil`, `reintentarMovil` y `cerrarTrasRechazo` (sesión terminada), en lugar de armar cada uno su error. Sus sobrecargas dan el tipo exacto: `ErrorDeRed` para `'red'` y `ApiError` para los demás.
- Uso: `throw crearErrorApi({ tipo: 'respuesta', status: response.status, cuerpo: data })`.

**Repository**
- `src/features/*/models/*Model.ts` y `src/features/auth/models/authService.ts`: funciones como `listarMisCitas`, `obtenerCita`, `crearCita` y `cancelarCita` (`citaModel.ts`), `obtenerCatalogo` (`productoModel.ts`) u `obtenerCarrito` (`carritoModel.ts`) ocultan la ruta HTTP y convierten la respuesta cruda en tipos de la feature (`normalizarCita`, `normalizarProducto`, `normalizarItem`). Los viewmodels piden datos a estas funciones sin saber de dónde salen. En `authService.ts`, `obtenerPerfilConToken` pide `GET /api/auth/me` con el token recién emitido tras el inicio con Google.

**Observer**
- `src/features/tienda/viewmodels/usePiezasCarrito.ts`: estado en memoria con un `Set` de `oyentes`; `suscribir()` agrega y quita oyentes, `fijar()` les avisa cuando cambia el número de piezas y `usePiezasCarrito()` se conecta con `useSyncExternalStore(suscribir, leerPiezas)`. Otras pantallas publican cambios con `avisarCambioCarrito()` y `publicarPiezasCarrito()`.
- `src/features/auth/viewmodels/useFotoClienta.ts`: el mismo esquema (`oyentes`, `suscribir`, `fijar`, `useSyncExternalStore`) para la foto de la cabecera; Perfil avisa con `fijarFotoClienta()`.
- `src/shared/api/apiClient.ts`: `alExpirarSesion(manejador)` registra a quien se entera cuando la sesión expira (un solo manejador) y devuelve la función para quitarlo; `AuthProvider` en `useAuth.tsx` se registra ahí para quedar sin sesión y avisarle a la clienta.

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
