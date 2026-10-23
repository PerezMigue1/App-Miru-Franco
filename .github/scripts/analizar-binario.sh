#!/usr/bin/env bash
# Análisis del binario Android que generó EAS.
#
# Revisa con aapt2 los datos del manifiesto, la alineación de 16 KB, busca secretos y URLs de
# desarrollo con JADX y en el bundle de Hermes, mide la ofuscación y corre MobSF (informativo).
#
# Entrada por variables de entorno (las pone el workflow):
#   URL_ARTEFACTO, PERFIL, VERSION_BUNDLETOOL, SHA256_BUNDLETOOL, VERSION_JADX, SHA256_JADX,
#   IMAGEN_MOBSF y DIR_REPORTES. El runner pone RUNNER_TEMP, ANDROID_HOME y GITHUB_STEP_SUMMARY.
#
# En DIR_REPORTES quedan solo los reportes que se suben (MobSF JSON y PDF, resumen de JADX y
# salida de aapt2). El AAB, el APK, el keystore, la llave de MobSF y la descompilación quedan en
# DIR_TRABAJO (dentro de RUNNER_TEMP, fuera de DIR_REPORTES) y nunca se suben.
#
# Falla (exit 1, después de escribir reportes y resumen) solo si:
#   - hay hallazgos de JADX o del bundle (secretos, o URLs de desarrollo fuera de las excepciones
#     permitidas del bundle o por encima de su máximo de apariciones);
#   - targetSdk no es 36;
#   - falta arm64-v8a;
#   - la alineación de 16 KB no pasa;
#   - con perfil production o preview, quedan visibles en el bundle más de
#     MAX_IDENTIFICADORES_VISIBLES de los IDENTIFICADORES_PROPIOS (la ofuscación no se aplicó).
set -euo pipefail

: "${URL_ARTEFACTO:?Falta URL_ARTEFACTO}"
: "${PERFIL:?Falta PERFIL}"
: "${VERSION_BUNDLETOOL:?Falta VERSION_BUNDLETOOL}"
: "${SHA256_BUNDLETOOL:?Falta SHA256_BUNDLETOOL}"
: "${VERSION_JADX:?Falta VERSION_JADX}"
: "${SHA256_JADX:?Falta SHA256_JADX}"
: "${IMAGEN_MOBSF:?Falta IMAGEN_MOBSF}"
: "${RUNNER_TEMP:?Falta RUNNER_TEMP}"
: "${ANDROID_HOME:?Falta ANDROID_HOME}"
: "${GITHUB_STEP_SUMMARY:?Falta GITHUB_STEP_SUMMARY}"

readonly DIR_TRABAJO="$RUNNER_TEMP/analisis-binario"
readonly DIR_REPORTES="${DIR_REPORTES:-$RUNNER_TEMP/reportes}"
readonly ARTEFACTO="$DIR_TRABAJO/artefacto.zip"
readonly APK="$DIR_TRABAJO/app.apk"
readonly CONTENIDO_APK="$DIR_TRABAJO/contenido-apk.txt"
readonly ARCHIVO_CLAVE="$DIR_TRABAJO/clave-almacen.txt"
readonly ENCABEZADO_MOBSF="$DIR_TRABAJO/encabezado-mobsf.txt"
readonly SALIDA_JADX="$DIR_TRABAJO/jadx-salida"
readonly CADENAS_BUNDLE="$DIR_TRABAJO/cadenas-bundle.txt"
readonly CADENAS_BUNDLE_FILTRADAS="$DIR_TRABAJO/cadenas-bundle-sin-excepciones.txt"
readonly BADGING="$DIR_REPORTES/aapt2-badging.txt"
readonly RESUMEN_JADX="$DIR_REPORTES/jadx-resumen.md"
readonly CONTENEDOR_MOBSF="mobsf-analisis"
readonly URL_MOBSF="http://127.0.0.1:8000"

# Los prefijos de credenciales de Mercado Pago se arman aquí a partir de partes para que el
# propio repositorio no contenga el prefijo literal y los escáneres de secretos no lo marquen.
readonly MP_PARTE_A="APP"
readonly MP_PARTE_B="USR"
readonly MP_PARTE_C="TE"
readonly MP_PARTE_D="ST"
readonly PREFIJO_MP_PRODUCCION="${MP_PARTE_A}_${MP_PARTE_B}-"
readonly PREFIJO_MP_PRUEBA="${MP_PARTE_C}${MP_PARTE_D}-"
# Después del prefijo, Mercado Pago usa números largos (access token) o un UUID (public key).
readonly CUERPO_MP="([0-9]{10,}-|[0-9a-f]{8}-[0-9a-f]{4}-)"

