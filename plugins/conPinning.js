'use strict';

// Certificate pinning de api.mirufranco.com (GP-09).
//
// Solo actúa con PINNING=1 (lo ponen los perfiles preview y production de eas.json). Entonces escribe
// android/app/src/main/res/xml/network_security_config.xml y lo enlaza desde el <application> del
// manifiesto. Sin PINNING=1 devuelve la configuración intacta: Expo Go, expo start, el perfil
// development y cualquier compilación local quedan como siempre y conservan el texto plano hacia Metro.
//
// Además deja una copia permisiva en src/debug: si alguien compila Debug con PINNING=1, Gradle usa esa
// y la variante Debug sigue sin pinning y con texto plano hacia Metro. El pinning solo vive en Release.
//
// Los pines son el SHA-256 del SPKI (llave pública) de las raíces de todas las CA que usa Cloudflare,
// incluidas las de firma cruzada. Fijar la llave raíz y no el certificado del servidor permite que
// Cloudflare renueve o cambie de CA sin romper la app. Se calculan y verifican con scripts/pines-spki.sh.
// Al llegar el vencimiento Android deja de aplicar el pin-set y la app sigue conectando con los
// certificados del sistema; se renueva en cada versión con el script.
//
// PINNING_PRUEBA_FALSA=1 (junto con PINNING=1) cambia el pin-set por un único pin que no es de ninguna
// llave, para comprobar en una compilación local de Release que la app rechaza la conexión. Nunca en EAS.

const fs = require('node:fs');
const path = require('node:path');
const { withAndroidManifest, withDangerousMod } = require('expo/config-plugins');

const DOMINIO_FIJADO = 'api.mirufranco.com';
const VENCIMIENTO_PINES = '2027-06-30';
const NOMBRE_RECURSO = 'network_security_config';
const RUTA_XML_RELEASE = path.join('app', 'src', 'main', 'res', 'xml', `${NOMBRE_RECURSO}.xml`);
const RUTA_XML_DEBUG = path.join('app', 'src', 'debug', 'res', 'xml', `${NOMBRE_RECURSO}.xml`);
const ATRIBUTO_MANIFIESTO = 'android:networkSecurityConfig';
const VALOR_MANIFIESTO = `@xml/${NOMBRE_RECURSO}`;

// 32 bytes en cero en base64: forma válida de un SHA-256, pero no corresponde a ninguna llave.
const PIN_FALSO = Buffer.alloc(32).toString('base64');

/** Pines SHA-256 del SPKI, en base64, de cada raíz. Salida de scripts/pines-spki.sh. */
const PINES = Object.freeze([
  // Let's Encrypt (https://letsencrypt.org/certificates/)
  { raiz: 'ISRG Root X1', pin: 'C5+lpZ7tcVwmwQIMcRtPbsQtWLABXhQzejna0wHFr8M=' },
  { raiz: 'ISRG Root X2', pin: 'diGVwiVYbubAI3RW4hB9xU8e/CH2GnkuvVFZE8zmgzI=' },
  // Google Trust Services (https://pki.goog/repository/)
  { raiz: 'GTS Root R1', pin: 'hxqRlPTu1bMS/0DITB1SSu0vd4u/8l8TjPgfaAp63Gc=' },
  { raiz: 'GTS Root R2', pin: 'Vfd95BwDeSQo+NUYxVEEIlvkOlWY2SalKK1lPhzOx78=' },
  { raiz: 'GTS Root R3', pin: 'QXnt2YHvdHR3tJYmQIr0Paosp6t/nggsEGD4QJZ3Q0g=' },
  { raiz: 'GTS Root R4', pin: 'mEflZT5enoR1FuXLgYYGqnVEoZvmf9c2bVBpiOjYQ0c=' },
  // GlobalSign Root CA: firma cruzada de GTS Root R1 y R4.
  { raiz: 'GlobalSign Root CA', pin: 'K87oWBWM9UZfyddvDfoxL+8lpNyoUB2ptGtn0fv6G2Q=' },
  // SSL.com (https://www.ssl.com/repository/)
  { raiz: 'SSL.com TLS RSA Root CA 2022', pin: 'K89VOmb1cJAN3TK6bf4ezAbJGC1mLcG2Dh97dnwr3VQ=' },
  { raiz: 'SSL.com TLS ECC Root CA 2022', pin: 'G/ANXI8TwJTdF+AFBM8IiIUPEv0Gf6H5LA/b9guG4yE=' },
  { raiz: 'SSL.com Root Certification Authority RSA', pin: '0cRTd+vc1hjNFlHcLgLCHXUeWqn80bNDH/bs9qMTSPo=' },
  { raiz: 'SSL.com Root Certification Authority ECC', pin: 'oyD01TTXvpfBro3QSZc1vIlcMjrdLTiL/M9mLCPX+Zo=' },
  // Certum Trusted Network CA: firma cruzada de SSL.com.
  { raiz: 'Certum Trusted Network CA', pin: 'qiYwp7YXsE0KKUureoyqpQFubb5gSDeoOoVxn6tmfrU=' },
  // Sectigo (https://www.sectigo.com/knowledge-base/detail/Sectigo-Public-Intermediates-and-Roots)
  { raiz: 'USERTrust RSA Certification Authority', pin: 'x4QzPSC810K5/cMjb05Qm4k3Bw5zBn4lTdO/nEW/Td4=' },
  { raiz: 'USERTrust ECC Certification Authority', pin: 'ICGRfpgmOUXIWcQ/HXPLQTkFPEFPoDyjvH7ohhQpjzs=' },
  { raiz: 'AAA Certificate Services', pin: 'vRU+17BDT2iGsXvOi76E7TQMcTLXAqj0+jGPdW7L1vM=' },
  // Raíces TLS de Sectigo desde 2025 (firmadas en cruz por USERTrust). Sin ellas, un certificado nuevo
  // de Sectigo con la ruta terminando en R46 o E46 no coincidiría con ningún pin.
  { raiz: 'Sectigo Public Server Authentication Root R46', pin: 'Douxi77vs4G+Ib/BogbTFymEYq0QSFXwSgVCaZcI09Q=' },
  { raiz: 'Sectigo Public Server Authentication Root E46', pin: 'sLVjNUaFYfW7n6EtgBeEpjOlcnBdNPMrZDRF36iwBdE=' },
]);

