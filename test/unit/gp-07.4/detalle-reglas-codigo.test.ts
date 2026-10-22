/// <reference types="jest" />
/// <reference types="node" />

import {
  colores,
  conNombre,
  deModels,
  GUION_LARGO,
  importacionesProhibidas,
  leer,
  llamadasApi,
  prohibidoEnModels,
  sinComentarios,
  src,
  usosDeConsola,
} from '../../helpers/reglasCodigo';

/**
 * GP-07.4 (detalle, anticipo en el salón, cancelar y reprogramar): reglas de arquitectura y estilo
 * de los archivos nuevos y cambiados, revisadas sobre el código real.
 *
 * Regla 1: gestionCitaModel no depende de la interfaz; EnlacePolitica y las vistas no importan models.
 * Regla 2: ningún archivo escribe colores, usa console ni el guion largo; los models no usan toISOString.
 * Regla 3: anticipo-en-salon va por apiClient, con sesión y sin ?propios (como la web).
 * Regla 4: ningún texto de reglas escrito a mano ("15 minutos", "2 horas") en los archivos tocados.
 */

const citas = (...partes: string[]) => src('features', 'citas', ...partes);

const MODELO = citas('models', 'gestionCitaModel.ts');
const CITA_MODEL = citas('models', 'citaModel.ts');
const ENLACE = citas('components', 'EnlacePolitica.tsx');
const VISTAS = ['DetalleCitaView', 'ReprogramarCitaView', 'AnticipoView', 'CitaConfirmadaView', 'MisCitasView'].map((v) =>
  citas('views', `${v}.tsx`),
);
const VIEWMODELS = [
  'useDetalleCitaViewModel',
  'useReprogramarCitaViewModel',
  'useAnticipoViewModel',
  'useCitaConfirmadaViewModel',
  'useMisCitasViewModel',
  'useAceptacionAnticipos',
].map((v) => citas('viewmodels', `${v}.ts`));
const COMPONENTES = [ENLACE, citas('components', 'HojaCancelarCita.tsx'), citas('components', 'TarjetaCita.tsx')];
const TODOS = [MODELO, CITA_MODEL, ...VISTAS, ...VIEWMODELS, ...COMPONENTES];

describe('Regla 1: capas', () => {
  it('gestionCitaModel no depende de la interfaz', () => {
    expect(importacionesProhibidas(MODELO, ({ modulo }) => prohibidoEnModels(modulo))).toEqual([]);
  });

  it.each(conNombre([ENLACE, ...VISTAS]))('%s no importa nada de models/', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => deModels(modulo))).toEqual([]);
  });
});

describe('Regla 2: sin colores escritos, console ni guion largo', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(colores(texto)).toEqual([]);
    expect(usosDeConsola(texto)).toEqual([]);
    expect(texto.includes(GUION_LARGO)).toBe(false);
    expect(texto.includes(String.fromCodePoint(0x2013))).toBe(false);
  });

  it.each(conNombre([MODELO, CITA_MODEL]))('%s no usa toISOString', (_nombre, ruta) => {
    expect(sinComentarios(leer(ruta))).not.toMatch(/\btoISOString\s*\(/);
  });
});

describe('Regla 3: anticipo-en-salon por apiClient', () => {
  it('una sola llamada, con sesión y sin ?propios', () => {
    const llamadas = llamadasApi(leer(CITA_MODEL)).filter((args) => args.includes('anticipo-en-salon'));
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0]).not.toMatch(/publica|propios/);
  });
});

describe('Regla 4: sin cifras de reglas escritas a mano', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    expect(sinComentarios(leer(ruta))).not.toMatch(/\b\d+ (minutos|horas?) (antes|de anticipación)|menos de \d+ horas/);
  });
});
