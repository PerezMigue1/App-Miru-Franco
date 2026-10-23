/// <reference types="jest" />

import {
  compararMeses,
  crearCita,
  ENCABEZADOS_SEMANA,
  esHorarioOcupado,
  fechaLegible,
  fechaLocal,
  horaLegible,
  limiteAnticipo,
  limitePagoCorto,
  MENSAJES_ANTICIPO_PARA_CLIENTA,
  mensajeAnticipoParaClienta,
  mesDe,
  motivoConflictoAnticipo,
  obtenerCita,
  obtenerDisponibilidad,
  obtenerEspecialistas,
  pideAnticipo,
  semanasDelMes,
  sumarMeses,
  tituloMes,
  type Cita,
  type DatosNuevaCita,
  type Disponibilidad,
  type Especialista,
  type MesCalendario,
} from '@/features/citas/models/citaModel';
import { ApiError, crearErrorApi, ErrorDeRed } from '@/shared/api/apiClient';

import {
  AHORA,
  CITA_CON_ANTICIPO,
  CITA_CON_ANTICIPO_NORMALIZADA,
  CITA_SIN_ANTICIPO,
  CITA_SIN_ANTICIPO_NORMALIZADA,
  citaAnticipoPagado,
  CLIENTA_CITAS,
  conError,
  cuerpoCita,
  cuerpoEspecialistas,
  cuerpoError,
  DIA_CITA,
  DIA_DOMINGO,
  DIA_SABADO,
  disponibilidadCerrada,
  disponibilidadComoServidor,
  disponibilidadCruda,
  enHoraLocal,
  ERRORES,
  errorDe,
  ESPECIALISTAS_AGENDA,
  especialistaAgendaCruda,
  FIN_CITA_CON_ANTICIPO_ISO,
  FOTO_ESPECIALISTA,
  HORA_MS,
  HOY,
  ID_CITA,
  INICIO_CITA_ISO,
  isoMexico,
  llamadasDeRuta,
  MENSAJES_BACKEND,
  MINUTO_MS,
  MINUTOS_PAGO_EN_SALON,
  MOTIVO_SALON_CERRADO,
  pagoCrudo,
  PAGADO_EN_ISO,
  PLAZO_ANTICIPO_HORAS,
  RUTA_CREAR_CITA,
  RUTA_ESPECIALISTAS,
  RUTA_RENOVAR_MOVIL,
  rutaCita,
  rutaDisponibilidad,
  simularServidorReserva,
  simularSinRed,
  slotCrudo,
  usarRelojFijo,
  VENCE_ANTICIPO_ISO,
  type CuerpoError,
} from '../../helpers/citasFicticias';
import { ESPECIALISTA_DOS, ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta, type Llamada } from '../../helpers/servidorSimulado';
import { sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';

/**
 * GP-06.2 (reservar cita con anticipo): modelo de la reserva en src/features/citas/models/citaModel.ts,
 * en caja blanca. Especialistas, disponibilidad y slots, la cita creada y su normalización, el
 * monto y el plazo del anticipo, las fechas y horas locales del calendario, y los errores (con
 * crearErrorApi de apiClient) y sus clasificadores. Solo fetch es simulado (http://api.test) y el
 * reloj está fijo en AHORA; apiClient es el real.
 */

usarRelojFijo();

const MENSAJE_SIN_DATOS = 'Respuesta de cita sin datos.';

/** Datos mínimos que arma el viewmodel para el alaciado con ESPECIALISTA_UNO el martes a las 11:00. */
const DATOS: DatosNuevaCita = {
  clienteId: CLIENTA_CITAS.id,
  especialistaId: ESPECIALISTA_UNO.usuarioId,
  servicioId: 2,
  fechaHoraInicio: INICIO_CITA_ISO,
  fechaHoraFin: FIN_CITA_CON_ANTICIPO_ISO,
};

/** La única llamada a esa ruta, revisando que salió con la sesión de la clienta. */
function unicaLlamada(llamadas: Llamada[], ruta: string): Llamada {
  expect(llamadas).toHaveLength(1);
  const [llamada] = llamadasDeRuta(llamadas, ruta);
  expect(llamada).toBeDefined();
  expect(llamada.cabeceras.Authorization).toMatch(/^Bearer /);
  return llamada;
}

/** Cuerpo que recibió el servidor al crear la cita con esos datos. */
async function cuerpoEnviado(datos: DatosNuevaCita): Promise<unknown> {
  const llamadas = simularServidorReserva({});
  await crearCita(datos);
  return llamadasDeRuta(llamadas, RUTA_CREAR_CITA)[0].cuerpo;
}

/** Pasa la cita cruda (CITA_CON_ANTICIPO con esos campos encima) por obtenerCita. */
async function normalizarCita(campos: Record<string, unknown>): Promise<Cita> {
  simularServidorReserva({ [rutaCita()]: () => respuesta(cuerpoCita({ ...CITA_CON_ANTICIPO, ...campos })) });
  return obtenerCita(ID_CITA);
}

/** Pasa una especialista cruda por GET /api/citas/especialistas y devuelve las normalizadas. */
async function especialistasDe(lista: unknown[]): Promise<Especialista[]> {
  simularServidorReserva({ [RUTA_ESPECIALISTAS]: () => respuesta(cuerpoEspecialistas(lista)) });
  return obtenerEspecialistas();
}

const RUTA_MARTES = rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, DIA_CITA, 2);

/** La disponibilidad del martes con ese cuerpo de respuesta. */
async function disponibilidadDe(cuerpo: unknown): Promise<Disponibilidad> {
  simularServidorReserva({ [RUTA_MARTES]: () => respuesta(cuerpo) });
  return obtenerDisponibilidad({ especialistaId: ESPECIALISTA_UNO.usuarioId, fecha: DIA_CITA, servicioId: 2 });
}

/** ApiError tal como lo arma apiClient con ese cuerpo de error del backend. */
function apiErrorDe(cuerpo: CuerpoError): ApiError {
  return crearErrorApi({ tipo: 'respuesta', status: cuerpo.statusCode, cuerpo });
}

// ── Especialistas ────────────────────────────────────────────────────────────────────────────

