/// <reference types="jest" />

import { normalizarConfiguracion, type ConfiguracionPublica } from '@/shared/api/configuracionPublica';

import { contenidoArchivo, CONFIGURACION_COMPLETA, respuestaCompleta, rutaConfiguracion, sembrarConfiguracionGuardada } from './configuracionFicticia';
import type { Manejador } from './servidorSimulado';

/**
 * Textos del sitio ficticios para las pruebas de GP-07.3 (src/shared/api/textosSitio.ts). Llegan
 * dentro de la configuración pública (`textos`), como los manda textosPublicos() del backend: con
 * las variables de reglas ya llenas y las de contexto todavía entre llaves. Todos son inventados y
 * distintos del respaldo, para distinguir de dónde salió cada texto.
 */

/** Textos del servidor: dos claves del respaldo y una que solo existe en el servidor. */
export const TEXTOS_SERVIDOR: Readonly<Record<string, string>> = Object.freeze({
  'inicio.galeria.titulo': 'Galería ficticia del servidor',
  'inicio.promociones.vigencia': 'Promoción ficticia hasta el {fecha}.',
  'citas.aviso': 'Aviso ficticio: llega {minutosLlegadaAntes} minutos antes a {nombreSalon}.',
});

/** respuestaCompleta() con estos textos. */
export const respuestaConTextos = (textos: Record<string, unknown> = TEXTOS_SERVIDOR) => ({ ...respuestaCompleta(), textos });

/** CONFIGURACION_COMPLETA (normalizada) con estos textos. */
export const configuracionConTextos = (textos: Record<string, unknown>): ConfiguracionPublica =>
  normalizarConfiguracion(respuestaConTextos(textos));

/** Ruta del servidor simulado que responde la configuración con estos textos. */
export const rutaConTextos = (textos: Record<string, unknown> = TEXTOS_SERVIDOR): Record<string, Manejador> =>
  rutaConfiguracion(respuestaConTextos(textos));

/** Deja en el disco simulado una configuración guardada con estos textos. */
export function sembrarTextosGuardados(textos: Record<string, string>): void {
  sembrarConfiguracionGuardada(contenidoArchivo({ ...CONFIGURACION_COMPLETA, textos }));
}
