import { useCallback, useEffect, useMemo, useRef } from 'react';

import { useConfiguracionPublica } from '@/shared/api/useConfiguracionPublica';
import { useTextos, type FuncionTexto } from '@/shared/api/useTextos';

import {
  bloqueoDelDia,
  bloqueosDelMes,
  fechaLocal,
  primerDiaLibre as primerDiaLibreDe,
  type DiaBloqueado,
  type MesCalendario,
} from '../models/citaModel';

/** Día inhábil del mes con su motivo listo para mostrar. */
export interface InhabilDelMes {
  /** 'YYYY-MM-DD' local. */
  fecha: string;
  motivo: string;
}

/**
 * Lo que CalendarioMensual necesita para pintar los días sin citas del mes que muestra. Solo hoy y
 * los días que vienen: un día pasado ya está deshabilitado por pasado y se anuncia sin motivo.
 */
export interface BloqueosCalendario {
  /** Motivo del catálogo, listo para leer, de cada día bloqueado del mes ('YYYY-MM-DD' local). */
  dias: Readonly<Record<string, string>>;
  /** citas.calendario.leyenda si el mes tiene algún día bloqueado; '' si no tiene. */
  leyenda: string;
  /** Días inhábiles del mes, en orden, con su motivo (o citas.calendario.inhabilSinMotivo). */
  inhabiles: readonly InhabilDelMes[];
}

export interface CalendarioCitas {
  bloqueos: BloqueosCalendario;
  /** citas.calendario.cerrado: respaldo cuando el backend dice que no abre y no manda motivo. */
  motivoCerrado: string;
  /** El día no se puede elegir por la configuración. La función es siempre la misma. */
  estaBloqueado: (fecha: string) => boolean;
  /** El primer día libre desde `fecha` (incluida), o null. La función es siempre la misma. */
  primerDiaLibre: (fecha: string) => string | null;
}

/** El motivo del salón sin el punto final: la plantilla ya pone el suyo. */
function sinPuntoFinal(motivo: string): string {
  return motivo.replace(/[.\s]+$/, '');
}

/** El texto del catálogo que explica por qué ese día no tiene citas. */
export function motivoDeBloqueo(bloqueo: DiaBloqueado, texto: FuncionTexto): string {
  if (bloqueo.tipo === 'cerrado') {
    return texto('citas.calendario.cerrado');
  }
  const motivo = sinPuntoFinal(bloqueo.motivo);
  return motivo ? texto('citas.calendario.inhabil', { motivo }) : texto('citas.calendario.inhabilSinMotivo');
}

/**
 * Arma los textos del calendario para los días bloqueados de un mes, sin los anteriores a `hoy`
 * ('YYYY-MM-DD' local).
 */
export function armarBloqueos(todos: readonly DiaBloqueado[], texto: FuncionTexto, hoy: string): BloqueosCalendario {
  const lista = todos.filter((bloqueo) => bloqueo.fecha >= hoy);
  return {
    dias: Object.fromEntries(lista.map((bloqueo) => [bloqueo.fecha, motivoDeBloqueo(bloqueo, texto)])),
    leyenda: lista.length > 0 ? texto('citas.calendario.leyenda') : '',
    inhabiles: lista
      .filter((bloqueo) => bloqueo.tipo === 'inhabil')
      .map(({ fecha, motivo }) => ({
        fecha,
        motivo: sinPuntoFinal(motivo) || texto('citas.calendario.inhabilSinMotivo'),
      })),
  };
}

/**
 * Días sin citas para el calendario de la reserva y de reprogramar (GP-07.3): el horario y los días
 * inhábiles de la configuración pública (patrón Observer: se vuelve a pintar si llega otra versión)
 * con los textos del catálogo. Si con la configuración nueva el día elegido (`fecha`) queda
 * bloqueado, llama a `alBloquearse` para que el viewmodel lo limpie.
 */
export function useCalendarioCitas(
  mesVisible: MesCalendario,
  fecha: string | null,
  alBloquearse: () => void,
): CalendarioCitas {
  const { configuracion } = useConfiguracionPublica();
  const texto = useTextos();

  // Las funciones estables leen la configuración más reciente sin volver a crear los callbacks del
  // viewmodel (si cambiaran, la reserva volvería a cargar el servicio).
  const refConfiguracion = useRef(configuracion);
  useEffect(() => {
    refConfiguracion.current = configuracion;
  }, [configuracion]);

  useEffect(() => {
    if (fecha !== null && bloqueoDelDia(fecha, configuracion)) {
      alBloquearse();
    }
  }, [configuracion, fecha, alBloquearse]);

  const bloqueos = useMemo(
    () => armarBloqueos(bloqueosDelMes(mesVisible, configuracion), texto, fechaLocal(new Date())),
    [mesVisible, configuracion, texto],
  );

  const estaBloqueado = useCallback((dia: string) => bloqueoDelDia(dia, refConfiguracion.current) !== null, []);
  const primerDiaLibre = useCallback((dia: string) => primerDiaLibreDe(dia, refConfiguracion.current), []);

  return { bloqueos, motivoCerrado: texto('citas.calendario.cerrado'), estaBloqueado, primerDiaLibre };
}
