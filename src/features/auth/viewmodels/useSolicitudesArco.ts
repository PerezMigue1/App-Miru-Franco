import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from '@/shared/api/apiClient';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos, type FuncionTexto } from '@/shared/api/useTextos';
import { fechaLargaLegible } from '@/shared/ui/fechasLegibles';
import type { TonoBadge } from '@/shared/ui/tonoBadge';
import { useCandado } from '@/shared/ui/useCandado';

import {
  CODE_CANCELACION_ABIERTA,
  crearSolicitudArco,
  folioCancelacionAbierta,
  LARGO_DESCRIPCION_ARCO,
  misSolicitudesArco,
  TIPOS_ARCO,
  type EstadoArco,
  type SolicitudArco,
  type TipoArco,
} from '../models/arcoModel';
import type { AvisoPrivacidad, EstadoCarga } from './usePermisosPrivacidad';

/** Una solicitud lista para pintar, con sus fechas en el día local del teléfono. */
export interface FilaSolicitudVista {
  id: string;
  tipo: string;
  folio: string;
  estado: string;
  /** Color de la insignia del estado. */
  tono: TonoBadge;
  /** Enviada, plazo de respuesta, respondida, plazo para aplicarla y atendida (las que haya). */
  fechas: string[];
  etiquetaDescripcion: string;
  descripcion: string | null;
  etiquetaRespuesta: string;
  respuesta: string | null;
  /** Lo que TalkBack lee de corrido: tipo, folio y estado. */
  accessibilityLabel: string;
}

export interface OpcionTipoArco {
  tipo: TipoArco;
  titulo: string;
  ayuda: string;
  elegida: boolean;
  elegir: () => void;
}

export interface HojaSolicitudVista {
  visible: boolean;
  titulo: string;
  texto: string;
  pregunta: string;
  /** Ninguna elegida al abrir. */
  opciones: OpcionTipoArco[];
  etiquetaDescripcion: string;
  ayudaDescripcion: string;
  largoMaximo: number;
  descripcion: string;
  setDescripcion: (texto: string) => void;
  textoEnviar: string;
  /** Sin tipo elegido o durante la espera de un 429. */
  enviarDeshabilitado: boolean;
  pistaSinTipo: string | null;
  enviando: boolean;
  enviar: () => void;
  /** Error al enviar (se anuncia), o null. */
  error: string | null;
  /**
   * Con el 409 CANCELACION_ABIERTA, "Folio de tu solicitud abierta: ARCO-..." en su propia línea,
   * aparte del mensaje (el folio llega en errors.folio); null si no hay.
   */
  detalleError: string | null;
  textoCancelar: string;
  cerrar: () => void;
}

export interface SolicitudesArcoViewModel {
  titulo: string;
  estado: EstadoCarga;
  textoCargando: string;
  error: string | null;
  textoReintentar: string;
  reintentar: () => void;
  textoVacia: string;
  filas: FilaSolicitudVista[];
  aviso: AvisoPrivacidad | null;
  textoNueva: string;
  abrirNueva: () => void;
  hoja: HojaSolicitudVista;
  /** Vuelve a pedir la lista (al volver a la pantalla o tras la oposición). */
  recargar: () => void;
}

const CLAVE_ESTADO: Record<EstadoArco, string> = {
  recibida: 'privacidad.app.estado.recibida',
  en_proceso: 'privacidad.app.estado.enProceso',
  respondida: 'privacidad.app.estado.respondida',
  atendida: 'privacidad.app.estado.atendida',
  rechazada: 'privacidad.app.estado.rechazada',
};

/** Como la web: recibida en azul, en proceso en ámbar, respondida neutra, atendida verde y rechazada en vino. */
const TONO_ESTADO: Record<EstadoArco, TonoBadge> = {
  recibida: 'info',
  en_proceso: 'aviso',
  respondida: 'neutro',
  atendida: 'exito',
  rechazada: 'peligro',
};

