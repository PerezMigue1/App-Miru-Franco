/// <reference types="jest" />

import { mensajeCancelacion, mensajeReprogramacion } from '@/features/citas/models/citaModel';
import { ApiError } from '@/shared/api/apiClient';
import { refrescar, reiniciarConfiguracionPublica, RESPALDO_CONFIGURACION } from '@/shared/api/configuracionPublica';
import { obtenerTexto, RESPALDO_TEXTOS, type ClaveTexto } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { cadenas, GUION_LARGO, leer, nombre, sinComentarios, src } from '../../helpers/reglasCodigo';
import { servidorConRutas } from '../../helpers/servidorSimulado';
import { rutaConTextos } from '../../helpers/textosFicticios';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.6, revisión final: textos de citas y tienda que estaban escritos a mano pasan al catálogo
 * (RESPALDO_TEXTOS, claves propias de la app) y se leen con obtenerTexto o useTextos. Se revisa que
 * cada clave exista con su respaldo, que el texto del servidor gane cuando lo manda y que el código ya
 * no los escriba a mano. Datos ficticios; nada sale a la red.
 */

const CLAVES_NUEVAS: ClaveTexto[] = [
  'citas.errores.citaNoEncontrada',
  'citas.errores.horarioOcupado',
  'citas.errores.horarioPasado',
  'citas.errores.citaCobrada',
  'citas.errores.reservar',
  'citas.errores.horarios',
  'citas.errores.noSeReprograma',
  'citas.errores.reprogramar',
  'citas.errores.noSeCancela',
  'citas.errores.motivoCaracteres',
  'citas.errores.motivoVacio',
  'citas.errores.cancelar',
  'citas.confirmada.noSePierde',
  'tienda.pago.noSePierde',
  'citas.reserva.sinConfirmar',
  'citas.reserva.verMisCitas',
  'citas.cancelar.anticipoEnProceso',
  'citas.cancelar.anticipoSinConfirmar',
];

const simular = servidorConRutas({});
const error400 = (message: string) => new ApiError(400, message);

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

describe('claves nuevas del catálogo (respaldo)', () => {
  it.each(CLAVES_NUEVAS)('%s existe, tiene texto, no deja llaves ni guiones largos', (clave) => {
    expect(Object.prototype.hasOwnProperty.call(RESPALDO_TEXTOS, clave)).toBe(true);
    const texto = obtenerTexto(clave, {}, RESPALDO_CONFIGURACION);
    expect(texto.trim()).not.toBe('');
    expect(texto).not.toMatch(/[{}]/);
    expect(texto).not.toContain(GUION_LARGO);
  });
});

describe('los mensajes de reprogramar y cancelar salen del catálogo', () => {
  it.each<[string, ClaveTexto, () => string]>([
    ['cita no encontrada al cancelar', 'citas.errores.citaNoEncontrada', () => mensajeCancelacion(new ApiError(404, 'Cita no encontrada'))],
    ['cita cobrada al cancelar', 'citas.errores.citaCobrada', () => mensajeCancelacion(new ApiError(409, 'La cita ya se cobró'))],
    ['horario ocupado', 'citas.errores.horarioOcupado', () => mensajeReprogramacion(error400('Ya tiene una cita en ese horario'))],
    ['horario pasado', 'citas.errores.horarioPasado', () => mensajeReprogramacion(error400('Elige un horario que todavía no haya pasado'))],
    ['ya no se reprograma', 'citas.errores.noSeReprograma', () => mensajeReprogramacion(error400("No se puede reprogramar una cita en estado 'completada'"))],
    ['respaldo de reprogramar', 'citas.errores.reprogramar', () => mensajeReprogramacion(error400('Otro'))],
    ['ya no se cancela', 'citas.errores.noSeCancela', () => mensajeCancelacion(error400("No se puede cancelar una cita en estado 'cancelada'"))],
    ['motivo con caracteres', 'citas.errores.motivoCaracteres', () => mensajeCancelacion(error400('El motivo contiene caracteres no permitidos'))],
    ['motivo vacío', 'citas.errores.motivoVacio', () => mensajeCancelacion(error400('motivoCancelacion should not be empty'))],
    ['respaldo de cancelar', 'citas.errores.cancelar', () => mensajeCancelacion(error400('Otro'))],
  ])('%s: respaldo y, si el servidor manda la clave, la del servidor', async (_caso, clave, mensaje) => {
    expect(mensaje()).toBe(RESPALDO_TEXTOS[clave]);
    simular(rutaConTextos({ [clave]: 'Texto ficticio del salón.' }));
    await refrescar();
    expect(mensaje()).toBe('Texto ficticio del salón.');
  });
});

/** Por archivo, los textos que ya no deben estar escritos a mano en sus cadenas. */
const MIGRADOS: [string, string[]][] = [
  [src('features', 'citas', 'models', 'citaModel.ts'), [
    'No encontramos esta cita.', 'Ese horario ya se ocupó', 'Ese horario ya pasó', 'ya se cobró en el salón',
    'ya no se puede reprogramar', 'ya no se puede cancelar', 'caracteres que no podemos guardar',
    'Escribe el motivo de la cancelación', 'No pudimos cambiar tu cita', 'No pudimos cancelar tu cita',
  ]],
  [src('features', 'citas', 'viewmodels', 'useReservarCitaViewModel.ts'), ['No pudimos reservar tu cita', 'No pudimos cargar los horarios']],
  [src('features', 'citas', 'viewmodels', 'useReprogramarCitaViewModel.ts'), ['No pudimos cargar los horarios']],
  [src('features', 'citas', 'viewmodels', 'useCitaConfirmadaViewModel.ts'), ['Tu reserva no se pierde']],
  [src('features', 'tienda', 'viewmodels', 'usePedidoConfirmadoViewModel.ts'), ['Tu pedido no se pierde']],
];

describe('los textos migrados ya no están escritos a mano', () => {
  it.each(MIGRADOS.map(([ruta, textos]) => [nombre(ruta), ruta, textos] as const))('%s', (_nombre, ruta, textos) => {
    const escritos = cadenas(sinComentarios(leer(ruta))).map(({ valor }) => valor);
    expect(textos.filter((texto) => escritos.some((escrito) => escrito.includes(texto)))).toEqual([]);
  });
});