describe('obtenerEspecialistas: agenda (GET /api/citas/especialistas)', () => {
  it('normaliza cada especialista con su foto, puesto y especialidades', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorReserva({});
    await expect(obtenerEspecialistas()).resolves.toEqual([
      {
        id: ESPECIALISTA_UNO.usuarioId,
        nombre: ESPECIALISTA_UNO.nombre,
        foto: FOTO_ESPECIALISTA,
        puesto: 'Estilista',
        especialidades: ['Corte', 'Color'],
      },
      { id: ESPECIALISTA_DOS.usuarioId, nombre: ESPECIALISTA_DOS.nombre, foto: undefined, puesto: undefined, especialidades: [] },
    ]);
    expect(unicaLlamada(llamadas, RUTA_ESPECIALISTAS).cuerpo).toBeUndefined();
  });

  it.each<[string, unknown]>([
    ['arreglo directo', ESPECIALISTAS_AGENDA],
    ['{ data: [] }', cuerpoEspecialistas()],
    ['{ especialistas: [] }', { especialistas: ESPECIALISTAS_AGENDA }],
  ])('lee la lista como %s', async (_caso, cuerpo) => {
    simularServidorReserva({ [RUTA_ESPECIALISTAS]: () => respuesta(cuerpo) });
    const ids = (await obtenerEspecialistas()).map((e) => e.id);
    expect(ids).toEqual([ESPECIALISTA_UNO.usuarioId, ESPECIALISTA_DOS.usuarioId]);
  });

  it.each<[string, unknown]>([
    ['sin data', { success: true }],
    ['data como objeto', { data: ESPECIALISTAS_AGENDA[0] }],
    ['cuerpo null', null],
    ['cuerpo de texto', 'especialistas'],
    ['lista vacía', cuerpoEspecialistas([])],
  ])('%s da una agenda vacía', async (_caso, cuerpo) => {
    simularServidorReserva({ [RUTA_ESPECIALISTAS]: () => respuesta(cuerpo) });
    await expect(obtenerEspecialistas()).resolves.toEqual([]);
  });

  it('descarta las que no traen id o nombre y las que no son objetos', async () => {
    const especialistas = await especialistasDe([
      null,
      'Especialista de texto',
      { nombre: 'Sin id' },
      { id: 'sin-nombre' },
      { id: 'nombre-vacio', nombre: '   ' },
      { id: { anidado: 1 }, nombre: 'Id inválido' },
      especialistaAgendaCruda(ESPECIALISTA_DOS),
    ]);
    expect(especialistas.map((e) => e.id)).toEqual([ESPECIALISTA_DOS.usuarioId]);
  });

  it.each<[string, Record<string, unknown>, Partial<Especialista>]>([
    ['id numérico', { id: 12 }, { id: 12 }],
    ['_id cuando falta id', { id: undefined, _id: 'respaldo' }, { id: 'respaldo' }],
    ['nombre recortado', { nombre: '  Especialista Ficticia  ' }, { nombre: 'Especialista Ficticia' }],
    ['puesto vacío como undefined', { puesto: '   ' }, { puesto: undefined }],
    ['puesto recortado', { puesto: ' Colorista ' }, { puesto: 'Colorista' }],
    ['foto http descartada', { foto: 'http://img.test/a.jpg' }, { foto: undefined }],
    ['foto como arreglo: la primera https', { foto: ['', FOTO_ESPECIALISTA] }, { foto: FOTO_ESPECIALISTA }],
    [
      'especialidades: solo textos no vacíos y recortados',
      { especialidades: [' Corte ', '', '  ', 3, null, { nombre: 'x' }, 'Color'] },
      { especialidades: ['Corte', 'Color'] },
    ],
    ['especialidades como texto quedan vacías', { especialidades: 'Corte, Color' }, { especialidades: [] }],
    ['especialidades null quedan vacías', { especialidades: null }, { especialidades: [] }],
  ])('%s', async (_caso, campos, esperado) => {
    const [especialista] = await especialistasDe([{ ...especialistaAgendaCruda(ESPECIALISTA_UNO), ...campos }]);
    expect(especialista).toMatchObject(esperado);
  });
});

// ── Disponibilidad ───────────────────────────────────────────────────────────────────────────

