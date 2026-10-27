/// <reference types="jest" />

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import conPinning, {
  DOMINIO_FIJADO,
  PIN_FALSO,
  PINES,
  RUTA_XML_DEBUG,
  RUTA_XML_RELEASE,
  VENCIMIENTO_PINES,
  agregarConfigSeguridadRed,
  armarXmlSeguridadRed,
  armarXmlSeguridadRedDebug,
  pinesParaCompilacion,
} from '../../../plugins/conPinning';

/**
 * GP-09, bloque B: plugin de certificate pinning. Sin PINNING=1 la configuración sale intacta (Expo Go,
 * expo start, development y Debug sin pinning); con PINNING=1 escribe network_security_config.xml con
 * el pin-set solo para api.mirufranco.com y lo enlaza en el manifiesto. Con PINNING_PRUEBA_FALSA=1 deja
 * un único pin inválido y en EAS se niega. Nada sale a la red: el XML se escribe en una carpeta temporal.
 */

type Manifiesto = {
  manifest: {
    $: Record<string, string>;
    application?: { $: Record<string, string> }[];
  };
};

type ModAndroid = (config: Record<string, unknown>) => Promise<Record<string, unknown>>;

type ConfigConMods = {
  name: string;
  slug: string;
  mods?: { android?: { manifest?: ModAndroid; dangerous?: ModAndroid } };
};

const VARIABLES = ['PINNING', 'PINNING_PRUEBA_FALSA', 'EAS_BUILD'] as const;
const entornoOriginal: Partial<Record<(typeof VARIABLES)[number], string>> = {};

beforeEach(() => {
  for (const nombre of VARIABLES) {
    entornoOriginal[nombre] = process.env[nombre];
    delete process.env[nombre];
  }
});

afterEach(() => {
  for (const nombre of VARIABLES) {
    const valor = entornoOriginal[nombre];
    if (valor === undefined) {
      delete process.env[nombre];
    } else {
      process.env[nombre] = valor;
    }
  }
});

function configBase(): ConfigConMods {
  return { name: 'Miru Franco', slug: 'App-Miru-Franco' };
}

function manifiestoBase(): Manifiesto {
  return {
    manifest: {
      $: { 'xmlns:android': 'http://schemas.android.com/apk/res/android' },
      application: [{ $: { 'android:name': '.MainApplication', 'android:allowBackup': 'false' } }],
    },
  };
}

function pinesDe(xml: string): string[] {
  return [...xml.matchAll(/<pin digest="SHA-256">([^<]+)<\/pin>/g)].map((m) => m[1]);
}

async function correrMods(config: ConfigConMods, raizAndroid: string) {
  const modRequest = { platform: 'android', platformProjectRoot: raizAndroid, projectRoot: raizAndroid };
  const manifest = config.mods?.android?.manifest;
  const dangerous = config.mods?.android?.dangerous;
  if (!manifest || !dangerous) {
    throw new Error('Se esperaban los mods manifest y dangerous de Android.');
  }
  const conManifiesto = await manifest({ ...config, modResults: manifiestoBase(), modRequest });
  await dangerous({ ...config, modRequest });
  return {
    manifiesto: conManifiesto.modResults as Manifiesto,
    xmlRelease: fs.readFileSync(path.join(raizAndroid, RUTA_XML_RELEASE), 'utf8'),
    xmlDebug: fs.readFileSync(path.join(raizAndroid, RUTA_XML_DEBUG), 'utf8'),
  };
}

describe('sin PINNING=1 la configuración queda intacta', () => {
  it.each<[string, string | undefined]>([
    ['sin la variable', undefined],
    ['con PINNING=0', '0'],
    ['con PINNING=true (solo vale "1")', 'true'],
  ])('%s', (_caso, valor) => {
    if (valor !== undefined) process.env.PINNING = valor;
    const config = configBase();
    const resultado = conPinning(config as never) as ConfigConMods;
    expect(resultado).toBe(config);
    expect(resultado).toEqual(configBase());
    expect(resultado.mods).toBeUndefined();
  });

  it('el pin falso sin PINNING=1 tampoco agrega nada', () => {
    process.env.PINNING_PRUEBA_FALSA = '1';
    const resultado = conPinning(configBase() as never) as ConfigConMods;
    expect(resultado.mods).toBeUndefined();
  });
});

