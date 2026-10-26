#!/usr/bin/env bash
# Pines SPKI del certificate pinning de api.mirufranco.com (GP-09).
#
# Descarga cada certificado raíz desde la página oficial de su CA, comprueba su huella contra la que
# publica la CA (escrita abajo con su fuente), imprime el nombre y el pin (SHA-256 del SPKI en base64)
# de cada raíz y comprueba que la cadena que sirve hoy api.mirufranco.com cae en alguno de los pines.
# Sale con un código distinto de 0 si una descarga falla, si una huella no coincide o si la cadena en
# vivo no coincide con ningún pin.
#
# Se corre en un contenedor node:22 (trae bash, curl y openssl), por ejemplo:
#   docker run --rm --cpus=2 --memory=4g -v "$PWD/scripts:/s:ro" node:22 bash /s/pines-spki.sh
# Lo que se descarga solo se lee con openssl; nunca se ejecuta.
#
# Al renovar los pines en cada versión: correr este script, copiar los pines a plugins/conPinning.js
# si cambiaron y mover la fecha de vencimiento del pin-set.
set -euo pipefail

DOMINIO="${DOMINIO:-api.mirufranco.com}"

# Cada raíz: nombre|URL oficial de descarga|algoritmo de la huella publicada|huella publicada|fuente.
# Let's Encrypt y Sectigo no escriben la huella en su página: enlazan la ficha de crt.sh de cada raíz,
# y la huella se toma de esa ficha. GlobalSign solo publica la huella SHA-1 de Root R1.
RAICES=(
  "ISRG Root X1|https://letsencrypt.org/certs/isrgrootx1.pem|sha256|96BCEC06264976F37460779ACF28C5A7CFE8A3C0AAE11A8FFCEE05C0BDDF08C6|https://crt.sh/?id=9314791 (enlazada desde https://letsencrypt.org/certificates/)"
  "ISRG Root X2|https://letsencrypt.org/certs/isrg-root-x2.pem|sha256|69729B8E15A86EFC177A57AFB7171DFC64ADD28C2FCA8CF1507E34453CCB1470|https://crt.sh/?id=3335562555 (enlazada desde https://letsencrypt.org/certificates/)"
  "GTS Root R1|https://i.pki.goog/r1.pem|sha256|D947432ABDE7B7FA90FC2E6B59101B1280E0E1C7E4E40FA3C6887FFF57A7F4CF|https://pki.goog/repo/repo.json (datos de https://pki.goog/repository/)"
  "GTS Root R2|https://i.pki.goog/r2.pem|sha256|8D25CD97229DBF70356BDA4EB3CC734031E24CF00FAFCFD32DC76EB5841C7EA8|https://pki.goog/repo/repo.json (datos de https://pki.goog/repository/)"
  "GTS Root R3|https://i.pki.goog/r3.pem|sha256|34D8A73EE208D9BCDB0D956520934B4E40E69482596E8B6F73C8426B010A6F48|https://pki.goog/repo/repo.json (datos de https://pki.goog/repository/)"
  "GTS Root R4|https://i.pki.goog/r4.pem|sha256|349DFA4058C5E263123B398AE795573C4E1313C83FE68F93556CD5E8031B3C7D|https://pki.goog/repo/repo.json (datos de https://pki.goog/repository/)"
  "GlobalSign Root CA|https://secure.globalsign.net/cacert/Root-R1.crt|sha1|B1BC968BD4F49D622AA89A81F2150152A41D829C|https://support.globalsign.com/ca-certificates/root-certificates/globalsign-root-certificates"
  "SSL.com TLS RSA Root CA 2022|https://repo-certs.ssl.com/repo/certs/SSLcom-TLS-Root-2022-RSA.pem|sha256|8FAF7D2E2CB4709BB8E0B33666BF75A5DD45B5DE480F8EA8D4BFE6BEBC17F2ED|https://www.ssl.com/repository/"
  "SSL.com TLS ECC Root CA 2022|https://repo-certs.ssl.com/repo/certs/SSLcom-TLS-Root-2022-ECC.pem|sha256|C32FFD9F46F936D16C3673990959434B9AD60AAFBB9E7CF33654F144CC1BA143|https://www.ssl.com/repository/"
  "SSL.com Root Certification Authority RSA|https://repo-certs.ssl.com/repo/certs/SSLcomRootCertificationAuthorityRSA.pem|sha256|85666A562EE0BE5CE925C1D8890A6F76A87EC16D4D7D5F29EA7419CF20123B69|https://www.ssl.com/repository/"
  "SSL.com Root Certification Authority ECC|https://repo-certs.ssl.com/repo/certs/SSLcomRootCertificationAuthorityECC.pem|sha256|3417BB06CC6007DA1B961C920B8AB4CE3FAD820E4AA30B9ACBC4A74EBDCEBC65|https://www.ssl.com/repository/"
  "Certum Trusted Network CA|https://repository.certum.pl/ctnca.pem|sha256|5C58468D55F58E497E743982D2B50010B6D165374ACF83A7D4A32DB768C4408E|https://www.certum.eu/en/cert_expertise_root_certificates/"
  "USERTrust RSA Certification Authority|http://crt.sectigo.com/USERTrustRSACertificationAuthority.crt|sha256|E793C9B02FD8AA13E21C31228ACCB08119643B749C898964B1746D46C3D4CBD2|https://crt.sh/?id=1199354 (enlazada desde https://www.sectigo.com/knowledge-base/detail/Sectigo-Public-Intermediates-and-Roots)"
  "USERTrust ECC Certification Authority|http://crt.sectigo.com/USERTrustECCCertificationAuthority.crt|sha256|4FF460D54B9C86DABFBCFC5712E0400D2BED3FBC4D4FBDAA86E06ADCD2A9AD7A|https://crt.sh/?id=2841410 (enlazada desde https://www.sectigo.com/knowledge-base/detail/Sectigo-Public-Intermediates-and-Roots)"
  "AAA Certificate Services|http://crt.sectigo.com/AAACertificateServices.crt|sha256|D7A7A0FB5D7E2731D771E9484EBCDEF71D5F0C3E0A2948782BC83EE0EA699EF4|https://www.ssl.com/repository/ (sección Comodo AAA Root; Sectigo no publica la huella)"
  "Sectigo Public Server Authentication Root R46|http://crt.sectigo.com/SectigoPublicServerAuthenticationRootR46.crt|sha256|7BB647A62AEEAC88BF257AA522D01FFEA395E0AB45C73F93F65654EC38F25A06|https://crt.sh/?id=4256644734 (enlazada desde https://www.sectigo.com/knowledge-base/detail/Sectigo-Public-Intermediates-and-Roots)"
  "Sectigo Public Server Authentication Root E46|http://crt.sectigo.com/SectigoPublicServerAuthenticationRootE46.crt|sha256|C90F26F0FB1B4018B22227519B5CA2B53E2CA5B3BE5CF18EFE1BEF47380C5383|https://crt.sh/?id=4256644603 (enlazada desde https://www.sectigo.com/knowledge-base/detail/Sectigo-Public-Intermediates-and-Roots)"
)

