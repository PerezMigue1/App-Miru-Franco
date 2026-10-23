import { useEffect, useSyncExternalStore } from 'react';

import { useTextos } from '@/shared/api/useTextos';

import { guardarPreferenciaAvisos, leerPreferenciaAvisos } from '../models/preferenciaAvisos';

/**
 * Interruptor "Avisos en la app" (GP-07.6): un solo estado en memoria para toda la app (Singleton,
 * con Observer para useSyncExternalStore) con la preferencia de la clienta en sesión. La raíz lo
 * prepara con useAvisosEnApp; Perfil lo cambia con useInterruptorAvisos. Apagado: no hay conexión
 * en vivo ni consulta de respaldo y no se muestra el aviso en pantalla; la bandeja se pide al
 * abrirla.
 */

interface EstadoPreferencia {
  /** Clienta en sesión; null sin sesión. */
  usuarioId: string | null;
  enApp: boolean;
  /** Ya se leyó del teléfono (o la clienta ya lo cambió): hasta entonces no se conecta nada. */
  lista: boolean;
}

let estado: EstadoPreferencia = Object.freeze({ usuarioId: null, enApp: true, lista: false });
const oyentes = new Set<() => void>();
/** Cambia con cada lectura o cambio: una lectura vieja ya no escribe. */
let lectura = 0;

function fijar(nuevo: EstadoPreferencia): void {
  estado = Object.freeze(nuevo);
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

function leerEstado(): EstadoPreferencia {
  return estado;
}

function apagadosEn(actual: EstadoPreferencia): boolean {
  return actual.usuarioId !== null && actual.lista && !actual.enApp;
}

/** La clienta en sesión apagó "Avisos en la app" (mientras no se sabe, no cuenta como apagado). */
export function avisosApagados(): boolean {
  return apagadosEn(estado);
}

/** Cambia la clienta en sesión y lee su preferencia del teléfono. Sin cambio de clienta no hace nada. */
export function prepararPreferenciaAvisos(usuarioId: string | null): void {
  if (usuarioId === estado.usuarioId) {
    return;
  }
  lectura += 1;
  const actual = lectura;
  fijar({ usuarioId, enApp: true, lista: false });
  if (usuarioId === null) {
    return;
  }
  void leerPreferenciaAvisos(usuarioId).then((enApp) => {
    if (actual === lectura) {
      fijar({ usuarioId, enApp, lista: true });
    }
  });
}

/** Enciende o apaga los avisos en la app para la clienta en sesión y lo guarda en el teléfono. */
export function cambiarAvisosEnApp(enApp: boolean): void {
  const { usuarioId } = estado;
  if (usuarioId === null || (estado.lista && estado.enApp === enApp)) {
    return;
  }
  // Una lectura que siguiera en camino ya no pisa lo que eligió la clienta.
  lectura += 1;
  fijar({ usuarioId, enApp, lista: true });
  void guardarPreferenciaAvisos(usuarioId, enApp);
}

/** Solo para pruebas: vuelve al estado inicial. */
export function reiniciarPreferenciaAvisos(): void {
  lectura += 1;
  fijar({ usuarioId: null, enApp: true, lista: false });
}

function useEstadoPreferencia(): EstadoPreferencia {
  return useSyncExternalStore(suscribir, leerEstado, leerEstado);
}

/**
 * Para la raíz: prepara la preferencia de la clienta en sesión (null sin sesión) y dice si la
 * conexión en vivo debe estar encendida. Mientras se lee del teléfono, devuelve false.
 */
export function useAvisosEnApp(usuarioId: string | null): boolean {
  useEffect(() => {
    prepararPreferenciaAvisos(usuarioId);
  }, [usuarioId]);
  const actual = useEstadoPreferencia();
  return usuarioId !== null && actual.usuarioId === usuarioId && actual.lista && actual.enApp;
}

/** Para el aviso en pantalla y la bandeja: la clienta apagó "Avisos en la app". */
export function useAvisosApagados(): boolean {
  return apagadosEn(useEstadoPreferencia());
}

export interface InterruptorAvisos {
  /** "Avisos en la app", del catálogo de textos. */
  titulo: string;
  /** Qué pasa con el interruptor como está (encendido o apagado), del catálogo de textos. */
  descripcion: string;
  encendido: boolean;
  /** Aún se lee la preferencia del teléfono: el interruptor se muestra deshabilitado. */
  cargando: boolean;
  cambiar: (enApp: boolean) => void;
}

/** Para la fila de Perfil. */
export function useInterruptorAvisos(): InterruptorAvisos {
  const actual = useEstadoPreferencia();
  const texto = useTextos();
  return {
    titulo: texto('perfil.avisos.titulo'),
    descripcion: texto(actual.enApp ? 'perfil.avisos.encendidos' : 'perfil.avisos.apagados'),
    encendido: actual.enApp,
    cargando: !actual.lista,
    cambiar: cambiarAvisosEnApp,
  };
}
