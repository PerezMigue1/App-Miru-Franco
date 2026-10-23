/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';
import path from 'path';

import { cadenas, leer, nombre, sinComentarios, src } from '../../helpers/reglasCodigo';

/**
 * GP-07.6, reglas sobre el código real de src/ (lectura con fs, sin ejecutarlo) para que ningún
 * texto del servidor llegue a la pantalla:
 * 1. Ninguna vista, componente ni viewmodel de src/features, ni src/shared/ui ni src/app, lee el
 *    `.message` de un error: el texto para la clienta sale de mensajeParaClienta (o de los textos
 *    propios de la feature).
 * 2. En los modelos, el `.message` de un ApiError solo se compara para clasificar el error
 *    (`.message.toLowerCase()`, `patron.test(error.message)` o `textoPropio(error.message, ...)`,
 *    que devuelve un texto propio de la app); nunca se devuelve ni se guarda tal cual.
 * 3. Hay un solo MENSAJE_SIN_CONEXION en todo src (en shared/api/mensajesError.ts).
 * 4. Ninguna vista ni componente escribe "Revisa tu conexión": ese texto depende del tipo de error.
 */

/** Archivos .ts y .tsx bajo una carpeta, recorriendo subcarpetas. */
function codigoBajo(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      return codigoBajo(ruta);
    }
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

const TODO_SRC = codigoBajo(src());
/** Vistas, componentes y viewmodels de las features, más la UI compartida y las rutas. */
const PANTALLAS = TODO_SRC.filter(
  (ruta) => /[\\/](views|components|viewmodels)[\\/]/.test(ruta) || ruta.startsWith(src('shared', 'ui')) || ruta.startsWith(src('app')),
);
const MODELOS = TODO_SRC.filter((ruta) => !PANTALLAS.includes(ruta));

/** Cada `.message` del código (sin comentarios) con su línea y si es una comparación permitida. */
function usosDeMessage(texto: string): { linea: number; permitido: boolean }[] {
  const codigo = sinComentarios(texto);
  return Array.from(codigo.matchAll(/\.message\b/g), (m) => {
    const indice = m.index ?? 0;
    const antes = codigo.slice(Math.max(0, indice - 40), indice);
    const despues = codigo.slice(indice + m[0].length);
    return {
      linea: codigo.slice(0, indice).split('\n').length,
      permitido: despues.startsWith('.toLowerCase()') || /(?:\.test|\btextoPropio)\(\s*[\w]+$/.test(antes),
    };
  });
}

describe('el texto del servidor no llega a la pantalla', () => {
  it('hay vistas, componentes, viewmodels y modelos que revisar', () => {
    expect(PANTALLAS.length).toBeGreaterThan(50);
    expect(MODELOS.length).toBeGreaterThan(30);
  });

  it('ninguna vista, componente, viewmodel, UI compartida ni ruta lee el .message de un error', () => {
    const lecturas = PANTALLAS.flatMap((ruta) => usosDeMessage(leer(ruta)).map(({ linea }) => `${nombre(ruta)}:${linea}`));

    expect(lecturas).toEqual([]);
  });

  it('en los modelos, el .message solo se compara para clasificar el error', () => {
    const indebidos = MODELOS.flatMap((ruta) =>
      usosDeMessage(leer(ruta))
        .filter(({ permitido }) => !permitido)
        .map(({ linea }) => `${nombre(ruta)}:${linea}`),
    );

    expect(indebidos).toEqual([]);
  });

  it('el detector distingue una comparación de un uso indebido', () => {
    const permitidos = [
      'if (error.message.toLowerCase().includes("x")) {}',
      'return /motivo/i.test(error.message);',
      'return textoPropio(error.message, PROPIOS);',
    ];
    const indebidos = ['return error.message;', 'setError(e.message);', 'const texto = `${error.message}`;'];

    expect(permitidos.flatMap(usosDeMessage).map((uso) => uso.permitido)).toEqual([true, true, true]);
    expect(indebidos.flatMap(usosDeMessage).map((uso) => uso.permitido)).toEqual([false, false, false]);
  });

  it('hay un solo MENSAJE_SIN_CONEXION en todo src, en shared/api/mensajesError.ts', () => {
    const definiciones = TODO_SRC.filter((ruta) => /\bconst MENSAJE_SIN_CONEXION\b/.test(sinComentarios(leer(ruta)))).map(nombre);

    expect(definiciones).toEqual(['src/shared/api/mensajesError.ts']);
  });

  it('ninguna vista ni componente escribe "Revisa tu conexión"', () => {
    const escritos = PANTALLAS.flatMap((ruta) =>
      cadenas(sinComentarios(leer(ruta)))
        .filter(({ valor }) => valor.includes('Revisa tu conexión'))
        .map(({ linea }) => `${nombre(ruta)}:${linea}`),
    );

    expect(escritos).toEqual([]);
  });
});
