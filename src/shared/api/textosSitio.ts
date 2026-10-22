import { obtenerConfiguracion, type ConfiguracionPublica } from './configuracionPublica';

/**
 * Textos del sitio para la app (Admin > Textos del sitio). GET /api/textos-sitio es solo para la
 * administración: los textos públicos llegan dentro de la configuración pública (`textos`), con las
 * variables de reglas ya llenas por el servidor y las de contexto ({fecha}, {motivo}...) entre llaves.
 *
 * Patrón Repository: las pantallas piden un texto por su clave y no saben si salió del servidor o del
 * respaldo. No hace ninguna petición: lee la misma configuración en memoria que configuracionPublica
 * (red, archivo guardado o respaldo). Nunca devuelve llaves: si una plantilla del servidor queda con
 * una variable sin valor o con una llave suelta, usa la del respaldo.
 */

// ── Respaldo ─────────────────────────────────────────────────────────────────────────────────

/**
 * Plantillas de la app cuando el servidor no manda la clave (o la manda rota). Las claves son las
 * que usan las pantallas; las variables entre llaves se llenan con el contexto de cada pantalla.
 */
export const RESPALDO_TEXTOS = Object.freeze({
  'inicio.galeria.titulo': 'Nuestro trabajo',
  'inicio.galeria.vaciaTitulo': 'Pronto verás aquí nuestro trabajo',
  'inicio.galeria.vaciaTexto':
    'Estamos reuniendo las fotos de nuestros cortes, color y tratamientos. Mientras tanto, puedes conocer los servicios y reservar tu cita.',
  'inicio.galeria.verServicio': 'Ver servicio',
  'inicio.promociones.titulo': 'Promociones',
  'inicio.promociones.vigencia': 'Válida hasta el {fecha}.',
  'inicio.equipo.titulo': 'Nuestro equipo',
  'inicio.preguntas.titulo': 'Preguntas frecuentes',
  'inicio.sobreNosotros.titulo': 'Sobre nosotros',
  'inicio.sobreNosotros.enlace': 'Conoce el salón',
  'inicio.cierre.boton': 'Reservar una cita',
  'inicio.contenido.errorTitulo': 'No pudimos cargar esta sección',
  'inicio.contenido.errorTexto': 'Revisa tu conexión a internet e inténtalo de nuevo.',
  'salon.titulo': 'El salón',
  'salon.perfil.descripcion': 'Horario, ubicación y cómo contactarnos.',
  'salon.contacto.titulo': 'Contacto',
  'salon.contacto.telefono': 'Llamar al {telefono}',
  'salon.contacto.whatsapp': 'Escribir por WhatsApp',
  'salon.contacto.correo': 'Escribir a {correo}',
  'salon.contacto.mapa': 'Ver en el mapa',
  'salon.valores.titulo': 'Lo que nos distingue',
  'salon.horario.titulo': 'Horario',
  'salon.horario.cerrado': 'Cerrado',
  'salon.horario.rango': '{abre} a {cierra}',
  'salon.inhabiles.titulo': 'Días sin servicio',
  'salon.inhabiles.vacio': 'Por ahora no hay días sin servicio programados.',
  'salon.sinRed': 'Sin conexión. Te mostramos los últimos datos guardados del salón.',
  'citas.calendario.cerrado': 'El salón no abre este día.',
  'citas.calendario.inhabil': 'No hay citas este día: {motivo}.',
  'citas.calendario.inhabilSinMotivo': 'No hay citas este día.',
  'citas.calendario.leyenda': 'Los días atenuados no tienen citas: el salón no abre o es un día de descanso.',
});

/** Claves con respaldo en la app. */
export type ClaveTexto = keyof typeof RESPALDO_TEXTOS;
/** Una clave del respaldo o cualquier otra que mande el servidor (por ejemplo, las del catálogo del backend). */
export type ClaveTextoSitio = ClaveTexto | (string & Record<never, never>);
/** Valores de las variables de contexto ({fecha}, {motivo}...); null o undefined cuentan como sin valor. */
export type ContextoTexto = Record<string, string | number | null | undefined>;