/** Etiqueta legible de un tipo ARCO, del catálogo. */
export function etiquetaTipoArco(texto: FuncionTexto, tipo: TipoArco): string {
  return texto(`privacidad.app.tipo.${tipo}`);
}

/**
 * Las fechas de la solicitud con el año, mes y día locales (nunca por UTC). Los plazos solo se dicen
 * mientras corren: el de respuesta antes de responder y el de aplicarla mientras está respondida.
 */
function fechasDe(texto: FuncionTexto, solicitud: SolicitudArco): string[] {
  const linea = (clave: string, iso: string | null) => {
    const fecha = iso ? fechaLargaLegible(new Date(iso)) : '';
    return fecha ? texto(clave, { fecha }) : '';
  };
  const abierta = solicitud.estado === 'recibida' || solicitud.estado === 'en_proceso';
  return [
    linea('privacidad.app.solicitudes.enviada', solicitud.creadaEn),
    abierta ? linea('privacidad.app.solicitudes.venceRespuesta', solicitud.venceRespuesta) : '',
    linea('privacidad.app.solicitudes.respondida', solicitud.respondidaEn),
    solicitud.estado === 'respondida'
      ? linea('privacidad.app.solicitudes.venceEfectividad', solicitud.venceEfectividad)
      : '',
    linea('privacidad.app.solicitudes.atendida', solicitud.atendidaEn),
  ].filter(Boolean);
}

export function filaSolicitud(texto: FuncionTexto, solicitud: SolicitudArco): FilaSolicitudVista {
  const tipo = etiquetaTipoArco(texto, solicitud.tipo);
  const folio = texto('privacidad.app.solicitudes.folio', { folio: solicitud.folio });
  const estado = texto(CLAVE_ESTADO[solicitud.estado]);
  return {
    id: solicitud.id,
    tipo,
    folio,
    estado,
    tono: TONO_ESTADO[solicitud.estado],
    fechas: fechasDe(texto, solicitud),
    etiquetaDescripcion: texto('privacidad.app.solicitudes.tuSolicitud'),
    descripcion: solicitud.descripcion,
    etiquetaRespuesta: texto('privacidad.app.solicitudes.respuesta'),
    respuesta: solicitud.respuesta,
    accessibilityLabel: `${tipo}, ${folio}, ${estado}`,
  };
}

/**
 * Mis solicitudes ARCO (GP-09): la lista de GET /api/arco/mias y la hoja para crear una (tipo sin
 * elegir al abrir y descripción opcional de hasta 2000 caracteres). Al crearla se cierra la hoja, se
 * avisa el folio y se recarga la lista. El 409 CANCELACION_ABIERTA y los demás errores se deciden por
 * code y estado en mensajeParaClienta; con el 409 el folio de la cancelación abierta sale aparte y la
 * lista se vuelve a pedir. Un 429 deja "Enviar" en espera.
 */