TRABAJO="$(mktemp -d)"
trap 'rm -rf "$TRABAJO"' EXIT

# Pin de un certificado PEM: SHA-256 de su SubjectPublicKeyInfo en DER, en base64.
pin_de() {
  openssl x509 -in "$1" -pubkey -noout \
    | openssl pkey -pubin -outform DER \
    | openssl dgst -sha256 -binary \
    | openssl enc -base64
}

# Huella del certificado completo, en hexadecimal mayúsculas sin dos puntos.
huella_de() {
  openssl x509 -in "$1" -noout -fingerprint "-$2" | cut -d= -f2 | tr -d ':'
}

fallas=0
declare -A NOMBRE_POR_PIN=()
: > "$TRABAJO/raices.pem"

echo "== Raíces (descarga oficial y huella publicada)"
for i in "${!RAICES[@]}"; do
  IFS='|' read -r nombre url algoritmo esperada fuente <<< "${RAICES[$i]}"
  crudo="$TRABAJO/raiz-$i.bin"
  pem="$TRABAJO/raiz-$i.pem"
  if ! curl -fsSL --max-time 90 --retry 2 -o "$crudo" "$url"; then
    echo "FALLA  $nombre: no se pudo descargar $url" >&2
    fallas=$((fallas + 1))
    continue
  fi
  # Algunas CA publican en DER y otras en PEM.
  if grep -q -- '-----BEGIN CERTIFICATE-----' "$crudo"; then
    openssl x509 -in "$crudo" -out "$pem"
  else
    openssl x509 -inform DER -in "$crudo" -out "$pem"
  fi
  obtenida="$(huella_de "$pem" "$algoritmo")"
  if [[ "$obtenida" != "$esperada" ]]; then
    echo "FALLA  $nombre: huella $algoritmo $obtenida no coincide con la publicada $esperada ($fuente)" >&2
    fallas=$((fallas + 1))
    continue
  fi
  pin="$(pin_de "$pem")"
  NOMBRE_POR_PIN["$pin"]="$nombre"
  cat "$pem" >> "$TRABAJO/raices.pem"
  echo "OK     $nombre"
  echo "       huella $algoritmo $obtenida (fuente: $fuente)"
  echo "       pin    $pin"