describe('obtenerDisponibilidad: horarios libres (GET /api/citas/disponibilidad)', () => {
  it('pide la especialista, el día local y el servicio, cada uno codificado', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const especialistaId = 'a b&c=d';
    const ruta = rutaDisponibilidad(especialistaId, DIA_CITA, 2);
    const llamadas = simularServidorReserva({ [ruta]: () => respuesta(disponibilidadCruda()) });
    await obtenerDisponibilidad({ especialistaId, fecha: DIA_CITA, servicioId: 2 });
    const llamada = unicaLlamada(llamadas, ruta);
    expect(llamada.ruta).toBe('/api/citas/disponibilidad?especialistaId=a%20b%26c%3Dd&fecha=2026-10-20&servicioId=2');
  });

  it('día abierto: devuelve los slots con inicio, fin y horaLocal tal como llegan', async () => {
    const cruda = disponibilidadCruda();
    await expect(disponibilidadDe(cruda)).resolves.toEqual({ abierto: true, motivo: null, slots: cruda.slots });
    expect(cruda.slots[0]).toEqual({
      inicio: '2026-10-20T15:30:00.000Z',
      fin: '2026-10-20T18:00:00.000Z',
      horaLocal: '09:30 a.m.',
    });
  });

  it('día cerrado: abierto false con el motivo del servidor y sin slots', async () => {
    simularServidorReserva({});
    await expect(
      obtenerDisponibilidad({ especialistaId: ESPECIALISTA_UNO.usuarioId, fecha: DIA_DOMINGO, servicioId: 2 }),
    ).resolves.toEqual({ abierto: false, motivo: MOTIVO_SALON_CERRADO, slots: [] });
  });

  it.each<[string, string, string, string]>([
    ['el domingo no abre', DIA_DOMINGO, '', ''],
    ['entre semana cierra a las 19:30: el alaciado de 150 min empieza a más tardar a las 17:00', DIA_CITA, '09:30 a.m.', '05:00 p.m.'],
    ['el sábado cierra a las 19:00: el último alaciado empieza a las 16:30', DIA_SABADO, '09:30 a.m.', '04:30 p.m.'],
  ])('la app pinta lo que calcula el servidor: %s', async (_caso, fecha, primera, ultima) => {
    const cruda = disponibilidadComoServidor({ fecha });
    const disponibilidad = await disponibilidadDe(cruda);
    expect(disponibilidad.abierto).toBe(fecha !== DIA_DOMINGO);
    expect(disponibilidad.slots[0]?.horaLocal ?? '').toBe(primera);
    expect(disponibilidad.slots.at(-1)?.horaLocal ?? '').toBe(ultima);
    expect(disponibilidad.slots).toEqual(cruda.slots);
  });

  it('horarios ya pasados: el servidor los quita; hoy a las 10:00 el primer slot es el de las 10:30', async () => {
    const cruda = disponibilidadComoServidor({ fecha: HOY, duracionMinutos: 60 });
    const disponibilidad = await disponibilidadDe(cruda);
    expect(disponibilidad.slots[0]).toEqual(slotCrudo(HOY, '10:30', 60));
    expect(disponibilidad.slots.every((slot) => new Date(slot.inicio).getTime() > AHORA.getTime())).toBe(true);
  });

  it('horarios ya pasados: la app no vuelve a filtrar por hora; pinta exactamente los slots que llegan', async () => {
    // Si el servidor mandara un slot que ya empezó, el modelo lo deja pasar: filtrar es trabajo del
    // backend (quita inicio <= ahora y los ocupados). La app no compara con su propio reloj.
    const pasado = slotCrudo(HOY, '09:30', 60);
    const futuro = slotCrudo(HOY, '11:00', 60);
    const disponibilidad = await disponibilidadDe(disponibilidadCruda({ fecha: HOY, slots: [pasado, futuro] }));
    expect(disponibilidad.slots).toEqual([pasado, futuro]);
  });

  it('los ocupados también los quita el servidor: un alaciado a las 11:00 bloquea los slots que se cruzan', async () => {
    const ocupada = { inicio: isoMexico(DIA_CITA, '11:00'), fin: isoMexico(DIA_CITA, '13:30') };
    const disponibilidad = await disponibilidadDe(disponibilidadComoServidor({ fecha: DIA_CITA, ocupadas: [ocupada] }));
    const horas = disponibilidad.slots.map((slot) => slot.horaLocal);
    // Con 150 min, de las 9:30 a la 1:00 todos se cruzan con la cita; el primero libre es el de la 1:30.
    expect(horas[0]).toBe('01:30 p.m.');
    expect(horas).not.toContain('09:30 a.m.');
    expect(horas).not.toContain('11:00 a.m.');
  });

  it('lee la disponibilidad aunque llegue envuelta en { data }', async () => {
    const cruda = disponibilidadCruda();
    await expect(disponibilidadDe({ success: true, data: cruda })).resolves.toEqual({
      abierto: true,
      motivo: null,
      slots: cruda.slots,
    });
  });

  it('descarta los slots sin inicio o sin fin y los que no son objetos; recorta y completa horaLocal', async () => {
    const valido = slotCrudo(DIA_CITA, '12:30');
    const disponibilidad = await disponibilidadDe(
      disponibilidadCruda({
        slots: [
          null,
          'slot',
          { fin: valido.fin, horaLocal: 'sin inicio' },
          { inicio: valido.inicio, horaLocal: 'sin fin' },
          { inicio: '   ', fin: valido.fin },
          { inicio: ` ${valido.inicio} `, fin: valido.fin },
          valido,
        ] as unknown as never[],
      }),
    );
    expect(disponibilidad.slots).toEqual([{ inicio: valido.inicio, fin: valido.fin, horaLocal: '' }, valido]);
  });

  it.each<[string, unknown, boolean]>([
    ['true', true, true],
    ['false', false, false],
    ['el texto "true"', 'true', false],
    ['el número 1', 1, false],
    ['null', null, false],
  ])('abierto %s queda como %p (solo el booleano true abre)', async (_caso, abierto, esperado) => {
    expect((await disponibilidadDe({ ...disponibilidadCruda(), abierto })).abierto).toBe(esperado);
  });

  it.each<[string, unknown, string | null]>([
    ['texto', ` ${MOTIVO_SALON_CERRADO} `, MOTIVO_SALON_CERRADO],
    ['vacío', '   ', null],
    ['null', null, null],
    ['número', 0, '0'],
  ])('motivo como %s queda como %p', async (_caso, motivo, esperado) => {
    expect((await disponibilidadDe({ ...disponibilidadCerrada(), motivo })).motivo).toBe(esperado);
  });

  it.each<[string, unknown]>([
    ['cuerpo null', null],
    ['cuerpo de texto', 'sin horarios'],
    ['cuerpo como arreglo', [slotCrudo(DIA_CITA, '09:30')]],
    ['slots como texto', { abierto: true, slots: 'ninguno' }],
    ['sin slots', { abierto: false }],
  ])('%s no deja horarios', async (_caso, cuerpo) => {
    const disponibilidad = await disponibilidadDe(cuerpo);
    expect(disponibilidad.slots).toEqual([]);
    expect(disponibilidad.motivo).toBeNull();
  });
});

// ── Crear la cita ────────────────────────────────────────────────────────────────────────────

