/// <reference types="node" />

import fs from 'fs';
import path from 'path';

/**
 * Detectores para las reglas de arquitectura y estilo que se revisan sobre el código real de src/
 * (lectura con fs, sin ejecutarlo). Los usan reglas-catalogo (GP-06.1) y reglas-reserva (GP-06.2).
 */

/** Raíz del repo. */
export const RAIZ = path.resolve(__dirname, '../..');
/** Ruta dentro de src/. */
export const src = (...partes: string[]) => path.join(RAIZ, 'src', ...partes);

/** Ruta relativa a la raíz con diagonales: 'src/features/...'. */
export const nombre = (ruta: string) => path.relative(RAIZ, ruta).split(path.sep).join('/');
export const leer = (ruta: string) => fs.readFileSync(ruta, 'utf8');
/** Pares [nombre, ruta] para it.each. */
export const conNombre = (rutas: string[]) => rutas.map((ruta) => [nombre(ruta), ruta]);

// ── Detectores ───────────────────────────────────────────────────────────────────────────────

/**
 * Quita los comentarios (// y /* *\/) dejando los saltos de línea, sin tocar las cadenas: una URL
 * como 'https://...' no es comentario.
 */
export function sinComentarios(texto: string): string {
  const patron = /(['"`])(?:(?!\1)[^\\]|\\[\s\S])*\1|\/\/[^\n]*|\/\*[\s\S]*?\*\//g;
  return texto.replace(patron, (parte) =>
    parte.startsWith('/') ? parte.replace(/[^\n]/g, ' ') : parte,
  );
}

/** Contenido de las cadenas ('...', "..." y `...`) del código, con su línea. */
export function cadenas(codigo: string): { linea: number; valor: string }[] {
  return Array.from(codigo.matchAll(/(['"`])((?:(?!\1)[^\\]|\\[\s\S])*)\1/g), (m) => ({
    linea: codigo.slice(0, m.index).split('\n').length,
    valor: m[2],
  }));
}

export interface Importacion {
  linea: number;
  modulo: string;
  /** import type { ... }, o todas las piezas entre llaves marcadas con type. */
  soloTipos: boolean;
}

/** import/export ... from, import '...', import('...') y require('...'), con su línea. */
export function importaciones(texto: string): Importacion[] {
  const codigo = sinComentarios(texto);
  const lineaDe = (indice = 0) => codigo.slice(0, indice).split('\n').length;
  const conFrom = Array.from(
    codigo.matchAll(/\b(?:import|export)\s+(type\s+)?([\w$*\s,{}]*?)\s*\bfrom\s+['"]([^'"]+)['"]/g),
    (m) => {
      const llaves = /^\{([\s\S]*)\}$/.exec(m[2].trim());
      const piezas = llaves ? llaves[1].split(',').map((p) => p.trim()).filter(Boolean) : [];
      const todasTipo = piezas.length > 0 && piezas.every((p) => p.startsWith('type '));
      return { indice: m.index ?? 0, modulo: m[3], soloTipos: Boolean(m[1]) || todasTipo };
    },
  );
  const sueltas = Array.from(
    codigo.matchAll(/\b(?:import\s+|import\s*\(\s*|require\s*\(\s*)['"]([^'"]+)['"]/g),
    (m) => ({ indice: m.index ?? 0, modulo: m[1], soloTipos: false }),
  );
  return [...conFrom, ...sueltas]
    .sort((a, b) => a.indice - b.indice)
    .map(({ indice, modulo, soloTipos }) => ({ linea: lineaDe(indice), modulo, soloTipos }));
}

export const deModels = (modulo: string) => /(^|\/)models\//.test(modulo);
export const prohibidoEnModels = (modulo: string) =>
  /(^|\/)(components|views|viewmodels)(\/|$)/.test(modulo) || /^react(-native)?(\/|$)/.test(modulo);

const COLOR_EN_CADENA = /#(?:[\da-f]{8}|[\da-f]{6}|[\da-f]{3,4})\b|\b(?:rgba?|hsla?)\s*\(|\b(?:white|black|transparent)\b/i;

/** Cadenas con colores escritos a mano (hex, rgb/rgba/hsl o nombres), sin contar comentarios. */
export function colores(texto: string): string[] {
  return cadenas(sinComentarios(texto))
    .filter(({ valor }) => COLOR_EN_CADENA.test(valor))
    .map(({ linea, valor }) => `${linea}: '${valor}'`);
}

/** Usos de console en el código (los comentarios no cuentan). */
export function usosDeConsola(texto: string): number[] {
  return Array.from(sinComentarios(texto).matchAll(/\bconsole\s*\.\s*(?:log|warn|error|info|debug)\b/g), (m) =>
    texto.slice(0, m.index).split('\n').length,
  );
}

/** Llamadas apiGet/apiPost/... con sus argumentos completos (paréntesis balanceados). */
export function llamadasApi(texto: string): string[] {
  const codigo = sinComentarios(texto);
  return Array.from(codigo.matchAll(/\bapi(?:Get|Post|Put|Patch|Delete)\s*(?:<[^>(]*>)?\s*\(/g), (m) => {
    const inicio = (m.index ?? 0) + m[0].length;
    let profundidad = 1;
    let fin = inicio;
    while (fin < codigo.length && profundidad > 0) {
      profundidad += ({ '(': 1, ')': -1 } as Record<string, number>)[codigo[fin]] ?? 0;
      fin++;
    }
    return codigo.slice(inicio, fin - 1);
  });
}

/** Guion largo (U+2014), armado por su código para que este archivo tampoco lo contenga. */
export const GUION_LARGO = String.fromCodePoint(0x2014);

/** Importaciones de un archivo que no cumplen la regla, como "archivo:línea importa 'módulo'". */
export function importacionesProhibidas(ruta: string, prohibida: (importacion: Importacion) => boolean): string[] {
  return importaciones(leer(ruta))
    .filter(prohibida)
    .map(({ linea, modulo }) => `${nombre(ruta)}:${linea} importa '${modulo}'`);
}
