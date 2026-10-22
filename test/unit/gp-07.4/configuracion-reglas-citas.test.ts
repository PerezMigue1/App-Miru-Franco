/// <reference types="jest" />

import {
  cargarConfiguracion,
  normalizarConfiguracion,
  obtenerConfiguracion,
  reiniciarConfiguracionPublica,
  RESPALDO_CONFIGURACION,
} from '@/shared/api/configuracionPublica';

import { leerArchivo, limpiarArchivos } from '../../helpers/archivosLocales';
import {
  ARCHIVO_CONFIGURACION,
  CONFIGURACION_COMPLETA,
  DATOS_EXCLUIDOS,
  respuestaCompleta,
  rutaConfiguracion,
} from '../../helpers/configuracionFicticia';
import { sinRed } from '../../helpers/documentosFicticios';
import { servidorConRutas } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.4: reglas de citas que agrega la configuración pública: la política de anticipos (días
 * hábiles de excepción y de reembolso) y qué pasa si no llega (reglas.citas.noAsistio del servidor,
 * que la app guarda plano). Lo inválido toma el respaldo, que son los valores por omisión del
 * backend. Los datos de transferencia nunca entran.
 */

const simularServidor = servidorConRutas({});

/** respuestaCompleta() con estas reglas de citas encima. */
function conReglasCitas(cambios: Record<string, unknown>): Record<string, unknown> {
  const cuerpo = respuestaCompleta();
  const reglas = cuerpo.reglas as Record<string, Record<string, unknown>>;
  return { ...cuerpo, reglas: { ...reglas, citas: { ...reglas.citas, ...cambios } } };
}

const citasDe = (cuerpo: unknown) => normalizarConfiguracion(cuerpo).reglas.citas;

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

describe('respaldo', () => {
  it('trae los valores por omisión del backend', () => {
    expect(RESPALDO_CONFIGURACION.reglas.citas).toMatchObject({
      diasHabilesExcepcionAnticipo: 10,
      diasHabilesCancelarConReembolso: 5,
      pierdeAnticipoSiNoAsiste: true,
      mesesSoloPagoEnLinea: 6,
    });
  });
});

describe('normalización', () => {
  it('aplana noAsistio y se queda con los días de la política, sin lo que la app no usa', () => {
    const citas = citasDe(respuestaCompleta());

    expect(citas).toEqual(CONFIGURACION_COMPLETA.reglas.citas);
    expect(citas).toMatchObject({ pierdeAnticipoSiNoAsiste: false, mesesSoloPagoEnLinea: 3, diasHabilesExcepcionAnticipo: 7, diasHabilesCancelarConReembolso: 8 });
    expect(citas).not.toHaveProperty('noAsistio');
    expect(citas).not.toHaveProperty('porcentajeAnticipoSugerido');
    expect(citas).not.toHaveProperty('recordatoriosHorasAntes');
  });

  const NO_ASISTIO = ['pierdeAnticipoSiNoAsiste', 'mesesSoloPagoEnLinea'] as const;
  const DIAS = ['diasHabilesExcepcionAnticipo', 'diasHabilesCancelarConReembolso'] as const;

  it.each([
    ['noAsistio que no es objeto', { noAsistio: 'si' }, NO_ASISTIO],
    ['noAsistio con otros tipos', { noAsistio: { pierdeAnticipo: 'no', mesesSoloPagoEnLinea: -1 } }, NO_ASISTIO],
    ['días con decimales y en texto', { diasHabilesExcepcionAnticipo: 7.5, diasHabilesCancelarConReembolso: '8' }, DIAS],
  ])('%s: toma el respaldo en esos campos', (_caso, cambios, claves) => {
    const citas = citasDe(conReglasCitas(cambios));
    const respaldo = RESPALDO_CONFIGURACION.reglas.citas;

    expect(claves.map((clave) => citas[clave])).toEqual(claves.map((clave) => respaldo[clave]));
  });

  it('el archivo guardado (ya plano, sin noAsistio) conserva los valores al volver a leerlo', async () => {
    simularServidor(rutaConfiguracion());
    await cargarConfiguracion();
    const guardado = leerArchivo(ARCHIVO_CONFIGURACION) ?? '';
    reiniciarConfiguracionPublica();
    sinRed();

    await cargarConfiguracion();

    expect(obtenerConfiguracion().reglas.citas).toEqual(CONFIGURACION_COMPLETA.reglas.citas);
    expect(guardado).not.toContain('noAsistio');
    for (const excluido of DATOS_EXCLUIDOS) {
      expect(guardado).not.toContain(excluido);
    }
  });
});
