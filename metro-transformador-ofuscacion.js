'use strict';

// Transformer de Metro que ofusca, módulo por módulo, el código propio de src.
// Primero corre el worker que Expo configuró (Babel, dependencias, minificación y
// envoltura __d) y después ofusca la salida ya envuelta, cuando los import y require
// ya son índices de _dependencyMap. Solo se usa si metro.config.js lo conecta (OFUSCAR_JS=1).

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const JavaScriptObfuscator = require('javascript-obfuscator');
const { version: VERSION_OFUSCADOR } = require('javascript-obfuscator/package.json');

// Nombre fijo de la fábrica ofuscada; la envoltura __d le reenvía this y arguments.
const NOMBRE_FABRICA = '__miruFabricaOfuscada';

const OPCIONES_OFUSCACION = Object.freeze({
  compact: true,
  stringArray: true,
  stringArrayEncoding: ['base64'],
  // Por omisión solo el 75 % de las cadenas, elegidas al azar, entra al arreglo; con 1
  // ninguna cadena de src queda legible y el resultado no depende de la suerte.
  stringArrayThreshold: 1,
  renameGlobals: false,
  selfDefending: false,
  debugProtection: false,
  controlFlowFlattening: false,
  deadCodeInjection: false,
  // Sin transformar llaves: los worklets de Reanimated buscan su __closure por llave.
  transformObjectKeys: false,
  sourceMap: false,
  // Garantiza que la fábrica conserve el nombre al que llama la envoltura.
  reservedNames: [`^${NOMBRE_FABRICA}$`],
});

const SALTO_DE_LINEA = /\r\n?|\n|\u2028|\u2029/g;
const LISTA_PARAMETROS = /^\s*[A-Za-z_$][\w$]*(\s*,\s*[A-Za-z_$][\w$]*)*\s*$/;
const INICIO_ENVOLTURA = /^\s*__d\(\s*function\s*\(([^()]*)\)\s*\{/;
const FIN_ENVOLTURA = /^\}\s*\)\s*;?\s*$/;

let claveCalculada = null;

// Entra a la llave de caché de Metro: cualquier cambio de versión, opciones, variable
// o de este archivo invalida las salidas guardadas.
function claveCacheOfuscacion() {
  if (claveCalculada == null) {
    claveCalculada = crypto
      .createHash('sha256')
      .update(
        JSON.stringify({
          ofuscarJs: process.env.OFUSCAR_JS ?? null,
          versionOfuscador: VERSION_OFUSCADOR,
          opciones: OPCIONES_OFUSCACION,
          fuente: fs.readFileSync(__filename, 'utf8'),
        }),
      )
      .digest('hex');
  }
  return claveCalculada;
}

function separarConfig(config) {
  const { miruOfuscacion, ...configBase } = config;
  if (miruOfuscacion == null || typeof miruOfuscacion.transformadorBase !== 'string') {
    throw new Error(
      '[ofuscación] Falta transformer.miruOfuscacion.transformadorBase; conecta este archivo solo desde metro.config.js.',
    );
  }
  return { miruOfuscacion, configBase };
}

const basesCargadas = new Map();

// La ruta del worker de Expo llega relativa a la raíz del proyecto (así no mete rutas
// absolutas en la llave de caché) y se resuelve aquí, dentro de cada proceso worker.
function cargarBase(miruOfuscacion, projectRoot) {
  const ruta = path.resolve(projectRoot, miruOfuscacion.transformadorBase);
  if (ruta === __filename) {
    throw new Error('[ofuscación] El transformer base no puede ser este mismo archivo.');
  }
  let base = basesCargadas.get(ruta);
  if (base == null) {
    base = require(ruta);
    if (typeof base.transform !== 'function') {
      throw new Error(`[ofuscación] ${ruta} no exporta transform.`);
    }
    basesCargadas.set(ruta, base);
  }
  return base;
}

// path.relative funciona igual con / y \; los módulos virtuales (por ejemplo los de
// require.context, con "?ctx=") no son archivos de src y se dejan como están.
function estaEnSrc(projectRoot, filename) {
  if (filename.includes('?')) return false;
  const relativa = path.relative(path.join(projectRoot, 'src'), path.resolve(projectRoot, filename));
  return (
    relativa !== '' &&
    relativa !== '..' &&
    !relativa.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relativa)
  );
}

// Igual que countLinesAndTerminateSourceMap de @expo/metro-config.
function contarLineas(codigo) {
  return (codigo.match(SALTO_DE_LINEA) || []).length + 1;
}

