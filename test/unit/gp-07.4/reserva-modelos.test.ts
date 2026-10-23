/// <reference types="jest" />

import {
  ErrorConsentimiento,
  esSesionTerminada,
  MENSAJE_SESION_RESERVA,
  MENSAJE_SIN_VERSION_POLITICA,
  mensajeConsentimiento,
} from '@/features/citas/models/consentimientosReserva';
import {
  guardarReservaPendiente,
  reiniciarReservaPendiente,
  tomarReservaPendiente,
  type ReservaPendiente,
} from '@/features/citas/models/reservaPendiente';
import { anticipoVigente, montoDePrecio, type Servicio } from '@/features/citas/models/servicioModel';
import { botonConfirmar, formaPagoReserva, opcionVigente } from '@/features/citas/viewmodels/formaPagoReserva';
import { avisoAnticipo } from '@/features/citas/viewmodels/useDetalleServicioViewModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { normalizarConfiguracion } from '@/shared/api/configuracionPublica';

import { configuracionReserva, REGLAS_FICTICIAS, type ConfiguracionReservaFicticia } from '../../helpers/reservaFicticia';

/**
 * GP-07.4: lo puro de la reserva. La sección "Forma de pago" (formaPagoReserva, opcionVigente,
 * botonConfirmar), el anticipo que hoy se pide (anticipoVigente, también en el detalle del
 * servicio), los mensajes de los consentimientos y la reserva que se recupera tras una sesión
 * vencida. Configuración ficticia; las cifras de los textos salen de sus reglas.
 */

const config = (opciones?: ConfiguracionReservaFicticia) => normalizarConfiguracion(configuracionReserva(opciones));

/** El alaciado ya normalizado: solo importa su anticipo. */
const ALACIADO: Servicio = {
  id: 2,
  nombre: 'Alaciado keratínico',
  descripcion: '',
  descripcionLarga: '',
  precio: '$1,200',
  anticipo: '$360',
  duracion: null,
  requiereEvaluacion: false,
  incluye: [],
  recomendaciones: [],
  especialistas: [],
};

describe('formaPagoReserva', () => {
  it('con anticipo y sin precio: no hay saldo y dice que se descuenta del total', () => {
    const forma = formaPagoReserva({ precio: null }, '$360', config());
    expect(forma).toMatchObject({
      conAnticipo: true,
      anticipo: { etiqueta: 'Anticipo para apartar tu cita', monto: '$360' },
      saldo: null,
      descuento: 'Se descuenta del total el día de tu cita.',
    });
  });

  it('con un anticipo igual al precio el saldo es $0 y sin métodos activos no los menciona', () => {
    const forma = formaPagoReserva({ precio: '$360' }, '$360', config({ metodosSalon: [] }));
    expect(forma).toMatchObject({ saldo: { monto: '$0' }, descuento: null, metodos: null });
  });

  it('las opciones llevan su plazo con las reglas; con las dos apagadas se ofrece en línea (decide el backend)', () => {
    const forma = formaPagoReserva(
      { precio: '$1,200' },
      '$360',
      config({ mercadoPagoAnticipos: false, citas: { permitirAnticipoEnSalon: false } }),
    );
    expect(forma.conAnticipo && forma.opciones.map((o) => o.opcion)).toEqual(['linea']);
    expect(forma.conAnticipo && forma.opciones[0].plazo).toContain(`${REGLAS_FICTICIAS.plazoAnticipoHoras} horas`);
  });

  it('sin anticipo: el precio en el salón; sin precio, el texto sin monto', () => {
    expect(formaPagoReserva({ precio: '$350' }, null, config())).toEqual({
      conAnticipo: false,
      sinAnticipo: 'Pagas $350 en el salón el día de tu cita.',
      metodos: 'En el salón puedes pagar con efectivo o tarjeta.',
      // GP-07.5: la sección trae los datos de transferencia; sin ella entre los métodos, null.
      transferencia: null,
    });
    expect(formaPagoReserva({ precio: null }, null, config())).toMatchObject({
      sinAnticipo: 'Pagas tu servicio en el salón el día de tu cita.',
    });
  });
});

