/// <reference types="jest" />

import {
  crearSolicitudArco,
  folioCancelacionAbierta,
  leerMisDatos,
  misSolicitudesArco,
  normalizarSolicitudArco,
  oponerseAPromociones,
  resumirMisDatos,
  SECCIONES_MIS_DATOS,
} from '@/features/auth/models/arcoModel';
import {
  activarPromociones,
  autorizarFotos,
  estadoFotos,
  leerRecibePromociones,
  misConsentimientos,
  retirarFotos,
  retirarPromociones,
  ultimaDeTipo,
} from '@/features/auth/models/permisosPrivacidad';
import { invalidarPerfil } from '@/features/auth/models/perfilCompartido';
import { ApiError } from '@/shared/api/apiClient';

import {
  ALERGIA_FICTICIA,
  ALERGIAS_AUTORIZADAS,
  FOLIO_ABIERTA,
  FOTOS_ACEPTADAS,
  FOTOS_REVOCADAS,
  RESPONDIDA,
  RUTA_CONSENTIMIENTOS,
  RUTA_ME,
  RUTA_MIAS,
  RUTA_MIOS,
  RUTA_MIS_DATOS,
  RUTA_OPOSICION,
  RUTA_SOLICITUDES,
  SIN_ALERGIAS,
  cancelacionAbierta409,
  filaConsentimiento,
  perfilMisDatos,
  respuestaMe,
  respuestaMias,
  respuestaMios,
  respuestaMisDatos,
  respuestaRevocado,
  respuestaSolicitud,
  solicitudCruda,
} from '../../helpers/misDatos';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { servidorVm, type ManejadorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque C: modelos de Mis datos y privacidad (arcoModel y permisosPrivacidad) contra el
 * contrato de src/arco y src/consentimientos del backend. fetch simulado en http://api.test con datos
 * ficticios: el cuerpo exacto de cada POST, la normalización y que las alergias no queden en memoria
 * sin autorización.
 */

function servidor(rutas: Record<string, ManejadorVm>) {
  return servidorVm(rutas);
}

beforeEach(() => {
  invalidarPerfil();
});

describe('normalizarSolicitudArco', () => {
  it('toma los campos del contrato y deja en null lo vacío', () => {
    expect(normalizarSolicitudArco(RESPONDIDA)).toEqual({
      id: '42',
      folio: 'ARCO-2026-000042',
      tipo: 'rectificacion',
      descripcion: 'Mi teléfono ficticio cambió.',
      estado: 'respondida',
      creadaEn: '2026-10-01T18:00:00.000Z',
      venceRespuesta: '2026-11-17T03:30:00.000Z',
      respuesta: 'Corregimos tu teléfono ficticio.',
      respondidaEn: '2026-10-05T18:00:00.000Z',
      venceEfectividad: '2026-10-26T18:00:00.000Z',
      atendidaEn: null,
    });
  });

  it.each([
    ['sin folio', { folio: '' }],
    ['con tipo desconocido', { tipo: 'portabilidad' }],
    ['con estado desconocido', { estado: 'perdida' }],
    ['sin fecha', { creadaEn: null }],
    ['sin id', { id: null }],
  ])('descarta una solicitud %s', (_caso, cambios) => {
    expect(normalizarSolicitudArco(solicitudCruda(cambios))).toBeNull();
  });

  it('descarta lo que no es un objeto', () => {
    expect(normalizarSolicitudArco(null)).toBeNull();
    expect(normalizarSolicitudArco([solicitudCruda()])).toBeNull();
  });
});

describe('solicitudes ARCO', () => {
  it('crea con el tipo y la descripción recortada', async () => {
    const llamadas = servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => respuestaSolicitud({ tipo: 'oposicion' }) });
    const creada = await crearSolicitudArco({ tipo: 'oposicion', descripcion: '  No quiero llamadas ficticias.  ' });
    expect(creada.tipo).toBe('oposicion');
    expect(llamadasA(llamadas, 'POST', RUTA_SOLICITUDES)[0].cuerpo).toEqual({
      tipo: 'oposicion',
      descripcion: 'No quiero llamadas ficticias.',
    });
  });

  it('sin descripción (o solo espacios) manda solo el tipo', async () => {
    const llamadas = servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => respuestaSolicitud() });
    await crearSolicitudArco({ tipo: 'acceso', descripcion: '   ' });
    await crearSolicitudArco({ tipo: 'acceso' });
    const cuerpos = llamadasA(llamadas, 'POST', RUTA_SOLICITUDES).map((l) => l.cuerpo);
    expect(cuerpos).toEqual([{ tipo: 'acceso' }, { tipo: 'acceso' }]);
  });

  it('el 409 CANCELACION_ABIERTA llega como ApiError con su code y el folio sale de errors.folio', async () => {
    servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => cancelacionAbierta409() });
    const error = await crearSolicitudArco({ tipo: 'cancelacion' }).catch((causa: unknown) => causa);
    expect(error).toMatchObject({ status: 409, code: 'CANCELACION_ABIERTA' });
    expect(folioCancelacionAbierta(error)).toBe(FOLIO_ABIERTA);
  });

  it.each([
    ['sin errors (backend anterior)', new ApiError(409, 'x', 'CANCELACION_ABIERTA')],
    ['errors sin folio', new ApiError(409, 'x', 'CANCELACION_ABIERTA', undefined, undefined, { otro: 1 })],
    ['folio que no es texto', new ApiError(409, 'x', 'CANCELACION_ABIERTA', undefined, undefined, { folio: 3 })],
    ['folio con otra forma', new ApiError(409, 'x', 'CANCELACION_ABIERTA', undefined, undefined, { folio: '<b>1</b>' })],
    ['otro code', new ApiError(409, 'x', 'OPERACIONES_EN_CURSO', undefined, undefined, { folio: FOLIO_ABIERTA })],
    ['otro estado', new ApiError(400, 'x', 'CANCELACION_ABIERTA', undefined, undefined, { folio: FOLIO_ABIERTA })],
    ['un error que no es del servidor', new Error('x')],
  ])('folioCancelacionAbierta: %s da null', (_caso, error) => {
    expect(folioCancelacionAbierta(error)).toBeNull();
  });

  it('una respuesta sin solicitud válida es un error', async () => {
    servidor({ [`POST ${RUTA_SOLICITUDES}`]: () => respuesta({ success: true, data: { folio: '' } }, 201) });
    await expect(crearSolicitudArco({ tipo: 'acceso' })).rejects.toBeInstanceOf(ApiError);
  });

  it('lista las válidas en el orden del servidor', async () => {
    servidor({ [`GET ${RUTA_MIAS}`]: () => respuestaMias([RESPONDIDA, { folio: 'roto' }, solicitudCruda()]) });
    const lista = await misSolicitudesArco();
    expect(lista.map((s) => s.folio)).toEqual(['ARCO-2026-000042', 'ARCO-2026-000041']);
  });

  it('la lista sin data es un error', async () => {
    servidor({ [`GET ${RUTA_MIAS}`]: () => respuesta({ success: true }) });
    await expect(misSolicitudesArco()).rejects.toBeInstanceOf(ApiError);
  });

  it('la oposición manda finalidad promociones y devuelve la solicitud atendida', async () => {
    const llamadas = servidor({
      [`POST ${RUTA_OPOSICION}`]: () => respuestaSolicitud({ tipo: 'oposicion', estado: 'atendida' }),
    });
    const solicitud = await oponerseAPromociones();
    expect(solicitud.estado).toBe('atendida');
    expect(llamadasA(llamadas, 'POST', RUTA_OPOSICION)[0].cuerpo).toEqual({ finalidad: 'promociones' });
  });
});

