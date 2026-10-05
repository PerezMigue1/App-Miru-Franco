/** Formato de números escritos (solo da formato: las reglas de validación viven en AuthModel). */

const LARGO_TELEFONO = 10;
const LARGO_TELEFONO_CON_52 = 12;
const LARGO_TELEFONO_CON_521 = 13;

export function soloDigitos(texto: string): string {
  return texto
    .split('')
    .filter((c) => c >= '0' && c <= '9')
    .join('');
}

/**
 * Teléfono sin la lada de México: si quedan 12 dígitos que empiezan con 52 o 13 que empiezan con
 * 521, se quita esa lada. No corta: si sobran dígitos, la validación existente lo marca.
 */
export function telefonoSinLada(texto: string): string {
  const digitos = soloDigitos(texto);
  if (digitos.length === LARGO_TELEFONO_CON_52 && digitos.startsWith('52')) {
    return digitos.slice(2);
  }
  if (digitos.length === LARGO_TELEFONO_CON_521 && digitos.startsWith('521')) {
    return digitos.slice(3);
  }
  return digitos;
}

/** Teléfono pegado o autocompletado: sin lada y limitado a 10 dígitos. */
export function telefonoPegado(texto: string): string {
  return telefonoSinLada(texto).slice(0, LARGO_TELEFONO);
}

/**
 * Teléfono escrito tecla por tecla: solo dígitos, hasta 13 (10 más la lada 521) para que un "52"
 * escrito a mano no se corte a un número equivocado; la lada se quita al salir del campo.
 */
export function telefonoEscrito(texto: string): string {
  return soloDigitos(texto).slice(0, LARGO_TELEFONO_CON_521);
}
