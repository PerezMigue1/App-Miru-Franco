/// <reference types="jest" />

import { refrescar, type DiaInhabil, type DiaSemana } from '@/shared/api/configuracionPublica';

import { cuerpoEspecialistas, ESPECIALISTAS_AGENDA, RUTA_ESPECIALISTAS } from './citasFicticias';
import { rutaConfiguracion } from './configuracionFicticia';
import { respuesta, type Manejador } from './servidorSimulado';

/**
 * Días sin citas de GP-07.3 para las pruebas: la configuración pública (GET
 * /api/configuracion-publica) con solo el horario por día y los días inhábiles (lo demás lo toma la
 * app del respaldo al normalizar), cómo dejarla en memoria en una prueba de viewmodel o servirla en
 * una de integración, los textos del catálogo que se esperan y la agenda con una especialista
 * oculta. Todos los datos son inventados.
 */

// ── Textos del catálogo (RESPALDO_TEXTOS de textosSitio) ─────────────────────────────────────

/** citas.calendario.cerrado. */
export const TEXTO_CERRADO = 'El salón no abre este día.';
/** citas.calendario.inhabil con { motivo }. */
export const textoInhabil = (motivo: string): string => `No hay citas este día: ${motivo}.`;
/** citas.calendario.inhabilSinMotivo. */
export const TEXTO_INHABIL_SIN_MOTIVO = 'No hay citas este día.';
/** citas.calendario.leyenda. */
export const LEYENDA_CALENDARIO = 'Los días atenuados no tienen citas: el salón no abre o es un día de descanso.';

// ── Configuración ────────────────────────────────────────────────────────────────────────────

export const DIAS_SEMANA: readonly DiaSemana[] = ['lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo'];

export interface OpcionesCalendario {
  /** Días de la semana que el salón no abre (por omisión, el domingo, como el respaldo). */
  cerrados?: readonly DiaSemana[];
  /** Días inhábiles { fecha 'YYYY-MM-DD', motivo } (por omisión, ninguno). */
  inhabiles?: readonly DiaInhabil[];
}

/** El salón abre los siete días (para probar el motivo que manda el backend de un día cerrado). */
export const SALON_ABRE_DIARIO: OpcionesCalendario = { cerrados: [] };

/** Cuerpo crudo de la configuración pública con ese horario y esos días inhábiles. */
export function configuracionCalendario({ cerrados = ['domingo'], inhabiles = [] }: OpcionesCalendario = {}): Record<
  string,
  unknown
> {
  return {
    horario: {
      dias: DIAS_SEMANA.map((dia) =>
        cerrados.includes(dia)
          ? { dia, cerrado: true, abre: '', cierra: '' }
          : { dia, cerrado: false, abre: '09:30', cierra: '19:30' },
      ),
    },
    reglas: { diasInhabiles: inhabiles.map((inhabil) => ({ ...inhabil })) },
  };
}

/**
 * Integración: ruta de servidorConRutas que responde esa configuración; la pantalla de carga la
 * pide al abrir la app. Cada prueba que la usa empieza con reiniciarConfiguracionPublica(): la
 * memoria se queda entre las pruebas de un archivo.
 */
export function rutaCalendario(opciones?: OpcionesCalendario): Record<string, Manejador> {
  return rutaConfiguracion(configuracionCalendario(opciones));
}

/**
 * Viewmodels: deja esa configuración en memoria como si llegara de la red (avisa a los
 * suscriptores). Cambia fetch solo durante la lectura, así que el servidor de la prueba sigue igual.
 * Con un hook montado va dentro de act.
 */
export async function fijarCalendario(opciones?: OpcionesCalendario): Promise<void> {
  const original = globalThis.fetch;
  globalThis.fetch = jest.fn(() => Promise.resolve(respuesta(configuracionCalendario(opciones)))) as unknown as typeof fetch;
  try {
    await refrescar();
  } finally {
    globalThis.fetch = original;
  }
}

// ── Especialistas ────────────────────────────────────────────────────────────────────────────

/** Banderas con las que el backend podría ocultar a una especialista. */
export type BanderaEspecialista = 'visible' | 'disponible' | 'activo';
export const BANDERAS_ESPECIALISTA: readonly BanderaEspecialista[] = ['visible', 'disponible', 'activo'];

/** GET /api/citas/especialistas con la segunda especialista de la agenda y esa bandera en false. */
export function rutaAgendaConOculta(bandera: BanderaEspecialista): Record<string, Manejador> {
  const [uno, dos] = ESPECIALISTAS_AGENDA;
  return { [RUTA_ESPECIALISTAS]: () => respuesta(cuerpoEspecialistas([uno, { ...dos, [bandera]: false }])) };
}