# Cada entrada es "nombre=expresión regular extendida" (grep -E). Se pueden agregar o quitar.
#
# Grupo 1, secretos: se buscan en TODA la salida de JADX (código propio y de terceros, recursos
# y bibliotecas nativas) y en las cadenas del bundle de Hermes. Ninguno es legítimo en la app.
PATRONES_SECRETOS=(
  "llave_privada=BEGIN ([A-Z]+ )?PRIVATE KEY"
  "postgres=(postgres|Postgres|POSTGRES)"
  "neon_tech=neon\.tech"
  "mercado_pago_produccion=${PREFIJO_MP_PRODUCCION}${CUERPO_MP}"
  "mercado_pago_prueba=${PREFIJO_MP_PRUEBA}${CUERPO_MP}"
)
# Grupo 2, URLs de desarrollo: el código Java de React Native y de otras bibliotecas trae
# localhost y 10.0.2.2 por diseño (por ejemplo com.facebook.react...AndroidInfoHelpers y el
# soporte del servidor de desarrollo), igual que sus bibliotecas nativas. Por eso estos patrones
# NO se buscan en código de terceros: solo en el bundle, en el código propio de JADX
# (sources/com/mirufranco) y en resources/ sin resources/lib (bibliotecas nativas de terceros).
#
# Limitación: con la ofuscación, las cadenas de src quedan en base64 dentro del string array, así
# que la búsqueda en el bundle ya no ve una URL de desarrollo escrita en src. Esa búsqueda cubre
# las librerías y lo que no se ofusca; las URLs públicas de la app llegan por el env de eas.json.
PATRONES_DESARROLLO=(
  "localhost=localhost"
  "ip_loopback=127\.0\.0\.1"
  "ip_emulador=10\.0\.2\.2"
  "red_local=192\.168\."
  "puerto_backend_local=:3101"
  "api_de_pruebas=api\.test"
  "ngrok=ngrok"
)

# Excepciones exactas de URLs de desarrollo, SOLO para las cadenas del bundle (en el código propio
# de JADX y en resources/ no hay excepciones). Cada entrada es "máximo|modo|texto|librería": el
# texto es fijo, de una librería, y se compara literal (sin expresión regular). Modo "exacta"
# acepta cualquier aparición del texto; modo "suelta" solo la que no es parte de una URL (sin "/"
# ni "@" antes y sin ":", "/" ni "." después), para que una URL nueva con localhost no se cuele.
#
# Hermes deduplica cadenas idénticas y strings puede juntar cadenas vecinas en una línea, así que
# se cuentan apariciones, no líneas. Hermes además empaca una cadena dentro de otra que la
# contiene, por eso "localhost" suelto puede salir con 0 apariciones.
#
# El orden importa: van primero las más largas. Cada excepción se cuenta y luego se quita del
# texto antes de contar la siguiente, porque "localhost" es subcadena de "http://localhost:8081/".
# Las apariciones por encima del máximo cuentan como hallazgo; lo que sobre después de quitar las
# excepciones se busca con PATRONES_DESARROLLO como siempre.
EXCEPCIONES_BUNDLE=(
  # Respaldo del servidor de desarrollo en getDevServer (const FALLBACK, línea 15).
  "1|exacta|http://localhost:8081/|react-native (node_modules/react-native/Libraries/Core/Devtools/getDevServer.js)"
  # Analizador de URL de Expo (parseFileHost, "localhost" === t, línea 1046). Lo usa
  # node_modules/expo/src/winter/url.ts.
  "1|suelta|localhost|whatwg-url-minimum (node_modules/whatwg-url-minimum/dist/whatwg-url-minimum.js)"
)

