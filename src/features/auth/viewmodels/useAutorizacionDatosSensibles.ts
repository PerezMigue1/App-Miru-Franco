import { useCallback, useEffect, useRef, useState } from 'react';

import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos } from '@/shared/api/useTextos';

import {
  autorizarDatosSensibles,
  esTextoCambiado,
  obtenerTextoDatosSensibles,
  parrafosDe,
  type AutorizacionDatosSensibles,
  type RutaDatosSensibles,
  type TextoDatosSensibles,
} from '../models/datosSensibles';

export interface OpcionesAutorizacion {
  /** Ruta de la app para la constancia (rutaOrigen). */
  ruta: RutaDatosSensibles;
  /**
   * true: con sesión, "Autorizo" la registra en el backend (POST /api/consentimientos/datos-sensibles).
   * false: en el registro (sin sesión) solo la devuelve, para mandarla con la cuenta nueva.
   */
  registrarEnServidor: boolean;
  /** La clienta autorizó (y, con sesión, el backend ya la guardó): versión y hash del texto que leyó. */
  onAutorizada: (autorizacion: AutorizacionDatosSensibles) => void;
}

export interface AutorizacionDatosSensiblesViewModel {
  visible: boolean;
  /** Abre la hoja: pide el texto vigente y deja la casilla sin marcar. */
  abrir: () => void;
  /**
   * "Ahora no", el velo o Atrás: cierra sin autorizar. Mientras se envía "Autorizo" no hace nada: la
   * respuesta del backend decide (si la cerrara, la app mostraría un estado contrario al guardado).
   */
  cerrar: () => void;
  /** Cierra aunque se esté enviando (la sesión cambió o se cerró): la respuesta ya no cuenta. */
  descartar: () => void;
  titulo: string;
  /** Pidiendo el texto. */
  cargando: boolean;
  textoCargando: string;
  /** El texto completo del backend, por párrafo; [] mientras no hay. */
  parrafos: string[];
  /** "Versión 1.0 del texto de la autorización.", o null sin texto. */
  version: string | null;
  /** No se pudo cargar el texto (con su botón para reintentar). */
  errorTexto: string | null;
  textoReintentar: string;
  reintentar: () => void;
  casilla: string;
  marcada: boolean;
  alternar: (marcada: boolean) => void;
  textoAutorizo: string;
  /** Sin texto, sin la casilla marcada o durante la espera de un 429. */
  autorizoDeshabilitado: boolean;
  enviando: boolean;
  autorizar: () => void;
  /** Error al autorizar (se anuncia), o null. */
  error: string | null;
  textoAhoraNo: string;
}

/**
 * Autorización expresa de datos sensibles (alergias): muestra el texto completo que da el backend,
 * la casilla siempre empieza sin marcar y "Autorizo" es la acción principal. Si el texto cambió
 * mientras la clienta lo leía (400), se vuelve a pedir y la casilla se desmarca. Un 429 deja
 * "Autorizo" en espera. Lo comparten el registro, editar perfil, la oferta al iniciar sesión y Mis
 * datos.
 */
export function useAutorizacionDatosSensibles({
  ruta,
  registrarEnServidor,
  onAutorizada,
}: OpcionesAutorizacion): AutorizacionDatosSensiblesViewModel {
  const texto = useTextos();
  const espera = useEsperaLimite();
  const [visible, setVisible] = useState(false);
  const [contenido, setContenido] = useState<TextoDatosSensibles | null>(null);
  const [cargando, setCargando] = useState(false);
  const [errorTexto, setErrorTexto] = useState<string | null>(null);
  const [marcada, setMarcada] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Cada apertura (y cada recarga del texto) es un turno: una respuesta vieja no escribe.
  const turno = useRef(0);
  // Se está enviando "Autorizo" (en un ref para que cerrar lo lea sin cambiar de identidad).
  const enviandoRef = useRef(false);

  useEffect(
    () => () => {
      turno.current++;
    },
    [],
  );

  const cargarTexto = useCallback(() => {
    const actual = ++turno.current;
    setCargando(true);
    setErrorTexto(null);
    setContenido(null);
    setMarcada(false);
    obtenerTextoDatosSensibles()
      .then((recibido) => {
        if (turno.current === actual) {
          setContenido(recibido);
        }
      })
      .catch((causa: unknown) => {
        if (turno.current === actual) {
          setErrorTexto(mensajeParaClienta(causa, { respaldo: texto('datosSensibles.app.errorTexto') }));
        }
      })
      .finally(() => {
        if (turno.current === actual) {
          setCargando(false);
        }
      });
  }, [texto]);

  const abrir = useCallback(() => {
    setVisible(true);
    setError(null);
    setEnviando(false);
    cargarTexto();
  }, [cargarTexto]);

  const descartar = useCallback(() => {
    turno.current++;
    enviandoRef.current = false;
    setVisible(false);
    setMarcada(false);
    setEnviando(false);
    setCargando(false);
  }, []);

  const cerrar = useCallback(() => {
    if (!enviandoRef.current) {
      descartar();
    }
  }, [descartar]);

  const autorizar = useCallback(() => {
    if (!contenido || !marcada || enviando || espera.activa) {
      return;
    }
    const autorizacion: AutorizacionDatosSensibles = { version: contenido.version, hash: contenido.hash };
    if (!registrarEnServidor) {
      setVisible(false);
      setMarcada(false);
      onAutorizada(autorizacion);
      return;
    }
    const actual = turno.current;
    enviandoRef.current = true;
    setEnviando(true);
    setError(null);
    autorizarDatosSensibles(autorizacion, ruta)
      .then(() => {
        if (turno.current !== actual) {
          return;
        }
        setVisible(false);
        setMarcada(false);
        onAutorizada(autorizacion);
      })
      .catch((causa: unknown) => {
        if (turno.current !== actual) {
          return;
        }
        if (espera.esperarSiLimite(causa)) {
          setError(mensajeParaClienta(causa));
          return;
        }
        if (esTextoCambiado(causa)) {
          // Otra versión del texto: se vuelve a mostrar completo y hay que leerlo y marcar otra vez.
          setError(texto('datosSensibles.app.textoCambio'));
          enviandoRef.current = false;
          setEnviando(false);
          cargarTexto();
          return;
        }
        setError(mensajeParaClienta(causa, { respaldo: texto('datosSensibles.app.errorAutorizar') }));
      })
      .finally(() => {
        if (turno.current === actual) {
          enviandoRef.current = false;
          setEnviando(false);
        }
      });
  }, [contenido, marcada, enviando, espera, registrarEnServidor, onAutorizada, ruta, texto, cargarTexto]);

  return {
    visible,
    abrir,
    cerrar,
    descartar,
    titulo: texto('datosSensibles.app.titulo'),
    cargando,
    textoCargando: texto('datosSensibles.app.cargando'),
    parrafos: contenido ? parrafosDe(contenido.texto) : [],
    version: contenido ? texto('datosSensibles.app.version', { version: contenido.version }) : null,
    errorTexto,
    textoReintentar: texto('datosSensibles.app.reintentar'),
    reintentar: cargarTexto,
    casilla: texto('datosSensibles.app.casilla'),
    marcada,
    alternar: setMarcada,
    textoAutorizo:
      espera.texto ?? (enviando ? texto('datosSensibles.app.autorizando') : texto('datosSensibles.app.autorizo')),
    autorizoDeshabilitado: !contenido || !marcada || espera.activa,
    enviando,
    autorizar,
    error,
    textoAhoraNo: texto('datosSensibles.app.ahoraNo'),
  };
}
