/// <reference types="jest" />

import { reiniciarConfiguracionPublica, RESPALDO_CONFIGURACION } from '@/shared/api/configuracionPublica';
import { llenarVariables, obtenerTexto, RESPALDO_TEXTOS, variablesDeReglas } from '@/shared/api/textosSitio';

import { CONFIGURACION_COMPLETA } from '../../helpers/configuracionFicticia';
import { GUION_LARGO } from '../../helpers/reglasCodigo';
import { configuracionConTextos, TEXTOS_SERVIDOR } from '../../helpers/textosFicticios';

/**
 * GP-07.3: catálogo de textos del sitio (src/shared/api/textosSitio.ts) con funciones puras: el
 * respaldo, el llenado de variables, las variables de reglas que salen de la configuración y la
 * elección entre el texto del servidor y el del respaldo. Ninguna prueba toca la red ni el disco.
 */

const CON_TEXTOS = configuracionConTextos(TEXTOS_SERVIDOR);

/** Las claves que usan las pantallas de GP-07.3 (las tareas siguientes dependen de estos nombres). */
const CLAVES = [
  'inicio.galeria.titulo',
  'inicio.galeria.vaciaTitulo',
  'inicio.galeria.vaciaTexto',
  'inicio.galeria.verServicio',
  'inicio.promociones.titulo',
  'inicio.promociones.vigencia',
  'inicio.equipo.titulo',
  'inicio.preguntas.titulo',
  'inicio.sobreNosotros.titulo',
  'inicio.sobreNosotros.enlace',
  'inicio.cierre.boton',
  'inicio.contenido.errorTitulo',
  'inicio.contenido.errorTexto',
  'salon.titulo',
  'salon.perfil.descripcion',
  'salon.contacto.titulo',
  'salon.contacto.telefono',
  'salon.contacto.whatsapp',
  'salon.contacto.correo',
  'salon.contacto.mapa',
  'salon.valores.titulo',
  'salon.horario.titulo',
  'salon.horario.cerrado',
  'salon.horario.rango',
  'salon.inhabiles.titulo',
  'salon.inhabiles.vacio',
  'salon.sinRed',
  'citas.calendario.cerrado',
  'citas.calendario.inhabil',
  'citas.calendario.inhabilSinMotivo',
  'citas.calendario.leyenda',
];

beforeEach(() => {
  reiniciarConfiguracionPublica();
});

/**
 * Variables de contexto que pueden usar las plantillas del respaldo: las de GP-07.3 y, desde GP-07.4,
 * las de citas y forma de pago del catálogo del backend. Las de reglas salen de variablesDeReglas.
 */
const VARIABLES_CONTEXTO = [
  'fecha', 'telefono', 'correo', 'abre', 'cierra', 'motivo',
  'saldo', 'precio', 'plazoAnticipo', 'horasAviso', 'metodosSalon', 'mesesSoloLinea', 'anticipo',
  'diasExcepcion', 'diasReembolso', 'fechaLimite', 'formasPago', 'limite',
  // GP-07.5: {total} de checkout.avisoSalon y checkout.avisoLinea del catálogo del backend.
  'total',
  // GP-07.5: {plazoPago}, {diasRevocacion}, {monto} y {pedido} de pedidos.* del catálogo del backend
  // (VARIABLES_CONTEXTO), y {producto} de los avisos propios del carrito (tienda.carrito.*).
  'plazoPago', 'diasRevocacion', 'monto', 'pedido', 'producto',
  // GP-07.6: {referencia} de errores.referencia (la referencia de un 5xx del backend).
  'referencia',
  // GP-07.6 Tarea 5: cifras de constantes de la app ({digitos}, {minutos}, {segundos}, {megas}) y
  // datos de pantalla ({numero}, {paso}, {piezas}, {formaPago}) de los textos que salieron del código.
  'digitos', 'minutos', 'segundos', 'megas', 'numero', 'paso', 'piezas', 'formaPago',
  // GP-09: {folio} de cuenta.listo.eliminada del catálogo del backend y de cuenta.app.folio.
  'folio',
];

