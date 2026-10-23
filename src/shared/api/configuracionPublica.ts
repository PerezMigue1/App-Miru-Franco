import { File, Paths } from 'expo-file-system';

import { apiGet, ApiError, crearErrorApi, ErrorDeRed } from './apiClient';

/**
 * Configuración pública del salón (GET /api/configuracion-publica, sin sesión): datos de contacto,
 * horario, reglas de citas y tienda, métodos de pago, días inhábiles, contenido editable (inicio,
 * sobre nosotros y contacto) y textos del sitio (los lee textosSitio.ts sin pedir nada más).
 *
 * Patrón Repository: las pantallas piden la configuración aquí y no saben si llegó de la red, del
 * archivo guardado o del respaldo. Patrón Singleton: hay un solo estado en memoria para toda la app.
 * Patrón Observer: `suscribir` avisa cuando llega una versión nueva (lo usa useConfiguracionPublica).
 *
 * Nunca rechaza ni escribe en consola: los ApiError y ErrorDeRed de apiClient se atrapan y solo
 * viajan en el resultado de `refrescar`. No guarda datos personales: solo lo que normaliza.
 */

// ── Tipos ────────────────────────────────────────────────────────────────────────────────────

export type DiaSemana = 'lunes' | 'martes' | 'miercoles' | 'jueves' | 'viernes' | 'sabado' | 'domingo';
export type MetodoPagoSalon = 'efectivo' | 'tarjeta' | 'transferencia';

export interface DiaHorario {
  dia: DiaSemana;
  cerrado: boolean;
  /** 'HH:MM', o '' si el día está cerrado. */
  abre: string;
  cierra: string;
}

export interface DiaInhabil {
  /** 'YYYY-MM-DD'. */
  fecha: string;
  motivo: string;
}

export interface SalonPublico {
  nombre: string;
  direccion: string;
  ciudad: string;
  telefono: string;
  whatsapp: string;
  mapaUrl: string;
  correoContacto: string;
}

export interface ReglasCitasPublicas {
  plazoAnticipoHoras: number;
  minutosAntesPagoSalon: number;
  minutosLlegadaAntes: number;
  toleranciaLlegadaMinutos: number;
  permitirAnticipoEnSalon: boolean;
  maxCitasPorPagarEnSalon: number;
  intervaloHorariosMinutos: number;
  horasAvisoCancelarReagendar: number;
  /** Días hábiles desde el pago en que el anticipo ya no se devuelve al cancelar (Política de anticipos). */
  diasHabilesExcepcionAnticipo: number;
  /** Días hábiles después del pago para cancelar con reembolso del anticipo. */
  diasHabilesCancelarConReembolso: number;
  /** reglas.citas.noAsistio.pierdeAnticipo del servidor: si no llega, el anticipo se retiene. */
  pierdeAnticipoSiNoAsiste: boolean;
  /** reglas.citas.noAsistio.mesesSoloPagoEnLinea: meses con pago solo en línea después de una falta. */
  mesesSoloPagoEnLinea: number;
}

export interface ReglasTiendaPublicas {
  plazoPagoLineaHoras: number;
  tiempoPreparacionTexto: string;
  diasResguardoPagado: number;
  diasCancelarNoRecogido: number;
  diasCambioProducto: number;
  /** Días para preparar un apartado; si no se prepara en ese tiempo, se cancela. */
  diasPrepararApartado: number;
  /** Día (desde que quedó listo) en que se recuerda a la clienta que pase por su pedido. */
  diaRecordatorioRecoger: number;
}

/** Revocación de compra (art. 56 LFPC): días hábiles, nunca menos de 5. */
export interface ReglasRevocacionPublicas {
  diasHabiles: number;
}

/** Datos para pagar por transferencia en el salón. Solo llegan si la transferencia está activa y completa. */
export interface DatosTransferencia {
  banco: string;
  titular: string;
  /** 18 dígitos, sin espacios. */
  clabe: string;
}

export interface PagosPublicos {
  mercadoPagoTienda: boolean;
  mercadoPagoAnticipos: boolean;
  metodosSalon: MetodoPagoSalon[];
  /**
   * null si la transferencia está apagada, incompleta o la configuración no viene de la red: nunca
   * se guarda en el archivo ni en el respaldo, para no mostrar sin conexión una cuenta que ya cambió.
   */
  transferencia: DatosTransferencia | null;
}