describe('mis datos (acceso)', () => {
  it('lee el objeto data y exige el perfil', async () => {
    servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => respuestaMisDatos() });
    await expect(leerMisDatos()).resolves.toMatchObject({ perfil: { nombre: 'Clienta Ficticia' } });

    servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => respuesta({ success: true, data: { generadoEn: 'x' } }) });
    await expect(leerMisDatos()).rejects.toBeInstanceOf(ApiError);
  });

  it('guardadas y ocultas (Ronda 9): el texto no llega y se marca que están guardadas y ocultas', async () => {
    servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => respuestaMisDatos() });
    const resumen = resumirMisDatos(await leerMisDatos());
    expect(resumen.perfil.alergias).toBeNull();
    expect(resumen.perfil.alergiasGuardadas).toBe(true);
    expect(resumen.perfil.alergiasOcultas).toBe(true);
    expect(JSON.stringify(resumen)).not.toContain(ALERGIA_FICTICIA);
  });

  it('guardadas y autorizadas: el texto se muestra y nada está oculto', () => {
    const resumen = resumirMisDatos({ perfil: perfilMisDatos(ALERGIAS_AUTORIZADAS) });
    expect(resumen.perfil.alergias).toBe(ALERGIA_FICTICIA);
    expect(resumen.perfil.alergiasGuardadas).toBe(true);
    expect(resumen.perfil.alergiasOcultas).toBe(false);
  });

  it('sin alergias guardadas no hay nada oculto ni texto', () => {
    const { perfil } = resumirMisDatos({ perfil: perfilMisDatos(SIN_ALERGIAS) });
    expect(perfil).toMatchObject({ alergias: null, alergiasGuardadas: false, alergiasOcultas: false });
  });

  it('autorizada sin texto guardado: el campo existe vacío y no hay aviso', () => {
    const { perfil } = resumirMisDatos({ perfil: perfilMisDatos({ ...SIN_ALERGIAS, datosSensiblesAutorizados: true }) });
    expect(perfil).toMatchObject({ alergias: '', alergiasGuardadas: false, alergiasOcultas: false });
  });

  it('ya no se calcula a partir del texto: sin datosSensiblesAutorizados el texto nunca se muestra', () => {
    // Un backend anterior a la Ronda 9 mandaba el texto sin los campos nuevos.
    const anterior = perfilMisDatos({
      alergias: ALERGIA_FICTICIA,
      datosSensiblesAutorizados: undefined,
      alergiasGuardadas: undefined,
      alergiasOcultas: undefined,
    });
    const { perfil } = resumirMisDatos({ perfil: anterior });
    expect(perfil).toMatchObject({ alergias: null, alergiasGuardadas: false, alergiasOcultas: false });
    expect(JSON.stringify(perfil)).not.toContain(ALERGIA_FICTICIA);
  });

  it('alergiasOcultas del backend basta aunque falte alergiasGuardadas', () => {
    const { perfil } = resumirMisDatos({ perfil: perfilMisDatos({ alergiasGuardadas: undefined }) });
    expect(perfil.alergiasOcultas).toBe(true);
  });

  it('resume el perfil sin nada técnico y cuenta cada sección (las que faltan cuentan 0)', async () => {
    servidor({ [`GET ${RUTA_MIS_DATOS}`]: () => respuestaMisDatos(perfilMisDatos(ALERGIAS_AUTORIZADAS)) });
    const resumen = resumirMisDatos(await leerMisDatos());
    expect(resumen.generadoEn).toBe('2026-10-26T17:30:00.000Z');
    expect(resumen.perfil).toEqual({
      nombre: 'Clienta Ficticia',
      email: 'misdatos@ejemplo.test',
      telefono: '7710000001',
      fechaNacimiento: '1995-04-12',
      tipoCabello: 'ondulado',
      colorNatural: 'Castaño',
      colorActual: 'Castaño claro',
      productosUsados: 'Shampoo ficticio',
      tratamientosQuimicos: true,
      tratamientos: 'Tinte ficticio',
      alergias: ALERGIA_FICTICIA,
      alergiasGuardadas: true,
      alergiasOcultas: false,
      recibePromociones: true,
      creadoEn: '2026-01-15T17:00:00.000Z',
    });
    expect(resumen.conteos.map((c) => c.seccion)).toEqual([...SECCIONES_MIS_DATOS]);
    const cuenta = Object.fromEntries(resumen.conteos.map((c) => [c.seccion, c.cantidad]));
    expect(cuenta).toMatchObject({ pedidos: 2, citas: 3, facturas: 1, direcciones: 0 });

    const vacio = resumirMisDatos(null);
    expect(vacio.conteos.every((c) => c.cantidad === 0)).toBe(true);
    expect(vacio.perfil.tratamientosQuimicos).toBeNull();
  });
});