describe('RESPALDO_TEXTOS', () => {
  // GP-07.4 agrega las claves de citas y forma de pago: aquí se revisa que sigan las de GP-07.3 (las
  // nuevas las revisa test/unit/gp-07.4/textos-reglas.test.ts).
  it('trae las claves de las pantallas de GP-07.3 y está congelado', () => {
    expect(Object.keys(RESPALDO_TEXTOS)).toEqual(expect.arrayContaining(CLAVES));
    expect(Object.isFrozen(RESPALDO_TEXTOS)).toBe(true);
  });

  it('cada plantilla tiene texto, solo variables conocidas bien escritas y nunca el guion largo', () => {
    const variables = {
      ...variablesDeReglas(RESPALDO_CONFIGURACION),
      ...Object.fromEntries(VARIABLES_CONTEXTO.map((nombre) => [nombre, 'x'])),
    };
    for (const plantilla of Object.values(RESPALDO_TEXTOS)) {
      expect(plantilla.trim()).not.toBe('');
      expect(llenarVariables(plantilla, variables).completo).toBe(true);
      expect(plantilla.includes(GUION_LARGO)).toBe(false);
    }
  });
});

describe('llenarVariables', () => {
  it('llena todas las variables (números y textos) y la marca completa', () => {
    expect(llenarVariables('Llega {minutos} minutos antes a {salon}.', { minutos: 10, salon: 'Salón Ficticio' })).toEqual({
      texto: 'Llega 10 minutos antes a Salón Ficticio.',
      completo: true,
    });
  });

  it.each([
    ['sin valor', 'Válida hasta el {fecha}.', {}, 'Válida hasta el.'],
    ['en null', 'Hola {nombre}, tu cita', { nombre: null }, 'Hola, tu cita'],
    ['entre dos palabras', 'De {abre} a {cierra} horas', { abre: '09:00' }, 'De 09:00 a horas'],
  ])('variable %s: incompleta, la quita y junta los espacios', (_caso, plantilla, variables, esperado) => {
    expect(llenarVariables(plantilla, variables)).toEqual({ texto: esperado, completo: false });
  });

  it.each([
    ['abierta', 'Hola { mundo'],
    ['cerrada', 'Hola } mundo'],
    ['con nombre que no es variable', 'Hola {1x} mundo'],
  ])('llave suelta %s: incompleta y sin llaves', (_caso, plantilla) => {
    const { texto, completo } = llenarVariables(plantilla, {});

    expect(completo).toBe(false);
    expect(texto).not.toMatch(/[{}]/);
    expect(texto).toMatch(/^Hola .*mundo$/);
  });
});

describe('variablesDeReglas', () => {
  it('saca las variables de reglas que la app conoce, con los nombres del backend, más el nombre del salón', () => {
    expect(variablesDeReglas(CONFIGURACION_COMPLETA)).toEqual({
      plazoAnticipoHoras: '3',
      minutosAntesPagoSalon: '30',
      minutosLlegadaAntes: '10',
      toleranciaLlegadaMinutos: '5',
      horasAvisoCancelarReagendar: '24',
      mesesSoloPagoEnLinea: '3',
      diasHabilesExcepcionAnticipo: '7',
      diasHabilesCancelarConReembolso: '8',
      plazoPagoLineaHoras: '12',
      // GP-07.5: apartados, recordatorio para recoger y revocación (mismos nombres que el backend).
      diasPrepararApartado: '4',
      diaRecordatorioRecoger: '3',
      diasCancelarNoRecogido: '10',
      diasRestantesRecoger: '7',
      diasHabilesRevocacion: '6',
      diasResguardo: '20',
      tiempoPreparacion: 'Listo en un día hábil',
      diasCambioProducto: '5',
      nombreSalon: 'Salón Ficticio de Prueba',
    });
  });
});