/** Textos de la portada (Admin > Configuración del sitio > Inicio). Las imágenes son URL https:// o ''. */
export interface ContenidoInicio {
  heroTexto: string;
  heroDestacado: string;
  productosDescripcion: string;
  serviciosDescripcion: string;
  trabajoDescripcion: string;
  sobreNosotrosParrafos: string[];
  sobreNosotrosImagen: string;
  cierreTitulo: string;
  cierreTexto: string;
}

export interface ValorSalon {
  titulo: string;
  descripcion: string;
}

export interface ContenidoSobreNosotros {
  titulo: string;
  parrafos: string[];
  imagen: string;
  /** Hasta MAXIMO_VALORES. */
  valores: ValorSalon[];
}

export interface ContenidoContacto {
  introduccion: string;
  agendaTexto: string;
}

export interface ContenidoPublico {
  inicio: ContenidoInicio;
  sobreNosotros: ContenidoSobreNosotros;
  contacto: ContenidoContacto;
}

/**
 * Solo lo que la app usa: sin responsable, correo de privacidad ni redes. Los datos de transferencia
 * solo viven en memoria (ver PagosPublicos.transferencia).
 */
export interface ConfiguracionPublica {
  salon: SalonPublico;
  horario: { dias: DiaHorario[] };
  contenido: ContenidoPublico;
  anticiposActivos: boolean;
  reglas: {
    citas: ReglasCitasPublicas;
    tienda: ReglasTiendaPublicas;
    revocacion: ReglasRevocacionPublicas;
    pagos: PagosPublicos;
    diasInhabiles: DiaInhabil[];
  };
  textos: Record<string, string>;
}

/** De dónde salió la configuración que hay en memoria. */
export type OrigenConfiguracion = 'red' | 'archivo' | 'respaldo';

export interface EstadoConfiguracion {
  configuracion: ConfiguracionPublica;
  origen: OrigenConfiguracion;
  /** Momento (ms) de la lectura de red que dio esta configuración; null si nunca hubo una. */
  leidoEn: number | null;
}

export interface ResultadoRefresco {
  configuracion: ConfiguracionPublica;
  origen: OrigenConfiguracion;
  /** Por qué no se pudo leer de la red, si falló. Nunca se muestra a la clienta. */
  error?: ApiError | ErrorDeRed;
}

// ── Constantes ───────────────────────────────────────────────────────────────────────────────

/** Vigencia de la lectura de red en memoria (el backend guarda la suya 60 s). */
export const VIGENCIA_CONFIGURACION_MS = 5 * 60 * 1000;
/**
 * Lo más que la pantalla de carga espera a la red (apiClient espera hasta 15 s): después sigue
 * con el archivo guardado o el respaldo y la red termina en segundo plano.
 */
export const TIEMPO_MAXIMO_CARGA_MS = 3000;

const RUTA = '/api/configuracion-publica';
const NOMBRE_ARCHIVO = 'configuracion-publica.json';
const VERSION_ARCHIVO = 1;
const DIAS: readonly DiaSemana[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];
const METODOS: readonly MetodoPagoSalon[] = ['efectivo', 'tarjeta', 'transferencia'];
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;
const URL_HTTPS = /^https:\/\/\S+$/;
const CLABE = /^\d{18}$/;
/** Lo más que acepta el backend en "Lo que nos distingue" (validarSeccion, contenido_sobre_nosotros). */
export const MAXIMO_VALORES = 6;

const PARRAFO_EQUIPO =
  'En Mirú Franco, nos dedicamos a realzar tu belleza natural con productos y servicios de la más alta calidad. Nuestro equipo de profesionales está comprometido a brindarte una experiencia excepcional en cada visita.';
const PARRAFO_UBICACION =
  'Estamos en Huejutla de Reyes, Hidalgo. Aquí puedes agendar tus servicios en línea, comprar productos profesionales para el cuidado de tu cabello y recogerlos en el salón.';

