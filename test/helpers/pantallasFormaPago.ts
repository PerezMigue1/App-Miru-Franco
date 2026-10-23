/// <reference types="jest" />

import { screen } from 'expo-router/testing-library';

import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import { SERVICIO_CON_ANTICIPO, SERVICIO_SIN_ANTICIPO } from './citasFicticias';
import { abrirReserva, llegarAlResumen, prepararPruebasReserva, type PantallaReserva } from './pantallasReserva';
import { rutaConfiguracionReserva, type ConfiguracionReservaFicticia } from './reservaFicticia';
import type { Manejador } from './servidorSimulado';

/**
 * Pasos comunes de las pruebas de la forma de pago y los consentimientos de la reserva (GP-07.4) con
 * las pantallas reales: la configuración de la prueba (reglas de anticipos) y el paso Confirmar del
 * alaciado (con anticipo) o del corte (sin anticipo), el martes a las 11:00.
 */

/** Textos fijos de la sección y de la casilla de fotos. */
export const FORMA_PAGO = 'Forma de pago';
export const CASILLA_FOTOS =
  'Autorizo que el salón tome fotos del resultado de mi servicio para mostrarlas en sus redes y galería (puedes retirar tu autorización cuando quieras desde tu perfil)';

/**
 * prepararPruebasReserva más el reinicio de la configuración y de los documentos legales (memoria de
 * los módulos, que se comparte entre las pruebas de un archivo). Va dentro del describe.
 */
export function prepararPruebasFormaPago(): () => void {
  beforeEach(() => {
    reiniciarConfiguracionPublica();
    reiniciarDocumentosLegales();
  });
  return prepararPruebasReserva();
}

export interface OpcionesConfirmar {
  /** Servicio: el alaciado (con anticipo, por omisión) o el corte (sin anticipo). */
  conAnticipo?: boolean;
  configuracion?: ConfiguracionReservaFicticia;
  rutas?: Record<string, Manejador>;
  crear?: (comoServidor: Manejador) => Manejador;
}

/** Abre la reserva con la configuración indicada y llega al paso Confirmar. */
export async function abrirConfirmar({
  conAnticipo = true,
  configuracion,
  rutas = {},
  crear,
}: OpcionesConfirmar = {}): Promise<PantallaReserva> {
  const servicio = conAnticipo ? SERVICIO_CON_ANTICIPO : SERVICIO_SIN_ANTICIPO;
  const abierta = await abrirReserva(`/reservar/${servicio.id}`, {
    rutas: { ...rutaConfiguracionReserva(configuracion), ...rutas },
    crear,
  });
  await llegarAlResumen();
  return abierta;
}

/** Cada texto está a la vista. */
export function seVen(...textos: (string | RegExp)[]): void {
  for (const texto of textos) {
    expect(screen.getByText(texto)).toBeOnTheScreen();
  }
}
