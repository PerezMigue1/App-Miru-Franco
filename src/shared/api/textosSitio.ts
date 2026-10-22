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
  // Citas y forma de pago (GP-07.4): copia exacta de los valores por omisión del catálogo del
  // backend (src/textos-sitio/catalogo.ts), con sus mismas variables.
  'citas.crear.tituloConfirmar': 'Confirma tu cita',
  'citas.crear.anticipoDescuentoSaldo': 'Se descuenta del total: el día de tu cita pagas {saldo} en el salón.',
  'citas.crear.anticipoDescuento': 'Se descuenta del total el día de tu cita.',
  'citas.crear.botonConfirmar': 'Confirmar cita',
  'citas.crear.botonConfirmarLinea': 'Confirmar y pagar anticipo',
  'citas.crear.botonConfirmarSalon': 'Confirmar y pagar en el salón',
  'citas.formaPago.anticipoEtiqueta': 'Anticipo para apartar tu cita',
  'citas.formaPago.saldoEtiqueta': 'Pagas en el salón el día de tu cita',
  'citas.formaPago.pregunta': '¿Cómo quieres pagar el anticipo?',
  'citas.formaPago.opcionLinea': 'Pagar anticipo en línea',
  'citas.formaPago.opcionSalon': 'Pagar anticipo en el salón',
  'citas.formaPago.plazoLinea':
    'Con Mercado Pago. Tienes {plazoAnticipo} para pagarlo, sin pasar de {minutosAntesPagoSalon} minutos antes de tu cita; si no, el horario se libera.',
  'citas.formaPago.llegadaSalon': 'Llega entre {minutosLlegadaAntes} y {minutosAntesPagoSalon} minutos antes para pagarlo.',
  'citas.formaPago.plazoSalon': 'Si a {minutosAntesPagoSalon} minutos de tu cita no se ha pagado, la cita se cancela.',
  'citas.formaPago.noAsistePierde': 'Si no llegas a tu cita y no avisas, el anticipo no se devuelve.',
  'citas.formaPago.noAsisteRevisa': 'Si no llegas a tu cita, el salón revisa la devolución de tu anticipo.',
  'citas.formaPago.soloLineaDespuesFalta': 'Durante {mesesSoloLinea}, tus próximas citas se apartan pagando el anticipo en línea.',
  'citas.formaPago.avisoCancelar':
    'Para reagendar desde tu cuenta avisa con al menos {horasAviso} de anticipación; con menos aviso, reagenda con el salón.',
  'citas.formaPago.metodosSalon': 'En el salón puedes pagar con {metodosSalon}.',
  'citas.formaPago.sinAnticipoPrecio': 'Pagas {precio} en el salón el día de tu cita.',
  'citas.formaPago.sinAnticipo': 'Pagas tu servicio en el salón el día de tu cita.',
  'citas.confirmacion.titulo': 'Tu cita ha sido agendada exitosamente',
  'citas.recordatorio': 'Antes de tu cita te mandaremos un recordatorio en tu cuenta y, si lo tienes activado, por correo.',
  'citas.lista.vacia': 'No tienes citas agendadas',
  'citas.lista.sinResultados': 'No hay citas que coincidan con tu búsqueda',
  'citas.pagoSalon.saldo': 'El día de tu cita pagas en el salón {saldo} (el total menos tu anticipo).',
  'citas.pagoSalon.saldoSinPrecio': 'El día de tu cita pagas en el salón el total menos tu anticipo.',
  'citas.cancelar.sinAnticipo':
    'Como no has pagado anticipo, cancelar no tiene costo. Si solo necesitas otro horario, te recomendamos reprogramarla.',
  'citas.cancelar.avisoReagendar': 'Para reagendar desde tu cuenta avisa con al menos {horasAviso} de anticipación.',
  'citas.cancelar.anticipoSinDatos':
    'Si tu cita está a más de {diasExcepcion} días hábiles de la fecha en que pagaste tu anticipo de {anticipo} y cancelas dentro de los {diasReembolso} días hábiles siguientes a tu pago, te lo devolvemos completo; en otro caso no se devuelve.',
  'citas.cancelar.anticipoReembolsable':
    'Si cancelas ahora, te devolvemos completo tu anticipo de {anticipo} por el mismo medio con el que lo pagaste: tu cita está a más de {diasExcepcion} días hábiles de tu pago y cancelas dentro de los {diasReembolso} días hábiles siguientes.',
  'citas.cancelar.anticipoHasta': 'Tienes hasta el {fechaLimite}.',
  'citas.cancelar.anticipoPlazoTerminado':
    'Tu anticipo de {anticipo} ya no se devuelve si cancelas: el plazo para cancelar con reembolso terminó el {fechaLimite}.',
  'citas.cancelar.anticipoNoReembolsable':
    'Tu anticipo de {anticipo} no se devuelve si cancelas, porque tu cita está a {diasExcepcion} días hábiles o menos de la fecha en que lo pagaste.',
  'citas.cancelar.reprogramar': 'Si reprogramas tu cita con aviso, tu anticipo se respeta para la nueva fecha.',
  'citas.cancelar.toast': 'Tu cita quedó cancelada.',
  'citas.cancelar.toastReembolso':
    'Tu cita quedó cancelada. Te devolvemos tu anticipo completo por el mismo medio con el que lo pagaste.',
  'anticipos.sinAnticipo': 'Sin anticipo',
  'anticipos.botonPagar': 'Pagar anticipo',
  'anticipos.botonMercadoPago': 'Pagar anticipo con Mercado Pago',
  'anticipos.botonSalon': 'Pagar en el salón',
  'anticipos.enlacePolitica': 'Leer la Política de anticipos y cancelación',
  'anticipos.pendiente': 'Págalo {formasPago}. Si no se paga en {plazoAnticipo}, el horario se libera.',
  'anticipos.plazoLinea': 'Tienes {plazoAnticipo} para pagarlo en línea{limite}; si no, el horario se libera.',
  'anticipos.salonSeLibera': 'Si no lo pagas a tiempo, el horario se libera.',
  'anticipos.pagado': 'Se descuenta del total el día de tu cita.',
  'anticipos.enRevision': 'El salón está revisando tu anticipo; te avisaremos en tu cuenta.',
  'anticipos.liberada': 'No recibimos el anticipo a tiempo y el horario se liberó.',
  'anticipos.retenido': 'La cita no se atendió y el anticipo se retuvo, como indican los términos.',
  'anticipos.devuelto': 'Te devolvimos el anticipo.',
  // Propias de la app: el backend deja en el código los textos de las casillas de consentimiento
  // (catalogo.ts: son evidencia legal ligada a una versión publicada). El resumen es el de la web
  // (TEXTO_POLITICA_ANTICIPOS de consentimientoAnticipo.ts) con variables en lugar de las cifras.
  'citas.politicaAnticipos.resumen':
    'Si al pagar tu anticipo faltan más de {diasExcepcion} días hábiles para tu cita, puedes cancelarla dentro de los {diasReembolso} días hábiles siguientes a tu pago y te devolvemos el anticipo completo. Si faltan {diasExcepcion} días hábiles o menos, al cancelar el anticipo no se devuelve, pero puedes reagendar con aviso; si el salón cancela, te lo devolvemos.',
  'citas.politicaAnticipos.casilla': 'Leí la Política de anticipos y cancelación',
  'citas.politicaAnticipos.falta': 'Para continuar marca que leíste la Política de anticipos y cancelación.',
  'citas.politicaAnticipos.actualizada':
    'La Política de anticipos y cancelación se actualizó. Revisa la versión vigente y vuelve a marcar la casilla.',
  // Propias de la app (GP-07.4, detalle de la cita, anticipo en el salón y reprogramar): el backend
  // no tiene estas claves. Las cifras salen de las reglas guardadas en la cita (obtenerTextoConReglas).
  'citas.anticipoSalon.plazo': 'Paga tu anticipo en el salón {limite} ({minutosAntesPagoSalon} minutos antes de tu cita).',
  'citas.anticipoSalon.plazoSinLimite':
    'Paga tu anticipo en el salón a más tardar {minutosAntesPagoSalon} minutos antes de tu cita.',
  'citas.anticipoSalon.tambienEnLinea': 'También puedes pagarlo en línea.',
  'citas.anticipoSalon.listo': 'Listo: tu anticipo ahora se paga en el salón.',
  'citas.anticipoSalon.noSePudo': 'No pudimos cambiar tu anticipo a pago en el salón. Intenta de nuevo en un momento.',
  'citas.detalle.enLinea': 'Lo pagas en línea con Mercado Pago.',
  'citas.detalle.enSalon': 'Lo pagas en el salón.',
  'citas.detalle.liberado': 'La cita se canceló antes de pagar el anticipo, así que no hay nada que pagar.',
  'citas.detalle.revisandoPago': 'Estamos revisando el pago de tu anticipo. Si ya pagaste, no pagues de nuevo.',
  'citas.detalle.cancelarRevisando': 'Estamos revisando qué pasa con tu anticipo si cancelas.',
  'citas.detalle.cancelarSinReagendar':
    'Faltan menos de {horasAviso} para tu cita: ya no puedes reagendarla desde tu cuenta. Si necesitas otro horario, comunícate con el salón.',
  'citas.detalle.politicaNoDisponible':
    'No pudimos cargar la Política de anticipos y cancelación. Revisa tu conexión e intenta de nuevo.',
  'citas.detalle.consentimientoFallo':
    'No pudimos guardar que leíste la Política de anticipos y cancelación. Intenta de nuevo en un momento.',
  'citas.reprogramar.avisoMinimo': 'Para reagendar con menos de {horasAviso} de anticipación, comunícate con el salón.',
  'citas.reprogramar.avisoSinHoras': 'Para reagendar con tan poco tiempo, comunícate con el salón.',
  'citas.reprogramar.especialistaInactiva':
    'Tu especialista ya no tiene agenda disponible. Para cambiar tu cita, comunícate con el salón.',
  'citas.reprogramar.anticipoPagado': 'Tu anticipo de {anticipo} se respeta para la nueva fecha.',
  'citas.reprogramar.anticipoSalon':
    'Tu anticipo se sigue pagando en el salón: el plazo pasa a {minutosAntesPagoSalon} minutos antes del nuevo horario.',
  'citas.reprogramar.anticipoLinea': 'Tu anticipo conserva su plazo: págalo en línea {limite}, aunque cambies la fecha.',
  'citas.reprogramar.anticipoLineaSinPlazo': 'Tu anticipo conserva el plazo que ya tenía para pagarlo en línea.',
  // Propias de la app (GP-07.4, reserva y catálogo de servicios). La casilla de fotos es la de la web
  // (TEXTO_FOTOS_RESULTADO de consentimientosCita.ts), que el backend deja en el código.
  'citas.reserva.fotosResultado':
    'Autorizo que el salón tome fotos del resultado de mi servicio para mostrarlas en sus redes y galería (puedes retirar tu autorización cuando quieras desde tu perfil)',
  'citas.servicios.anticipo': 'Este servicio pide un anticipo de {anticipo} al reservar.',
  'citas.servicios.invitacion': 'Con tu cuenta eliges día y hora y pagas tu anticipo desde la app.',
  'citas.servicios.invitacionSinAnticipo': 'Con tu cuenta eliges día y hora desde la app.',
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
    mesesSoloPagoEnLinea: String(citas.mesesSoloPagoEnLinea),
    diasHabilesExcepcionAnticipo: String(citas.diasHabilesExcepcionAnticipo),
    diasHabilesCancelarConReembolso: String(citas.diasHabilesCancelarConReembolso),
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