/** Congela un objeto y todo lo que contiene: la configuración en memoria no se puede modificar. */
function congelar<T>(valor: T): T {
  if (valor && typeof valor === 'object') {
    Object.values(valor).forEach(congelar);
    Object.freeze(valor);
  }
  return valor;
}

const abierto = (dia: DiaSemana, abre: string, cierra: string): DiaHorario => ({ dia, cerrado: false, abre, cierra });

/**
 * Valores que la app tenía fijos antes de leer la configuración, para que sin red ni archivo nada
 * cambie de comportamiento. Salón: nombre, dirección, ciudad, teléfono, WhatsApp y correo de contacto
 * tal como los publica GET /api/configuracion-publica (datos públicos); el mapa busca las coordenadas
 * del salón en Google Maps. Horario: el que publica el sitio web. Citas:
 * textos de citas/views/ReservarCitaView y límites de citas/models/citaModel (2 horas en línea, 15
 * minutos antes en el salón, llegar 20 minutos antes, horarios cada 30). La política de anticipos
 * (10 días hábiles de excepción y 5 para cancelar con reembolso), qué pasa si no llega (pierde el
 * anticipo y 6 meses con pago solo en línea), tienda, pagos y lo demás: valores por omisión del
 * backend (REGLAS_POR_OMISION de reglas-negocio.ts). Sin datos de transferencia: solo llegan de la red.
 * Contenido: los que publica hoy el sitio web
 * (CONFIGURACION_POR_OMISION.contenido de miru-franco-web).
 */
export const RESPALDO_CONFIGURACION: ConfiguracionPublica = congelar({
  salon: {
    nombre: 'Mirú Franco Salón Beauty',
    direccion: 'Segunda Cerrada de Allende No. 15, Col. Juárez',
    ciudad: 'Huejutla de Reyes, Hidalgo',
    telefono: '+52 771 268 1432',
    whatsapp: '+52 771 186 7645',
    mapaUrl: 'https://www.google.com/maps/search/?api=1&query=21.144534,-98.4205943',
    correoContacto: 'contacto@mirufranco.com',
  },
  horario: {
    dias: [
      ...DIAS.slice(0, 5).map((dia) => abierto(dia, '09:30', '19:30')),
      abierto('sabado', '09:30', '19:00'),
      { dia: 'domingo', cerrado: true, abre: '', cierra: '' },
    ],
  },
  contenido: {
    inicio: {
      heroTexto: 'Realza tu belleza natural con productos y servicios profesionales. Agenda tu cita y descubre la experiencia Mirú Franco.',
      heroDestacado: 'Brillo que se nota',
      productosDescripcion: 'Lo que usamos en el salón, para que lo sigas en casa.',
      serviciosDescripcion: 'Nuestra carta: elige un servicio para ver qué incluye y reservar tu horario.',
      trabajoDescripcion: 'Fotos de servicios hechos en el salón. Tócalas para verlas en grande.',
      sobreNosotrosParrafos: [PARRAFO_EQUIPO, PARRAFO_UBICACION],
      sobreNosotrosImagen: '',
      cierreTitulo: '¿Lista para tu cambio de look?',
      cierreTexto: 'Agenda una cita con nosotros y descubre la diferencia que hace la calidad profesional.',
    },
    sobreNosotros: {
      titulo: 'Pasión por la belleza natural',
      parrafos: [
        PARRAFO_EQUIPO,
        PARRAFO_UBICACION,
        'Cada cliente es único, y por eso diseñamos un plan de cuidado personalizado para adaptarnos a tus necesidades específicas, tu tipo de cabello y tus preferencias de estilo.',
      ],
      imagen: '',
      valores: [
        { titulo: 'Profesionalismo', descripcion: 'Cada servicio se ejecuta con técnica depurada y productos de primera calidad.' },
        { titulo: 'Calidez', descripcion: 'Te recibimos con atención personalizada desde el primer momento.' },
        { titulo: 'Innovación', descripcion: 'Combinamos técnicas tradicionales con las últimas tendencias del mundo capilar.' },
        { titulo: 'Confianza', descripcion: 'Construimos relaciones duraderas basadas en resultados reales y honestos.' },
      ],
    },
    contacto: {
      introduccion: 'Agenda una cita, resuelve tus dudas o simplemente escríbenos. Estaremos encantados de atenderte.',
      agendaTexto: 'Elige el servicio, la fecha y la hora que prefieras. Si el servicio pide anticipo, tu cita se confirma al pagarlo.',
    },
  },
  anticiposActivos: true,
  reglas: {
    citas: {
      plazoAnticipoHoras: 2,
      minutosAntesPagoSalon: 15,
      minutosLlegadaAntes: 20,
      toleranciaLlegadaMinutos: 15,
      permitirAnticipoEnSalon: true,
      maxCitasPorPagarEnSalon: 1,
      intervaloHorariosMinutos: 30,
      horasAvisoCancelarReagendar: 0,
      diasHabilesExcepcionAnticipo: 10,
      diasHabilesCancelarConReembolso: 5,
      pierdeAnticipoSiNoAsiste: true,
      mesesSoloPagoEnLinea: 6,
    },
    tienda: {
      plazoPagoLineaHoras: 24,
      tiempoPreparacionTexto: 'Suele estar listo en 24 a 48 horas hábiles',
      diasResguardoPagado: 15,
      diasCancelarNoRecogido: 7,
      diasCambioProducto: 7,
      diasPrepararApartado: 3,
      diaRecordatorioRecoger: 3,
    },
    revocacion: { diasHabiles: 5 },
    pagos: { mercadoPagoTienda: true, mercadoPagoAnticipos: true, metodosSalon: [...METODOS], transferencia: null },
    diasInhabiles: [],
  },
  textos: {},
});