// Recibe "__d(function(params){cuerpo});" y devuelve la misma envoltura con el cuerpo
// ofuscado adentro. El serializador agrega moduleId y dependencias antes del último
// paréntesis, así que el final se conserva tal cual. Si la forma no es la esperada, falla.
function ofuscarModulo(codigo, filename) {
  const inicio = INICIO_ENVOLTURA.exec(codigo);
  const cierre = codigo.lastIndexOf('}');
  if (inicio == null || cierre < inicio[0].length || !FIN_ENVOLTURA.test(codigo.slice(cierre))) {
    throw new Error(`[ofuscación] ${filename}: la salida no tiene la forma __d(function(...){...}); esperada.`);
  }
  const parametros = inicio[1];
  if (!LISTA_PARAMETROS.test(parametros)) {
    throw new Error(`[ofuscación] ${filename}: parámetros inesperados en la fábrica: ${parametros}`);
  }
  const cuerpo = codigo.slice(inicio[0].length, cierre);
  if (cuerpo.includes(NOMBRE_FABRICA)) {
    throw new Error(`[ofuscación] ${filename}: el módulo ya usa el nombre ${NOMBRE_FABRICA}.`);
  }

  // Todo lo que agrega el ofuscador (arreglo de cadenas, decodificador y rotación) queda
  // dentro de la fábrica de __d y nunca como global del bundle.
  const programa = `function ${NOMBRE_FABRICA}(${parametros}){${cuerpo}}`;
  const ofuscado = JavaScriptObfuscator.obfuscate(programa, {
    ...OPCIONES_OFUSCACION,
    inputFileName: filename,
  })
    .getObfuscatedCode()
    .trim();
  if (!ofuscado.includes(`function ${NOMBRE_FABRICA}(`)) {
    throw new Error(`[ofuscación] ${filename}: el ofuscador no conservó la fábrica ${NOMBRE_FABRICA}.`);
  }

  return `__d(function(${parametros}){${ofuscado};return ${NOMBRE_FABRICA}.apply(this,arguments);});`;
}

function ofuscarSalida(salida, filename) {
  const datos = salida.data;
  if (datos == null || typeof datos.code !== 'string') {
    throw new Error(`[ofuscación] ${filename}: salida js/module sin código.`);
  }
  // Con EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH el código se vuelve a generar desde el AST al
  // final y se perdería la ofuscación; no se permite en silencio.
  if (datos.reconcile != null || datos.ast != null) {
    throw new Error(
      `[ofuscación] ${filename}: la optimización del grafo (EXPO_UNSTABLE_METRO_OPTIMIZE_GRAPH) no es compatible con la ofuscación.`,
    );
  }
  const code = ofuscarModulo(datos.code, filename);
  return {
    ...salida,
    data: {
      ...datos,
      code,
      lineCount: contarLineas(code),
      // Sin mapa de fuentes: el código ofuscado ya no corresponde al original.
      map: [],
      functionMap: null,
    },
  };
}

async function transform(config, projectRoot, filename, data, options) {
  const { miruOfuscacion, configBase } = separarConfig(config);
  if (process.env.OFUSCAR_JS !== '1') {
    throw new Error('[ofuscación] Este transformer solo corre con OFUSCAR_JS=1.');
  }
  const base = cargarBase(miruOfuscacion, projectRoot);
  const resultado = await base.transform(configBase, projectRoot, filename, data, options);
  if (!estaEnSrc(projectRoot, filename)) return resultado;
  return {
    ...resultado,
    output: resultado.output.map((salida) =>
      salida.type === 'js/module' ? ofuscarSalida(salida, filename) : salida,
    ),
  };
}

// Metro la usa si llama a este archivo directamente. Con el supervisor de Expo
// (withMetroSupervisingTransformWorker) se usa la del worker de Expo, que hashea
// config.transformer completo; por eso metro.config.js también pone la clave ahí.
function getCacheKey(config, opts) {
  const { miruOfuscacion, configBase } = separarConfig(config);
  const base = cargarBase(miruOfuscacion, opts?.projectRoot ?? process.cwd());
  const claveBase = typeof base.getCacheKey === 'function' ? base.getCacheKey(configBase, opts) : '';
  return [claveBase, claveCacheOfuscacion()].join('$');
}

module.exports = { transform, getCacheKey, claveCacheOfuscacion };
