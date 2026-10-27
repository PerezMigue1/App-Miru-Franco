import { obtenerConfiguracion, type ConfiguracionPublica } from './configuracionPublica';
import TEXTOS_PROPIOS_APP from './textosPropiosApp.json';

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
  // Tienda y pagos (GP-07.5). Las claves que existen en el catálogo del backend llevan su valor por
  // omisión exacto; las propias de la app lo dicen en su bloque.
  // GP-07.5 bloque checkout
  'checkout.recogerTitulo': 'Recoges tu pedido en el salón',
  'checkout.recogerTexto': 'Lo preparamos y te lo apartamos en el mostrador.',
  'checkout.recogerAviso': '{tiempoPreparacion}. Te avisamos en la app y por correo cuando puedas pasar por él.',
  'checkout.opcionLineaTitulo': 'Pagar en línea',
  'checkout.opcionLineaTexto': 'Con tarjeta en la página segura de Mercado Pago.',
  'checkout.opcionSalonTitulo': 'Pagar al recoger en el salón',
  'checkout.opcionSalonTexto': 'Te apartamos el pedido y lo pagas en el mostrador cuando pases por él.',
  'checkout.ambasRecoges': 'En los dos casos recoges tu pedido en el salón.',
  'checkout.soloRecoges': 'Recoges tu pedido en el salón.',
  'checkout.avisoSalon': 'Tu pedido queda apartado. Pagas {total} en el mostrador cuando pases por él{metodosSalon}.',
  'checkout.avisoLinea':
    'Al confirmar te llevamos a Mercado Pago para pagar {total}. Tu tarjeta la escribes allá: este sitio no la ve ni la guarda. Tienes {plazoPagoLineaHoras} horas para completar el pago.',
  'checkout.botonLinea': 'Ir a pagar con Mercado Pago',
  'checkout.botonSalon': 'Apartar mi pedido',
  // Propias de la app (GP-07.5, checkout): no existen en el catálogo del backend. Plazos, recoger en
  // el salón, información de la compra (LFPC art. 76 BIS), casillas y mensajes del consentimiento.
  'tienda.checkout.avisoListo': 'Te avisamos en la app y por correo cuando puedas pasar por él.',
  'tienda.checkout.llamanos': '¿Dudas para llegar? Llámanos al {telefono}',
  'tienda.checkout.verMapa': 'Ver cómo llegar en el mapa',
  'tienda.checkout.plazosTitulo': 'Plazos de tu pedido',
  'tienda.checkout.plazoLinea': 'Si el pago no se completa en {plazoPagoLineaHoras} horas, el pedido se cancela.',
  'tienda.checkout.resguardo': 'Ya pagado, te guardamos tu pedido en el salón {diasResguardo} días para que pases por él.',
  'tienda.checkout.apartadoPreparar': 'Preparamos tu apartado en un máximo de {diasPrepararApartado} días; si no lo logramos, se cancela y te avisamos.',
  'tienda.checkout.apartadoRecordatorio': 'Cuando esté listo, el día {diaRecordatorioRecoger} te recordamos pasar por él.',
  'tienda.checkout.apartadoCancelar':
    'Si no lo recoges en {diasCancelarNoRecogido} días desde que te avisamos que está listo, el apartado se cancela.',
  'tienda.checkout.sinMetodosTitulo': 'Por ahora no podemos recibir pedidos en la app',
  'tienda.checkout.sinMetodos': 'Las formas de pago de la tienda están en pausa. Llámanos al {telefono} y te ayudamos con tu compra.',
  'tienda.checkout.metodoCambio': 'La forma de pago que elegiste ya no está disponible y la cambiamos. Revísala antes de confirmar.',
  'tienda.checkout.precios': 'Precios en pesos mexicanos con IVA incluido.',
  'tienda.checkout.precioVigente':
    'Si el precio de algún producto cambió desde que lo agregaste a tu carrito, tu pedido se crea con el precio vigente: lo ves en Mercado Pago o en la confirmación de tu pedido antes de pagar.',
  'tienda.checkout.infoTitulo': 'Información de tu compra',
  'tienda.checkout.vendeTitulo': 'Quién te vende',
  'tienda.checkout.preciosTitulo': 'Precios',
  'tienda.checkout.entregaTitulo': 'Entrega',
  'tienda.checkout.entrega': 'Recoges tu pedido en el salón, en el domicilio de arriba. No hacemos envíos a domicilio.',
  'tienda.checkout.cambiosTitulo': 'Cambios y revocación',
  'tienda.checkout.cambios': 'Aceptamos cambios de producto dentro de los {diasCambioProducto} días naturales siguientes a que lo recojas.',
  'tienda.checkout.sinCambios': 'Por ahora no aceptamos cambios de producto.',
  'tienda.checkout.revocacion':
    'Puedes revocar tu compra sin dar razones dentro de los {diasHabilesRevocacion} días hábiles siguientes a que recojas tu pedido en el salón (o a tu pago, si todavía no lo recoges), como marca el artículo 56 de la Ley Federal de Protección al Consumidor.',
  'tienda.checkout.quejasTitulo': 'Quejas',
  'tienda.checkout.quejas':
    'Si tienes una queja, escríbenos o llámanos primero: queremos resolverla contigo. También puedes acudir a la Procuraduría Federal del Consumidor (Profeco):',
  'tienda.checkout.casillasTitulo': 'Antes de confirmar',
  'tienda.checkout.casillaTerminos': 'Acepto los Términos de venta',
  'tienda.checkout.casillaReembolsos':
    'Leí la Política de reembolsos, cambios y cancelaciones, incluido mi derecho a revocar la compra en {diasHabilesRevocacion} días hábiles',
  'tienda.checkout.faltaTerminos': 'Para confirmar tu pedido acepta los Términos de venta.',
  'tienda.checkout.faltaReembolsos': 'Para confirmar tu pedido marca que leíste la Política de reembolsos, cambios y cancelaciones.',
  'tienda.checkout.faltanCasillas': 'Para confirmar tu pedido marca las casillas de "Antes de confirmar".',
  'tienda.checkout.consentimientoNoGuardado':
    'No pudimos guardar tu aceptación de los Términos de venta y la Política de reembolsos, así que tu pedido no se creó.',
  'tienda.checkout.consentimientoSinVersion':
    'No pudimos confirmar la versión vigente de los Términos de venta y la Política de reembolsos, así que tu pedido no se creó.',
  'tienda.checkout.consentimientoSinRed': 'Revisa tu conexión a internet e intenta de nuevo.',
  'tienda.checkout.consentimientoSesion': 'Tu sesión terminó: inicia sesión de nuevo y confirma tu compra.',
  'tienda.checkout.consentimientoVersion':
    'Los documentos se actualizaron hace un momento: revísalos, vuelve a marcar las casillas y confirma de nuevo.',
  'tienda.checkout.consentimientoGenerico': 'Intenta de nuevo en un momento.',
  // GP-07.5 bloque transferencia
  // Propias de la app: datos para pagar por transferencia en el salón (DatosTransferencia).
  'pagos.transferencia.banco': 'Banco',
  'pagos.transferencia.titular': 'Titular',
  'pagos.transferencia.clabe': 'CLABE',
  'pagos.transferencia.copiar': 'Copiar CLABE',
  'pagos.transferencia.copiarAyuda': 'Copia los 18 dígitos de la CLABE para pegarlos en tu banco.',
  'pagos.transferencia.copiada': 'Copiamos la CLABE.',
  'pagos.transferencia.noCopiada': 'No pudimos copiarla. Mantén presionada la CLABE para copiarla.',
  // GP-07.5 bloque verificacion
  'tienda.confirmacionTitulo': '¡Gracias por tu compra!',
  'tienda.confirmacionApartado':
    'Te apartamos tu pedido. Te avisamos en la app y por correo cuando esté listo para recogerlo y pagarlo en el salón.',
  'tienda.confirmacionRegistrado':
    'Tu pedido quedó registrado. Te avisamos en la app y por correo cuando esté listo para recoger en el salón.',
  'tienda.pagoRecibidoTexto':
    'Tu pedido quedó pagado. Te avisamos en la app y por correo cuando esté listo para recoger en el salón.',
  'tienda.pagoEnProcesoTexto': 'Mercado Pago aún no lo confirma. Te avisamos en la app y por correo en cuanto se acredite.',
  // Propias de la app (GP-07.5, confirmación del pedido y verificación del pago): no existen en el
  // catálogo del backend.
  'tienda.pago.verificandoTitulo': 'Verificando tu pago',
  'tienda.pago.verificandoTexto': 'Lo estamos confirmando con Mercado Pago. Esta pantalla se actualiza sola.',
  'tienda.pago.aprobadoTitulo': '¡Pago recibido!',
  'tienda.pago.enProcesoTitulo': 'Tu pago se está procesando',
  'tienda.pago.revisionTitulo': 'Recibimos tu pago',
  'tienda.pago.revisionTexto':
    'Necesitamos revisarlo antes de preparar tu pedido. El salón te contactará; no tienes que pagar otra vez.',
  'tienda.pago.noCompletadoTitulo': 'Tu pago no se completó',
  'tienda.pago.rechazadoTexto': 'Mercado Pago no aprobó el pago y no se hizo ningún cargo.',
  'tienda.pago.sinPagoTexto': 'Todavía no recibimos tu pago.',
  'tienda.pago.apartadoHasta': 'Tu pedido sigue apartado hasta el {limite}.',
  'tienda.pago.porConfirmarTitulo': 'Todavía no vemos tu pago',
  'tienda.pago.porConfirmarTexto':
    'Si ya pagaste, no pagues de nuevo: puede tardar unos minutos en verse. Toca Revisar mi pago.',
  'tienda.pago.porPagarTitulo': 'Completa tu pago',
  'tienda.pago.porPagarTexto': 'Tu pedido está apartado. Págalo en Mercado Pago para que lo preparemos.',
  'tienda.pago.canceladoTitulo': 'Pedido cancelado',
  'tienda.pago.canceladoTexto': 'Este pedido está cancelado.',
  'tienda.pago.pagasEnMostrador': 'Pagas {precio} en el mostrador cuando pases por él.',
  'tienda.pago.abriendo': 'Abriendo Mercado Pago',
  'tienda.pago.noSePudoRevisar': 'No pudimos revisar tu pago. Si ya pagaste, no pagues de nuevo: toca Revisar mi pago.',
  'tienda.pago.sinNavegador':
    'No encontramos un navegador para abrir Mercado Pago. Activa Chrome u otro navegador e intenta de nuevo.',
  'tienda.pago.plazo': 'Paga antes del {limite}.',
  'tienda.pago.formaPago': 'Forma de pago',
  'tienda.pago.dondeRecoges': 'Dónde lo recoges',
  'tienda.pago.cargando': 'Cargando tu pedido',
  'tienda.pago.errorCargaTitulo': 'No pudimos cargar tu pedido',
  'tienda.pago.errorCargaTexto': 'Tu pedido no se pierde. Revisa tu conexión e intenta de nuevo.',
  'tienda.pago.noEncontradoTitulo': 'No encontramos este pedido',
  'tienda.pago.noEncontradoTexto': 'Revisa tus pedidos para ver su estado.',
  'tienda.pago.botonReintentarCarga': 'Reintentar',
  'tienda.pago.botonPagar': 'Pagar con Mercado Pago',
  'tienda.pago.botonReintentar': 'Reintentar pago',
  'tienda.pago.botonPagarDeNuevo': 'Pagar de nuevo',
  'tienda.pago.botonRevisarMiPago': 'Revisar mi pago',
  'tienda.pago.botonRevisarDeNuevo': 'Revisar de nuevo',
  'tienda.pago.botonMisPedidos': 'Ver mis pedidos',
  'tienda.pago.botonSeguirComprando': 'Seguir comprando',
  'tienda.pago.pistaPagar': 'Abre Mercado Pago en el navegador',
  'tienda.pago.pistaPagarDeNuevo': 'Abre Mercado Pago en el navegador. Si ya pagaste, no lo hagas.',
  // GP-07.5 bloque pedidos
  // Mis pedidos y detalle: copia exacta de los valores por omisión del catálogo del backend
  // (src/textos-sitio/catalogo.ts), con sus mismas variables. {monto} de pedidos.revocacion.* va
  // pegado a la palabra anterior: se llena con su espacio delante (" $450.00") o vacío.
  'pedidos.lista.vacia': 'No tienes pedidos realizados',
  'pedidos.lista.sinResultados': 'Ningún pedido coincide con la búsqueda',
  'pedidos.estado.apartado': 'Tu pedido está apartado. Lo preparamos y te avisamos cuando puedas pasar a pagarlo y recogerlo.',
  'pedidos.estado.faltaPago': 'Falta completar tu pago en Mercado Pago. Tienes {plazoPago} horas desde que hiciste el pedido.',
  'pedidos.estado.confirmandoPago': 'Estamos confirmando tu pago. Después lo preparamos y te avisamos.',
  'pedidos.estado.pagado': 'Pago recibido. Lo preparamos y te avisamos cuando esté listo para recoger.',
  'pedidos.estado.preparando': 'Estamos preparando tu pedido. Te avisamos en la app y por correo cuando esté listo.',
  'pedidos.estado.listoPagar': 'Tu pedido está listo. Pasa por él al salón y págalo en el mostrador{metodosSalon}.',
  'pedidos.estado.listo': 'Tu pedido está listo. Pasa por él al salón.',
  'pedidos.estado.entregado': 'Recogiste tu pedido en el salón.',
  'pedidos.cancelarORevocar':
    'Las dos te devuelven lo que pagaste. «Cancelar pedido» solo se puede antes de que empecemos a prepararlo; «Revocar compra» es tu derecho por ley durante {diasRevocacion} días hábiles y sigue disponible aunque ya lo hayamos preparado o lo hayas recogido.',
  'pedidos.revocacion.pendiente':
    'Revocaste tu compra. Entrega tu pedido en el salón: al recibirlo te reembolsamos{monto} por el mismo medio con el que pagaste.',
  'pedidos.revocacion.aprobada':
    'Revocaste tu compra: recibimos tu pedido y te reembolsamos{monto} por el mismo medio con el que pagaste.',
  'pedidos.revocacion.rechazada':
    'Revocaste tu compra, pero el salón rechazó la revocación. Si tienes dudas, comunícate con el salón.',
  'pedidos.sinDevoluciones': 'No hay solicitudes para este pedido.',
  'devoluciones.vacia': 'No hay devoluciones registradas.',
  'devoluciones.toastRegistrada': 'Solicitud registrada.',
  // Propias de la app (GP-07.5, pedidos): no existen en el catálogo del backend. Insignias, formas de
  // pago, qué sigue y errores que antes estaban escritos en pedidoModel.ts (mismos textos), con el
  // plazo del pedido en {plazoPago} y el teléfono de la configuración en {telefono}.
  'tienda.pedido.etiqueta.borrador': 'Borrador',
  'tienda.pedido.etiqueta.pendientePago': 'Pendiente de pago',
  'tienda.pedido.etiqueta.pagado': 'Pagado',
  'tienda.pedido.etiqueta.preparando': 'En preparación',
  'tienda.pedido.etiqueta.listoRecoger': 'Listo para recoger',
  'tienda.pedido.etiqueta.enviado': 'Enviado',
  'tienda.pedido.etiqueta.entregado': 'Entregado en el salón',
  'tienda.pedido.etiqueta.cancelado': 'Cancelado',
  'tienda.pedido.etiqueta.apartado': 'Apartado, pagas al recoger',
  'tienda.pedido.etiqueta.pagoEnProceso': 'Pago en proceso',
  'tienda.pedido.etiqueta.sinEstado': 'Sin estado',
  'tienda.pedido.metodo.mercadoPago': 'En línea con Mercado Pago',
  'tienda.pedido.metodo.pagoEnSalon': 'Pago al recoger en el salón',
  'tienda.pedido.metodo.efectivo': 'Efectivo',
  'tienda.pedido.metodo.transferencia': 'Transferencia',
  'tienda.pedido.metodo.tarjetaTerminal': 'Tarjeta en terminal',
  'tienda.pedido.metodo.sinEspecificar': 'Sin especificar',
  'tienda.pedido.metodoCorto.mercadoPago': 'Pago en línea',
  'tienda.pedido.metodoCorto.pagoEnSalon': 'Pago en el salón',
  'tienda.pedido.estado.plazoTerminado':
    'El plazo de {plazoPago} horas para pagar terminó. Este pedido se cancelará y los productos vuelven a la tienda.',
  'tienda.pedido.estado.pagoEnProceso':
    'Tu pago se está procesando en Mercado Pago. No pagues de nuevo: te avisamos en la app y por correo cuando se acredite.',
  'tienda.pedido.noEncontrado': 'No encontramos este pedido.',
  'tienda.pedido.crear.sinExistencias': 'Uno de tus productos ya no tiene piezas suficientes. Revisa tu carrito.',
  'tienda.pedido.crear.retirado': 'Uno de tus productos ya no está en la tienda. Revisa tu carrito.',
  'tienda.pedido.crear.enLineaApagado': 'El pago en línea no está disponible por ahora. Elige pagar al recoger en el salón.',
  'tienda.pedido.crear.enSalonApagado': 'El pago al recoger no está disponible por ahora. Elige pagar en línea.',
  'tienda.pedido.crear.generico': 'No pudimos crear tu pedido. Intenta de nuevo en un momento.',
  'tienda.pedido.crear.revisarMisPedidos':
    'No pudimos confirmar si tu pedido se creó. Revisa Mis pedidos antes de intentar de nuevo, para no hacer el mismo pedido dos veces.',
  'tienda.pedido.crear.verMisPedidos': 'Revisar Mis pedidos',
  'tienda.pedido.pago.noPendiente': 'Este pedido ya no está pendiente de pago.',
  'tienda.pedido.pago.vencido':
    'El plazo de {plazoPago} horas para pagar terminó y el pedido se canceló. Puedes volver a hacer tu compra.',
  'tienda.pedido.pago.total': 'El total de tu pedido no coincide con sus productos. Llámanos al salón para revisarlo: {telefono}.',
  'tienda.pedido.pago.enSalon': 'Este pedido se paga al recogerlo en el salón.',
  'tienda.pedido.pago.noDisponible': 'El pago en línea no está disponible por ahora. Intenta más tarde.',
  'tienda.pedido.pago.generico': 'No pudimos abrir el pago. Intenta de nuevo.',
  'tienda.pedido.cancelar.texto': 'Se cancela tu pedido y los productos vuelven a la tienda. Esta acción no se puede deshacer.',
  'tienda.pedido.cancelar.reembolso': 'Te devolvemos el pago completo al mismo medio con que pagaste en Mercado Pago.',
  'tienda.pedido.cancelar.preparando': 'Este pedido ya se está preparando y no se puede cancelar.',
  'tienda.pedido.cancelar.cambio': 'Tu pedido cambió. Lo actualizamos para que veas su estado.',
  'tienda.pedido.cancelar.devolucionEnProceso':
    'Este pedido tiene una devolución en proceso, así que no se puede cancelar desde la app. Comunícate con el salón para cancelarlo.',
  'tienda.pedido.cancelar.generico': 'No pudimos cancelar tu pedido. Intenta de nuevo en un momento.',
  'tienda.pedido.cancelado': 'Tu pedido quedó cancelado.',
  'tienda.pedido.cancelado.reembolsado':
    'Tu pedido quedó cancelado. Ya pedimos a Mercado Pago la devolución{monto} al mismo medio con que pagaste. Puede tardar unos días en reflejarse, según tu banco.',
  'tienda.pedido.cancelado.enRevision':
    'Tu pedido quedó cancelado. La devolución de tu pago quedó en revisión: el salón la hará y te avisará.',
  'tienda.pedido.lista.titulo': 'Mis pedidos',
  'tienda.pedido.lista.subtitulo': 'Consulta el estado de todos tus pedidos',
  'tienda.pedido.lista.vaciaTexto': 'Cuando compres en la tienda, tus pedidos aparecerán aquí.',
  'tienda.pedido.lista.verTienda': 'Ver la tienda',
  'tienda.pedido.lista.cargando': 'Cargando tus pedidos',
  'tienda.pedido.lista.errorTitulo': 'No pudimos cargar tus pedidos',
  'tienda.pedido.lista.error': 'Algo salió mal al traer tus pedidos. Intenta de nuevo en un momento.',
  'tienda.pedido.lista.refresco': 'No pudimos actualizar tus pedidos. Desliza hacia abajo para intentar de nuevo.',
  'tienda.pedido.lista.reintentar': 'Reintentar',
  'tienda.pedido.lista.sesionTitulo': 'Tus pedidos',
  'tienda.pedido.lista.sesionBeneficio': 'Inicia sesión para ver tus compras y saber cuándo puedes recogerlas.',
  // Propias de la app (GP-07.5, revocación de compra, art. 56 LFPC): los textos de revocacion.ts de
  // la web con los días hábiles guardados en el pedido ({diasRevocacion}) y el monto ({monto}).
  'tienda.revocar.boton': 'Revocar compra',
  'tienda.revocar.titulo': '¿Revocar tu compra del pedido #{pedido}?',
  'tienda.revocar.derecho':
    'Tienes derecho a revocar tu compra sin dar razones dentro de los {diasRevocacion} días hábiles siguientes a que recogiste tu pedido en el salón (o a tu pago, si todavía no lo recoges), según el artículo 56 de la Ley Federal de Protección al Consumidor; no cuentan los domingos ni los días festivos oficiales.',
  'tienda.revocar.reintegroTotal': 'Te reintegramos todo lo que pagaste: {monto}.',
  'tienda.revocar.reintegroParcial': 'Te reintegramos lo que pagaste y todavía no te habíamos devuelto: {monto}.',
  'tienda.revocar.yaRecogido':
    'Como ya recogiste tu pedido, entrégalo en el salón con sus productos. Al recibirlo te reembolsamos por el mismo medio con el que pagaste.',
  'tienda.revocar.sinRecoger': 'Como todavía no lo recoges, cancelamos tu pedido y te reembolsamos por el mismo medio con el que pagaste.',
  'tienda.revocar.hasta': 'Puedes revocarla hasta el {fechaLimite}.',
  'tienda.revocar.motivo': 'Motivo (opcional)',
  'tienda.revocar.motivoAyuda': 'No tienes que dar razones; si quieres, cuéntanos por qué.',
  'tienda.revocar.confirmar': 'Sí, revocar mi compra',
  'tienda.revocar.revocando': 'Revocando tu compra',
  'tienda.revocar.conservar': 'No, conservarla',
  'tienda.revocar.resultadoReembolsado':
    'Revocaste tu compra: cancelamos tu pedido y te devolvimos {monto}. Puede tardar unos días en reflejarse, según tu banco.',
  'tienda.revocar.resultadoPendienteEntrega':
    'Revocaste tu compra. Entrega tu pedido en el salón: al recibirlo te reembolsamos {monto} por el mismo medio con el que pagaste.',
  'tienda.revocar.resultadoEnRevision':
    'Revocaste tu compra y cancelamos tu pedido. El salón te reintegra {monto} por el mismo medio con el que pagaste y te contactará.',
  'tienda.revocar.registrada': 'Tu revocación quedó registrada. Abajo ves en qué va tu reembolso.',
  'tienda.revocar.yaRevocada': 'Ya revocaste esta compra. Abajo ves en qué va tu reembolso.',
  'tienda.revocar.cancelado': 'Este pedido ya está cancelado, así que no hay compra que revocar.',
  'tienda.revocar.sinPago': 'Este pedido todavía no está pagado, así que no hay nada que reintegrar.',
  'tienda.revocar.plazoTerminado': 'El plazo para revocar tu compra ya terminó. Si tienes un problema con tu pedido, comunícate con el salón.',
  'tienda.revocar.devolucionActiva':
    'Tienes una solicitud de devolución activa en este pedido. Para revocar tu compra, comunícate con el salón.',
  'tienda.revocar.yaReembolsado': 'El pago de este pedido ya se reembolsó, así que no hay nada que revocar.',
  'tienda.revocar.cambio': 'Tu pedido cambió mientras lo revocabas. Lo actualizamos para que veas su estado.',
  'tienda.revocar.motivoInvalido': 'Revisa el motivo: quita los símbolos especiales o déjalo en blanco.',
  'tienda.revocar.generico': 'No pudimos revocar tu compra. Intenta de nuevo en un momento.',
  // Propias de la app (GP-07.5, devoluciones y reembolsos en el detalle del pedido).
  'tienda.devoluciones.titulo': 'Devoluciones y reembolsos',
  'tienda.devoluciones.cargando': 'Cargando devoluciones y reembolsos',
  'tienda.devoluciones.error': 'No pudimos cargar las devoluciones y reembolsos de este pedido.',
  'tienda.devoluciones.reintentar': 'Reintentar',
  'tienda.devoluciones.estado.pendiente': 'Pendiente',
  'tienda.devoluciones.estado.aprobada': 'Aprobada',
  'tienda.devoluciones.estado.rechazada': 'Rechazada',
  'tienda.devoluciones.estado.cancelada': 'Cancelada',
  'tienda.devoluciones.tipo.cambio': 'Cambio',
  'tienda.devoluciones.tipo.reembolso': 'Reembolso',
  'tienda.devoluciones.revocacion': 'Revocación (art. 56)',
  'tienda.devoluciones.monto': 'Monto: {monto}',
  'tienda.devoluciones.solicitada': 'Solicitada el {fecha}.',
  'tienda.devoluciones.resuelta': 'Resuelta el {fecha}.',
  'tienda.devoluciones.notaTitulo': 'Respuesta del salón',
  'tienda.devoluciones.metodo.efectivo': 'Se reembolsa en efectivo en el salón.',
  'tienda.devoluciones.metodo.original': 'Se reembolsa por el mismo medio con el que pagaste.',
  'tienda.devoluciones.pagosTitulo': 'Pagos',
  'tienda.devoluciones.pago.aprobado': 'Pago aprobado',
  'tienda.devoluciones.pago.reembolsado': 'Reembolsado',
  'tienda.devoluciones.pago.enRevision': 'En revisión',
  'tienda.devoluciones.pago.reembolsadoEl': 'Te lo reembolsamos el {fecha}.',
  'tienda.devoluciones.pago.reembolsadoSinFecha': 'Te lo reembolsamos.',
  'tienda.devoluciones.pago.revisando': 'El salón lo revisa y te avisa en tu cuenta.',
  // Propias de la app (GP-07.5, pedir y retirar una solicitud de cambio o reembolso): la política y
  // las causas son las de la página de devoluciones de la web (politicaDevolucion.ts), con los días
  // para cambios guardados en el pedido en {diasCambioProducto}.
  'tienda.devoluciones.solicitar.boton': 'Solicitar cambio o reembolso',
  'tienda.devoluciones.solicitar.titulo': 'Solicitar un cambio o reembolso del pedido #{pedido}',
  'tienda.devoluciones.solicitar.politica':
    'Cambio: producto sellado y sin abrir, o con defecto de fábrica, dentro de {diasCambioProducto} días naturales después de recogerlo. Reembolso: por defecto de fábrica, error del salón, falta de existencias o un pedido pagado en línea que se canceló antes de estar listo. El salón revisa cada solicitud y calcula el monto; puedes retirarla mientras esté pendiente.',
  'tienda.devoluciones.solicitar.tipoPregunta': '¿Qué necesitas?',
  'tienda.devoluciones.solicitar.tipoCambio': 'Cambio de producto',
  'tienda.devoluciones.solicitar.tipoCambioTexto': 'Por un producto sellado y sin abrir o con defecto de fábrica.',
  'tienda.devoluciones.solicitar.tipoReembolso': 'Reembolso',
  'tienda.devoluciones.solicitar.tipoReembolsoTexto': 'Si el salón aprueba tu solicitud, te devolvemos lo que pagaste.',
  'tienda.devoluciones.solicitar.causaPregunta': '¿Qué pasó?',
  'tienda.devoluciones.solicitar.articuloPregunta': '¿Qué producto?',
  'tienda.devoluciones.solicitar.articuloOpcional': '¿Qué producto? (opcional)',
  'tienda.devoluciones.solicitar.pedidoCompleto': 'Todo el pedido',
  'tienda.devoluciones.solicitar.pedidoCompletoTexto': 'La solicitud es por el pedido completo.',
  'tienda.devoluciones.solicitar.sellado': 'El producto está sellado y sin abrir',
  'tienda.devoluciones.solicitar.motivo': 'Detalle (opcional)',
  'tienda.devoluciones.solicitar.motivoAyuda': 'Cuéntale al salón qué pasó con tu producto.',
  'tienda.devoluciones.solicitar.enviar': 'Enviar solicitud',
  'tienda.devoluciones.solicitar.enviando': 'Enviando solicitud',
  'tienda.devoluciones.solicitar.volver': 'Volver',
  'tienda.devoluciones.solicitar.faltaArticulo': 'Elige el producto del pedido.',
  'tienda.devoluciones.solicitar.faltaSellado': 'Confirma que el producto está sellado y sin abrir.',
  'tienda.devoluciones.causa.sellado': 'Producto sellado y sin abrir',
  'tienda.devoluciones.causa.selladoTexto': 'Sigue cerrado como lo recogiste.',
  'tienda.devoluciones.causa.defecto': 'Defecto de fábrica',
  'tienda.devoluciones.causa.defectoTexto': 'Llegó dañado o no funciona como debe.',
  'tienda.devoluciones.causa.distinto': 'Error del salón: producto distinto al pedido',
  'tienda.devoluciones.causa.distintoTexto': 'Te entregamos otro producto o presentación.',
  'tienda.devoluciones.causa.existencias': 'Falta de existencias',
  'tienda.devoluciones.causa.existenciasTexto': 'El salón no tuvo el producto para tu pedido.',
  'tienda.devoluciones.causa.cancelacion': 'Cancelado antes de estar listo',
  'tienda.devoluciones.causa.cancelacionTexto': 'Pagaste en línea y el pedido se canceló antes de estar listo para recoger.',
  'tienda.devoluciones.error.causaNoAplica': 'Esa causa no aplica para el tipo de solicitud que elegiste. Elige otra.',
  'tienda.devoluciones.error.noEntregado':
    'Tu pedido todavía no se entrega: el cambio o el reembolso por un defecto se piden después de recogerlo.',
  'tienda.devoluciones.error.plazoCambio':
    'El cambio solo procede dentro de los {diasCambioProducto} días naturales después de recoger tu pedido. Si tienes un problema, comunícate con el salón.',
  'tienda.devoluciones.error.sinPago': 'Tu pedido no está pagado: no hay nada que reembolsar.',
  'tienda.devoluciones.error.existenciasEntregado': 'Un pedido que ya recogiste no se reembolsa por falta de existencias.',
  'tienda.devoluciones.error.noCancelado': 'Esa causa solo aplica a un pedido cancelado.',
  'tienda.devoluciones.error.soloEnLinea': 'Esa causa solo aplica a pedidos pagados en línea.',
  'tienda.devoluciones.error.yaListo':
    'Tu pedido ya estaba listo para recoger cuando se canceló. Comunícate con el salón para revisarlo.',
  'tienda.devoluciones.error.articuloAjeno': 'Ese producto no es de este pedido. Elige otro.',
  'tienda.devoluciones.error.yaActiva':
    'Ya tienes una solicitud activa para este producto o pedido. Espera la respuesta del salón o retírala.',
  'tienda.devoluciones.error.generico': 'No pudimos registrar tu solicitud. Intenta de nuevo en un momento.',
  'tienda.devoluciones.retirar.boton': 'Retirar solicitud',
  'tienda.devoluciones.retirar.titulo': 'Retirar tu solicitud',
  'tienda.devoluciones.retirar.texto':
    'Tu solicitud se cancela y el salón ya no la revisa. Si la necesitas otra vez, puedes pedirla de nuevo mientras sigas dentro del plazo.',
  'tienda.devoluciones.retirar.confirmar': 'Retirar solicitud',
  'tienda.devoluciones.retirar.retirando': 'Retirando solicitud',
  'tienda.devoluciones.retirar.conservar': 'Conservar mi solicitud',
  'tienda.devoluciones.retirar.listo': 'Retiraste tu solicitud.',
  'tienda.devoluciones.retirar.noEncontrada': 'No encontramos esta solicitud. Te mostramos cómo quedaron tus solicitudes.',
  'tienda.devoluciones.retirar.yaNoPendiente': 'Tu solicitud ya no está pendiente: el salón ya la revisó. Te mostramos cómo quedó.',
  'tienda.devoluciones.retirar.revocacion': 'Tu pedido ya se canceló por la revocación: el salón te reintegra tu pago.',
  'tienda.devoluciones.retirar.generico': 'No pudimos retirar tu solicitud. Intenta de nuevo en un momento.',
  // Propias de la app (GP-07.5, carrito): un artículo que se dejó de vender se avisa por su nombre.
  'tienda.carrito.productoRetirado': '{producto} ya no está a la venta y lo quitamos de tu carrito.',
  'tienda.carrito.presentacionRetirada': '{producto} ya no está disponible y lo quitamos de tu carrito.',
  'tienda.carrito.cerrarAviso': 'Cerrar aviso',
  // Mi cuenta (GP-09): desactivar, eliminar y reactivar la cuenta propia. Copia exacta de los valores
  // por omisión del catálogo del backend (src/textos-sitio/catalogo.ts), con sus mismas variables.
  // Los mensajes de cada pendiente (cuenta.revision.*Cancela y cuenta.bloqueo.*) ya llegan llenos en
  // la revisión; las propias de la app van en textosPropiosApp.json (cuenta.app.*).
  'cuenta.titulo': 'Tu cuenta',
  'cuenta.personal': 'Tu cuenta es del personal del salón: solo la administración la puede desactivar o eliminar.',
  'cuenta.desactivar.titulo': 'Desactivar mi cuenta',
  'cuenta.desactivar.explicacion':
    'Es temporal. Mientras esté desactivada no puedes entrar ni te llegan avisos ni correos del salón, y tus datos se conservan. Para volver, reactívala desde el inicio de sesión con un código que te enviamos a tu correo.',
  'cuenta.eliminar.titulo': 'Eliminar mi cuenta',
  'cuenta.eliminar.explicacion':
    'Es definitivo y no se puede deshacer. Borramos o anonimizamos tus datos personales y ya no podrás entrar. Por ley conservamos 5 años tus pedidos, pagos y ventas, sin tu nombre, y tus facturas con sus datos fiscales (nombre o razón social, RFC y correo de facturación). También conservamos tus citas sin tu nombre, la constancia de tus consentimientos y tus solicitudes ARCO. Te enviamos la confirmación con un folio.',
  'cuenta.revision.seResuelve': 'Al confirmar se cancela, sin costo:',
  'cuenta.revision.bloquea': 'Antes de continuar tienes que resolver esto:',
  'cuenta.revision.sinPendientes': 'No tienes citas ni pedidos pendientes. Puedes continuar.',
  'cuenta.confirmar.desactivar':
    'Vas a desactivar tu cuenta. No podrás entrar ni recibirás avisos ni correos hasta que la reactives. Tus datos se conservan.',
  'cuenta.confirmar.eliminar':
    'Vas a eliminar tu cuenta para siempre y no se puede deshacer. Conservamos solo lo que la ley obliga, sin tu nombre.',
  'cuenta.confirmar.casillaDesactivar':
    'Entiendo que no podré entrar hasta que reactive mi cuenta con un código que llega a mi correo.',
  'cuenta.confirmar.casillaEliminar': 'Entiendo que mi cuenta se elimina para siempre y que esto no se puede deshacer.',
  'cuenta.confirmar.password': 'Para confirmar que eres tú, escribe tu contraseña actual.',
  'cuenta.confirmar.codigo':
    'Tu cuenta entra con Google. Para confirmar que eres tú, te enviamos un código de 6 dígitos a tu correo. Vence en 10 minutos.',
  'cuenta.listo.desactivada':
    'Desactivamos tu cuenta y cerramos tus sesiones. Para volver, entra al inicio de sesión y elige «Reactivar mi cuenta».',
  'cuenta.listo.eliminada': 'Eliminamos tu cuenta. Te enviamos la confirmación con el folio {folio} a tu correo.',
  'cuenta.login.desactivada':
    'Desactivaste tu cuenta. Si quieres volver, reactívala con un código que te enviamos a tu correo.',
  'cuenta.reactivar.boton': 'Reactivar mi cuenta',
  'cuenta.reactivar.enlaceGoogle': '¿Desactivaste tu cuenta?',
  'cuenta.reactivar.explicacion':
    'Escribe el correo de tu cuenta. Si la desactivaste tú, te enviamos un código de 6 dígitos para reactivarla. Vence en 10 minutos.',
  'cuenta.reactivar.enviado':
    'Si tu cuenta está desactivada, te enviamos un código. Revisa tu correo, también la carpeta de spam.',
  'cuenta.reactivar.listo': 'Tu cuenta está activa otra vez. Ya puedes iniciar sesión.',
  // Mis datos y privacidad (GP-09): lo que se conserva por ley, copia exacta de los valores por
  // omisión de eliminarCuenta.conserva.* del catálogo del backend (corregidos en la Ronda 8: las
  // facturas se conservan con sus datos fiscales). Los textos propios de la pantalla van en
  // textosPropiosApp.json (privacidad.app.*).
  'eliminarCuenta.conserva.titulo': 'Qué conservamos por ley',
  'eliminarCuenta.conserva.intro': 'Algunos registros los tenemos que guardar aunque elimines tu cuenta:',
  'eliminarCuenta.conserva.fiscal':
    'Tus pedidos, pagos y ventas, sin tu nombre, y tus facturas con sus datos fiscales (nombre o razón social, RFC y correo de facturación), durante 5 años, como lo exige el artículo 30 del Código Fiscal de la Federación.',
  'eliminarCuenta.conserva.historial': 'Tus citas, quejas y valoraciones, ya sin tu nombre.',
  'eliminarCuenta.conserva.constancias':
    'La constancia de tus consentimientos y de tus solicitudes ARCO, incluida la de esta eliminación con su folio.',
  // Ver comprobante (GP-09): copia exacta de los valores por omisión de correos.comprobante.* del
  // catálogo del backend. Las leyendas del ticket ya llegan llenas en GET /api/comprobantes/mio; los
  // textos propios de la pantalla van en textosPropiosApp.json (comprobante.app.*).
  'correos.comprobante.titulo': 'Comprobante de compra',
  'correos.comprobante.gracias': 'Gracias por tu preferencia.',
  // Mis datos y privacidad (Ronda 9 del backend): copia exacta de los valores por omisión del catálogo
  // (src/textos-sitio/catalogo.ts). Lo que se conserva visto desde Mis datos, el aviso junto a la
  // casilla de un documento legal que cambió de versión y el folio de la cancelación ARCO abierta.
  'privacidad.conserva.constancias': 'La constancia de tus consentimientos y de tus solicitudes ARCO.',
  'legal.documentoActualizado': 'Actualizamos este documento; revísalo y acéptalo de nuevo.',
  'privacidad.arco.folioAbierta': 'Folio de tu solicitud abierta: {folio}',
  // Preferencias de avisos (Ronda 9): copia exacta de preferenciasAvisos.* del catálogo del backend.
  'preferenciasAvisos.titulo': 'Preferencias de avisos',
  'preferenciasAvisos.descripcion': 'Elige qué avisos recibes en la app y por correo',
  'preferenciasAvisos.intro':
    'Elige qué avisos quieres recibir en la app y por correo. Si apagas uno, dejamos de mandártelo desde ahora, incluidos los recordatorios que ya estaban programados.',
  'preferenciasAvisos.canalApp': 'En la app',
  'preferenciasAvisos.canalCorreo': 'Por correo',
  'preferenciasAvisos.canalNoAplica': 'Este aviso no se manda por este medio',
  'preferenciasAvisos.arcoRespuesta': 'Respuesta a tus solicitudes ARCO',
  'preferenciasAvisos.arcoRespuestaExplicacion':
    'Este aviso siempre está encendido: la ley nos obliga a comunicarte la respuesta a tus solicitudes de acceso, rectificación, cancelación, oposición o revocación.',
  'preferenciasAvisos.guardado': 'Guardamos tus preferencias de avisos.',
  'preferenciasAvisos.noDisponible':
    'Las preferencias de avisos todavía no están disponibles. Vuelve a intentarlo más tarde.',
  'preferenciasAvisos.errorCarga': 'No pudimos cargar tus preferencias de avisos. Intenta de nuevo.',
  'preferenciasAvisos.guardar': 'Guardar',
  'preferenciasAvisos.guardando': 'Guardando…',
  'preferenciasAvisos.guardarEspera': 'Guardar ({segundos} s)',
  'preferenciasAvisos.reintentar': 'Reintentar',
  'preferenciasAvisos.reintentarEspera': 'Reintentar ({segundos} s)',
  'preferenciasAvisos.cargando': 'Cargando tus preferencias de avisos',
  'preferenciasAvisos.errorGuardado': 'No pudimos guardar tus preferencias de avisos. Intenta de nuevo.',
  'preferenciasAvisos.canalSoloApp': 'Solo en la app',
  'preferenciasAvisos.sinGuardarTitulo': 'Tienes cambios sin guardar',
  'preferenciasAvisos.sinGuardarTexto':
    'Si sales ahora, se pierden los cambios que hiciste en tus preferencias de avisos.',
  'preferenciasAvisos.sinGuardarSalir': 'Salir sin guardar',
  'preferenciasAvisos.sinGuardarQuedarse': 'Seguir aquí',
  // Propias de la app agregadas en GP-07.6 (textosPropiosApp.json): no existen en el catálogo del
  // backend y son respaldos de la app hasta que el backend agregue las claves. Viven en JSON porque
  // son datos, no código. Traen los defectos de citas, los avisos por tipo de falla, los textos que
  // estaban escritos a mano en acceso, perfil, inicio y tienda (mismos textos), los errores para la
  // clienta de mensajesError.ts (por tipo y por code estable del backend), la nota de Google al
  // recuperar la contraseña, el regreso a la reserva, el interruptor de avisos en Perfil y los errores
  // de reservar, reprogramar y cancelar una cita. Las cifras van en variables ({digitos}, {minutos},
  // {megas}...) con el valor de una constante de la app o de la configuración.
  ...TEXTOS_PROPIOS_APP,
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
  const { citas, tienda, revocacion } = config.reglas;
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
    diasPrepararApartado: String(tienda.diasPrepararApartado),
    diaRecordatorioRecoger: String(tienda.diaRecordatorioRecoger),
    diasCancelarNoRecogido: String(tienda.diasCancelarNoRecogido),
    diasRestantesRecoger: String(Math.max(0, tienda.diasCancelarNoRecogido - tienda.diaRecordatorioRecoger)),
    diasHabilesRevocacion: String(revocacion.diasHabiles),
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