// ── Normalización ────────────────────────────────────────────────────────────────────────────

type Objeto = Record<string, unknown>;
type Primitivo = string | number | boolean;

const esObjeto = (valor: unknown): valor is Objeto =>
  typeof valor === 'object' && valor !== null && !Array.isArray(valor);
const objeto = (valor: unknown): Objeto => (esObjeto(valor) ? valor : {});
const esEnteroNoNegativo = (valor: unknown): valor is number => Number.isInteger(valor) && (valor as number) >= 0;
const esHora = (valor: unknown): valor is string => typeof valor === 'string' && HORA.test(valor.trim());

/** Un campo con el tipo de su respaldo: entero >= 0, booleano o texto recortado; si no, el respaldo. */
function campo<V extends Primitivo>(valor: unknown, respaldo: V): V {
  if (typeof respaldo === 'number') {
    return (esEnteroNoNegativo(valor) ? valor : respaldo) as V;
  }
  if (typeof respaldo === 'boolean') {
    return (typeof valor === 'boolean' ? valor : respaldo) as V;
  }
  return (typeof valor === 'string' ? valor.trim() : respaldo) as V;
}

/** Normaliza un campo a partir de lo que trae el servidor y su respaldo. */
type Normalizador<V> = (valor: unknown, respaldo: V) => V;
type Normalizadores<T> = { [K in keyof T]: Normalizador<T[K]> };

/** Solo las claves del respaldo, cada una con su normalizador: lo que sobra en el servidor no entra. */
function seccion<T extends object>(crudo: unknown, respaldo: T, normalizadores: Normalizadores<T>): T {
  const fuente = objeto(crudo);
  const limpio = { ...respaldo };
  for (const clave of Object.keys(respaldo) as (keyof T & string)[]) {
    limpio[clave] = normalizadores[clave](fuente[clave], respaldo[clave]);
  }
  return limpio;
}

/** `seccion` con `campo` en cada clave (secciones de puros números, booleanos y textos). */
function porCampos<T extends { [K in keyof T]: Primitivo }>(crudo: unknown, respaldo: T): T {
  const normalizadores = Object.fromEntries(Object.keys(respaldo).map((clave) => [clave, campo]));
  return seccion(crudo, respaldo, normalizadores as Normalizadores<T>);
}

function diaHorario(crudo: unknown, dia: DiaSemana): DiaHorario | null {
  const d = objeto(crudo);
  if (d.cerrado === true) {
    return { dia, cerrado: true, abre: '', cierra: '' };
  }
  return esHora(d.abre) && esHora(d.cierra) ? abierto(dia, d.abre.trim(), d.cierra.trim()) : null;
}