# Evidencia de ofuscación: nombres locales no exportados y literales de texto únicos de src. Con
# Hermes y minify false (como compila Gradle) aparecen 1 vez sin ofuscar y 0 con ofuscación. Se
# buscan literales (grep -F); los que tienen espacios van entre comillas.
IDENTIFICADORES_PROPIOS=(
  # Nombres locales no exportados.
  "aTokensMovil"                                      # src/shared/api/apiClient.ts:346
  "accesoVencido"                                     # src/shared/api/apiClient.ts:342
  "actualizarVigilancia"                              # src/features/tienda/models/verificacionPago.ts:197
  "aplicarRespuesta"                                  # src/features/tienda/models/verificacionPago.ts:250
  "PreguntaAcordeon"                                  # src/features/inicio/components/SeccionesContenido.tsx:267
  # Literales de texto únicos.
  "Consulta del pago sin respuesta."                  # src/features/tienda/models/verificacionPago.ts:293
  "Respuesta de servicio sin datos."                  # src/features/citas/models/servicioModel.ts:163
  "Debes indicar si tienes alergias a productos"      # src/features/auth/models/AuthModel.ts:432
  "Lo preparamos y te lo apartamos en el mostrador."  # src/shared/api/textosSitio.ts:162
  "Producto sellado y sin abrir"                      # src/shared/api/textosSitio.ts:458
)
# Con production o preview, más visibles que esto hace fallar el job.
readonly MAX_IDENTIFICADORES_VISIBLES=2

TIPO_ARTEFACTO=""
DIR_BUILD_TOOLS=""
PAQUETE=""
VERSION_CODE=""
VERSION_NAME=""
MIN_SDK=""
TARGET_SDK=""
PERMISOS=""
NUM_PERMISOS=0
ABIS=""
ESTADO_16KB="No pasa"
PASO_MOBSF="sin iniciar"
PUNTAJE_MOBSF="sin dato"
ALTOS_MOBSF="sin dato"
AVISOS_MOBSF="sin dato"
TOTAL_JADX=0
FILAS_JADX=()
FILAS_PERMITIDAS=()
VISIBLES=()
NOTAS=()
FALLAS=()

limpiar() {
  docker stop "$CONTENEDOR_MOBSF" > /dev/null 2>&1 || true
  docker rm "$CONTENEDOR_MOBSF" > /dev/null 2>&1 || true
  rm -f "$ARCHIVO_CLAVE" "$ENCABEZADO_MOBSF"
}

detener() {
  echo "::error::$1"
  exit 1
}

# Quita caracteres que romperían la tabla de Markdown del resumen.
celda() {
  printf '%s' "$1" | tr -d '|<>\140\r\n'
}