/** Pinning pedido para esta compilación. */
function pinningActivo(env = process.env) {
  return env.PINNING === '1';
}

/**
 * Pines a escribir según el entorno. El pin falso jamás sale en EAS: si EAS_BUILD está presente con
 * PINNING_PRUEBA_FALSA=1 se lanza un error que detiene la compilación.
 */
function pinesParaCompilacion(env = process.env) {
  const pruebaFalsa = env.PINNING_PRUEBA_FALSA === '1';
  if (pruebaFalsa && env.EAS_BUILD !== undefined && env.EAS_BUILD !== '') {
    throw new Error(
      'conPinning: PINNING_PRUEBA_FALSA=1 solo se usa en una compilación local de Release. ' +
        'Quítala del perfil o de los secretos de EAS: con el pin falso la app no conectaría con la API.',
    );
  }
  return pruebaFalsa ? [PIN_FALSO] : PINES.map((p) => p.pin);
}

/** XML de network_security_config para Release: sin texto plano y con el pin-set solo para la API. */
function armarXmlSeguridadRed(pines, vencimiento = VENCIMIENTO_PINES) {
  const lineasPines = pines.map((pin) => `      <pin digest="SHA-256">${pin}</pin>`).join('\n');
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Generado por plugins/conPinning.js (GP-09). No se edita a mano: android/ no se versiona. -->',
    '<network-security-config>',
    '  <base-config cleartextTrafficPermitted="false">',
    '    <trust-anchors>',
    '      <certificates src="system"/>',
    '    </trust-anchors>',
    '  </base-config>',
    '  <domain-config>',
    `    <domain includeSubdomains="false">${DOMINIO_FIJADO}</domain>`,
    `    <pin-set expiration="${vencimiento}">`,
    lineasPines,
    '    </pin-set>',
    '  </domain-config>',
    '</network-security-config>',
    '',
  ].join('\n');
}

/** XML de la variante Debug: sin pin-set y con texto plano para hablar con Metro. */
function armarXmlSeguridadRedDebug() {
  return [
    '<?xml version="1.0" encoding="utf-8"?>',
    '<!-- Generado por plugins/conPinning.js (GP-09). Solo Debug: sin pinning y con texto plano hacia Metro. -->',
    '<network-security-config>',
    '  <base-config cleartextTrafficPermitted="true">',
    '    <trust-anchors>',
    '      <certificates src="system"/>',
    '    </trust-anchors>',
    '  </base-config>',
    '</network-security-config>',
    '',
  ].join('\n');
}

/** Enlaza el XML desde el <application> principal del manifiesto. */
function agregarConfigSeguridadRed(manifiesto) {
  const aplicacion = manifiesto?.manifest?.application?.[0];
  if (!aplicacion) {
    throw new Error('conPinning: el AndroidManifest.xml no tiene <application>.');
  }
  aplicacion.$ = { ...aplicacion.$, [ATRIBUTO_MANIFIESTO]: VALOR_MANIFIESTO };
  return manifiesto;
}

async function escribirArchivo(raizAndroid, rutaRelativa, contenido) {
  const destino = path.join(raizAndroid, rutaRelativa);
  await fs.promises.mkdir(path.dirname(destino), { recursive: true });
  await fs.promises.writeFile(destino, contenido, 'utf8');
}

function conPinning(config) {
  if (!pinningActivo()) {
    return config;
  }
  const pines = pinesParaCompilacion();

  let resultado = withAndroidManifest(config, (c) => {
    c.modResults = agregarConfigSeguridadRed(c.modResults);
    return c;
  });
  resultado = withDangerousMod(resultado, [
    'android',
    async (c) => {
      const raizAndroid = c.modRequest.platformProjectRoot;
      await escribirArchivo(raizAndroid, RUTA_XML_RELEASE, armarXmlSeguridadRed(pines));
      await escribirArchivo(raizAndroid, RUTA_XML_DEBUG, armarXmlSeguridadRedDebug());
      return c;
    },
  ]);
  return resultado;
}

module.exports = conPinning;
module.exports.DOMINIO_FIJADO = DOMINIO_FIJADO;
module.exports.VENCIMIENTO_PINES = VENCIMIENTO_PINES;
module.exports.PINES = PINES;
module.exports.PIN_FALSO = PIN_FALSO;
module.exports.RUTA_XML_RELEASE = RUTA_XML_RELEASE;
module.exports.RUTA_XML_DEBUG = RUTA_XML_DEBUG;
module.exports.pinningActivo = pinningActivo;
module.exports.pinesParaCompilacion = pinesParaCompilacion;
module.exports.armarXmlSeguridadRed = armarXmlSeguridadRed;
module.exports.armarXmlSeguridadRedDebug = armarXmlSeguridadRedDebug;
module.exports.agregarConfigSeguridadRed = agregarConfigSeguridadRed;
