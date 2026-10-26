import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { esDocumentoActualizado } from '@/shared/api/documentosActualizados';
import { abrirRutaEnWeb } from '@/shared/api/documentosLegales';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { vigenciaLegible, type VigenciaDocumento } from '@/shared/api/useDocumentoLegal';
import { useTextos } from '@/shared/api/useTextos';

import {
  aceptarPendiente,
  completarDatos,
  leerPendientes,
  esVersionCambiada,
  type DocumentoPendiente,
} from '../models/documentosPendientes';
import { useAuth } from './useAuth';

/**
 * Re-aceptación de documentos legales con sesión (GP-09): al iniciar sesión o al abrir la app con una
 * sesión guardada se consultan los pendientes; si hay, la pantalla obligatoria los muestra uno por uno
 * y la clienta no sale de ella hasta aceptarlos (o cerrar sesión). Si la consulta falla (sin red, 429,
 * 503...) no bloquea nada ni cierra la sesión: se vuelve a intentar al regresar a primer plano o en el
 * siguiente inicio de sesión.
 *
 * La fase vive en un solo estado de módulo (Singleton, con Observer para useSyncExternalStore): lo que
 * va después de los documentos (por ejemplo, ofrecer autorizar las alergias) espera a la fase 'listo'.
 */

/**
 * 'inactivo': sin sesión. 'consultando': pidiendo los pendientes. 'pendientes': la pantalla
 * obligatoria está a la vista. 'listo': no queda ninguno. 'fallido': no se pudo consultar (no bloquea).
 */
export type FaseReaceptacion = 'inactivo' | 'consultando' | 'pendientes' | 'listo' | 'fallido';

let faseActual: FaseReaceptacion = 'inactivo';
const oyentes = new Set<() => void>();

function fijarFase(fase: FaseReaceptacion): void {
  if (fase === faseActual) {
    return;
  }
  faseActual = fase;
  for (const oyente of [...oyentes]) {
    oyente();
  }
}

function suscribir(oyente: () => void): () => void {
  oyentes.add(oyente);
  return () => {
    oyentes.delete(oyente);
  };
}

const leerFase = (): FaseReaceptacion => faseActual;

/** Fase de la re-aceptación de la sesión actual (Observer). */
export function useFaseReaceptacion(): FaseReaceptacion {
  return useSyncExternalStore(suscribir, leerFase, leerFase);
}

/** Solo para pruebas: vuelve a la fase inicial y olvida los oyentes. */
export function reiniciarReaceptacion(): void {
  faseActual = 'inactivo';
  oyentes.clear();
}

/** Cómo se pide la lista (ver consultar). */
type ModoConsulta = 'inicial' | 'reconsulta' | 'reintento';

export interface DocumentosPendientesViewModel {
  /**
   * Con sesión, la consulta de los pendientes está en curso: la app queda cubierta por la carga
   * (sin botones) hasta saber si hay alguno. Nunca dura más que la petición.
   */
  cargando: boolean;
  /** Lo que anuncia el lector de pantalla durante la carga. */
  textoCargando: string;
  /** La pantalla obligatoria está a la vista. */
  visible: boolean;
  /** "Documento 1 de 2" con varios; null con uno solo. */
  paso: string | null;
  titulo: string;
  vigencia: VigenciaDocumento | null;
  /** Por qué se pide (versión nueva o nunca aceptado). */
  explicacion: string;
  /** Texto de la casilla (también su etiqueta para TalkBack). */
  casilla: string;
  marcada: boolean;
  alternar: (marcada: boolean) => void;
  textoAceptar: string;
  /** Sin la casilla marcada, mientras se envía o durante la espera de un 429. */
  aceptarDeshabilitado: boolean;
  enviando: boolean;
  aceptar: () => void;
  /** Error para la clienta (se anuncia), o null. */
  error: string | null;
  /** "Intenta de nuevo en N s" durante la espera de un 429, o null. */
  espera: string | null;
  abrirCompleto: () => void;
  avisoAbrir: string | null;
  textoCerrarSesion: string;
  pistaCerrarSesion: string;
  cerrandoSesion: boolean;
  cerrarSesion: () => void;
}

/**
 * Lógica de la pantalla de documentos pendientes. Se monta una sola vez, en la raíz: consulta por cada
 * clienta que entra (por su id) y olvida todo al cerrar la sesión.
 */