describe('crearCita: cuerpo de POST /api/citas?propios=true', () => {
  it('manda clienteId, especialistaId, servicioId y el horario del slot, sin notas ni pagoAnticipo', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorReserva({});
    await crearCita(DATOS);
    const llamada = unicaLlamada(llamadas, RUTA_CREAR_CITA);
    expect(llamada.ruta).toBe('/api/citas?propios=true');
    expect(llamada.cabeceras['Content-Type']).toBe('application/json');
    expect(llamada.cuerpo).toStrictEqual({
      clienteId: CLIENTA_CITAS.id,
      especialistaId: ESPECIALISTA_UNO.usuarioId,
      servicioId: 2,
      fechaHoraInicio: INICIO_CITA_ISO,
      fechaHoraFin: FIN_CITA_CON_ANTICIPO_ISO,
    });
  });

  it.each<[string, Partial<DatosNuevaCita>, Record<string, unknown>]>([
    ['especialistaId numérico como texto', { especialistaId: 7 }, { especialistaId: '7' }],
    ['especialistaId de texto tal cual', { especialistaId: 'persona-x' }, { especialistaId: 'persona-x' }],
    ['servicioId de texto como número', { servicioId: '2' }, { servicioId: 2 }],
    ['servicioId numérico tal cual', { servicioId: 1 }, { servicioId: 1 }],
  ])('convierte el %s', async (_caso, cambios, esperado) => {
    expect(await cuerpoEnviado({ ...DATOS, ...cambios })).toMatchObject(esperado);
  });

  it.each<[string, string | undefined, string | undefined]>([
    ['con espacios se recortan', '  Traigo foto de referencia  ', 'Traigo foto de referencia'],
    ['solo espacios no se mandan', '   ', undefined],
    ['vacías no se mandan', '', undefined],
    ['sin notas no se mandan', undefined, undefined],
  ])('notas %s', async (_caso, notas, esperado) => {
    const cuerpo = (await cuerpoEnviado({ ...DATOS, notas })) as Record<string, unknown>;
    expect(cuerpo.notas).toBe(esperado);
    expect('notas' in cuerpo).toBe(esperado !== undefined);
  });

  it.each<[string, DatosNuevaCita['pagoAnticipo']]>([
    ['en línea', 'linea'],
    ['en el salón', 'salon'],
    ['sin elegir (el backend usa línea)', undefined],
  ])('pagoAnticipo %s solo se manda si viene', async (_caso, pagoAnticipo) => {
    const cuerpo = (await cuerpoEnviado({ ...DATOS, pagoAnticipo })) as Record<string, unknown>;
    expect(cuerpo.pagoAnticipo).toBe(pagoAnticipo);
    expect('pagoAnticipo' in cuerpo).toBe(pagoAnticipo !== undefined);
  });

  it.each<[string, unknown, Cita]>([
    ['con anticipo', CITA_CON_ANTICIPO, CITA_CON_ANTICIPO_NORMALIZADA],
    ['sin anticipo', CITA_SIN_ANTICIPO, CITA_SIN_ANTICIPO_NORMALIZADA],
  ])('devuelve la cita %s ya normalizada', async (_caso, cita, esperada) => {
    simularServidorReserva({ [RUTA_CREAR_CITA]: () => respuesta(cuerpoCita(cita), 201) });
    await expect(crearCita(DATOS)).resolves.toEqual(esperada);
  });

  it('plazo de 2 horas: la cita llega con anticipoVenceEn = ahora más 2 horas y el modelo lo deja tal cual', async () => {
    simularServidorReserva({});
    const cita = await crearCita({ ...DATOS, pagoAnticipo: 'linea' });
    expect(cita.anticipoVenceEn).toBe(VENCE_ANTICIPO_ISO);
    expect(new Date(VENCE_ANTICIPO_ISO).getTime() - AHORA.getTime()).toBe(PLAZO_ANTICIPO_HORAS * HORA_MS);
    expect(pideAnticipo(cita)).toBe(true);
  });

  it('plazo de 2 horas: si la cita empieza antes, vence 15 minutos antes del inicio', async () => {
    simularServidorReserva({});
    const inicio = isoMexico(HOY, '11:00');
    const cita = await crearCita({ ...DATOS, fechaHoraInicio: inicio, fechaHoraFin: isoMexico(HOY, '13:30') });
    expect(new Date(inicio).getTime() - new Date(cita.anticipoVenceEn ?? '').getTime()).toBe(
      MINUTOS_PAGO_EN_SALON * MINUTO_MS,
    );
  });

  it('el horario, la especialista y las notas de la cita creada son los que mandó la app', async () => {
    simularServidorReserva({});
    const slot = slotCrudo(DIA_CITA, '12:30');
    const cita = await crearCita({
      ...DATOS,
      especialistaId: ESPECIALISTA_DOS.usuarioId,
      fechaHoraInicio: slot.inicio,
      fechaHoraFin: slot.fin,
      notas: ' Primera vez ',
      pagoAnticipo: 'salon',
    });
    expect(cita).toMatchObject({
      especialistaId: ESPECIALISTA_DOS.usuarioId,
      especialistaNombre: ESPECIALISTA_DOS.nombre,
      fechaHoraInicio: slot.inicio,
      fechaHoraFin: slot.fin,
      notas: 'Primera vez',
      anticipoEnSalon: true,
      anticipoVenceEn: new Date(new Date(slot.inicio).getTime() - MINUTOS_PAGO_EN_SALON * MINUTO_MS).toISOString(),
    });
  });

  it.each<[string, unknown]>([
    ['sin data', { success: true }],
    ['data null', { success: true, data: null }],
    ['data como arreglo', { success: true, data: [CITA_CON_ANTICIPO] }],
    ['data como texto', { success: true, data: 'cita' }],
    ['la cita en la raíz', CITA_CON_ANTICIPO],
    ['cuerpo null', null],
    ['cuerpo de texto', 'creada'],
  ])('una respuesta %s falla con "Respuesta de cita sin datos." (no es ApiError)', async (_caso, cuerpo) => {
    simularServidorReserva({ [RUTA_CREAR_CITA]: () => respuesta(cuerpo, 201) });
    const error = await errorDe(crearCita(DATOS));
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(ApiError);
    expect((error as Error).message).toBe(MENSAJE_SIN_DATOS);
  });
});

// ── obtenerCita y normalización ──────────────────────────────────────────────────────────────

describe('obtenerCita: una cita de la clienta (GET /api/citas/:id?propios=true)', () => {
  it('pide la cita con propios=true y la normaliza', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    const llamadas = simularServidorReserva({});
    await expect(obtenerCita(ID_CITA)).resolves.toEqual(CITA_CON_ANTICIPO_NORMALIZADA);
    expect(unicaLlamada(llamadas, rutaCita()).cuerpo).toBeUndefined();
  });

  it('codifica el id con encodeURIComponent', async () => {
    const id = 'a b/c?d';
    const llamadas = simularServidorReserva({ [rutaCita(id)]: () => respuesta(cuerpoCita()) });
    await obtenerCita(id);
    expect(llamadas[0].ruta).toBe('/api/citas/a%20b%2Fc%3Fd?propios=true');
  });

  it('una cita con el anticipo pagado trae su pago aprobado y ya no pide anticipo', async () => {
    simularServidorReserva({ [rutaCita()]: () => respuesta(cuerpoCita(citaAnticipoPagado())) });
    const cita = await obtenerCita(ID_CITA);
    expect(cita).toMatchObject({ estado: 'confirmada', anticipoPagadoEn: PAGADO_EN_ISO });
    expect(cita.pagos).toEqual([
      { estado: 'aprobado', monto: 360, metodo: 'mercadopago', pagadoEn: PAGADO_EN_ISO, retenidoEn: null },
    ]);
    expect(pideAnticipo(cita)).toBe(false);
  });

  it('un 404 (cita ajena o inexistente) llega como ApiError', async () => {
    simularServidorReserva({ [rutaCita()]: conError(ERRORES.citaNoEncontrada) });
    await expect(errorDe(obtenerCita(ID_CITA))).resolves.toEqual(apiErrorDe(ERRORES.citaNoEncontrada));
  });

  it('una respuesta sin data falla con "Respuesta de cita sin datos."', async () => {
    simularServidorReserva({ [rutaCita()]: () => respuesta({ success: true }) });
    await expect(obtenerCita(ID_CITA)).rejects.toThrow(MENSAJE_SIN_DATOS);
  });
});

