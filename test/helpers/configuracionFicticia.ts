/// <reference types="jest" />

import type { ConfiguracionPublica } from '@/shared/api/configuracionPublica';

import { sembrarArchivo } from './archivosLocales';
import { respuesta, type Manejador } from './servidorSimulado';

/**
 * Configuración pública ficticia (GET /api/configuracion-publica) para las pruebas de GP-07.1: la
 * respuesta completa del servidor, con la misma forma que publica() del backend (objeto sin
 * envoltura), lo que la app debe quedarse después de normalizarla y el archivo que guarda. Todos
 * los datos son inventados y distintos del respaldo, para distinguir de dónde salió cada valor.
 */

export const RUTA_CONFIGURACION = '/api/configuracion-publica';
/** Nombre del archivo en Paths.document. */
export const ARCHIVO_CONFIGURACION = 'configuracion-publica.json';

/** Respuesta completa: trae también lo que la app no debe guardar (responsable, transferencia...). */
export function respuestaCompleta(): Record<string, unknown> {
  return {
    salon: {
      nombre: '  Salón Ficticio de Prueba  ',
      responsable: 'Responsable Ficticia',
      direccion: 'Calle Inventada 123, Centro',
      ciudad: 'Ciudad Ficticia, Estado',
      codigoPostal: '00000',
      telefono: '+52 700 000 0000',
      whatsapp: '+52 700 000 0001',
      correoContacto: 'contacto@salon.test',
      correoPrivacidad: 'privacidad@salon.test',
      mapaUrl: 'https://maps.app.goo.gl/ficticio',
      lema: 'Lema ficticio',
      descripcionSeo: 'Descripción ficticia',
    },
    redes: { facebook: 'https://facebook.com/ficticio', instagram: '' },
    horario: {
      dias: [
        { dia: 'lunes', cerrado: true, abre: '', cierra: '' },
        { dia: 'martes', cerrado: false, abre: '10:00', cierra: '18:00' },
        { dia: 'miercoles', cerrado: false, abre: '10:00', cierra: '18:00' },
        { dia: 'jueves', cerrado: false, abre: '10:00', cierra: '18:00' },
        { dia: 'viernes', cerrado: false, abre: '10:00', cierra: '20:00' },
        { dia: 'sabado', cerrado: false, abre: '09:00', cierra: '15:00' },
        { dia: 'domingo', cerrado: true, abre: '', cierra: '' },
      ],
    },
    contenido: {
      inicio: {
        heroTexto: '  Portada ficticia de prueba  ',
        heroDestacado: 'Frase ficticia',
        productosDescripcion: 'Productos ficticios',
        serviciosDescripcion: 'Servicios ficticios',
        trabajoDescripcion: 'Galería ficticia',
        sobreNosotrosParrafos: ['Párrafo ficticio uno', 'Párrafo ficticio dos'],
        sobreNosotrosImagen: 'https://res.cloudinary.com/ficticio/inicio.jpg',
        cierreTitulo: 'Cierre ficticio',
        cierreTexto: 'Texto de cierre ficticio',
        campoAjeno: 'Campo ajeno ficticio',
      },
      sobreNosotros: {
        titulo: 'Historia ficticia',
        parrafos: ['Historia ficticia uno'],
        imagen: 'https://res.cloudinary.com/ficticio/salon.jpg',
        valores: [{ titulo: 'Valor ficticio', descripcion: 'Descripción de valor ficticio' }],
      },
      contacto: { introduccion: 'Introducción ficticia', agendaTexto: 'Agenda ficticia' },
    },
    anticiposActivos: false,
    reglas: {
      citas: {
        plazoAnticipoHoras: 3,
        minutosAntesPagoSalon: 30,
        minutosLlegadaAntes: 10,
        toleranciaLlegadaMinutos: 5,
        horasAvisoCancelarReagendar: 24,
        maxCitasPorPagarEnSalon: 2,
        permitirAnticipoEnSalon: false,
        intervaloHorariosMinutos: 15,
      },
      tienda: {
        plazoPagoLineaHoras: 12,
        diaRecordatorioRecoger: 3,
        diasCancelarNoRecogido: 10,
        diasResguardoPagado: 20,
        tiempoPreparacionTexto: 'Listo en un día hábil',
        diasCambioProducto: 5,
      },
      revocacion: { diasHabiles: 5 },
      garantia: { dias: 30 },
      facturacion: { activa: false },
      arco: { diasHabilesRespuesta: 20, diasHabilesEfectividad: 15, diasAvisoVencePronto: 3 },
      pagos: {
        mercadoPagoTienda: false,
        mercadoPagoAnticipos: true,
        metodosSalon: ['efectivo', 'transferencia'],
        transferencia: { banco: 'Banco Ficticio', titular: 'Titular Ficticia', clabe: 'clabe-ficticia' },
      },
      diasInhabiles: [{ fecha: '2026-12-25', motivo: 'Navidad' }],
      variables: { plazoAnticipoHoras: '3' },
    },
    textos: { 'citas.aviso': 'Aviso ficticio de citas', 'tienda.aviso': 'Aviso ficticio de tienda' },
  };
}

