/// <reference types="jest" />

import { rutaDocumento } from './documentosFicticios';
import { respuesta, type Llamada, type Manejador } from './servidorSimulado';

/**
 * Servidor y configuración ficticios de la forma de pago y los consentimientos de la reserva
 * (GP-07.4): POST /api/consentimientos como ConsentimientosService.registrar del backend (201 con
 * { success, data: [...] }) y la configuración pública con las reglas de anticipos que cada prueba
 * cambia. Todo es inventado.
 */

export const RUTA_CONSENTIMIENTOS = 'POST /api/consentimientos';

/** 201 con un registro por cada elemento que mandó la app (sin IP ni navegador). */
export const consentimientoRegistrado: Manejador = (cuerpo) => {
  const { items } = cuerpo as { items: { tipo: string; accion: string; documentoSlug?: string; version?: string }[] };
  return respuesta(
    {
      success: true,
      data: items.map((item, i) => ({
        id: `consentimiento-ficticio-${i + 1}`,
        tipo: item.tipo,
        accion: item.accion,
        documentoSlug: item.documentoSlug ?? null,
        documentoVersion: item.version ?? null,
        creadoEn: '2026-10-19T16:00:00.000Z',
      })),
    },
    201,
  );
};

/** Política de anticipos vigente (2.3) y el registro de consentimientos. */
export function rutasConsentimientos(): Record<string, Manejador> {
  return { ...rutaDocumento('anticipos'), [RUTA_CONSENTIMIENTOS]: consentimientoRegistrado };
}

/** Cuerpos de los POST /api/consentimientos en el orden en que llegaron. */
export function consentimientosEnviados(llamadas: Llamada[]): unknown[] {
  return llamadas.filter((l) => `${l.metodo} ${l.ruta}` === RUTA_CONSENTIMIENTOS).map((l) => l.cuerpo);
}

/** "MÉTODO /ruta" de las peticiones que no son lecturas (POST, PATCH...), en orden. */
export function escrituras(llamadas: Llamada[]): string[] {
  return llamadas.filter((l) => l.metodo !== 'GET').map((l) => `${l.metodo} ${l.ruta}`);
}

/** Reglas de citas de la configuración ficticia (la forma de publica() del backend). */
export interface ReglasCitasFicticias {
  plazoAnticipoHoras?: number;
  minutosAntesPagoSalon?: number;
  minutosLlegadaAntes?: number;
  horasAvisoCancelarReagendar?: number;
  permitirAnticipoEnSalon?: boolean;
  diasHabilesExcepcionAnticipo?: number;
  diasHabilesCancelarConReembolso?: number;
  noAsistio?: { pierdeAnticipo: boolean; mesesSoloPagoEnLinea: number };
}

export interface ConfiguracionReservaFicticia {
  anticiposActivos?: boolean;
  citas?: ReglasCitasFicticias;
  mercadoPagoAnticipos?: boolean;
  metodosSalon?: string[];
}

/** Reglas por omisión de estas pruebas: distintas del respaldo, para que se note de dónde sale cada cifra. */
export const REGLAS_FICTICIAS: Required<ReglasCitasFicticias> = {
  plazoAnticipoHoras: 3,
  minutosAntesPagoSalon: 25,
  minutosLlegadaAntes: 35,
  horasAvisoCancelarReagendar: 6,
  permitirAnticipoEnSalon: true,
  diasHabilesExcepcionAnticipo: 8,
  diasHabilesCancelarConReembolso: 6,
  noAsistio: { pierdeAnticipo: true, mesesSoloPagoEnLinea: 0 },
};

/** Cuerpo de GET /api/configuracion-publica con los anticipos activos y las reglas indicadas. */
export function configuracionReserva({
  anticiposActivos = true,
  citas = {},
  mercadoPagoAnticipos = true,
  metodosSalon = ['efectivo', 'tarjeta'],
}: ConfiguracionReservaFicticia = {}): Record<string, unknown> {
  return {
    anticiposActivos,
    reglas: {
      citas: { ...REGLAS_FICTICIAS, ...citas },
      pagos: { mercadoPagoTienda: true, mercadoPagoAnticipos, metodosSalon },
    },
  };
}

/** Ruta del servidor simulado con esa configuración. */
export function rutaConfiguracionReserva(opciones?: ConfiguracionReservaFicticia): Record<string, Manejador> {
  return { 'GET /api/configuracion-publica': () => respuesta(configuracionReserva(opciones)) };
}