validar_entradas() {
  [[ "$PERFIL" == "production" || "$PERFIL" == "preview" ]] || detener "Perfil no permitido. Solo production o preview."
  [[ "$VERSION_BUNDLETOOL" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || detener "VERSION_BUNDLETOOL no es X.Y.Z."
  [[ "$VERSION_JADX" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || detener "VERSION_JADX no es X.Y.Z."
  [[ "$SHA256_BUNDLETOOL" =~ ^[0-9a-f]{64}$ ]] || detener "SHA256_BUNDLETOOL no es un sha256."
  [[ "$SHA256_JADX" =~ ^[0-9a-f]{64}$ ]] || detener "SHA256_JADX no es un sha256."
  [[ "$IMAGEN_MOBSF" =~ ^opensecurity/mobile-security-framework-mobsf:v[0-9]+\.[0-9]+\.[0-9]+$ ]] \
    || detener "IMAGEN_MOBSF debe tener una etiqueta exacta vX.Y.Z."
}

# Solo https y solo expo.dev o sus subdominios. El host no admite usuario, puerto ni "@".
validar_url() {
  [[ "$URL_ARTEFACTO" =~ ^https://([A-Za-z0-9.-]+)(/[^[:space:]]*)?$ ]] \
    || detener "La URL del artefacto no es https válida."
  local host="${BASH_REMATCH[1]}"
  [[ "$host" == "expo.dev" || "$host" == *.expo.dev ]] \
    || detener "La URL del artefacto no es de un dominio de expo.dev."
}

descargar() {
  curl -fsSL --proto '=https' --proto-redir '=https' --retry 3 --max-time 900 -o "$2" "$1"
}

descargar_verificado() {
  descargar "$1" "$2"
  echo "$3  $2" | sha256sum -c --quiet -
}

preparar_herramientas() {
  local dir="$DIR_TRABAJO/herramientas"
  mkdir -p "$dir/jadx"
  descargar_verificado \
    "https://github.com/google/bundletool/releases/download/${VERSION_BUNDLETOOL}/bundletool-all-${VERSION_BUNDLETOOL}.jar" \
    "$dir/bundletool.jar" "$SHA256_BUNDLETOOL"
  descargar_verificado \
    "https://github.com/skylot/jadx/releases/download/v${VERSION_JADX}/jadx-${VERSION_JADX}.zip" \
    "$dir/jadx.zip" "$SHA256_JADX"
  unzip -q -o "$dir/jadx.zip" -d "$dir/jadx"
  chmod +x "$dir/jadx/bin/jadx"
}

# Keystore desechable solo para que bundletool firme el APK universal de análisis.
crear_almacen_desechable() {
  local clave
  clave="$(openssl rand -hex 24)"
  echo "::add-mask::$clave"
  (umask 077 && printf '%s' "$clave" > "$ARCHIVO_CLAVE")
  chmod 600 "$ARCHIVO_CLAVE"
  CLAVE_ALMACEN="$clave" keytool -genkeypair -noprompt -keystore "$DIR_TRABAJO/analisis.p12" \
    -storetype PKCS12 -alias analisis -keyalg RSA -keysize 2048 -validity 1 \
    -dname "CN=Solo analisis CI" -storepass:env CLAVE_ALMACEN > /dev/null 2>&1
}

# El APK universal sale del AAB solo para analizarlo; nunca se distribuye ni se sube.
convertir_aab() {
  crear_almacen_desechable
  java -jar "$DIR_TRABAJO/herramientas/bundletool.jar" build-apks \
    --bundle="$ARTEFACTO" --output="$DIR_TRABAJO/universal.apks" --mode=universal \
    --ks="$DIR_TRABAJO/analisis.p12" --ks-key-alias=analisis \
    --ks-pass="file:$ARCHIVO_CLAVE" --key-pass="file:$ARCHIVO_CLAVE"
  unzip -q -o "$DIR_TRABAJO/universal.apks" -d "$DIR_TRABAJO/apks"
  mv "$DIR_TRABAJO/apks/universal.apk" "$APK"
}

obtener_apk() {
  descargar "$URL_ARTEFACTO" "$ARTEFACTO"
  unzip -Z1 "$ARTEFACTO" > "$DIR_TRABAJO/contenido-artefacto.txt"
  if grep -qx 'BundleConfig.pb' "$DIR_TRABAJO/contenido-artefacto.txt"; then
    TIPO_ARTEFACTO="AAB (APK universal solo para análisis)"
    convertir_aab
  elif grep -qx 'AndroidManifest.xml' "$DIR_TRABAJO/contenido-artefacto.txt"; then
    TIPO_ARTEFACTO="APK"
    mv "$ARTEFACTO" "$APK"
  else
    detener "El artefacto no es AAB ni APK."
  fi
  unzip -Z1 "$APK" > "$CONTENIDO_APK"
}

elegir_build_tools() {
  local version
  version="$(find "$ANDROID_HOME/build-tools" -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort -V | tail -n 1)"
  [[ -n "$version" ]] || detener "No hay build-tools en ANDROID_HOME."
  DIR_BUILD_TOOLS="$ANDROID_HOME/build-tools/$version"
  NOTAS+=("aapt2 y zipalign de build-tools $version.")
}

# $1 = filtro de la línea, $2 = expresión de sed que deja solo el valor.
valor_badging() {
  { grep -m1 -E -- "$1" "$BADGING" || true; } | sed -nE "$2"
}

leer_badging() {
  "$DIR_BUILD_TOOLS/aapt2" dump badging "$APK" > "$BADGING"
  PAQUETE="$(valor_badging '^package: ' "s/^package: name='([^']*)'.*/\1/p")"
  VERSION_CODE="$(valor_badging '^package: ' "s/.* versionCode='([^']*)'.*/\1/p")"
  VERSION_NAME="$(valor_badging '^package: ' "s/.* versionName='([^']*)'.*/\1/p")"
  MIN_SDK="$(valor_badging '^(sdkVersion|minSdkVersion):' "s/^[a-zA-Z]+:'([^']*)'.*/\1/p")"
  TARGET_SDK="$(valor_badging '^targetSdkVersion:' "s/^targetSdkVersion:'([^']*)'.*/\1/p")"
  PERMISOS="$({ grep -E "^uses-permission: name='" "$BADGING" || true; } \
    | sed -nE "s/^uses-permission: name='([^']*)'.*/\1/p" | sort -u | paste -sd, -)"
  if [[ -n "$PERMISOS" ]]; then
    NUM_PERMISOS="$(tr ',' '\n' <<< "$PERMISOS" | wc -l)"
  fi
}

tiene_abi() {
  [[ ",$ABIS," == *",$1,"* ]]
}

# Cada segmento LOAD de cada .so de arm64-v8a debe tener Align >= 0x4000 (16 KB).
revisar_elf_arm64() {
  local dir_libs="$DIR_TRABAJO/libs" so alineacion total=0 malas=0
  unzip -q -o "$APK" 'lib/arm64-v8a/*' -d "$dir_libs"
  while IFS= read -r -d '' so; do
    total=$((total + 1))
    while IFS= read -r alineacion; do
      if [[ ! "$alineacion" =~ ^0x[0-9a-fA-F]+$ ]] || (( alineacion < 0x4000 )); then
        malas=$((malas + 1))
        NOTAS+=("Sin alineación de 16 KB: $(basename "$so").")
        break
      fi
    done < <(readelf -lW "$so" | awk '$1 == "LOAD" { print $NF }')
  done < <(find "$dir_libs" -name '*.so' -print0)
  NOTAS+=("readelf revisó $total bibliotecas .so de arm64-v8a; $malas sin alineación de 16 KB.")
  (( total > 0 && malas == 0 ))
}

revisar_16kb() {
  local zipalign_ok="no" elf_ok="no"
  ABIS="$({ grep -E '^lib/[^/]+/' "$CONTENIDO_APK" || true; } | cut -d/ -f2 | sort -u | paste -sd, -)"
  if "$DIR_BUILD_TOOLS/zipalign" -c -P 16 -v 4 "$APK" > "$DIR_TRABAJO/zipalign.txt" 2>&1; then
    zipalign_ok="si"
  fi
  NOTAS+=("zipalign -c -P 16: $zipalign_ok pasa.")
  if tiene_abi arm64-v8a && revisar_elf_arm64; then
    elf_ok="si"
  fi
  if [[ "$zipalign_ok" == "si" && "$elf_ok" == "si" ]]; then
    ESTADO_16KB="Pasa"
  fi
}

# El bundle es bytecode de Hermes: se buscan sus cadenas ASCII y UTF-16LE.
extraer_cadenas_bundle() {
  local bundle="$DIR_TRABAJO/index.android.bundle"
  : > "$CADENAS_BUNDLE"
  if ! grep -qx 'assets/index.android.bundle' "$CONTENIDO_APK"; then
    NOTAS+=("El APK no trae assets/index.android.bundle.")
    return 0
  fi
  unzip -p "$APK" assets/index.android.bundle > "$bundle"
  strings -a -n 4 "$bundle" >> "$CADENAS_BUNDLE"
  strings -a -n 4 -e l "$bundle" >> "$CADENAS_BUNDLE"
}

descompilar_con_jadx() {
  local estado=0
  "$DIR_TRABAJO/herramientas/jadx/bin/jadx" --quiet -j "$(nproc)" -d "$SALIDA_JADX" "$APK" \
    > "$DIR_TRABAJO/jadx.log" 2>&1 || estado=$?
  # JADX sale con 3 cuando algunas clases no se pudieron descompilar; lo demás sí se revisa.
  if (( estado == 3 )); then
    NOTAS+=("JADX terminó con clases sin descompilar; se revisó lo que generó.")
  elif (( estado != 0 )); then
    detener "JADX falló con código $estado."
  fi
}

registrar_hallazgo() {
  FILAS_JADX+=("| $(celda "$1") | $2 | $(celda "$3") |")
  TOTAL_JADX=$((TOTAL_JADX + $2))
}

# $1 = nombre, $2 = regex, resto = opciones de grep y rutas relativas a SALIDA_JADX.
# Solo usa grep -l y grep -c: nunca imprime el texto encontrado.
buscar_en_jadx() {
  local nombre="$1" regex="$2" archivo conteo
  shift 2
  while IFS= read -r archivo; do
    conteo="$(grep -cE --binary-files=text -e "$regex" "$SALIDA_JADX/$archivo" || true)"
    registrar_hallazgo "$nombre" "$conteo" "$archivo"
  done < <(cd "$SALIDA_JADX" && grep -rlsE --binary-files=text --exclude=index.android.bundle -e "$regex" "$@" || true)
}

# $1 = nombre, $2 = regex, $3 = archivo de cadenas. Cuenta apariciones (grep -o), no líneas,
# porque strings puede juntar varias cadenas en una línea. La salida de grep va directo a wc.
buscar_en_bundle() {
  local conteo
  conteo="$({ grep -oE -e "$2" "$3" || true; } | wc -l)"
  if (( conteo > 0 )); then
    registrar_hallazgo "$1" "$conteo" "assets/index.android.bundle"
  fi
}

# $1 = texto, $2 = modo (exacta o suelta), $3 = archivo de entrada, $4 = archivo de salida.
# Copia la entrada en la salida sin las apariciones aceptadas del texto (cada una se cambia por
# un salto de línea para no unir lo que tenía a los lados) e imprime cuántas quitó. En modo suelta
# se dejan las que son parte de una URL. Nunca imprime cadenas del bundle.
quitar_excepcion() {
  local cuenta="$DIR_TRABAJO/cuenta-excepcion.txt" suelta=0
  if [[ "$2" == "suelta" ]]; then
    suelta=1
  fi
  awk -v t="$1" -v suelta="$suelta" -v cuenta="$cuenta" '
    {
      s = $0
      r = ""
      while ((i = index(s, t)) > 0) {
        antes = (i > 1) ? substr(s, i - 1, 1) : substr(r, length(r), 1)
        despues = substr(s, i + length(t), 1)
        if (suelta && (antes == "/" || antes == "@" || despues == ":" || despues == "/" || despues == ".")) {
          r = r substr(s, 1, i + length(t) - 1)
        } else {
          n++
          r = r substr(s, 1, i - 1) "\n"
        }
        s = substr(s, i + length(t))
      }
      print r s
    }
    END { print (n + 0) > cuenta }
  ' "$3" > "$4"
  cat "$cuenta"
}

# Cuenta y quita del texto las EXCEPCIONES_BUNDLE en orden. Deja el resultado en
# CADENAS_BUNDLE_FILTRADAS, que es donde se buscan las URLs de desarrollo del bundle.
aplicar_excepciones_bundle() {
  local entrada maximo modo texto libreria encontradas
  local actual="$DIR_TRABAJO/cadenas-excepcion-a.txt" siguiente="$DIR_TRABAJO/cadenas-excepcion-b.txt"
  cp "$CADENAS_BUNDLE" "$actual"
  for entrada in "${EXCEPCIONES_BUNDLE[@]}"; do
    IFS='|' read -r maximo modo texto libreria <<< "$entrada"
    encontradas="$(quitar_excepcion "$texto" "$modo" "$actual" "$siguiente")"
    mv "$siguiente" "$actual"
    FILAS_PERMITIDAS+=("$(printf '| \140%s\140 | %s | %s | %s | %s |' "$(celda "$texto")" "$modo" \
      "$(celda "$libreria")" "$maximo" "$encontradas")")
    if (( encontradas > maximo )); then
      registrar_hallazgo "excepcion_sobre_maximo" "$((encontradas - maximo))" "assets/index.android.bundle"
    fi
  done
  mv "$actual" "$CADENAS_BUNDLE_FILTRADAS"
}

buscar_patrones() {
  local entrada rutas_desarrollo=(resources)
  aplicar_excepciones_bundle
  if [[ -d "$SALIDA_JADX/sources/com/mirufranco" ]]; then
    rutas_desarrollo+=(sources/com/mirufranco)
  else
    NOTAS+=("JADX no generó sources/com/mirufranco; las URLs de desarrollo se buscaron en el bundle y en resources/.")
  fi
  for entrada in "${PATRONES_SECRETOS[@]}"; do
    buscar_en_jadx "${entrada%%=*}" "${entrada#*=}" sources resources
    buscar_en_bundle "${entrada%%=*}" "${entrada#*=}" "$CADENAS_BUNDLE"
  done
  for entrada in "${PATRONES_DESARROLLO[@]}"; do
    buscar_en_jadx "${entrada%%=*}" "${entrada#*=}" --exclude-dir=lib "${rutas_desarrollo[@]}"
    buscar_en_bundle "${entrada%%=*}" "${entrada#*=}" "$CADENAS_BUNDLE_FILTRADAS"
  done
}

contar_identificadores() {
  local identificador
  for identificador in "${IDENTIFICADORES_PROPIOS[@]}"; do
    if grep -qF -e "$identificador" "$CADENAS_BUNDLE"; then
      VISIBLES+=("$identificador")
    fi
  done
}

esperar_mobsf() {
  local intento
  for (( intento = 0; intento < 60; intento++ )); do
    if curl -s -o /dev/null --max-time 5 "$URL_MOBSF/"; then
      return 0
    fi
    sleep 5
  done
  return 1
}

# La llave de API se genera al vuelo, se enmascara y solo vive en un archivo 600 y en el entorno
# del comando docker (-e MOBSF_API_KEY sin valor la toma de ahí, sin ponerla en la línea).
iniciar_mobsf() {
  local llave
  llave="$(openssl rand -hex 32)" || return 1
  echo "::add-mask::$llave"
  (umask 077 && printf 'Authorization: %s\n' "$llave" > "$ENCABEZADO_MOBSF") || return 1
  PASO_MOBSF="descarga de la imagen"
  timeout 600 docker pull -q "$IMAGEN_MOBSF" > /dev/null || return 1
  PASO_MOBSF="arranque del contenedor"
  MOBSF_API_KEY="$llave" docker run -d --name "$CONTENEDOR_MOBSF" -p 127.0.0.1:8000:8000 \
    -e MOBSF_API_KEY "$IMAGEN_MOBSF" > /dev/null || return 1
  PASO_MOBSF="espera a que responda"
  esperar_mobsf
}

# $1 = endpoint de /api/v1, $2 = archivo de salida, resto = argumentos de curl.
mobsf_post() {
  local endpoint="$1" salida="$2"
  shift 2
  PASO_MOBSF="$endpoint"
  curl -sS --fail --max-time 1500 -H "@$ENCABEZADO_MOBSF" -o "$salida" "$@" \
    "$URL_MOBSF/api/v1/$endpoint"
}

analizar_con_mobsf() {
  local hash puntaje="$DIR_TRABAJO/mobsf-puntaje.json"
  iniciar_mobsf || return 1
  mobsf_post upload "$DIR_TRABAJO/mobsf-subida.json" -F "file=@$APK" || return 1
  hash="$(jq -r '.hash // empty' "$DIR_TRABAJO/mobsf-subida.json")" || return 1
  [[ "$hash" =~ ^[0-9a-f]{32}$ ]] || return 1
  mobsf_post scan "$DIR_TRABAJO/mobsf-escaneo.json" --data "hash=$hash" || return 1
  mobsf_post report_json "$DIR_REPORTES/mobsf-reporte.json" --data "hash=$hash" || return 1
  if ! mobsf_post download_pdf "$DIR_REPORTES/mobsf-reporte.pdf" --data "hash=$hash"; then
    rm -f "$DIR_REPORTES/mobsf-reporte.pdf"
    NOTAS+=("MobSF no generó el PDF.")
  fi
  mobsf_post scorecard "$puntaje" --data "hash=$hash" || return 1
  PUNTAJE_MOBSF="$(jq -r '.security_score // "sin dato"' "$puntaje")" || return 1
  ALTOS_MOBSF="$(jq -r '(.high // []) | length' "$puntaje")" || return 1
  AVISOS_MOBSF="$(jq -r '(.warning // []) | length' "$puntaje")" || return 1
}

evaluar_resultado() {
  (( TOTAL_JADX == 0 )) || FALLAS+=("JADX encontró $TOTAL_JADX coincidencias de patrones prohibidos.")
  [[ "$TARGET_SDK" == "36" ]] || FALLAS+=("targetSdk es ${TARGET_SDK:-desconocido}; debe ser 36.")
  tiene_abi arm64-v8a || FALLAS+=("Falta lib/arm64-v8a.")
  [[ "$ESTADO_16KB" == "Pasa" ]] || FALLAS+=("La alineación de 16 KB no pasa.")
  if [[ "$PERFIL" == "production" || "$PERFIL" == "preview" ]] \
    && (( ${#VISIBLES[@]} > MAX_IDENTIFICADORES_VISIBLES )); then
    FALLAS+=("Quedan visibles ${#VISIBLES[@]} de ${#IDENTIFICADORES_PROPIOS[@]} identificadores propios en el bundle; con $PERFIL el máximo es $MAX_IDENTIFICADORES_VISIBLES. La ofuscación no se aplicó.")
  fi
}

tabla_permitidas() {
  echo "| Texto | Modo | Librería | Máximo | Encontradas |"
  echo "|---|---|---|---|---|"
  printf '%s\n' "${FILAS_PERMITIDAS[@]}"
}

lista_visibles() {
  local identificador
  if (( ${#VISIBLES[@]} == 0 )); then
    echo "Ninguno."
    return 0
  fi
  for identificador in "${VISIBLES[@]}"; do echo "- $(celda "$identificador")"; done
}

tabla_jadx() {
  if (( ${#FILAS_JADX[@]} == 0 )); then
    echo "Sin hallazgos."
    return 0
  fi
  echo "| Patrón | Conteo | Ruta |"
  echo "|---|---|---|"
  printf '%s\n' "${FILAS_JADX[@]}"
}

escribir_resumen_jadx() {
  local entrada
  {
    echo "# Resumen de JADX ${VERSION_JADX}"
    echo ""
    echo "Solo se anotan el patrón, el conteo y la ruta; nunca el texto encontrado. En JADX se"
    echo "cuentan líneas; en el bundle, apariciones."
    echo ""
    tabla_jadx
    echo ""
    echo "## Permitidas en el bundle"
    echo ""
    echo "Excepciones fijas de librerías; solo aplican al bundle, no a JADX ni a resources/."
    echo ""
    tabla_permitidas
    echo ""
    echo "Patrones de secretos (toda la salida de JADX y el bundle):"
    for entrada in "${PATRONES_SECRETOS[@]}"; do echo "- ${entrada%%=*}"; done
    echo ""
    echo "Patrones de desarrollo (bundle, sources/com/mirufranco y resources/ sin lib/):"
    for entrada in "${PATRONES_DESARROLLO[@]}"; do echo "- ${entrada%%=*}"; done
  } > "$RESUMEN_JADX"
}

escribir_resumen() {
  local nota falla
  {
    echo "## Análisis del binario Android"
    echo ""
    echo "| Revisión | Resultado |"
    echo "|---|---|"
    echo "| Perfil | $PERFIL |"
    echo "| Artefacto | $TIPO_ARTEFACTO |"
    echo "| Paquete | $(celda "$PAQUETE") |"
    echo "| targetSdk | $(celda "${TARGET_SDK:-sin dato}") |"
    echo "| minSdk | $(celda "${MIN_SDK:-sin dato}") |"
    echo "| versionCode | $(celda "${VERSION_CODE:-sin dato}") (versionName $(celda "${VERSION_NAME:-sin dato}")) |"
    echo "| ABIs | $(celda "${ABIS:-ninguno}") |"
    echo "| 16 KB | $ESTADO_16KB |"
    echo "| Permisos | $NUM_PERMISOS: $(celda "${PERMISOS:-ninguno}") |"
    echo "| Identificadores visibles en el bundle | ${#VISIBLES[@]} de ${#IDENTIFICADORES_PROPIOS[@]} (máximo $MAX_IDENTIFICADORES_VISIBLES) |"
    echo "| Puntaje de MobSF | $(celda "$PUNTAJE_MOBSF") |"
    echo "| MobSF high / warning | $(celda "$ALTOS_MOBSF") / $(celda "$AVISOS_MOBSF") |"
    echo "| Hallazgos de JADX | $TOTAL_JADX |"
    echo ""
    echo "### Hallazgos de JADX y del bundle"
    echo ""
    tabla_jadx
    echo ""
    echo "### Permitidas en el bundle"
    echo ""
    tabla_permitidas
    echo ""
    echo "### Identificadores propios visibles en el bundle (${#VISIBLES[@]} de ${#IDENTIFICADORES_PROPIOS[@]})"
    echo ""
    lista_visibles
    echo ""
    echo "### Notas"
    echo ""
    for nota in "${NOTAS[@]}"; do echo "- $nota"; done
    echo ""
    echo "### Resultado"
    echo ""
    if (( ${#FALLAS[@]} == 0 )); then
      echo "Pasa: sin hallazgos de JADX ni del bundle, targetSdk 36, arm64-v8a presente, 16 KB correcto y ofuscación aplicada."
    else
      for falla in "${FALLAS[@]}"; do echo "- Falla: $falla"; done
    fi
  } >> "$GITHUB_STEP_SUMMARY"
}

main() {
  validar_entradas
  validar_url
  mkdir -p "$DIR_TRABAJO" "$DIR_REPORTES"
  chmod 700 "$DIR_TRABAJO"
  trap limpiar EXIT
  preparar_herramientas
  obtener_apk
  elegir_build_tools
  leer_badging
  revisar_16kb
  extraer_cadenas_bundle
  descompilar_con_jadx
  buscar_patrones
  contar_identificadores
  if ! analizar_con_mobsf; then
    NOTAS+=("MobSF no terminó (paso: $PASO_MOBSF); el análisis sigue sin su puntaje.")
  fi
  evaluar_resultado
  escribir_resumen_jadx
  escribir_resumen
  if (( ${#FALLAS[@]} > 0 )); then
    echo "::error::El análisis del binario encontró fallas; revisa el resumen."
    exit 1
  fi
}

main