export interface TextoLlenado {
  /** La plantilla con sus variables; si no quedó completa, sin las faltantes ni llaves sueltas. */
  texto: string;
  /** false si alguna variable no tuvo valor o la plantilla trae una llave suelta. */
  completo: boolean;
}

// ── Variables ────────────────────────────────────────────────────────────────────────────────

/** Misma forma de variable que el backend (textos-sitio.util.ts). */
const VARIABLE = /\{([a-zA-Z][a-zA-Z0-9]*)\}/g;
const LLAVE = /[{}]/;

const respaldos: Readonly<Record<string, string>> = RESPALDO_TEXTOS;

/** El valor propio de la clave (no uno heredado como 'toString'), o undefined. */
const propio = (registro: Readonly<Record<string, string>>, clave: string): string | undefined =>
  Object.prototype.hasOwnProperty.call(registro, clave) ? registro[clave] : undefined;

/**
 * Variables de reglas que la app conoce, con los mismos nombres que variablesDeReglas del backend
 * (reglas-negocio.ts), más el nombre del salón.
 */
export function variablesDeReglas(config: ConfiguracionPublica): Record<string, string> {
  const { citas, tienda } = config.reglas;
  return {
    plazoAnticipoHoras: String(citas.plazoAnticipoHoras),
    minutosAntesPagoSalon: String(citas.minutosAntesPagoSalon),
    minutosLlegadaAntes: String(citas.minutosLlegadaAntes),
    toleranciaLlegadaMinutos: String(citas.toleranciaLlegadaMinutos),
    horasAvisoCancelarReagendar: String(citas.horasAvisoCancelarReagendar),
    plazoPagoLineaHoras: String(tienda.plazoPagoLineaHoras),
    diasCancelarNoRecogido: String(tienda.diasCancelarNoRecogido),
    diasResguardo: String(tienda.diasResguardoPagado),
    tiempoPreparacion: tienda.tiempoPreparacionTexto,
    diasCambioProducto: String(tienda.diasCambioProducto),
    nombreSalon: config.salon.nombre,
  };
}

/**
 * Quita las llaves sueltas, junta los espacios, pega la puntuación que quedó separada y quita los
 * dos puntos o comas que se quedaron sin nada detrás ("este día: ." queda "este día.").
 */
function limpiar(texto: string): string {
  return texto
    .replace(/[{}]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .replace(/[,;:]+(?=[.!?]|$)/g, '')
    .trim();
}

/**
 * Llena las variables {nombre} de la plantilla. Una variable sin valor (o null) se quita; si quedó
 * alguna así o la plantilla trae una llave suelta, `completo` es false y el texto se limpia.
 */
export function llenarVariables(plantilla: string, variables: ContextoTexto): TextoLlenado {
  let completo = !LLAVE.test(plantilla.replace(VARIABLE, ''));
  const lleno = plantilla.replace(VARIABLE, (_todo, nombre: string) => {
    const valor = variables[nombre];
    if (valor === undefined || valor === null) {
      completo = false;
      return '';
    }
    return String(valor);
  });
  return { texto: completo ? lleno : limpiar(lleno), completo };
}

// ── API pública ──────────────────────────────────────────────────────────────────────────────

/**
 * El texto de una clave, listo para mostrar: el del servidor (config.textos) si viene y queda
 * completo; si no, el del respaldo. Las variables de contexto ganan a las de reglas. Si la clave no
 * existe en ningún lado devuelve ''. Nunca devuelve llaves: lo que falte se quita del texto.
 */
export function obtenerTexto(
  clave: ClaveTextoSitio,
  contexto: ContextoTexto = {},
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  const variables = { ...variablesDeReglas(config), ...contexto };
  const delServidor = propio(config.textos, clave);
  const respaldo = propio(respaldos, clave);
  if (delServidor) {
    const llenado = llenarVariables(delServidor, variables);
    if (llenado.completo || respaldo === undefined) {
      return llenado.texto;
    }
  }
  return respaldo === undefined ? '' : llenarVariables(respaldo, variables).texto;
}
