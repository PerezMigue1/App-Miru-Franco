import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { idDeCompra, tipoComprobante, type TipoComprobante } from '@/shared/api/comprobantesDeCompra';
import { mensajeParaClienta } from '@/shared/api/mensajesError';
import { useEsperaLimite } from '@/shared/api/useEsperaLimite';
import { useTextos } from '@/shared/api/useTextos';

import { esComprobanteNoEncontrado, obtenerComprobante, type Comprobante } from '../models/comprobanteModel';
import { presentarComprobante, type TicketVisible } from './presentacionComprobante';

// La vista no importa de models/: recibe estos tipos del viewmodel.
export type { DatoTicket, FilaMonto, LineaVisible, TicketVisible } from './presentacionComprobante';

/** 'invalido': el enlace no trae un tipo conocido o un id entero positivo (no se pide nada). */
export type EstadoComprobante = 'invalido' | 'cargando' | 'listo' | 'noEncontrado' | 'error';

export interface ComprobanteViewModel {
  estado: EstadoComprobante;
  /** El ticket listo para pintar; null si no hay comprobante. */
  ticket: TicketVisible | null;
  /** Con estado 'error': por qué no se cargó, en texto para la clienta; null en otro caso. */
  mensajeError: string | null;
  /** "Reintentar" o, mientras dura la espera de un 429, "Reintentar (N s)". */
  textoReintentar: string;
  /** Tras un 429 el botón queda deshabilitado hasta que pase la espera. */
  reintentarDeshabilitado: boolean;
  reintentar: () => void;
  regresar: () => void;
}

/** Adónde vuelve Volver si no hay pantalla debajo (por ejemplo, al abrir el enlace de un aviso). */
const VOLVER_A: Readonly<Record<TipoComprobante, string>> = {
  pedido: '/mis-pedidos',
  cita: '/mis-citas',
  venta: '/notificaciones',
};

/** Un parámetro de la ruta tal como lo entrega Expo Router. */
type ParametroRuta = string | string[] | undefined;

/** Un parámetro de la ruta que llegó una sola vez; undefined si vino repetido o no vino. */
const unico = (valor: ParametroRuta) => (Array.isArray(valor) ? undefined : valor);

/**
 * Pantalla del comprobante de una compra (GP-09): /comprobante?tipo=pedido|cita|venta&id=N. Con un
 * enlace que no sirve no pide nada. Un 404 es "no lo encontramos en tu cuenta"; sin red, un 5xx o una
 * respuesta que no es un comprobante, el mensaje para la clienta y Reintentar; un 429 además deja
 * Reintentar deshabilitado con su cuenta regresiva hasta que pase la espera del servidor.
 */
export function useComprobanteViewModel(
  tipoParametro: string | string[] | undefined,
  idParametro: string | string[] | undefined,
): ComprobanteViewModel {
  const router = useRouter();
  const texto = useTextos();
  const espera = useEsperaLimite();
  const { esperarSiLimite } = espera;
  const tipo = tipoComprobante(unico(tipoParametro));
  const id = idDeCompra(unico(idParametro));
  const valido = tipo !== null && id !== null;
  const [estado, setEstado] = useState<EstadoComprobante>(valido ? 'cargando' : 'invalido');
  const [comprobante, setComprobante] = useState<Comprobante | null>(null);
  const [error, setError] = useState<unknown>(null);
  // Solo la última solicitud escribe el estado (reintentos o pantalla desmontada).
  const solicitud = useRef(0);

  const cargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    if (tipo === null || id === null) {
      setEstado('invalido');
      return;
    }
    setEstado('cargando');
    obtenerComprobante(tipo, id)
      .then((recibido) => {
        if (actual === solicitud.current) {
          setComprobante(recibido);
          setEstado('listo');
        }
      })
      .catch((error_: unknown) => {
        if (actual !== solicitud.current) {
          return;
        }
        setComprobante(null);
        if (esComprobanteNoEncontrado(error_)) {
          setEstado('noEncontrado');
          return;
        }
        esperarSiLimite(error_);
        setError(error_);
        setEstado('error');
      });
  }, [tipo, id, esperarSiLimite]);

  useEffect(() => {
    cargar();
    return () => {
      solicitud.current += 1;
    };
  }, [cargar]);

  const reintentar = useCallback(() => {
    if (!espera.activa) {
      cargar();
    }
  }, [cargar, espera.activa]);

  const regresar = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace((tipo ? VOLVER_A[tipo] : '/inicio') as Href);
    }
  }, [router, tipo]);

  return {
    estado,
    ticket: estado === 'listo' && comprobante ? presentarComprobante(comprobante, texto) : null,
    mensajeError: estado === 'error' ? mensajeParaClienta(error) : null,
    textoReintentar: espera.activa
      ? texto('comprobante.app.reintentarEspera', { segundos: espera.restantes })
      : texto('comprobante.app.reintentar'),
    reintentarDeshabilitado: espera.activa,
    reintentar,
    regresar,
  };
}
