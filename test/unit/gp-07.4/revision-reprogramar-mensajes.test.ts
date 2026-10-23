/// <reference types="jest" />

import { mensajeReprogramacion } from '@/features/citas/models/citaModel';
import { ApiError } from '@/shared/api/apiClient';

/**
 * Revisión de GP-07.4: el 400 de PATCH /api/citas/:id/reprogramar?propios=true cuando la cita tiene
 * el anticipo sin pagar y el horario nuevo no deja tiempo para pagarlo (MENSAJE_SIN_TIEMPO_ANTICIPO
 * de citas.service.ts del backend) ya está escrito para la clienta: se muestra tal cual en lugar del
 * genérico, que invitaba a reintentar el mismo horario. Otros 400 siguen sin llegar a la pantalla.
 */

describe('Revisión: mensajes de reprogramar', () => {
  it('muestra el 400 de falta de tiempo para pagar el anticipo tal como lo manda el backend', () => {
    const mensaje = 'Ya no da tiempo de pagar el anticipo antes de tu cita.';
    expect(mensajeReprogramacion(new ApiError(400, mensaje))).toBe(mensaje);
  });

  it('un 400 técnico sigue con el mensaje genérico, sin el texto del servidor', () => {
    const mensaje = mensajeReprogramacion(new ApiError(400, 'fechaHoraInicio must be a valid ISO 8601 date string'));
    expect(mensaje).toBe('No pudimos cambiar tu cita. Intenta de nuevo en un momento.');
  });
});