describe('obtenerTexto', () => {
  it('usa el texto del servidor con el contexto y las variables de reglas llenas', () => {
    expect(obtenerTexto('inicio.promociones.vigencia', { fecha: '31 de diciembre' }, CON_TEXTOS)).toBe(
      'Promoción ficticia hasta el 31 de diciembre.',
    );
    expect(obtenerTexto('citas.aviso', {}, CON_TEXTOS)).toBe('Aviso ficticio: llega 10 minutos antes a Salón Ficticio de Prueba.');
  });

  it('el contexto gana a las variables de reglas', () => {
    expect(obtenerTexto('citas.aviso', { minutosLlegadaAntes: 45, nombreSalon: 'Sucursal Ficticia' }, CON_TEXTOS)).toBe(
      'Aviso ficticio: llega 45 minutos antes a Sucursal Ficticia.',
    );
  });

  it('variable sin valor en el texto del servidor: usa el respaldo llenado igual', () => {
    const config = configuracionConTextos({ 'salon.contacto.telefono': 'Marca al {telefono} o al {otroTelefono}' });

    expect(obtenerTexto('salon.contacto.telefono', { telefono: '+52 700 000 0000' }, config)).toBe('Llamar al +52 700 000 0000');
  });

  it.each([
    ['falta en el servidor', {}],
    ['viene vacía', { 'inicio.galeria.titulo': '' }],
  ])('clave que %s: el respaldo', (_caso, textos) => {
    expect(obtenerTexto('inicio.galeria.titulo', {}, configuracionConTextos(textos))).toBe('Nuestro trabajo');
  });

  it.each([
    ['inexistente', 'inicio.claveQueNoExiste'],
    ['heredada de Object', 'toString'],
  ])('clave %s en servidor y respaldo: texto vacío', (_caso, clave) => {
    expect(obtenerTexto(clave, {}, CON_TEXTOS)).toBe('');
  });

  it.each([
    ['una llave abierta', 'Llamada ficticia { al {telefono}'],
    ['una llave cerrada', 'Llamada ficticia al {telefono} }'],
    ['una variable desconocida', 'Llamada ficticia al {telefono} {variableDesconocida}'],
  ])('texto del servidor con %s: usa el respaldo y nunca muestra llaves', (_caso, plantilla) => {
    const config = configuracionConTextos({ 'salon.contacto.telefono': plantilla });

    expect(obtenerTexto('salon.contacto.telefono', { telefono: '+52 700 000 0000' }, config)).toBe('Llamar al +52 700 000 0000');
  });

  it('respaldo con una variable sin valor: la quita y no deja llaves', () => {
    expect(obtenerTexto('citas.calendario.inhabil', {}, CON_TEXTOS)).toBe('No hay citas este día.');
    expect(obtenerTexto('salon.horario.rango', { abre: '09:00' }, CON_TEXTOS)).toBe('09:00 a');
  });

  it('clave solo del servidor con una variable sin valor: la quita del texto del servidor', () => {
    const config = configuracionConTextos({ 'citas.otroAviso': 'Tu cita de {servicio} quedó lista.' });

    expect(obtenerTexto('citas.otroAviso', {}, config)).toBe('Tu cita de quedó lista.');
  });

  it('sin configuración explícita usa la que hay en memoria (al inicio, el respaldo)', () => {
    expect(obtenerTexto('salon.titulo')).toBe('El salón');
    expect(obtenerTexto('citas.calendario.inhabil', { motivo: 'Navidad' })).toBe('No hay citas este día: Navidad.');
    expect(variablesDeReglas(RESPALDO_CONFIGURACION).nombreSalon).toBe(RESPALDO_CONFIGURACION.salon.nombre);
  });

  it('sin red, {nombreSalon} dice el nombre de la web y ningún respaldo trae el nombre viejo', () => {
    const config = { ...RESPALDO_CONFIGURACION, textos: { 'citas.bienvenida': 'Te esperamos en {nombreSalon}.' } };

    expect(obtenerTexto('citas.bienvenida', {}, config)).toBe('Te esperamos en Mirú Franco Salón Beauty.');
    expect(JSON.stringify([RESPALDO_CONFIGURACION, RESPALDO_TEXTOS])).not.toContain('Beauty Salón');
  });
});
