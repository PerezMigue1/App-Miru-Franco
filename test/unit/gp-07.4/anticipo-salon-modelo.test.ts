/// <reference types="jest" />

import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import {
  avisoAnticipoEnSalon,
  cambiarAnticipoASalon,
  MENSAJES_ANTICIPO_EN_SALON,
  mensajeAnticipoEnSalon,
  plazoAnticipoEnSalon,
} from '@/features/citas/models/citaModel';
import {
  aceptarPoliticaAnticipos,
  FORMULARIO_ANTICIPO_CITA,
  registrarAceptacionAnticipos,
} from '@/features/citas/models/gestionCitaModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { AHORA, errorDe, ID_CITA, masMinutos } from '../../helpers/citasFicticias';
import { HASH_VIGENTE, rutaSinVersion } from '../../helpers/documentosFicticios';
import {
  anticipoEnSalonOk,
  configVigente,
  errorCon,
  reiniciarRepositorios,
  rutaAnticipoEnSalon,
  servidorGestion,
  sinRedTurno,
  turnos,
} from '../../helpers/gestionCitas';
import { consentimientosEnviados, RUTA_CONSENTIMIENTOS, REGLAS_FICTICIAS } from '../../helpers/reservaFicticia';
import { respuesta } from '../../helpers/servidorSimulado';

/**
 * GP-07.4, cambiar a pago en el salón el anticipo apartado en línea (modelo): PATCH
 * /api/citas/:id/anticipo-en-salon, los mensajes para la clienta de cada respuesta del backend
 * (citas.service.ts pagarAnticipoEnSalon), el plazo en el salón con los minutos de la cita y el
 * registro del consentimiento de la Política de anticipos. fetch simulado en http://api.test.
 */

reiniciarRepositorios();
beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
});
afterEach(() => {
  jest.useRealTimers();
});

const PLAZO_NUEVO = masMinutos(AHORA, 600).toISOString();

describe('cambiarAnticipoASalon', () => {
  it('manda PATCH sin cuerpo ni ?propios y devuelve el plazo nuevo', async () => {
    const llamadas = await servidorGestion({ [rutaAnticipoEnSalon()]: turnos(anticipoEnSalonOk(PLAZO_NUEVO)) });
    await expect(cambiarAnticipoASalon(` ${ID_CITA}`.trim())).resolves.toEqual({ anticipoVenceEn: PLAZO_NUEVO });
    const patch = llamadas.filter((l) => l.metodo === 'PATCH');
    expect(patch.map((l) => l.ruta)).toEqual([`/api/citas/${ID_CITA}/anticipo-en-salon`]);
    expect(patch[0].cuerpo).toBeUndefined();
  });

  it('una respuesta sin plazo da null', async () => {
    await servidorGestion({ [rutaAnticipoEnSalon()]: turnos(() => respuesta({ success: true })) });
    await expect(cambiarAnticipoASalon(ID_CITA)).resolves.toEqual({ anticipoVenceEn: null });
  });

  it('un error llega como ApiError con su status', async () => {
    await servidorGestion({ [rutaAnticipoEnSalon()]: turnos(errorCon(409, MENSAJES_ANTICIPO_EN_SALON[409][0])) });
    const error = await errorDe(cambiarAnticipoASalon(ID_CITA));
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 409 });
  });
});

describe('mensajeAnticipoEnSalon', () => {
  it.each(
    [400, 409, 503].flatMap((status) => MENSAJES_ANTICIPO_EN_SALON[status].map((mensaje) => [status, mensaje] as const)),
  )('%s "%s" se muestra tal cual (ya está escrito para la clienta)', (status, mensaje) => {
    expect(mensajeAnticipoEnSalon(new ApiError(status, `  ${mensaje} `))).toBe(mensaje);
  });

  it('400 con N citas por pagar en el salón (regla distinta de 1) también se muestra', () => {
    const mensaje = 'Ya tienes 3 citas por pagar en el salón. Paga su anticipo o paga esta en línea.';
    expect(mensajeAnticipoEnSalon(new ApiError(400, mensaje))).toBe(mensaje);
  });

  it.each<[string, unknown, string]>([
    ['sin red', new ErrorDeRed(), 'Sin conexión. Revisa tu internet e intenta de nuevo.'],
    ['404 de una cita ajena', new ApiError(404, 'Cita 501 no encontrada'), 'No encontramos esta cita.'],
    ['401', new ApiError(401, 'Unauthorized'), 'Tu sesión terminó. Inicia sesión de nuevo.'],
    ['un 503 con otro texto', new ApiError(503, 'Service Unavailable'), RESPALDO_TEXTOS['citas.anticipoSalon.noSePudo']],
    ['un 409 desconocido', new ApiError(409, 'Conflicto interno'), RESPALDO_TEXTOS['citas.anticipoSalon.noSePudo']],
    ['un 400 técnico', new ApiError(400, 'id must be a number'), RESPALDO_TEXTOS['citas.anticipoSalon.noSePudo']],
    ['un mensaje de 409 con status 400', new ApiError(400, MENSAJES_ANTICIPO_EN_SALON[409][1]), RESPALDO_TEXTOS['citas.anticipoSalon.noSePudo']],
    ['un error que no es del servidor', new Error('x'), RESPALDO_TEXTOS['citas.anticipoSalon.noSePudo']],
  ])('%s: mensaje propio, nunca el texto técnico', (_caso, error, esperado) => {
    expect(mensajeAnticipoEnSalon(error)).toBe(esperado);
  });
});