done

if (( fallas > 0 )); then
  echo "Se detiene: $fallas raíces fallaron." >&2
  exit 1
fi

echo
echo "== Cadena en vivo de $DOMINIO"
openssl s_client -connect "$DOMINIO:443" -servername "$DOMINIO" -showcerts < /dev/null \
  > "$TRABAJO/s_client.txt" 2> /dev/null || true
awk -v dir="$TRABAJO" '
  /-----BEGIN CERTIFICATE-----/ { n++; dentro = 1 }
  dentro { print > (dir "/cadena-" n ".pem") }
  /-----END CERTIFICATE-----/ { dentro = 0 }
' "$TRABAJO/s_client.txt"

mapfile -t cadena < <(find "$TRABAJO" -maxdepth 1 -name 'cadena-*.pem' | sort -V)
if (( ${#cadena[@]} == 0 )); then
  echo "FALLA  $DOMINIO no entregó certificados." >&2
  exit 1
fi

coincidencias=0
for c in "${cadena[@]}"; do
  pin="$(pin_de "$c")"
  basename "$c" .pem
  echo "  sujeto: $(openssl x509 -in "$c" -noout -subject -nameopt RFC2253 | sed 's/^subject=//')"
  echo "  emisor: $(openssl x509 -in "$c" -noout -issuer -nameopt RFC2253 | sed 's/^issuer=//')"
  echo "  pin:    $pin"
  if [[ -n "${NOMBRE_POR_PIN[$pin]:-}" ]]; then
    echo "  COINCIDE con el pin de ${NOMBRE_POR_PIN[$pin]}"
    coincidencias=$((coincidencias + 1))
  fi
done

# La cadena servida casi nunca trae la raíz. Android arma la ruta hasta una raíz del sistema y compara
# los pines contra toda esa ruta, así que se valida igual: solo con las raíces de arriba como confianza.
hoja="${cadena[0]}"
: > "$TRABAJO/intermedios.pem"
for c in "${cadena[@]:1}"; do cat "$c" >> "$TRABAJO/intermedios.pem"; done
echo
echo "== Ruta de confianza usando solo las raíces fijadas"
if ruta="$(openssl verify -show_chain -CAfile "$TRABAJO/raices.pem" -untrusted "$TRABAJO/intermedios.pem" \
  -verify_hostname "$DOMINIO" "$hoja" 2>&1)"; then
  echo "$ruta"
  ancla="$(grep -E '^depth=' <<< "$ruta" | tail -n 1)"
  ancla_pem="$TRABAJO/ancla.pem"
  # La última de la ruta es una raíz descargada arriba; se muestra su pin para saber cuál coincidió.
  for i in "${!RAICES[@]}"; do
    IFS='|' read -r nombre _ <<< "${RAICES[$i]}"
    if [[ "$ancla" == *"$nombre"* ]]; then
      cp "$TRABAJO/raiz-$i.pem" "$ancla_pem"
      echo "Ancla de la ruta: $nombre, pin $(pin_de "$ancla_pem")"
    fi
  done
else
  echo "$ruta" >&2
  echo "FALLA  la cadena de $DOMINIO no llega a ninguna de las raíces fijadas." >&2
  exit 1
fi

echo
if (( coincidencias > 0 )); then
  echo "Listo: $coincidencias certificados de la cadena servida coinciden con un pin y la ruta llega a una raíz fijada."
else
  echo "Listo: ningún certificado servido es una raíz fijada, pero la ruta validada termina en una raíz fijada (arriba)."
fi