export function useSolicitudesArco(): SolicitudesArcoViewModel {
  const texto = useTextos();
  const espera = useEsperaLimite();
  const candado = useCandado();
  const [estado, setEstado] = useState<EstadoCarga>('cargando');
  const [solicitudes, setSolicitudes] = useState<SolicitudArco[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<AvisoPrivacidad | null>(null);
  const [visible, setVisible] = useState(false);
  const [tipo, setTipo] = useState<TipoArco | null>(null);
  const [descripcion, setDescripcionCruda] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [errorHoja, setErrorHoja] = useState<string | null>(null);
  const [folioAbierta, setFolioAbierta] = useState<string | null>(null);
  const turno = useRef(0);
  const montado = useRef(true);

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
      turno.current++;
    };
  }, []);

  const recargar = useCallback(() => {
    const actual = ++turno.current;
    setError(null);
    setEstado((previo) => (previo === 'lista' ? previo : 'cargando'));
    misSolicitudesArco()
      .then((lista) => {
        if (turno.current === actual) {
          setSolicitudes(lista);
          setEstado('lista');
        }
      })
      .catch((causa: unknown) => {
        if (turno.current === actual) {
          setError(mensajeParaClienta(causa, { respaldo: texto('privacidad.app.solicitudes.error') }));
          setEstado('error');
        }
      });
  }, [texto]);

  const reintentar = () => {
    setEstado('cargando');
    recargar();
  };

  const abrirNueva = () => {
    setTipo(null);
    setDescripcionCruda('');
    setErrorHoja(null);
    setFolioAbierta(null);
    setAviso(null);
    setVisible(true);
  };

  const cerrar = () => {
    if (!enviando) {
      setVisible(false);
    }
  };

  const enviarSolicitud = async () => {
    if (tipo === null) {
      return;
    }
    setEnviando(true);
    setErrorHoja(null);
    setFolioAbierta(null);
    try {
      const creada = await crearSolicitudArco({ tipo, descripcion });
      if (!montado.current) {
        return;
      }
      setVisible(false);
      setAviso({ tono: 'exito', texto: texto('privacidad.app.hoja.lista', { folio: creada.folio }) });
      recargar();
    } catch (causa) {
      if (montado.current) {
        espera.esperarSiLimite(causa);
        setErrorHoja(mensajeParaClienta(causa, { respaldo: texto('privacidad.app.hoja.error') }));
        if (causa instanceof ApiError && causa.code === CODE_CANCELACION_ABIERTA) {
          // Ya hay una abierta: su folio aparte y la lista al día (puede que no se viera todavía).
          setFolioAbierta(folioCancelacionAbierta(causa));
          recargar();
        }
      }
    } finally {
      if (montado.current) {
        setEnviando(false);
      }
    }
  };

  const sinTipo = tipo === null;
  const textoEnviar = texto(enviando ? 'privacidad.app.hoja.enviando' : 'privacidad.app.hoja.enviar');

  return {
    titulo: texto('privacidad.app.solicitudes.titulo'),
    estado,
    textoCargando: texto('privacidad.app.solicitudes.cargando'),
    error,
    textoReintentar: texto('privacidad.app.reintentar'),
    reintentar,
    textoVacia: texto('privacidad.app.solicitudes.vacia'),
    filas: solicitudes.map((solicitud) => filaSolicitud(texto, solicitud)),
    aviso,
    textoNueva: texto('privacidad.app.solicitudes.nueva'),
    abrirNueva,
    hoja: {
      visible,
      titulo: texto('privacidad.app.hoja.titulo'),
      texto: texto('privacidad.app.hoja.texto'),
      pregunta: texto('privacidad.app.hoja.pregunta'),
      opciones: TIPOS_ARCO.map((opcion) => ({
        tipo: opcion,
        titulo: etiquetaTipoArco(texto, opcion),
        ayuda: texto(`privacidad.app.tipoAyuda.${opcion}`),
        elegida: opcion === tipo,
        elegir: () => {
          if (!enviando) {
            setTipo(opcion);
            setErrorHoja(null);
            setFolioAbierta(null);
          }
        },
      })),
      etiquetaDescripcion: texto('privacidad.app.hoja.descripcion'),
      ayudaDescripcion: texto('privacidad.app.hoja.ayudaDescripcion', { limite: LARGO_DESCRIPCION_ARCO }),
      largoMaximo: LARGO_DESCRIPCION_ARCO,
      descripcion,
      setDescripcion: (valor) => setDescripcionCruda(valor.slice(0, LARGO_DESCRIPCION_ARCO)),
      textoEnviar: espera.texto ?? textoEnviar,
      enviarDeshabilitado: sinTipo || espera.activa,
      pistaSinTipo: sinTipo ? texto('privacidad.app.hoja.pistaSinTipo') : null,
      enviando,
      enviar: () => {
        if (!sinTipo && !enviando && !espera.activa) {
          candado(enviarSolicitud);
        }
      },
      error: errorHoja,
      detalleError: folioAbierta ? texto('privacidad.arco.folioAbierta', { folio: folioAbierta }) : null,
      textoCancelar: texto('privacidad.app.cancelar'),
      cerrar,
    },
    recargar,
  };
}