/** Nombres de las variables {nombre} de una plantilla. */
function variablesDe(plantilla: string): string[] {
  return Array.from(plantilla.matchAll(VARIABLE), (m) => m[1]);
}

/**
 * Para textos que dependen de las reglas guardadas en una cita (las de cuando se creó), no de las
 * vigentes. El servidor manda config.textos con las variables de reglas ya llenas con los valores
 * vigentes, así que si alguna de `variablesPropias` que usa la plantilla del respaldo vale distinto
 * que la vigente (variablesDeReglas), el texto del servidor diría una cifra que no es la de la cita:
 * entonces se usa la plantilla del respaldo llenada con las vigentes, las propias y el contexto (en
 * ese orden de prioridad creciente). Si ninguna difiere, es igual que obtenerTexto con las propias y
 * el contexto. Nunca devuelve llaves.
 */
export function obtenerTextoConReglas(
  clave: ClaveTextoSitio,
  variablesPropias: Record<string, string>,
  contexto: ContextoTexto = {},
  config: ConfiguracionPublica = obtenerConfiguracion(),
): string {
  const vigentes = variablesDeReglas(config);
  const respaldo = propio(respaldos, clave);
  const difiere =
    respaldo !== undefined &&
    variablesDe(respaldo).some((nombre) => {
      const valor = propio(variablesPropias, nombre);
      return valor !== undefined && valor !== vigentes[nombre];
    });
  if (difiere) {
    return llenarVariables(respaldo, { ...vigentes, ...variablesPropias, ...contexto }).texto;
  }
  return obtenerTexto(clave, { ...variablesPropias, ...contexto }, config);
}