export function useDocumentosPendientes(): DocumentosPendientesViewModel {
  const texto = useTextos();
  const { estado, usuario, salir } = useAuth();
  const espera = useEsperaLimite();
  const fase = useFaseReaceptacion();
  const cuenta = estado === 'autenticado' ? (usuario?.id ?? null) : null;

  const [pendientes, setPendientes] = useState<DocumentoPendiente[]>([]);
  // Cuántos se aceptaron de la lista actual: para decir "Documento 2 de 2".
  const [aceptados, setAceptados] = useState(0);
  const [marcada, setMarcada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [cerrandoSesion, setCerrandoSesion] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [avisoAbrir, setAvisoAbrir] = useState<string | null>(null);
  // Solo cuenta la respuesta de la última consulta, y ninguna de una sesión que ya terminó.
  const turno = useRef(0);
  // Cambia con cada sesión: lo que llega de una sesión anterior (una aceptación en curso) no escribe.
  const sesion = useRef(0);
  // Se están trayendo el título y la página de los documentos (completarDatos): mientras un documento
  // sin página siga en camino, no se puede aceptar algo que la clienta todavía no puede abrir.
  const [completando, setCompletando] = useState(false);
  const completado = useRef<Promise<DocumentoPendiente[]> | null>(null);
  const listaActual = useRef<DocumentoPendiente[]>([]);
  useEffect(() => {
    listaActual.current = pendientes;
  });

  /**
   * Trae el título y la página de cada documento de `lista` y los pone en la lista a la vista. Con
   * forzarRed (tras un 400 de versión cambiada) los pide a la red aunque la memoria siga vigente.
   */
  const completar = useCallback((lista: DocumentoPendiente[], actual: number, forzarRed = false) => {
    setCompletando(true);
    const promesa = completarDatos(lista, { forzarRed });
    completado.current = promesa;
    void promesa.then((completos) => {
      if (turno.current !== actual) {
        return;
      }
      completado.current = null;
      setCompletando(false);
      setPendientes((actuales) =>
        actuales.map((pendiente) => completos.find((completo) => completo.slug === pendiente.slug) ?? pendiente),
      );
    });
  }, []);

  /**
   * Pide los pendientes. La consulta 'inicial' (al entrar y tras aceptar el último) pasa por
   * 'consultando', que cubre la app con la carga. Una 'reconsulta' (tras un 400 de versión cambiada)
   * deja la pantalla a la vista mientras llega y, si falla, conserva la lista: la clienta sigue sin
   * poder salir. Un 'reintento' (al volver a primer plano tras una falla) no cubre la app, que ya se
   * estaba usando: si encuentra pendientes, sale la pantalla obligatoria.
   */
  const consultar = useCallback(async (modo: ModoConsulta = 'inicial') => {
    const actual = ++turno.current;
    if (modo === 'inicial') {
      fijarFase('consultando');
    }
    try {
      // Solo se espera la lista: el título y la página de cada documento llegan después, sin
      // alargar la carga (mientras, el visor usa los de respaldo).
      const lista = await leerPendientes();
      if (turno.current !== actual) {
        return;
      }
      setPendientes(lista);
      setAceptados(0);
      setMarcada(false);
      fijarFase(lista.length > 0 ? 'pendientes' : 'listo');
      if (lista.length > 0) {
        completar(lista, actual, modo === 'reconsulta');
      } else {
        setCompletando(false);
      }
    } catch {
      if (turno.current !== actual) {
        return;
      }
      if (modo === 'reconsulta') {
        // Se conserva la lista: si su título y su página no habían llegado (la consulta anterior se
        // descartó), se vuelven a pedir.
        fijarFase('pendientes');
        completar(listaActual.current, actual, true);
        return;
      }
      // Sin red, límite, saturación o respuesta ilegible: no bloquea ni cierra la sesión.
      fijarFase('fallido');
    }
  }, [completar]);

  // Cada clienta que entra (inicio de sesión o sesión guardada) se consulta una vez; sin sesión, nada.
  useEffect(() => {
    sesion.current++;
    if (!cuenta) {
      turno.current++;
      setPendientes([]);
      setAceptados(0);
      setMarcada(false);
      setError(null);
      setEnviando(false);
      setCerrandoSesion(false);
      setCompletando(false);
      completado.current = null;
      fijarFase('inactivo');
      return undefined;
    }
    void consultar();
    return () => {
      // Cambió la cuenta o se desmontó: lo que llegue de esta sesión ya no cuenta, y la carga no se
      // queda a la vista esperando una respuesta que nadie va a escribir.
      turno.current++;
      sesion.current++;
      if (faseActual === 'consultando') {
        fijarFase('inactivo');
      }
    };
  }, [cuenta, consultar]);

  // Si la consulta falló, se reintenta al regresar a primer plano.
  useEffect(() => {
    if (fase !== 'fallido' || !cuenta) {
      return undefined;
    }
    const suscripcion = AppState.addEventListener('change', (estadoApp) => {
      if (estadoApp === 'active') {
        void consultar('reintento');
      }
    });
    return () => suscripcion.remove();
  }, [fase, cuenta, consultar]);

  const documento = fase === 'pendientes' ? (pendientes[0] ?? null) : null;
  const total = aceptados + pendientes.length;
  const numero = aceptados + 1;

  const aceptar = useCallback(() => {
    if (!documento || !marcada || enviando || espera.activa) {
      return;
    }
    const actual = sesion.current;
    setEnviando(true);
    setError(null);
    aceptarPendiente(documento)
      .then(() => {
        if (sesion.current !== actual) {
          return;
        }
        const restantes = pendientes.filter((pendiente) => pendiente.slug !== documento.slug);
        setPendientes(restantes);
        setAceptados((previos) => previos + 1);
        setMarcada(false);
        setAvisoAbrir(null);
        if (restantes.length === 0) {
          // Se confirma con el backend que no quedó nada (el salón pudo publicar otra versión mientras
          // tanto). Si la consulta falla, no bloquea: se reintenta al volver a primer plano.
          void consultar();
        }
      })
      .catch((causa: unknown) => {
        if (sesion.current !== actual) {
          return;
        }
        if (espera.esperarSiLimite(causa)) {
          setError(mensajeParaClienta(causa));
          return;
        }
        if (esVersionCambiada(causa)) {
          // El salón publicó otra versión: se vuelve a pedir la lista (y el documento a la red) y la
          // casilla queda sin marcar. Con el code del backend, el aviso común junto a la casilla.
          setError(texto(esDocumentoActualizado(causa) ? 'legal.documentoActualizado' : 'legal.pendientes.cambio'));
          void consultar('reconsulta');
          return;
        }
        setError(mensajeParaClienta(causa, { respaldo: texto('legal.pendientes.error') }));
      })
      .finally(() => {
        if (sesion.current === actual) {
          setEnviando(false);
        }
      });
  }, [documento, marcada, enviando, espera, pendientes, texto, consultar]);

  const cerrarSesion = useCallback(() => {
    if (cerrandoSesion) {
      return;
    }
    setCerrandoSesion(true);
    setError(null);
    salir()
      .then((cerrada) => {
        if (!cerrada) {
          setError(texto('legal.pendientes.errorCerrar'));
          setCerrandoSesion(false);
        }
      })
      .catch(() => {
        setError(texto('legal.pendientes.errorCerrar'));
        setCerrandoSesion(false);
      });
  }, [cerrandoSesion, salir, texto]);

  // Si el documento a la vista cambia de título (llegó el del servidor), la casilla marcada con el
  // título anterior ya no vale: se vuelve a marcar con el que se ve.
  const slugVisible = documento?.slug ?? null;
  const tituloVisible = documento?.titulo ?? null;
  useEffect(() => {
    setMarcada(false);
  }, [slugVisible, tituloVisible]);

  const ruta = documento?.ruta ?? null;
  const abrirCompleto = useCallback(() => {
    const abrir = (destino: string | null) => {
      if (!destino) {
        setAvisoAbrir(texto('legal.pendientes.sinAbrir'));
        return;
      }
      void abrirRutaEnWeb(destino).then((abierto) => {
        setAvisoAbrir(abierto ? null : texto('legal.pendientes.sinAbrir'));
      });
    };
    const enCamino = completado.current;
    if (!ruta && enCamino && slugVisible) {
      // La página del documento sigue en camino: se espera a que llegue antes de decir que no abrió.
      void enCamino.then((completos) => abrir(completos.find((completo) => completo.slug === slugVisible)?.ruta ?? null));
      return;
    }
    abrir(ruta);
  }, [ruta, slugVisible, texto]);

  const titulo = documento?.titulo || texto('legal.pendientes.tituloRespaldo');
  const version = documento?.version ?? '';
  return {
    cargando: cuenta !== null && fase === 'consultando',
    textoCargando: texto('legal.pendientes.cargando'),
    visible: documento !== null,
    paso: total > 1 ? texto('legal.pendientes.paso', { numero, total }) : null,
    titulo,
    vigencia: documento ? vigenciaLegible(documento.version, documento.vigenteDesde) : null,
    explicacion: documento?.versionAceptada
      ? texto('legal.pendientes.introNueva', { versionAceptada: documento.versionAceptada })
      : texto('legal.pendientes.introSinAceptar'),
    casilla: texto('legal.pendientes.casilla', { titulo, version }),
    marcada,
    alternar: setMarcada,
    textoAceptar: enviando ? texto('legal.pendientes.aceptando') : texto('legal.pendientes.aceptar'),
    aceptarDeshabilitado: !marcada || espera.activa || cerrandoSesion || (completando && !ruta),
    enviando,
    aceptar,
    error,
    espera: espera.texto,
    abrirCompleto,
    avisoAbrir,
    textoCerrarSesion: cerrandoSesion ? texto('legal.pendientes.cerrandoSesion') : texto('legal.pendientes.cerrarSesion'),
    pistaCerrarSesion: texto('legal.pendientes.pistaCerrarSesion'),
    cerrandoSesion,
    cerrarSesion,
  };
}