describe('permisos', () => {
  it('lee el historial y toma la fila más reciente de cada tipo', async () => {
    servidor({
      [`GET ${RUTA_MIOS}`]: () =>
        respuestaMios([
          filaConsentimiento('promociones', 'aceptado', '2026-08-01T17:00:00.000Z'),
          ...FOTOS_REVOCADAS,
          'basura',
        ]),
    });
    const filas = await misConsentimientos();
    expect(filas).toHaveLength(3);
    expect(ultimaDeTipo(filas, 'fotos_resultado')?.accion).toBe('revocado');
    expect(ultimaDeTipo(filas, 'datos_salud')).toBeUndefined();
  });

  it('el historial sin data es un error', async () => {
    servidor({ [`GET ${RUTA_MIOS}`]: () => respuesta({ success: true, data: null }) });
    await expect(misConsentimientos()).rejects.toBeInstanceOf(ApiError);
  });

  it('estado de las fotos: aceptado, revocado o sin registro (aunque lleguen en desorden)', () => {
    expect(estadoFotos(FOTOS_ACEPTADAS)).toBe('aceptado');
    expect(estadoFotos(FOTOS_REVOCADAS)).toBe('revocado');
    expect(estadoFotos([...FOTOS_REVOCADAS].reverse())).toBe('revocado');
    expect(estadoFotos([])).toBe('sinRegistro');
    // Una fecha ilegible nunca gana a una válida.
    expect(estadoFotos([filaConsentimiento('fotos_resultado', 'revocado', 'x'), ...FOTOS_ACEPTADAS])).toBe('aceptado');
  });

  it('lee recibePromociones de /me; sin perfil válido es un error', async () => {
    servidor({ [`GET ${RUTA_ME}`]: () => respuestaMe(true) });
    await expect(leerRecibePromociones()).resolves.toBe(true);

    invalidarPerfil();
    servidor({ [`GET ${RUTA_ME}`]: () => respuesta({ data: { nombre: 'Sin id' } }) });
    await expect(leerRecibePromociones()).rejects.toBeInstanceOf(ApiError);
  });

  it.each([
    ['promociones', retirarPromociones],
    ['fotos_resultado', retirarFotos],
  ] as const)('retirar %s manda el cuerpo exacto del contrato', async (tipo, retirar) => {
    const llamadas = servidor({ [`POST ${RUTA_CONSENTIMIENTOS}`]: () => respuestaRevocado(tipo) });
    await retirar();
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)[0].cuerpo).toEqual({
      items: [{ tipo, accion: 'revocado' }],
      formulario: 'perfil_privacidad',
      rutaOrigen: '/mis-datos',
    });
  });

  it('volver a autorizar las fotos manda el cuerpo exacto de fotos-reautorizar.spec.ts', async () => {
    const llamadas = servidor({
      [`POST ${RUTA_CONSENTIMIENTOS}`]: () =>
        respuesta({ success: true, data: [{ id: '78', tipo: 'fotos_resultado', accion: 'aceptado' }] }, 201),
    });
    await autorizarFotos();
    expect(llamadasA(llamadas, 'POST', RUTA_CONSENTIMIENTOS)[0].cuerpo).toEqual({
      items: [{ tipo: 'fotos_resultado', accion: 'aceptado' }],
      formulario: 'perfil_privacidad',
      rutaOrigen: '/mis-datos',
    });
  });

  it('activar promociones es PATCH /api/auth/me con recibePromociones en true', async () => {
    const llamadas = servidor({ [`PATCH ${RUTA_ME}`]: () => respuesta({ success: true, data: {} }) });
    await activarPromociones();
    expect(llamadasA(llamadas, 'PATCH', RUTA_ME)[0].cuerpo).toEqual({ recibePromociones: true });
  });
});
