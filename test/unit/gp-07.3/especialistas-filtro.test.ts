/// <reference types="jest" />

import { renderHook, waitFor } from '@testing-library/react-native';

import { obtenerEspecialistas } from '@/features/citas/models/citaModel';
import { especialistaOculta, obtenerServicios } from '@/features/citas/models/servicioModel';
import { useReservarCitaViewModel } from '@/features/citas/viewmodels/useReservarCitaViewModel';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { BANDERAS_ESPECIALISTA, rutaAgendaConOculta, type BanderaEspecialista } from '../../helpers/calendarioFicticio';
import {
  CLIENTA_CITAS,
  cuerpoEspecialistas,
  ESPECIALISTAS_AGENDA,
  RUTA_ESPECIALISTAS,
  SERVICIO_SIN_ANTICIPO,
  simularServidorReserva,
  usarRelojFijo,
} from '../../helpers/citasFicticias';
import { espiarConsola } from '../../helpers/consola';
import { cuerpoLista, ESPECIALISTA_DOS, ESPECIALISTA_UNO, especialistaCruda } from '../../helpers/serviciosFicticios';
import { respuesta } from '../../helpers/servidorSimulado';
import { authSimulada, cerrarConTemporizadores, reiniciarSimulaciones } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.3: en la reserva (y en "Reservar lo mismo") solo aparecen especialistas visibles y
 * disponibles. normalizarEspecialista de citaModel (agenda, GET /api/citas/especialistas) y de
 * servicioModel (las del servicio) descartan las que traen visible, disponible o activo en false,
 * en la fila o en su usuario. Es defensivo: hoy el backend ya filtra las inactivas y no manda esas
 * banderas, así que sin banderas (o con otro valor) se quedan. Solo se simulan fetch
 * (http://api.test), expo-router, useAuth y expo-file-system.
 */

jest.mock('expo-router', () => require('../../helpers/viewmodelsAuth').expoRouterSimulado());
jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

const UNO = ESPECIALISTA_UNO.usuarioId;
const DOS = ESPECIALISTA_DOS.usuarioId;
const CORTE = SERVICIO_SIN_ANTICIPO;
const [AGENDA_UNO, AGENDA_DOS] = ESPECIALISTAS_AGENDA;

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
  reiniciarSimulaciones();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA_CITAS;
});

espiarConsola(cerrarConTemporizadores, true);
usarRelojFijo();

const ids = (lista: { id: string | number }[]) => lista.map((item) => item.id);

describe('especialistaOculta', () => {
  it.each<[string, Record<string, unknown>, boolean]>([
    ['sin banderas', {}, false],
    ['visible en false', { visible: false }, true],
    ['disponible en false', { disponible: false }, true],
    ['activo en false', { activo: false }, true],
    ['las tres en true', { visible: true, disponible: true, activo: true }, false],
    ['"false" como texto', { disponible: 'false' }, false],
    ['null', { visible: null }, false],
    ['el usuario ligado con activo en false', { usuario: { activo: false } }, true],
    ['el usuario ligado sin banderas', { usuario: { id: 'u-ficticio' } }, false],
  ])('%s', (_caso, crudo, oculta) => {
    expect(especialistaOculta(crudo)).toBe(oculta);
  });
});

describe('agenda (citaModel.obtenerEspecialistas)', () => {
  it.each(BANDERAS_ESPECIALISTA)('descarta a la que trae %s en false', async (bandera) => {
    simularServidorReserva(rutaAgendaConOculta(bandera));
    expect(ids(await obtenerEspecialistas())).toEqual([UNO]);
  });

  it.each<[string, Record<string, unknown>]>([
    ['sin banderas (como hoy el backend)', {}],
    ['con las banderas en true', { visible: true, disponible: true, activo: true }],
  ])('se quedan las dos %s', async (_caso, banderas) => {
    simularServidorReserva({
      [RUTA_ESPECIALISTAS]: () => respuesta(cuerpoEspecialistas([{ ...AGENDA_UNO, ...banderas }, { ...AGENDA_DOS, ...banderas }])),
    });
    expect(ids(await obtenerEspecialistas())).toEqual([UNO, DOS]);
  });
});

describe('especialistas del servicio (servicioModel)', () => {
  it.each<[BanderaEspecialista, 'la fila' | 'el usuario']>(
    BANDERAS_ESPECIALISTA.flatMap((bandera) => [
      [bandera, 'la fila'],
      [bandera, 'el usuario'],
    ]),
  )('descarta a la que trae %s en false en %s', async (bandera, lugar) => {
    const dos = especialistaCruda(12, CORTE.id, ESPECIALISTA_DOS);
    const oculta = lugar === 'la fila' ? { ...dos, [bandera]: false } : { ...dos, usuario: { ...dos.usuario, [bandera]: false } };
    simularServidorReserva({
      'GET /api/servicios': () =>
        respuesta(cuerpoLista([{ ...CORTE, especialistas: [especialistaCruda(11, CORTE.id, ESPECIALISTA_UNO), oculta] }])),
    });
    const [servicio] = await obtenerServicios();
    expect(ids(servicio.especialistas)).toEqual([UNO]);
  });
});

describe('useReservarCitaViewModel: solo especialistas visibles y disponibles', () => {
  async function abrir(inicial?: string) {
    simularServidorReserva(rutaAgendaConOculta('disponible'));
    const hook = await renderHook(() => useReservarCitaViewModel(String(CORTE.id), inicial));
    await waitFor(() => expect(hook.result.current.estado).toBe('listo'));
    return hook.result;
  }

  it('la que no está disponible no aparece en el paso 1', async () => {
    const result = await abrir();
    expect(ids(result.current.especialistas)).toEqual([UNO]);
  });

  it('"Reservar lo mismo" con una especialista que ya no está disponible se queda en el paso 1 sin elegir otra', async () => {
    const result = await abrir(DOS);
    expect(result.current).toMatchObject({ paso: 1, especialista: null, fecha: null });
    expect(ids(result.current.especialistas)).toEqual([UNO]);
  });
});