describe('con PINNING=1', () => {
  let raizAndroid: string;

  beforeEach(() => {
    process.env.PINNING = '1';
    raizAndroid = fs.mkdtempSync(path.join(os.tmpdir(), 'pinning-'));
  });

  afterEach(() => {
    fs.rmSync(raizAndroid, { recursive: true, force: true });
  });

  it('escribe el XML con base-config sin texto plano y el pin-set solo para la API', async () => {
    const { xmlRelease } = await correrMods(conPinning(configBase() as never) as ConfigConMods, raizAndroid);

    expect(xmlRelease).toContain('<base-config cleartextTrafficPermitted="false">');
    expect(xmlRelease).toMatch(/<trust-anchors>\s*<certificates src="system"\/>\s*<\/trust-anchors>/);
    expect(xmlRelease.match(/<domain-config>/g)).toHaveLength(1);
    expect(xmlRelease.match(/<domain /g)).toHaveLength(1);
    expect(xmlRelease).toContain('<domain includeSubdomains="false">api.mirufranco.com</domain>');
    expect(xmlRelease).toContain('<pin-set expiration="2027-06-30">');
    expect(pinesDe(xmlRelease)).toEqual(PINES.map((p) => p.pin));
    // Mercado Pago, Cloudinary y Google quedan fuera: no tienen domain-config.
    expect(xmlRelease).not.toMatch(/mercadopago|mercadolibre|cloudinary|google/i);
    expect(xmlRelease).not.toContain('user');
  });

  it('enlaza el XML en el <application> del manifiesto sin tocar lo demás', async () => {
    const { manifiesto } = await correrMods(conPinning(configBase() as never) as ConfigConMods, raizAndroid);
    expect(manifiesto.manifest.application?.[0].$).toEqual({
      'android:name': '.MainApplication',
      'android:allowBackup': 'false',
      'android:networkSecurityConfig': '@xml/network_security_config',
    });
  });

  it('deja la variante Debug sin pin-set y con texto plano hacia Metro', async () => {
    const { xmlDebug } = await correrMods(conPinning(configBase() as never) as ConfigConMods, raizAndroid);
    expect(RUTA_XML_DEBUG.split(path.sep)).toEqual(['app', 'src', 'debug', 'res', 'xml', 'network_security_config.xml']);
    expect(xmlDebug).toBe(armarXmlSeguridadRedDebug());
    expect(xmlDebug).toContain('<base-config cleartextTrafficPermitted="true">');
    expect(xmlDebug).not.toContain('<pin');
    expect(xmlDebug).not.toContain('<domain-config');
  });

  it('con PINNING_PRUEBA_FALSA=1 escribe un único pin inválido', async () => {
    process.env.PINNING_PRUEBA_FALSA = '1';
    const { xmlRelease } = await correrMods(conPinning(configBase() as never) as ConfigConMods, raizAndroid);
    expect(pinesDe(xmlRelease)).toEqual([PIN_FALSO]);
    expect(PIN_FALSO).toBe('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=');
    expect(Buffer.from(PIN_FALSO, 'base64')).toHaveLength(32);
    expect(PINES.map((p) => p.pin)).not.toContain(PIN_FALSO);
  });

  it.each(['true', '1'])('el pin falso en EAS (EAS_BUILD=%s) detiene la compilación', (valor) => {
    process.env.PINNING_PRUEBA_FALSA = '1';
    process.env.EAS_BUILD = valor;
    expect(() => conPinning(configBase() as never)).toThrow(/PINNING_PRUEBA_FALSA=1 solo se usa en una compilación local/);
  });

  it('en EAS sin el pin falso usa los pines reales', () => {
    process.env.EAS_BUILD = 'true';
    expect(pinesParaCompilacion()).toEqual(PINES.map((p) => p.pin));
  });
});

describe('funciones puras', () => {
  it('cada pin es un SHA-256 en base64 y no hay repetidos', () => {
    expect(PINES).toHaveLength(17);
    for (const { raiz, pin } of PINES) {
      expect(raiz).not.toBe('');
      expect(Buffer.from(pin, 'base64')).toHaveLength(32);
      expect(Buffer.from(pin, 'base64').toString('base64')).toBe(pin);
    }
    expect(new Set(PINES.map((p) => p.pin)).size).toBe(PINES.length);
  });

  it('incluye las raíces de las cuatro CA de Cloudflare y sus firmas cruzadas', () => {
    expect(PINES.map((p) => p.raiz)).toEqual([
      'ISRG Root X1',
      'ISRG Root X2',
      'GTS Root R1',
      'GTS Root R2',
      'GTS Root R3',
      'GTS Root R4',
      'GlobalSign Root CA',
      'SSL.com TLS RSA Root CA 2022',
      'SSL.com TLS ECC Root CA 2022',
      'SSL.com Root Certification Authority RSA',
      'SSL.com Root Certification Authority ECC',
      'Certum Trusted Network CA',
      'USERTrust RSA Certification Authority',
      'USERTrust ECC Certification Authority',
      'AAA Certificate Services',
      'Sectigo Public Server Authentication Root R46',
      'Sectigo Public Server Authentication Root E46',
    ]);
  });

  it('armarXmlSeguridadRed respeta la fecha y los pines que recibe', () => {
    const xml = armarXmlSeguridadRed(['uno', 'dos'], '2030-01-31');
    expect(xml).toContain('<pin-set expiration="2030-01-31">');
    expect(pinesDe(xml)).toEqual(['uno', 'dos']);
    expect(DOMINIO_FIJADO).toBe('api.mirufranco.com');
    expect(VENCIMIENTO_PINES).toBe('2027-06-30');
  });

  it('agregarConfigSeguridadRed exige un <application>', () => {
    expect(() => agregarConfigSeguridadRed({ manifest: { $: {} } } as never)).toThrow(/no tiene <application>/);
  });
});