/** Los siete días con nombre conocido y horas HH:MM (o cerrado); si falta algo, el horario del respaldo. */
function horario(crudo: unknown): ConfiguracionPublica['horario'] {
  const lista = objeto(crudo).dias;
  if (!Array.isArray(lista) || lista.length !== DIAS.length) {
    return RESPALDO_CONFIGURACION.horario;
  }
  const dias = DIAS.map((dia) => diaHorario(lista.find((d) => objeto(d).dia === dia), dia));
  return dias.every((d): d is DiaHorario => d !== null) ? { dias } : RESPALDO_CONFIGURACION.horario;
}

function diasInhabiles(crudo: unknown): DiaInhabil[] {
  return (Array.isArray(crudo) ? crudo : [])
    .map(objeto)
    .filter((d) => typeof d.fecha === 'string' && FECHA.test(d.fecha) && typeof d.motivo === 'string')
    .map((d) => ({ fecha: d.fecha as string, motivo: (d.motivo as string).trim() }));
}

/** Los métodos conocidos que trae la lista, sin repetir y en orden fijo. */
function metodosSalon(crudo: unknown): MetodoPagoSalon[] {
  return Array.isArray(crudo)
    ? METODOS.filter((metodo) => crudo.includes(metodo))
    : [...RESPALDO_CONFIGURACION.reglas.pagos.metodosSalon];
}

/**
 * Banco, titular y CLABE de texto no vacío y CLABE de 18 dígitos (sin espacios); si falta algo o la
 * CLABE no es válida, null: nunca se muestra una cuenta a medias.
 */
function transferencia(crudo: unknown): DatosTransferencia | null {
  const t = objeto(crudo);
  const banco = typeof t.banco === 'string' ? t.banco.trim() : '';
  const titular = typeof t.titular === 'string' ? t.titular.trim() : '';
  const clabe = typeof t.clabe === 'string' ? t.clabe.replace(/\s+/g, '') : '';
  return banco && titular && CLABE.test(clabe) ? { banco, titular, clabe } : null;
}

/** Días hábiles para revocar: entero de al menos 5 (mínimo de ley); si no, el respaldo. */
function revocacion(crudo: unknown): ReglasRevocacionPublicas {
  const dias = objeto(crudo).diasHabiles;
  const respaldo = RESPALDO_CONFIGURACION.reglas.revocacion;
  return { diasHabiles: esEnteroNoNegativo(dias) && dias >= respaldo.diasHabiles ? dias : respaldo.diasHabiles };
}

function textos(crudo: unknown): Record<string, string> {
  return Object.fromEntries(
    Object.entries(objeto(crudo))
      .filter((par): par is [string, string] => typeof par[1] === 'string')
      .map(([clave, valor]) => [clave, valor.trim()]),
  );
}

/** Texto recortado no vacío (lo que el backend marca obligatorio); vacío o con otro tipo, el respaldo. */
const obligatorio: Normalizador<string> = (valor, respaldo) => campo(valor, respaldo) || respaldo;

/** Solo URL https:// recortada; cualquier otra cosa (ruta relativa, http, otro tipo) queda ''. */
const imagen: Normalizador<string> = (valor) =>
  typeof valor === 'string' && URL_HTTPS.test(valor.trim()) ? valor.trim() : '';

/** Textos no vacíos y recortados de la lista; si no queda ninguno (o no es lista), el respaldo. */
const parrafos: Normalizador<string[]> = (valor, respaldo) => {
  const lista = (Array.isArray(valor) ? valor : []).map((p) => obligatorio(p, '')).filter(Boolean);
  return lista.length > 0 ? lista : respaldo;
};

/**
 * Solo los pares con título y descripción de texto no vacío, hasta MAXIMO_VALORES. Una lista vacía
 * vale (la dueña pudo quitarlos todos); si no es lista, el respaldo.
 */
const valores: Normalizador<ValorSalon[]> = (valor, respaldo) =>
  Array.isArray(valor)
    ? valor
        .map(objeto)
        .map((v) => ({ titulo: obligatorio(v.titulo, ''), descripcion: obligatorio(v.descripcion, '') }))
        .filter((v) => v.titulo && v.descripcion)
        .slice(0, MAXIMO_VALORES)
    : respaldo;

