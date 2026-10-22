import * as WebBrowser from 'expo-web-browser';
import { useRouter, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { MENSAJE_SIN_CONEXION, esErrorDeRed } from '@/features/auth/models/AuthModel';
import { ApiError } from '@/shared/api/apiClient';
import { obtenerConfiguracion, suscribir } from '@/shared/api/configuracionPublica';
import { rutaVisorDocumento } from '@/shared/api/documentosLegales';
import { obtenerTexto } from '@/shared/api/textosSitio';
import { useCandado } from '@/shared/ui/useCandado';

import {
  avisoAnticipoEnSalon,
  crearPreferenciaAnticipo,
  esCanceladaPorAnticipo,
  esVigente,
  limiteAnticipo,
  motivoConflictoAnticipo,
  obtenerCita,
  obtenerEstadoAnticipo,
  pideAnticipo,
  REDIRECCION_ANTICIPO,
  type Cita,
} from '../models/citaModel';
import { textosAdvertenciaAnticipo } from '../models/formaPagoModel';
import { useAceptacionAnticipos, type AceptacionAnticipos } from './useAceptacionAnticipos';

// La vista no importa de models/: recibe estos tipos del viewmodel.
export type { Cita } from '../models/citaModel';
export type { AceptacionAnticipos } from './useAceptacionAnticipos';

/** Ruta de la app que se guarda con el consentimiento de la política al pagar desde esta pantalla. */
export const RUTA_ORIGEN_ANTICIPO = 'app/anticipo';

export type EstadoCargaAnticipo = 'cargando' | 'listo' | 'error' | 'noEncontrado';

/**
 * Estado del pago en esta pantalla:
 * - inicial: aún no se intenta pagar.
 * - abriendo: se pide la preferencia y se abre Mercado Pago (incluye el tiempo en el navegador).
 * - revisando: la clienta regresó y se consulta el estado real del anticipo.
 * - noCompletado: Mercado Pago no aprobó el pago (enProceso: lo está procesando todavía).
 * - errorRevision: no se pudo consultar el estado; el botón vuelve a consultar en lugar de pagar.
 * - error: no se pudo abrir el pago.
 * - cerrada: la cita ya no se puede pagar (plazo vencido o cita no vigente).
 */
export type EstadoPago =
  | { tipo: 'inicial' }
  | { tipo: 'abriendo' }
  | { tipo: 'revisando' }
  | { tipo: 'noCompletado'; enProceso: boolean }
  | { tipo: 'errorRevision'; mensaje: string }
  | { tipo: 'error'; mensaje: string }
  | { tipo: 'cerrada'; mensaje: string };

export interface AnticipoViewModel {
  estado: EstadoCargaAnticipo;
  cita: Cita | null;
  pago: EstadoPago;
  /**
   * "Paga antes de las 6:30 p. m." (o "Paga antes del miércoles 28 de octubre, 6:30 p. m."), o null
   * si no hay plazo. Con el anticipo en el salón va en avisoSalon.
   */
  limite: string | null;
  /** Anticipo pendiente que se paga en el salón: texto con la hora límite, o null. */
  avisoSalon: string | null;
  /** Anticipo en línea pendiente: el plazo con la regla de la cita (anticipos.plazoLinea), o null. */
  plazo: string | null;
  /** Qué pasa si no llega a la cita (regla de la cita), o null con el pago cerrado. */
  consecuencia: string | null;
  /** Casilla de la política: obligatoria antes de abrir Mercado Pago con el botón. */
  casilla: AceptacionAnticipos;
  /** El botón principal abre Mercado Pago (y entonces pide la casilla). */
  pideCasilla: boolean;
  /** Texto del enlace a la Política de anticipos y cancelación. */
  enlacePolitica: string;
  abrirPolitica: () => void;
  recargar: () => void;
  /** Acción del botón principal: pagar, volver a revisar el pago o ir a Mis citas. */
  accionPrincipal: () => void;
  regresar: () => void;
  verMisCitas: () => void;
}

const MENSAJE_NO_VIGENTE = 'Esta cita ya no está vigente.';
const MENSAJE_NO_ABRIO = 'No pudimos abrir el pago. Intenta de nuevo.';
const MENSAJE_NO_REVISO =
  'No pudimos revisar tu pago. Si ya pagaste, no pagues de nuevo: toca Revisar mi pago.';
const MENSAJE_SIN_NAVEGADOR =
  'No encontramos un navegador para abrir Mercado Pago. Activa Chrome u otro navegador e intenta de nuevo.';

function mensajeDeError(error: unknown, generico: string): string {
  return esErrorDeRed(error) ? MENSAJE_SIN_CONEXION : generico;
}

/**
 * Respaldo del regreso desde el navegador: se resuelve cuando la app pasa a segundo plano y vuelve
 * a estar activa. Devuelve la promesa y una función para soltarla.
 */
function esperarRegreso(): { promesa: Promise<void>; soltar: () => void } {
  let soltar = () => {};
  const promesa = new Promise<void>((resolve) => {
    let salio = AppState.currentState !== 'active';
    const suscripcion = AppState.addEventListener('change', (estado) => {
      if (estado !== 'active') {
        salio = true;
        return;
      }
      if (salio) {
        suscripcion.remove();
        resolve();
      }
    });
    soltar = () => {
      suscripcion.remove();
      resolve();
    };
  });
  return { promesa, soltar };
}

/**
 * Pago del anticipo de una cita con Mercado Pago (GP-06.2; también desde Mis citas en GP-06.3).
 * Con `pagarAlAbrir` (ruta con ?pagar=1) abre Mercado Pago solo, una vez, al terminar de cargar.
 * Con `revisarAlAbrir` (ruta con ?retorno=mp, regreso de Mercado Pago en arranque en frío) consulta
 * el estado del pago, una vez, al terminar de cargar.
 */
export function useAnticipoViewModel(
  citaId: string | undefined,
  pagarAlAbrir = false,
  revisarAlAbrir = false,
): AnticipoViewModel {
  const router = useRouter();
  const candado = useCandado();
  const configuracion = useSyncExternalStore(suscribir, obtenerConfiguracion, obtenerConfiguracion);
  const casilla = useAceptacionAnticipos(RUTA_ORIGEN_ANTICIPO);
  const [estado, setEstado] = useState<EstadoCargaAnticipo>('cargando');
  const [cita, setCita] = useState<Cita | null>(null);
  const [pago, setPago] = useState<EstadoPago>({ tipo: 'inicial' });
  // Solo la última solicitud de carga escribe el estado (reintentos rápidos o pantalla desmontada).
  const solicitud = useRef(0);
  const montada = useRef(true);
  // Suelta la espera del regreso del navegador si la pantalla se desmonta.
  const soltarEspera = useRef<(() => void) | null>(null);
  // El pago automático se intenta una sola vez por pantalla, aunque se recargue o se vuelva a enfocar.
  const pagoAutomaticoUsado = useRef(false);
  // Igual para la consulta del pago al volver de Mercado Pago en arranque en frío.
  const revisionAutomaticaUsada = useRef(false);

  const idLimpio = citaId?.trim() ?? '';

  const irAConfirmacion = useCallback(
    (id: string | number) => {
      router.replace(`/cita-confirmada/${encodeURIComponent(String(id))}` as Href);
    },
    [router],
  );

  const verMisCitas = useCallback(() => {
    router.replace('/mis-citas');
  }, [router]);

  const regresar = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/mis-citas');
    }
  }, [router]);

  const recargar = useCallback(() => {
    solicitud.current += 1;
    const actual = solicitud.current;
    if (idLimpio === '') {
      setCita(null);
      setEstado('noEncontrado');
      return;
    }
    setEstado('cargando');
    setPago({ tipo: 'inicial' });
    obtenerCita(idLimpio)
      .then((respuesta) => {
        if (actual !== solicitud.current) {
          return;
        }
        if (!pideAnticipo(respuesta)) {
          // Ya pagada o sin anticipo: el skeleton se queda mientras se reemplaza la pantalla.
          irAConfirmacion(respuesta.id);
          return;
        }
        setCita(respuesta);
        // Cancelada, completada, no asistió o cualquier otro estado final ya no admite pago. Si el
        // plazo venció lo dice el backend (estado y motivo), nunca el reloj del teléfono.
        if (!esVigente(respuesta)) {
          setPago({
            tipo: 'cerrada',
            mensaje: esCanceladaPorAnticipo(respuesta) ? obtenerTexto('anticipos.liberada') : MENSAJE_NO_VIGENTE,
          });
        }
        setEstado('listo');
      })
      .catch((error: unknown) => {
        if (actual !== solicitud.current) {
          return;
        }
        setCita(null);
        setEstado(error instanceof ApiError && error.status === 404 ? 'noEncontrado' : 'error');
      });
  }, [idLimpio, irAConfirmacion]);

  useEffect(() => {
    montada.current = true;
    recargar();
    return () => {
      montada.current = false;
      solicitud.current += 1;
      soltarEspera.current?.();
    };
  }, [recargar]);

  /**
   * Un 409 de la preferencia o del estado. Devuelve true si lo manejó: 'pagado' pasa a la
   * confirmación; 'vencido' y 'noVigente' cierran el pago y el botón lleva a Mis citas.
   */
  const manejarConflicto = useCallback(
    (error: unknown, id: string | number): boolean => {
      const motivo = motivoConflictoAnticipo(error);
      if (motivo === 'pagado') {
        irAConfirmacion(id);
        return true;
      }
      if (motivo === 'vencido' || motivo === 'noVigente') {
        setPago({
          tipo: 'cerrada',
          mensaje: motivo === 'vencido' ? obtenerTexto('anticipos.liberada') : MENSAJE_NO_VIGENTE,
        });
        return true;
      }
      return false;
    },
    [irAConfirmacion],
  );

  /** Consulta el estado real del anticipo y decide: confirmación, no completado o error. */
  const revisarEstado = useCallback(
    async (id: string | number) => {
      setPago({ tipo: 'revisando' });
      try {
        const resultado = await obtenerEstadoAnticipo(id);
        if (!montada.current) {
          return;
        }
        if (resultado === 'aprobado') {
          irAConfirmacion(id);
          return;
        }
        setPago({ tipo: 'noCompletado', enProceso: resultado === 'pendiente' });
      } catch (error) {
        if (!montada.current || manejarConflicto(error, id)) {
          return;
        }
        setPago({ tipo: 'errorRevision', mensaje: mensajeDeError(error, MENSAJE_NO_REVISO) });
      }
    },
    [irAConfirmacion, manejarConflicto],
  );

  const pagar = useCallback(
    async (id: string | number) => {
      setPago({ tipo: 'abriendo' });
      let initPoint: string;
      try {
        initPoint = await crearPreferenciaAnticipo(id);
      } catch (error) {
        if (!montada.current || manejarConflicto(error, id)) {
          return;
        }
        setPago({ tipo: 'error', mensaje: mensajeDeError(error, MENSAJE_NO_ABRIO) });
        return;
      }
      if (!montada.current) {
        return;
      }

      // Se escucha el regreso a primer plano antes de abrir para no perder el paso a segundo plano.
      const espera = esperarRegreso();
      soltarEspera.current = espera.soltar;
      try {
        // La sesión termina sola con el regreso de Mercado Pago (appmirufranco://anticipo/<id>) o
        // al cerrar la pestaña. El regreso a primer plano es el respaldo: lo que llegue primero
        // dispara una sola consulta del estado.
        await Promise.race([
          WebBrowser.openAuthSessionAsync(initPoint, REDIRECCION_ANTICIPO),
          espera.promesa,
        ]);
      } catch {
        espera.soltar();
        soltarEspera.current = null;
        if (montada.current) {
          setPago({ tipo: 'error', mensaje: MENSAJE_SIN_NAVEGADOR });
        }
        return;
      }
      espera.soltar();
      soltarEspera.current = null;
      if (!montada.current) {
        return;
      }
      await revisarEstado(id);
    },
    [manejarConflicto, revisarEstado],
  );

  // Con ?pagar=1, la primera carga lista abre el pago sin otro toque. Si falla o la clienta cierra
  // sin pagar, queda el estado normal con "Intentar de nuevo".
  useEffect(() => {
    if (!pagarAlAbrir || pagoAutomaticoUsado.current || estado !== 'listo' || !cita) {
      return;
    }
    pagoAutomaticoUsado.current = true;
    if (pago.tipo !== 'inicial' || !pideAnticipo(cita) || cita.id === '') {
      return;
    }
    const id = cita.id;
    candado(() => pagar(id));
  }, [pagarAlAbrir, estado, cita, pago.tipo, candado, pagar]);

  // Con ?retorno=mp, la primera carga lista consulta el pago (el webhook pudo no haber llegado):
  // aprobado pasa a la confirmación; si no, queda el estado de pago no completado o en proceso.
  useEffect(() => {
    if (!revisarAlAbrir || revisionAutomaticaUsada.current || estado !== 'listo' || !cita) {
      return;
    }
    revisionAutomaticaUsada.current = true;
    if (pago.tipo !== 'inicial' || !pideAnticipo(cita) || cita.id === '') {
      return;
    }
    const id = cita.id;
    candado(() => revisarEstado(id));
  }, [revisarAlAbrir, estado, cita, pago.tipo, candado, revisarEstado]);

  // Mercado Pago todavía procesa el pago (o lo revisa): la app nunca lo trata como no pagado.
  const enProceso = pago.tipo === 'noCompletado' && pago.enProceso;

  const accionPrincipal = useCallback(() => {
    if (pago.tipo === 'cerrada') {
      verMisCitas();
      return;
    }
    const id = cita?.id;
    if (id == null || id === '') {
      return;
    }
    // Con el pago en proceso se vuelve a consultar, nunca se crea otra preferencia (cobro doble).
    if (pago.tipo === 'errorRevision' || enProceso) {
      candado(() => revisarEstado(id));
      return;
    }
    // Pagar con el botón pide la casilla y el consentimiento, como la web (el pago automático de
    // ?pagar=1 llega justo después de reservar o del detalle, que ya lo registraron).
    candado(async () => {
      const aceptada = await casilla.aceptar();
      if (!montada.current) {
        return;
      }
      if (!aceptada.ok) {
        if (aceptada.mensaje) {
          setPago({ tipo: 'error', mensaje: aceptada.mensaje });
        }
        return;
      }
      await pagar(id);
    });
  }, [candado, casilla, cita, enProceso, pagar, pago.tipo, revisarEstado, verMisCitas]);

  const abrirPolitica = useCallback(() => {
    router.push(rutaVisorDocumento('anticipos'));
  }, [router]);

  // Una cita cerrada (cancelada, completada u otro estado final) ya no tiene plazo de pago.
  const abierta = cita != null && pago.tipo !== 'cerrada' && esVigente(cita);
  // En el salón y sin pago en curso: ni cita cerrada ni pago que Mercado Pago todavía procesa.
  const enSalon = abierta && cita.anticipoEnSalon && !enProceso;
  // Con el pago en proceso no se pide pagar antes de una hora: ya pagó o está pagando.
  const enLinea = abierta && !cita.anticipoEnSalon && !enProceso;
  const limite = enLinea ? limiteAnticipo(cita.anticipoVenceEn) : null;
  const advertencia =
    abierta && !enProceso
      ? textosAdvertenciaAnticipo({
          enSalon: cita.anticipoEnSalon,
          venceEn: cita.anticipoVenceEn,
          reglas: cita.reglas,
          config: configuracion,
        })
      : null;

  return {
    estado,
    cita,
    pago,
    limite: limite ? `Paga ${limite}` : null,
    avisoSalon: enSalon
      ? avisoAnticipoEnSalon(cita.anticipoVenceEn, new Date(), cita.reglas.minutosAntesPagoSalon, configuracion)
      : null,
    plazo: enLinea && advertencia ? advertencia[0] : null,
    consecuencia: advertencia ? advertencia[2] : null,
    casilla,
    pideCasilla: abierta && pago.tipo !== 'errorRevision' && !enProceso,
    enlacePolitica: obtenerTexto('anticipos.enlacePolitica', {}, configuracion),
    abrirPolitica,
    recargar,
    accionPrincipal,
    regresar,
    verMisCitas,
  };
}