describe('normalización de la cita creada', () => {
  it('una cita con solo id deja los valores vacíos que espera la vista', async () => {
    simularServidorReserva({ [rutaCita()]: () => respuesta(cuerpoCita({ id: ID_CITA })) });
    await expect(obtenerCita(ID_CITA)).resolves.toEqual({
      id: ID_CITA,
      servicioId: '',
      servicioNombre: '',
      especialistaId: '',
      especialistaNombre: '',
      fechaHoraInicio: '',
      fechaHoraFin: '',
      estado: '',
      anticipoRequerido: 0,
      anticipoMonto: null,
      anticipoVenceEn: null,
      anticipoPagadoEn: null,
      anticipoEnSalon: false,
      notas: '',
      motivoCancelacion: null,
      servicioDuracionMinutos: 0,
      servicioPrecio: null,
      pagos: [],
      // GP-07.4: sin `reglas` en la cita quedan las de omisión (las mismas de la cita ficticia).
      reglas: CITA_SIN_ANTICIPO_NORMALIZADA.reglas,
      reglasGuardadas: false,
    });
  });

  it.each<[string, Record<string, unknown>, Partial<Cita>]>([
    ['servicioId de la raíz', { servicioId: 9 }, { servicioId: 9 }],
    ['servicio.id si falta servicioId', { servicioId: undefined }, { servicioId: 2 }],
    ['servicio.id si servicioId es null', { servicioId: null, servicio: { id: 'srv' } }, { servicioId: 'srv' }],
    ['servicioId vacío si no es texto ni número', { servicioId: { id: 2 } }, { servicioId: '' }],
    ['especialistaId de la raíz', { especialistaId: 'persona-raiz' }, { especialistaId: 'persona-raiz' }],
    [
      'especialista.id si falta especialistaId',
      { especialistaId: undefined, especialista: { id: 33, nombre: 'Nombre' } },
      { especialistaId: 33, especialistaNombre: 'Nombre' },
    ],
    ['especialistaId vacío si no es texto ni número', { especialistaId: [1] }, { especialistaId: '' }],
    [
      'servicio que no es objeto: sin nombre, duración ni precio',
      { servicio: 'Alaciado' },
      { servicioNombre: '', servicioDuracionMinutos: 0, servicioPrecio: null },
    ],
    ['especialista que no es objeto: sin nombre', { especialista: ['Especialista'] }, { especialistaNombre: '' }],
    ['_id cuando falta id', { id: undefined, _id: 'cita-respaldo' }, { id: 'cita-respaldo' }],
    ['notas recortadas', { notas: '  Traigo foto  ' }, { notas: 'Traigo foto' }],
    ['motivoCancelacion vacío como null', { motivoCancelacion: '  ' }, { motivoCancelacion: null }],
    ['estado recortado', { estado: ' pendiente ' }, { estado: 'pendiente' }],
    ['anticipoEnSalon true', { anticipoEnSalon: true }, { anticipoEnSalon: true }],
    ['anticipoEnSalon "true" (solo el booleano cuenta)', { anticipoEnSalon: 'true' }, { anticipoEnSalon: false }],
    ['anticipoVenceEn vacío como null', { anticipoVenceEn: '' }, { anticipoVenceEn: null }],
    ['anticipoPagadoEn recortado', { anticipoPagadoEn: ` ${PAGADO_EN_ISO} ` }, { anticipoPagadoEn: PAGADO_EN_ISO }],
  ])('%s', async (_caso, campos, esperado) => {
    expect(await normalizarCita(campos)).toMatchObject(esperado);
  });

  it.each<[unknown, number]>([
    [150, 150],
    ['150', 150],
    [44.6, 45],
    [0, 0],
    [-30, 0],
    ['abc', 0],
    [null, 0],
  ])('servicio.duracionMinutos %p queda como %p', async (duracionMinutos, esperado) => {
    const cita = await normalizarCita({ servicio: { ...CITA_CON_ANTICIPO.servicio, duracionMinutos } });
    expect(cita.servicioDuracionMinutos).toBe(esperado);
  });

  it.each<[unknown, string | null]>([
    ['1200.00', '$1,200'],
    ['$350', '$350'],
    ['0.00', null],
    [null, null],
  ])('servicio.precio %p se muestra como %p', async (precio, esperado) => {
    const cita = await normalizarCita({ servicio: { ...CITA_CON_ANTICIPO.servicio, precio } });
    expect(cita.servicioPrecio).toBe(esperado);
  });

  it('pagos: descarta lo que no es objeto y normaliza cada pago', async () => {
    const cita = await normalizarCita({
      pagos: [
        null,
        'pago',
        pagoCrudo({ estado: 'rechazado', monto: '$1,200', metodo: '  ' }),
        pagoCrudo({ estado: 'aprobado', monto: 'gratis', pagadoEn: PAGADO_EN_ISO, retenidoEn: PAGADO_EN_ISO }),
      ],
    });
    expect(cita.pagos).toEqual([
      { estado: 'rechazado', monto: 1200, metodo: null, pagadoEn: null, retenidoEn: null },
      { estado: 'aprobado', monto: 0, metodo: 'mercadopago', pagadoEn: PAGADO_EN_ISO, retenidoEn: PAGADO_EN_ISO },
    ]);
  });

  it.each<[string, unknown]>([
    ['texto', 'pagos'],
    ['objeto', pagoCrudo()],
    ['null', null],
  ])('pagos como %s quedan vacíos', async (_caso, pagos) => {
    expect((await normalizarCita({ pagos })).pagos).toEqual([]);
  });
});

// ── Anticipo ─────────────────────────────────────────────────────────────────────────────────

describe('anticipo: monto (anticipoRequerido y anticipoMonto)', () => {
  it.each<[string, unknown, number, string | null]>([
    ['texto decimal del backend', '360.00', 360, '$360'],
    ['con signo de pesos y comas', '$1,200', 1200, '$1,200'],
    ['con signo de pesos', '$360', 360, '$360'],
    ['número', 360, 360, '$360'],
    ['con centavos', '1200.50', 1200.5, '$1,200.50'],
    ['cero', 0, 0, null],
    ['cero decimal', '0.00', 0, null],
    ['negativo', '-50.00', 0, null],
    ['no numérico', 'gratis', 0, null],
    ['vacío', '', 0, null],
    ['null (sin anticipo)', null, 0, null],
    ['booleano', true, 0, null],
  ])('%s (%p) da %p y se muestra como %p', async (_caso, anticipoRequerido, monto, texto) => {
    const cita = await normalizarCita({ anticipoRequerido });
    expect(cita.anticipoRequerido).toBe(monto);
    expect(cita.anticipoMonto).toBe(texto);
  });
});