describe('plazoAnticipoEnSalon y avisoAnticipoEnSalon con los minutos de la cita', () => {
  const vigentes = REGLAS_FICTICIAS.minutosAntesPagoSalon;
  const config = configVigente(undefined, {
    'citas.anticipoSalon.plazoSinLimite': `Paga a más tardar ${vigentes} minutos antes.`,
  });

  it('con los minutos de la cita gana su cifra aunque el servidor mande el texto con la vigente', () => {
    expect(plazoAnticipoEnSalon(null, AHORA, 40, config)).toBe(
      'Paga tu anticipo en el salón a más tardar 40 minutos antes de tu cita.',
    );
    expect(avisoAnticipoEnSalon(null, AHORA, 40, config)).toBe(
      `Paga tu anticipo en el salón a más tardar 40 minutos antes de tu cita. ${RESPALDO_TEXTOS['citas.anticipoSalon.tambienEnLinea']}`,
    );
  });

  it('sin minutos de una cita usa el texto con la regla vigente', () => {
    expect(plazoAnticipoEnSalon(null, AHORA, undefined, config)).toBe(`Paga a más tardar ${vigentes} minutos antes.`);
  });

  it('con un plazo por delante lleva la hora límite y los minutos', () => {
    const vence = masMinutos(AHORA, 30).toISOString();
    expect(plazoAnticipoEnSalon(vence, AHORA, 40, config)).toMatch(/^Paga tu anticipo en el salón antes de las? .+ \(40 minutos antes de tu cita\)\.$/);
  });
});

describe('registrarAceptacionAnticipos', () => {
  it('registra la versión y el hash vigentes de la política con el formulario y la ruta', async () => {
    const llamadas = await servidorGestion();
    await expect(registrarAceptacionAnticipos('app/cita')).resolves.toBeNull();
    expect(consentimientosEnviados(llamadas)).toEqual([
      {
        items: [{ tipo: 'anticipos', documentoSlug: 'anticipos', version: '2.3', hash: HASH_VIGENTE, accion: 'aceptado' }],
        formulario: FORMULARIO_ANTICIPO_CITA,
        rutaOrigen: 'app/cita',
      },
    ]);
  });

  it('sin versión publicada no registra nada y lo explica', async () => {
    const llamadas = await servidorGestion(rutaSinVersion());
    await expect(registrarAceptacionAnticipos('app/cita')).resolves.toBe(RESPALDO_TEXTOS['citas.detalle.politicaNoDisponible']);
    expect(consentimientosEnviados(llamadas)).toEqual([]);
  });

  it.each([
    ['un 400 (versión que ya no se publica)', errorCon(400, 'La versión no está publicada'), RESPALDO_TEXTOS['citas.detalle.consentimientoFallo']],
    ['sin red', sinRedTurno, MENSAJE_SIN_CONEXION],
  ])('si el registro falla con %s lo explica', async (_caso, falla, mensaje) => {
    await servidorGestion({ [RUTA_CONSENTIMIENTOS]: turnos(falla) });
    await expect(registrarAceptacionAnticipos('app/cita')).resolves.toBe(mensaje);
  });

  it.each(['DOCUMENTO_NO_VIGENTE', 'DOCUMENTO_NO_COINCIDE'])(
    'aceptarPoliticaAnticipos con %s dice que la versión cambió, con el aviso común',
    async (code) => {
      await servidorGestion({
        [RUTA_CONSENTIMIENTOS]: () => respuesta({ statusCode: 400, message: 'Mensaje técnico ficticio', code }, 400),
      });
      await expect(aceptarPoliticaAnticipos('app/cita')).resolves.toEqual({
        mensaje: RESPALDO_TEXTOS['legal.documentoActualizado'],
        documentoCambiado: true,
      });
    },
  );

  it('aceptarPoliticaAnticipos: registrada da null y otra falla no es un cambio de versión', async () => {
    await servidorGestion();
    await expect(aceptarPoliticaAnticipos('app/cita')).resolves.toBeNull();
    await servidorGestion({ [RUTA_CONSENTIMIENTOS]: turnos(sinRedTurno) });
    await expect(aceptarPoliticaAnticipos('app/cita')).resolves.toEqual({ mensaje: MENSAJE_SIN_CONEXION, documentoCambiado: false });
  });
});