/** Contenido de inicio, sobre nosotros y contacto; una sección en null (sin guardar) toma el respaldo. */
function contenido(crudo: unknown): ContenidoPublico {
  const fuente = objeto(crudo);
  const respaldo = RESPALDO_CONFIGURACION.contenido;
  return {
    inicio: seccion(fuente.inicio, respaldo.inicio, {
      heroTexto: obligatorio,
      heroDestacado: obligatorio,
      productosDescripcion: campo,
      serviciosDescripcion: campo,
      trabajoDescripcion: campo,
      sobreNosotrosParrafos: parrafos,
      sobreNosotrosImagen: imagen,
      cierreTitulo: obligatorio,
      cierreTexto: campo,
    }),
    sobreNosotros: seccion(fuente.sobreNosotros, respaldo.sobreNosotros, { titulo: obligatorio, parrafos, imagen, valores }),
    contacto: seccion(fuente.contacto, respaldo.contacto, { introduccion: obligatorio, agendaTexto: obligatorio }),
  };
}

/**
 * Reglas de citas en una sola capa: el servidor manda qué pasa si no llega dentro de
 * reglas.citas.noAsistio ({ pierdeAnticipo, mesesSoloPagoEnLinea }) y la app lo guarda plano
 * (pierdeAnticipoSiNoAsiste y mesesSoloPagoEnLinea). Lo guardado en el archivo ya viene plano y no
 * trae noAsistio, así que sin él se toma el campo plano.
 */
function reglasCitas(crudo: unknown): ReglasCitasPublicas {
  const citas = objeto(crudo);
  const noAsistio = esObjeto(citas.noAsistio) ? citas.noAsistio : null;
  return porCampos(
    {
      ...citas,
      pierdeAnticipoSiNoAsiste: noAsistio ? noAsistio.pierdeAnticipo : citas.pierdeAnticipoSiNoAsiste,
      mesesSoloPagoEnLinea: noAsistio ? noAsistio.mesesSoloPagoEnLinea : citas.mesesSoloPagoEnLinea,
    },
    RESPALDO_CONFIGURACION.reglas.citas,
  );
}

/**
 * Convierte la respuesta del servidor (o lo guardado en el archivo) en una ConfiguracionPublica,
 * campo por campo: lo que falte o venga con otro tipo toma el valor del respaldo sin romper el resto.
 * Pura: no lee ni escribe nada. Devuelve un objeto congelado.
 */
export function normalizarConfiguracion(cuerpo: unknown): ConfiguracionPublica {
  if (!esObjeto(cuerpo)) {
    return RESPALDO_CONFIGURACION;
  }
  const respaldo = RESPALDO_CONFIGURACION.reglas;
  const reglas = objeto(cuerpo.reglas);
  const pagos = objeto(reglas.pagos);
  return congelar({
    salon: porCampos(cuerpo.salon, RESPALDO_CONFIGURACION.salon),
    horario: horario(cuerpo.horario),
    contenido: contenido(cuerpo.contenido),
    anticiposActivos: campo(cuerpo.anticiposActivos, RESPALDO_CONFIGURACION.anticiposActivos),
    reglas: {
      citas: reglasCitas(reglas.citas),
      tienda: porCampos(reglas.tienda, respaldo.tienda),
      revocacion: revocacion(reglas.revocacion),
      pagos: {
        mercadoPagoTienda: campo(pagos.mercadoPagoTienda, respaldo.pagos.mercadoPagoTienda),
        mercadoPagoAnticipos: campo(pagos.mercadoPagoAnticipos, respaldo.pagos.mercadoPagoAnticipos),
        metodosSalon: metodosSalon(pagos.metodosSalon),
        transferencia: transferencia(pagos.transferencia),
      },
      diasInhabiles: diasInhabiles(reglas.diasInhabiles),
    },
    textos: textos(cuerpo.textos),
  });
}

// ── Archivo en disco ─────────────────────────────────────────────────────────────────────────

/**
 * Se guarda con expo-file-system y no con SecureStore: SecureStore limita cada valor a unos 2 KB en
 * Android (los textos del sitio lo pasan) y estos datos no son secretos. Va en Paths.document y no
 * en la caché para que el sistema no lo borre. El File y Paths solo se tocan aquí dentro de
 * try/catch: si el acceso falla (por ejemplo, un simulador sin Paths), se sigue sin disco.
 */