describe('anticipo: pideAnticipo', () => {
  it.each<[string, Partial<Cita>, boolean]>([
    ['con anticipo sin pagar', {}, true],
    ['con anticipo en el salón sin pagar', { anticipoEnSalon: true }, true],
    ['con anticipo pagado', { anticipoPagadoEn: PAGADO_EN_ISO }, false],
    ['sin anticipo', { anticipoRequerido: 0, anticipoMonto: null }, false],
  ])('una cita %s da %p', (_caso, cambios, esperado) => {
    expect(pideAnticipo({ ...CITA_CON_ANTICIPO_NORMALIZADA, ...cambios })).toBe(esperado);
  });
});

// ── Fechas y horas locales ───────────────────────────────────────────────────────────────────

describe('fechaLocal y meses del calendario', () => {
  it.each<[Date, string]>([
    [new Date(2026, 0, 5, 12, 0), '2026-01-05'],
    [new Date(2026, 11, 31, 12, 0), '2026-12-31'],
    [new Date(2026, 9, 9, 9, 30), '2026-10-09'],
  ])('fechaLocal(%p) da %p con año, mes y día locales', (fecha, esperado) => {
    expect(fechaLocal(fecha)).toBe(esperado);
  });

  it('a las 23:30 del teléfono sigue siendo el mismo día (no pasa a UTC como toISOString)', () => {
    expect(fechaLocal(new Date(2026, 9, 19, 23, 30))).toBe(HOY);
  });

  it('mesDe sin fecha da el mes de hoy (octubre de 2026) y con fecha, el de esa fecha', () => {
    expect(mesDe()).toEqual({ anio: 2026, mes: 9 });
    expect(mesDe(new Date(2027, 1, 14))).toEqual({ anio: 2027, mes: 1 });
  });

  it.each<[MesCalendario, number, MesCalendario]>([
    [{ anio: 2026, mes: 9 }, 1, { anio: 2026, mes: 10 }],
    [{ anio: 2026, mes: 11 }, 1, { anio: 2027, mes: 0 }],
    [{ anio: 2026, mes: 0 }, -1, { anio: 2025, mes: 11 }],
    [{ anio: 2026, mes: 9 }, 14, { anio: 2027, mes: 11 }],
    [{ anio: 2026, mes: 9 }, 0, { anio: 2026, mes: 9 }],
  ])('sumarMeses(%p, %p) da %p (con cambio de año)', (mes, delta, esperado) => {
    expect(sumarMeses(mes, delta)).toEqual(esperado);
  });

  it.each<[MesCalendario, MesCalendario, number]>([
    [{ anio: 2026, mes: 8 }, { anio: 2026, mes: 9 }, -1],
    [{ anio: 2026, mes: 9 }, { anio: 2026, mes: 9 }, 0],
    [{ anio: 2027, mes: 0 }, { anio: 2026, mes: 11 }, 1],
    [{ anio: 2025, mes: 11 }, { anio: 2026, mes: 1 }, -2],
  ])('compararMeses(%p, %p) da %p', (a, b, esperado) => {
    expect(compararMeses(a, b)).toBe(esperado);
  });

  it.each<[MesCalendario, string]>([
    [{ anio: 2026, mes: 9 }, 'Octubre 2026'],
    [{ anio: 2027, mes: 0 }, 'Enero 2027'],
    [{ anio: 2026, mes: 11 }, 'Diciembre 2026'],
    [{ anio: 2026, mes: 12 }, ' 2026'],
  ])('tituloMes(%p) da %p', (mes, esperado) => {
    expect(tituloMes(mes)).toBe(esperado);
  });

  it('los encabezados de la semana van de domingo a sábado', () => {
    expect(ENCABEZADOS_SEMANA).toEqual(['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']);
  });
});

describe('semanasDelMes', () => {
  /** Días (o null) de cada semana, para comparar sin repetir las fechas. */
  const dias = (mes: MesCalendario) => semanasDelMes(mes).map((semana) => semana.map((celda) => celda?.dia ?? null));

  it('octubre de 2026 empieza en jueves: cuatro celdas vacías y cinco semanas completas', () => {
    const semanas = dias({ anio: 2026, mes: 9 });
    expect(semanas).toHaveLength(5);
    expect(semanas[0]).toEqual([null, null, null, null, 1, 2, 3]);
    expect(semanas[4]).toEqual([25, 26, 27, 28, 29, 30, 31]);
  });

  it('noviembre de 2026 empieza en domingo y rellena el final con celdas vacías', () => {
    const semanas = dias({ anio: 2026, mes: 10 });
    expect(semanas[0]).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(semanas.at(-1)).toEqual([29, 30, null, null, null, null, null]);
  });

  it('cada semana tiene siete celdas y cada día trae su fecha YYYY-MM-DD local', () => {
    const semanas = semanasDelMes({ anio: 2026, mes: 1 });
    expect(semanas.every((semana) => semana.length === 7)).toBe(true);
    const celdas = semanas.flat().filter((celda) => celda !== null);
    expect(celdas).toHaveLength(28);
    expect(celdas[0]).toEqual({ fecha: '2026-02-01', dia: 1 });
    expect(celdas.at(-1)).toEqual({ fecha: '2026-02-28', dia: 28 });
  });
});

describe('fechaLegible y horaLegible', () => {
  it.each<[string, string | Date, string]>([
    ["'YYYY-MM-DD' armado en hora local", DIA_SABADO, 'sábado 24 de octubre'],
    ["'YYYY-MM-DD' con espacios", ` ${DIA_CITA} `, 'martes 20 de octubre'],
    ['Date local', new Date(2026, 9, 28, 11, 15), 'miércoles 28 de octubre'],
    ['ISO completo', new Date(2026, 11, 31, 18, 0).toISOString(), 'jueves 31 de diciembre'],
    ['domingo a primera hora', enHoraLocal(DIA_DOMINGO, '00:05'), 'domingo 25 de octubre'],
  ])('fechaLegible con %s', (_caso, valor, esperado) => {
    expect(fechaLegible(valor)).toBe(esperado);
  });

  it.each<[string, string, string]>([
    ['medianoche', '00:05', '12:05 a. m.'],
    ['madrugada', '01:15', '1:15 a. m.'],
    ['mañana', '09:30', '9:30 a. m.'],
    ['antes del mediodía', '11:59', '11:59 a. m.'],
    ['mediodía', '12:00', '12:00 p. m.'],
    ['después del mediodía', '12:30', '12:30 p. m.'],
    ['tarde', '18:30', '6:30 p. m.'],
    ['noche', '23:05', '11:05 p. m.'],
  ])('horaLegible en la %s da 12 horas con a. m. o p. m.', (_caso, hora, esperado) => {
    const fecha = enHoraLocal(DIA_CITA, hora);
    expect(horaLegible(fecha)).toBe(esperado);
    expect(horaLegible(fecha.toISOString())).toBe(esperado);
  });

  it("horaLegible de un 'YYYY-MM-DD' suelto es la medianoche local", () => {
    expect(horaLegible(DIA_CITA)).toBe('12:00 a. m.');
  });

  it.each<[string, string | Date]>([
    ['texto', 'mañana'],
    ['vacío', ''],
    ['fecha imposible', '2026-13-45T00:00:00Z'],
    ['Date inválido', new Date(Number.NaN)],
  ])('una fecha inválida (%s) da texto vacío', (_caso, valor) => {
    expect(fechaLegible(valor)).toBe('');
    expect(horaLegible(valor)).toBe('');
  });
});