describe('opcionVigente y botonConfirmar', () => {
  it('la opción elegida vale si sigue activa; si el panel la apagó, la primera activa', () => {
    expect(opcionVigente('salon', config())).toBe('salon');
    expect(opcionVigente(null, config())).toBe('linea');
    expect(opcionVigente('salon', config({ citas: { permitirAnticipoEnSalon: false } }))).toBe('linea');
    expect(opcionVigente('linea', config({ mercadoPagoAnticipos: false }))).toBe('salon');
  });

  it('el texto del botón según el anticipo, la opción y el envío', () => {
    const c = config();
    expect(botonConfirmar(null, 'linea', false, c)).toBe('Confirmar cita');
    expect(botonConfirmar('$360', 'linea', false, c)).toBe('Confirmar y pagar anticipo');
    expect(botonConfirmar('$360', 'salon', false, c)).toBe('Confirmar y pagar en el salón');
    expect(botonConfirmar('$360', 'salon', true, c)).toBe('Apartando…');
  });
});

describe('anticipoVigente, montoDePrecio y el aviso del detalle', () => {
  it('sin anticiposActivos no hay anticipo aunque el servicio traiga monto', () => {
    expect(anticipoVigente({ anticipo: '$360' }, config())).toBe('$360');
    expect(anticipoVigente({ anticipo: '$360' }, config({ anticiposActivos: false }))).toBeNull();
    expect(anticipoVigente({ anticipo: null }, config())).toBeNull();
    expect(anticipoVigente(null, config())).toBeNull();
  });

  it('montoDePrecio quita "$" y comas; lo que no se lee es 0', () => {
    expect(montoDePrecio('$1,200.50')).toBe(1200.5);
    expect(montoDePrecio('sin precio')).toBe(0);
    expect(montoDePrecio(null)).toBe(0);
  });

  it('el aviso del detalle parte el texto alrededor del monto; si el texto del panel no lo trae, va completo', () => {
    expect(avisoAnticipo(ALACIADO, config())).toEqual({
      antes: 'Este servicio pide un anticipo de ',
      monto: '$360',
      despues: ' al reservar.',
    });
    const sinMonto = { ...config(), textos: { 'citas.servicios.anticipo': 'Este servicio pide anticipo al reservar.' } };
    expect(avisoAnticipo(ALACIADO, sinMonto)).toEqual({ antes: 'Este servicio pide anticipo al reservar.', monto: '', despues: '' });
    expect(avisoAnticipo(ALACIADO, config({ anticiposActivos: false }))).toBeNull();
  });
});

describe('mensajes de los consentimientos', () => {
  it('sin versión, sesión terminada, sin red y un 400 de las fotos', () => {
    expect(mensajeConsentimiento(new ErrorConsentimiento('version'))).toBe(MENSAJE_SIN_VERSION_POLITICA);
    expect(mensajeConsentimiento(new ErrorConsentimiento('fotos', new ApiError(401, 'Sin sesión ficticia')))).toBe(
      MENSAJE_SESION_RESERVA,
    );
    expect(mensajeConsentimiento(new ErrorConsentimiento('anticipos', new ApiError(0, 'Sin respuesta ficticia')))).toMatch(
      /Revisa tu conexión a internet e intenta de nuevo\.$/,
    );
    expect(mensajeConsentimiento(new ErrorConsentimiento('fotos', new ErrorDeRed()))).toMatch(/^No pudimos guardar tu autorización de fotos/);
    const fotos400 = mensajeConsentimiento(new ErrorConsentimiento('fotos', new ApiError(400, 'Mensaje técnico ficticio')));
    expect(fotos400).toMatch(/Intenta de nuevo en un momento\.$/);
    expect(fotos400).not.toContain('técnico');
  });

  it('solo un 401 es sesión terminada', () => {
    expect(esSesionTerminada(new ApiError(401, 'x'))).toBe(true);
    expect(esSesionTerminada(new ApiError(403, 'x'))).toBe(false);
    expect(esSesionTerminada(new ErrorDeRed())).toBe(false);
  });
});

describe('reserva pendiente (solo en memoria)', () => {
  const RESERVA: ReservaPendiente = {
    usuarioId: 'clienta-ficticia',
    servicioId: '2',
    especialistaId: 'especialista-ficticia-1',
    fecha: '2026-10-20',
    inicio: '2026-10-20T17:00:00.000Z',
    notas: 'Notas ficticias',
  };

  beforeEach(reiniciarReservaPendiente);

  it('otra clienta u otro servicio no la toman; la misma clienta en ese servicio, una sola vez', () => {
    guardarReservaPendiente(RESERVA);
    expect(tomarReservaPendiente('otra-clienta', '2')).toBeNull();
    expect(tomarReservaPendiente('clienta-ficticia', '3')).toBeNull();
    expect(tomarReservaPendiente('clienta-ficticia', '2')).toEqual(RESERVA);
    expect(tomarReservaPendiente('clienta-ficticia', '2')).toBeNull();
  });
});
