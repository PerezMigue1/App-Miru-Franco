/**
 * Lector incremental de Server-Sent Events (text/event-stream), puro y sin red: recibe el texto ya
 * decodificado en trozos cortados en cualquier punto (incluso a mitad de una línea o entre el \r y
 * el \n de un salto) y emite cada evento completo al ver la línea vacía que lo cierra.
 *
 * Sigue el formato del estándar: saltos \n, \r\n o \r; campos "event:", "data:" (varias líneas se
 * unen con \n), "id:" y "retry:"; las líneas que empiezan con ":" son comentarios; un solo espacio
 * después de los dos puntos se quita; un evento sin ninguna línea "data:" no se emite.
 */

export interface EventoSse {
  /** Valor de "event:"; '' si el bloque no traía uno. */
  evento: string;
  /** Las líneas "data:" del bloque unidas con \n. */
  data: string;
  /** Último "id:" recibido en el flujo (se conserva entre eventos); '' si nunca llegó uno. */
  id: string;
}

export interface LectorSse {
  /** Agrega un trozo de texto; emite los eventos que queden completos. */
  leer(trozo: string): void;
  /** El flujo terminó: lo que quedó a medias (sin su línea vacía) se descarta. */
  terminar(): void;
  /** Último "retry:" válido (ms) que mandó el servidor, o null si no mandó ninguno. */
  reintentoMs(): number | null;
}

const SOLO_DIGITOS = /^\d+$/;
const MARCA_BOM = String.fromCodePoint(0xfeff);

export function crearLectorSse(alEvento: (evento: EventoSse) => void): LectorSse {
  /** Texto de una línea que todavía no llega completa. */
  let pendiente = '';
  /** El trozo anterior terminó en \r: si el siguiente empieza con \n, es el mismo salto. */
  let saltarLf = false;
  let alInicio = true;
  let tipo = '';
  let datos: string[] = [];
  let ultimoId = '';
  let reintento: number | null = null;

  function despachar(): void {
    const lineas = datos;
    const evento = tipo;
    datos = [];
    tipo = '';
    if (lineas.length > 0) {
      alEvento({ evento, data: lineas.join('\n'), id: ultimoId });
    }
  }

  function procesarLinea(linea: string): void {
    if (linea === '') {
      despachar();
      return;
    }
    if (linea.startsWith(':')) {
      return;
    }
    const dosPuntos = linea.indexOf(':');
    const campo = dosPuntos === -1 ? linea : linea.slice(0, dosPuntos);
    let valor = dosPuntos === -1 ? '' : linea.slice(dosPuntos + 1);
    if (valor.startsWith(' ')) {
      valor = valor.slice(1);
    }
    switch (campo) {
      case 'event':
        tipo = valor;
        break;
      case 'data':
        datos.push(valor);
        break;
      case 'id':
        if (!valor.includes('\0')) {
          ultimoId = valor;
        }
        break;
      case 'retry':
        if (SOLO_DIGITOS.test(valor)) {
          reintento = Number(valor);
        }
        break;
      default:
        // Campo desconocido: se ignora.
        break;
    }
  }

  return {
    leer(trozo) {
      let texto = trozo;
      if (texto === '') {
        return;
      }
      if (saltarLf) {
        saltarLf = false;
        if (texto.startsWith('\n')) {
          texto = texto.slice(1);
        }
      }
      if (alInicio) {
        alInicio = false;
        if (texto.startsWith(MARCA_BOM)) {
          texto = texto.slice(1);
        }
      }
      const bufer = pendiente + texto;
      let desde = 0;
      // Expresión nueva en cada trozo: su lastIndex no se comparte con otro lector.
      const finDeLinea = /\r\n|\r|\n/g;
      for (let salto = finDeLinea.exec(bufer); salto !== null; salto = finDeLinea.exec(bufer)) {
        procesarLinea(bufer.slice(desde, salto.index));
        desde = salto.index + salto[0].length;
        // Un \r al final del trozo puede ser la mitad de un \r\n.
        saltarLf = salto[0] === '\r' && desde === bufer.length;
      }
      pendiente = bufer.slice(desde);
    },
    terminar() {
      pendiente = '';
      saltarLf = false;
      datos = [];
      tipo = '';
    },
    reintentoMs() {
      return reintento;
    },
  };
}