describe('limiteAnticipo y limitePagoCorto', () => {
  /**
   * Hoy a las 0:30 del teléfono, para que el día y la hora no dependan de la zona y todos los plazos
   * de hoy queden por delante (GP-07.4: un plazo que ya pasó no muestra hora límite).
   */
  const ahoraLocal = enHoraLocal(HOY, '00:30');
  const venceHoy = (hora: string) => enHoraLocal(HOY, hora).toISOString();

  it.each<[string, string, string]>([
    ['la 1:15 de la tarde', '13:15', 'antes de la 1:15 p. m.'],
    ['la 1:15 de la madrugada', '01:15', 'antes de la 1:15 a. m.'],
    ['las 11:15', '11:15', 'antes de las 11:15 a. m.'],
    ['las 12:00 (mediodía)', '12:00', 'antes de las 12:00 p. m.'],
    ['las 6:30 de la tarde', '18:30', 'antes de las 6:30 p. m.'],
  ])('si vence hoy a %s: solo la hora', (_caso, hora, esperado) => {
    expect(limiteAnticipo(venceHoy(hora), ahoraLocal)).toBe(esperado);
  });

  it('si vence otro día: el día, la fecha y la hora', () => {
    const vence = enHoraLocal('2026-10-28', '11:15').toISOString();
    expect(limiteAnticipo(vence, ahoraLocal)).toBe('antes del miércoles 28 de octubre, 11:15 a. m.');
  });

  it('si vence mañana a la 1:15 no usa "la": lleva la fecha', () => {
    const vence = enHoraLocal(DIA_CITA, '13:15').toISOString();
    expect(limiteAnticipo(vence, ahoraLocal)).toBe('antes del martes 20 de octubre, 1:15 p. m.');
  });

  it.each<[string, string | null]>([
    ['null', null],
    ['vacío', ''],
    ['texto que no es fecha', 'pronto'],
  ])('sin plazo válido (%s) da null', (_caso, venceEn) => {
    expect(limiteAnticipo(venceEn, ahoraLocal)).toBeNull();
    expect(limitePagoCorto(venceEn, ahoraLocal)).toBeNull();
  });

  it('GP-07.4: un plazo que ya pasó en el teléfono da null (sin hora límite pasada)', () => {
    expect(limiteAnticipo(venceHoy('00:15'), ahoraLocal)).toBeNull();
    expect(limitePagoCorto(venceHoy('00:30'), ahoraLocal)).toBeNull();
  });

  it('sin ahora usa el reloj del teléfono', () => {
    jest.setSystemTime(ahoraLocal);
    expect(limiteAnticipo(venceHoy('13:15'))).toBe('antes de la 1:15 p. m.');
    expect(limitePagoCorto(venceHoy('18:30'))).toBe('Paga antes de las 6:30 p. m.');
  });

  it('limitePagoCorto antepone "Paga" al límite de hoy o de otro día', () => {
    expect(limitePagoCorto(venceHoy('11:15'), ahoraLocal)).toBe('Paga antes de las 11:15 a. m.');
    expect(limitePagoCorto(enHoraLocal(DIA_SABADO, '11:15').toISOString(), ahoraLocal)).toBe(
      'Paga antes del sábado 24 de octubre, 11:15 a. m.',
    );
  });

  it('plazo de 2 horas: el plazo de la cita creada vence hoy, así que solo muestra la hora', () => {
    // AHORA (16:00 UTC) más 2 horas sigue siendo hoy tanto en UTC como en México.
    expect(limiteAnticipo(VENCE_ANTICIPO_ISO, AHORA)).toBe(`antes de las ${horaLegible(VENCE_ANTICIPO_ISO)}`);
  });
});

// ── Errores ──────────────────────────────────────────────────────────────────────────────────

describe.each<[string, string, () => Promise<unknown>]>([
  ['crearCita', RUTA_CREAR_CITA, () => crearCita(DATOS)],
  ['obtenerCita', rutaCita(), () => obtenerCita(ID_CITA)],
  ['obtenerEspecialistas', RUTA_ESPECIALISTAS, () => obtenerEspecialistas()],
  [
    'obtenerDisponibilidad',
    RUTA_MARTES,
    () => obtenerDisponibilidad({ especialistaId: ESPECIALISTA_UNO.usuarioId, fecha: DIA_CITA, servicioId: 2 }),
  ],
])('%s: errores a través de crearErrorApi', (_nombre, ruta, llamar) => {
  it('sin red llega como el ErrorDeRed de apiClient', async () => {
    simularSinRed();
    const error = await errorDe(llamar());
    expect(error).toBeInstanceOf(ErrorDeRed);
    expect(error).toEqual(crearErrorApi({ tipo: 'red' }));
  });

  it.each<[string, CuerpoError]>([
    ['409', ERRORES.anticipoPagado],
    ['422 con mensajes en arreglo', ERRORES.validacion],
    ['500', ERRORES.interno],
    ['400 con code', cuerpoError(400, MENSAJES_BACKEND.horarioPasado, 'HORARIO_PASADO')],
  ])('un %s llega como ApiError con su status, mensaje y code', async (_caso, cuerpo) => {
    simularServidorReserva({ [ruta]: conError(cuerpo) });
    const error = await errorDe(llamar());
    const esperado = apiErrorDe(cuerpo);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toEqual(esperado);
    expect(error).toMatchObject({ status: cuerpo.statusCode, code: esperado.code });
  });

  it('el 422 junta los mensajes de validación', async () => {
    simularServidorReserva({ [ruta]: conError(ERRORES.validacion) });
    expect(((await errorDe(llamar())) as ApiError).message).toBe(MENSAJES_BACKEND.validacion.join(', '));
  });

  it('un 401 con la renovación rechazada cierra la sesión y llega como sesión terminada', async () => {
    await sembrarSesion(CLIENTA_CITAS);
    simularServidorReserva({ [ruta]: conError(ERRORES.noAutorizado), [RUTA_RENOVAR_MOVIL]: conError(ERRORES.sesionVencida) });
    const error = await errorDe(llamar());
    expect(error).toEqual(crearErrorApi({ tipo: 'sesionTerminada', code: 'SESION_VENCIDA' }));
    expect(error).toMatchObject({ status: 401, code: 'SESION_VENCIDA' });
    expect(sesionGuardada()).toBeNull();
  });

  it('un 401 sin sesión llega como ApiError sin intentar renovar', async () => {
    const llamadas = simularServidorReserva({ [ruta]: conError(ERRORES.noAutorizado) });
    await expect(errorDe(llamar())).resolves.toEqual(apiErrorDe(ERRORES.noAutorizado));
    expect(llamadasDeRuta(llamadas, RUTA_RENOVAR_MOVIL)).toHaveLength(0);
  });
});