function archivo(): File {
  return new File(Paths.document, NOMBRE_ARCHIVO);
}

/** Lo guardado en el archivo, ya normalizado; null si no hay, no se puede leer o está dañado. */
async function leerArchivo(): Promise<EstadoConfiguracion | null> {
  try {
    const guardado = archivo();
    if (!guardado.exists) {
      return null;
    }
    const datos: unknown = JSON.parse(await guardado.text());
    if (!esObjeto(datos) || datos.version !== VERSION_ARCHIVO || !esObjeto(datos.configuracion)) {
      return null;
    }
    return {
      // Un archivo de antes de esta versión pudo traer transferencia: tampoco se usa.
      configuracion: congelar(sinTransferencia(normalizarConfiguracion(datos.configuracion))),
      origen: 'archivo',
      leidoEn: esEnteroNoNegativo(datos.leidoEn) ? datos.leidoEn : null,
    };
  } catch {
    return null;
  }
}

/** La configuración sin los datos de transferencia: así se guarda en el archivo. */
function sinTransferencia(configuracion: ConfiguracionPublica): ConfiguracionPublica {
  const { reglas } = configuracion;
  return { ...configuracion, reglas: { ...reglas, pagos: { ...reglas.pagos, transferencia: null } } };
}

/**
 * Guarda la configuración normalizada (sin datos de transferencia) y la fecha de la lectura. Si
 * falla, la app sigue igual.
 */
function escribirArchivo({ configuracion, leidoEn }: EstadoConfiguracion): void {
  try {
    const destino = archivo();
    if (!destino.exists) {
      destino.create();
    }
    destino.write(JSON.stringify({ version: VERSION_ARCHIVO, leidoEn, configuracion: sinTransferencia(configuracion) }));
  } catch {
    // Sin disco: la próxima apertura usará el respaldo.
  }
}

// ── Estado en memoria (Singleton) y suscriptores (Observer) ──────────────────────────────────

const ESTADO_INICIAL: EstadoConfiguracion = Object.freeze({
  configuracion: RESPALDO_CONFIGURACION,
  origen: 'respaldo',
  leidoEn: null,
});

let estado: EstadoConfiguracion = ESTADO_INICIAL;
const oyentes = new Set<() => void>();
let enVuelo: Promise<ResultadoRefresco> | null = null;
/**
 * Por qué falló la última lectura de red (null si salió bien o si todavía no hubo ninguna). Va aparte
 * del estado: una falla que conserva la memoria no avisa a los suscriptores de la configuración, sino
 * a los de suscribirErrorRefresco.
 */
let ultimoError: ApiError | ErrorDeRed | null = null;
const oyentesError = new Set<() => void>();

/** Fija el resultado de la última lectura de red y avisa a quien lo observa. */
function fijarUltimoError(error: ApiError | ErrorDeRed | null): void {
  ultimoError = error;
  for (const oyente of [...oyentesError]) {
    try {
      oyente();
    } catch {
      // Un oyente que falla no impide avisar a los demás.
    }
  }
}

function fijar(nuevo: EstadoConfiguracion): void {
  estado = Object.freeze(nuevo);
  for (const oyente of [...oyentes]) {
    try {
      oyente();
    } catch {
      // Un oyente que falla no impide avisar a los demás.
    }
  }
}

/** Si en memoria solo está el respaldo, sube lo guardado en el archivo (y avisa). */
async function subirArchivoSiNoHayNada(): Promise<void> {
  if (estado.origen !== 'respaldo') {
    return;
  }
  const guardado = await leerArchivo();
  if (guardado && estado.origen === 'respaldo') {
    fijar(guardado);
  }
}

// ── API pública ──────────────────────────────────────────────────────────────────────────────

/** La configuración que hay en memoria (o el respaldo), al instante. Está congelada. */
export function obtenerConfiguracion(): ConfiguracionPublica {
  return estado.configuracion;
}

/** Estado completo para useSyncExternalStore: el mismo objeto mientras no cambie. */
export function estadoConfiguracion(): EstadoConfiguracion {
  return estado;
}