/** Lo que la app se queda de respuestaCompleta() después de normalizarla. */
export const CONFIGURACION_COMPLETA: ConfiguracionPublica = {
  salon: {
    nombre: 'Salón Ficticio de Prueba',
    direccion: 'Calle Inventada 123, Centro',
    ciudad: 'Ciudad Ficticia, Estado',
    telefono: '+52 700 000 0000',
    whatsapp: '+52 700 000 0001',
    mapaUrl: 'https://maps.app.goo.gl/ficticio',
    correoContacto: 'contacto@salon.test',
  },
  horario: {
    dias: [
      { dia: 'lunes', cerrado: true, abre: '', cierra: '' },
      { dia: 'martes', cerrado: false, abre: '10:00', cierra: '18:00' },
      { dia: 'miercoles', cerrado: false, abre: '10:00', cierra: '18:00' },
      { dia: 'jueves', cerrado: false, abre: '10:00', cierra: '18:00' },
      { dia: 'viernes', cerrado: false, abre: '10:00', cierra: '20:00' },
      { dia: 'sabado', cerrado: false, abre: '09:00', cierra: '15:00' },
      { dia: 'domingo', cerrado: true, abre: '', cierra: '' },
    ],
  },
  contenido: {
    inicio: {
      heroTexto: 'Portada ficticia de prueba',
      heroDestacado: 'Frase ficticia',
      productosDescripcion: 'Productos ficticios',
      serviciosDescripcion: 'Servicios ficticios',
      trabajoDescripcion: 'Galería ficticia',
      sobreNosotrosParrafos: ['Párrafo ficticio uno', 'Párrafo ficticio dos'],
      sobreNosotrosImagen: 'https://res.cloudinary.com/ficticio/inicio.jpg',
      cierreTitulo: 'Cierre ficticio',
      cierreTexto: 'Texto de cierre ficticio',
    },
    sobreNosotros: {
      titulo: 'Historia ficticia',
      parrafos: ['Historia ficticia uno'],
      imagen: 'https://res.cloudinary.com/ficticio/salon.jpg',
      valores: [{ titulo: 'Valor ficticio', descripcion: 'Descripción de valor ficticio' }],
    },
    contacto: { introduccion: 'Introducción ficticia', agendaTexto: 'Agenda ficticia' },
  },
  anticiposActivos: false,
  reglas: {
    citas: {
      plazoAnticipoHoras: 3,
      minutosAntesPagoSalon: 30,
      minutosLlegadaAntes: 10,
      toleranciaLlegadaMinutos: 5,
      permitirAnticipoEnSalon: false,
      maxCitasPorPagarEnSalon: 2,
      intervaloHorariosMinutos: 15,
      horasAvisoCancelarReagendar: 24,
    },
    tienda: {
      plazoPagoLineaHoras: 12,
      tiempoPreparacionTexto: 'Listo en un día hábil',
      diasResguardoPagado: 20,
      diasCancelarNoRecogido: 10,
      diasCambioProducto: 5,
    },
    pagos: { mercadoPagoTienda: false, mercadoPagoAnticipos: true, metodosSalon: ['efectivo', 'transferencia'] },
    diasInhabiles: [{ fecha: '2026-12-25', motivo: 'Navidad' }],
  },
  textos: { 'citas.aviso': 'Aviso ficticio de citas', 'tienda.aviso': 'Aviso ficticio de tienda' },
};

/** Valores de respuestaCompleta() que nunca deben llegar a la app ni al archivo. */
export const DATOS_EXCLUIDOS = [
  'Responsable Ficticia',
  'privacidad@salon.test',
  'Banco Ficticio',
  'Titular Ficticia',
  'clabe-ficticia',
  'https://facebook.com/ficticio',
  'Campo ajeno ficticio',
];

/** Configuración guardada antes en el archivo: distinta de la completa y del respaldo. */
export const CONFIGURACION_GUARDADA: ConfiguracionPublica = {
  ...CONFIGURACION_COMPLETA,
  salon: { ...CONFIGURACION_COMPLETA.salon, nombre: 'Salón Guardado en Archivo' },
};

/** Contenido del archivo como lo escribe el repositorio: versión 1, fecha de lectura y configuración. */
export function contenidoArchivo(configuracion: unknown = CONFIGURACION_GUARDADA, leidoEn: unknown = 1_000): string {
  return JSON.stringify({ version: 1, leidoEn, configuracion });
}

/** Deja en el disco simulado un archivo de configuración (por omisión, CONFIGURACION_GUARDADA). */
export function sembrarConfiguracionGuardada(contenido: string = contenidoArchivo()): void {
  sembrarArchivo(ARCHIVO_CONFIGURACION, contenido);
}

/** Ruta del servidor simulado (servidorConRutas) que responde la configuración indicada. */
export function rutaConfiguracion(cuerpo: unknown = respuestaCompleta(), status = 200): Record<string, Manejador> {
  return { [`GET ${RUTA_CONFIGURACION}`]: () => respuesta(cuerpo, status) };
}