describe('esHorarioOcupado (400 de horario ocupado, no 409)', () => {
  it.each<[string, unknown, boolean]>([
    ['el 400 del backend con el número de cita', apiErrorDe(ERRORES.horarioOcupado), true],
    ['el mismo texto en mayúsculas', new ApiError(400, MENSAJES_BACKEND.horarioOcupado.toUpperCase()), true],
    ['el mismo texto como 409', new ApiError(409, MENSAJES_BACKEND.horarioOcupado), false],
    ['otro 400 (horario que ya pasó)', apiErrorDe(ERRORES.horarioPasado), false],
    ['otro 400 (salón cerrado)', apiErrorDe(ERRORES.salonCerrado), false],
    ['un Error común con el texto', new Error(MENSAJES_BACKEND.horarioOcupado), false],
    ['sin red', new ErrorDeRed(), false],
    ['un texto', MENSAJES_BACKEND.horarioOcupado, false],
    ['null', null, false],
  ])('%s da %p', (_caso, error, esperado) => {
    expect(esHorarioOcupado(error)).toBe(esperado);
  });

  it('el 400 de crearCita por horario ocupado se reconoce para recargar la disponibilidad', async () => {
    simularServidorReserva({ [RUTA_CREAR_CITA]: conError(ERRORES.horarioOcupado) });
    const error = await errorDe(crearCita(DATOS));
    expect(error).toMatchObject({ status: 400 });
    expect(esHorarioOcupado(error)).toBe(true);
    expect(mensajeAnticipoParaClienta(error)).toBeNull();
  });
});

describe('mensajeAnticipoParaClienta (solo los textos de la lista pasan)', () => {
  it.each(MENSAJES_ANTICIPO_PARA_CLIENTA.map((mensaje) => [mensaje]))('"%s" pasa tal cual en un 400', (mensaje) => {
    expect(mensajeAnticipoParaClienta(new ApiError(400, mensaje))).toBe(mensaje);
    expect(mensajeAnticipoParaClienta(new ApiError(400, `  ${mensaje}  `))).toBe(mensaje);
  });

  it.each<[string, CuerpoError]>([
    ['sin tiempo para el anticipo', ERRORES.sinTiempoAnticipo],
    ['sin tiempo para pagar en el salón', ERRORES.sinTiempoSalon],
    ['ya hay una cita por pagar en el salón', ERRORES.unaPorPagarEnSalon],
    ['solo en línea', ERRORES.soloEnLinea],
  ])('el 400 real de crearCita (%s) llega a la clienta', async (_caso, cuerpo) => {
    simularServidorReserva({ [RUTA_CREAR_CITA]: conError(cuerpo) });
    const error = await errorDe(crearCita({ ...DATOS, pagoAnticipo: 'salon' }));
    expect(mensajeAnticipoParaClienta(error)).toBe(cuerpo.message);
    expect(esHorarioOcupado(error)).toBe(false);
  });

  it.each<[string, unknown]>([
    ['horario ocupado', apiErrorDe(ERRORES.horarioOcupado)],
    ['error interno', new ApiError(400, MENSAJES_BACKEND.interno)],
    ['validación', apiErrorDe(cuerpoError(400, ['especialistaId must be a string']))],
    ['notas no permitidas', new ApiError(400, 'Las notas contienen caracteres no permitidos')],
    ['un texto de la lista con otro texto encima', new ApiError(400, `Error: ${MENSAJES_BACKEND.soloEnLinea}`)],
    ['un texto de la lista como 409', new ApiError(409, MENSAJES_BACKEND.soloEnLinea)],
    ['un texto de la lista como 500', new ApiError(500, MENSAJES_BACKEND.soloEnLinea)],
    ['un Error común con un texto de la lista', new Error(MENSAJES_BACKEND.soloEnLinea)],
    ['sin red', new ErrorDeRed()],
    ['null', null],
  ])('cualquier otro (%s) da null', (_caso, error) => {
    expect(mensajeAnticipoParaClienta(error)).toBeNull();
  });
});

describe('motivoConflictoAnticipo (409 de la preferencia)', () => {
  it.each<[string, unknown, ReturnType<typeof motivoConflictoAnticipo>]>([
    ['plazo terminado', apiErrorDe(ERRORES.plazoTerminado), 'vencido'],
    ['ya pagado', apiErrorDe(ERRORES.anticipoPagado), 'pagado'],
    ['cita no vigente', apiErrorDe(ERRORES.citaNoVigente), 'noVigente'],
    ['plazo en mayúsculas', new ApiError(409, MENSAJES_BACKEND.plazoTerminado.toUpperCase()), 'vencido'],
    ['otro 409', new ApiError(409, 'Conflicto ficticio'), null],
    ['un 400 que dice pagado', new ApiError(400, MENSAJES_BACKEND.anticipoPagado), null],
    ['el 400 de cita sin anticipo', apiErrorDe(ERRORES.noPideAnticipo), null],
    ['un Error común', new Error(MENSAJES_BACKEND.plazoTerminado), null],
    ['sin red', new ErrorDeRed(), null],
    ['null', null, null],
  ])('%s da %p', (_caso, error, esperado) => {
    expect(motivoConflictoAnticipo(error)).toBe(esperado);
  });
});