/** true si la memoria no viene de la red o si ya pasó VIGENCIA_CONFIGURACION_MS desde la lectura. */
export function cacheVencida(ahora: number = Date.now()): boolean {
  return estado.origen !== 'red' || estado.leidoEn === null || ahora - estado.leidoEn >= VIGENCIA_CONFIGURACION_MS;
}

/**
 * El error de la última lectura de red, o null si salió bien o todavía no hubo ninguna. Sirve para
 * decir "sin conexión" solo cuando de verdad no hubo red. Nunca se muestra a la clienta.
 */
export function errorUltimoRefresco(): ApiError | ErrorDeRed | null {
  return ultimoError;
}

/**
 * Registra un oyente que se llama al terminar cada lectura de red, salga bien o mal (para
 * useSyncExternalStore con errorUltimoRefresco). Devuelve cómo quitarlo.
 */
export function suscribirErrorRefresco(oyente: () => void): () => void {
  oyentesError.add(oyente);
  return () => {
    oyentesError.delete(oyente);
  };
}

/** Registra un oyente que se llama cada vez que llega una versión nueva. Devuelve cómo quitarlo. */
export function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

async function ejecutarRefresco(): Promise<ResultadoRefresco> {
  try {
    const cuerpo = await apiGet<unknown>(RUTA, { publica: true });
    if (!esObjeto(cuerpo)) {
      // Un 200 sin objeto JSON (por ejemplo, el portal de un wifi público) no pisa lo guardado.
      throw crearErrorApi({ tipo: 'red' });
    }
    const nuevo: EstadoConfiguracion = { configuracion: normalizarConfiguracion(cuerpo), origen: 'red', leidoEn: Date.now() };
    escribirArchivo(nuevo);
    fijarUltimoError(null);
    fijar(nuevo);
    return { configuracion: nuevo.configuracion, origen: 'red' };
  } catch (causa) {
    // Solo llegan ApiError o ErrorDeRed; otro error (por ejemplo, sin URL de la API) cuenta como sin red.
    const error = causa instanceof ApiError || causa instanceof ErrorDeRed ? causa : crearErrorApi({ tipo: 'red' });
    fijarUltimoError(error);
    await subirArchivoSiNoHayNada();
    return { configuracion: estado.configuracion, origen: estado.origen, error };
  }
}

/**
 * Pide la configuración a la red. Si falla, conserva lo que haya en memoria; si no había nada,
 * usa el archivo guardado y por último el respaldo. Dos llamadas a la vez comparten una sola
 * petición. Nunca rechaza.
 */
export function refrescar(): Promise<ResultadoRefresco> {
  enVuelo ??= ejecutarRefresco().finally(() => {
    enVuelo = null;
  });
  return enVuelo;
}

/**
 * La configuración en este orden: memoria vigente, red, archivo guardado y respaldo. Nunca rechaza.
 */
export async function cargarConfiguracion(): Promise<ConfiguracionPublica> {
  if (!cacheVencida()) {
    return estado.configuracion;
  }
  return (await refrescar()).configuracion;
}

/**
 * Para la pantalla de carga: como cargarConfiguracion, pero si en `ms` no terminó resuelve con el
 * archivo guardado (o el respaldo) y deja que la red siga; cuando llega, avisa a los suscriptores.
 */
export function cargarConLimite(ms: number = TIEMPO_MAXIMO_CARGA_MS): Promise<ConfiguracionPublica> {
  let limite: ReturnType<typeof setTimeout> | undefined;
  const alVencer = new Promise<ConfiguracionPublica>((resolve) => {
    limite = setTimeout(() => {
      resolve(subirArchivoSiNoHayNada().then(obtenerConfiguracion));
    }, ms);
  });
  return Promise.race([cargarConfiguracion(), alVencer]).finally(() => clearTimeout(limite));
}

/**
 * Solo para pruebas: vuelve al respaldo y olvida suscriptores y la petición en vuelo. Los módulos
 * se comparten entre las pruebas de un archivo, así que cada prueba empieza con esto.
 */
export function reiniciarConfiguracionPublica(): void {
  estado = ESTADO_INICIAL;
  oyentes.clear();
  enVuelo = null;
  ultimoError = null;
  oyentesError.clear();
}
