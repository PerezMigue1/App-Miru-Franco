/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';

import {
  colores,
  conNombre,
  deModels,
  GUION_LARGO,
  importaciones,
  importacionesProhibidas,
  leer,
  llamadasApi,
  nombre,
  prohibidoEnModels,
  sinComentarios,
  src,
  usosDeConsola,
} from '../../helpers/reglasCodigo';

/**
 * GP-06.2 (reservar cita con anticipo): reglas de arquitectura y estilo revisadas sobre el código
 * real de src/ (lectura con fs, sin ejecutarlo), con los detectores de test/helpers/reglasCodigo.ts.
 *
 * Regla 1: las vistas y las rutas de la reserva no importan nada de models/ (ni tipos).
 * Regla 2: los models que usa la reserva no importan components, views, viewmodels, react ni react-native.
 * Regla 3: ningún archivo de GP-06.2 escribe colores, usa console ni el guion largo.
 * Regla 4: citaModel habla con el servidor solo por apiClient (apiGet, apiPost, apiPatch).
 *
 * MisCitasView y ReprogramarCitaView son de GP-06.3 y no entran aquí.
 */

const citas = (...partes: string[]) => src('features', 'citas', ...partes);

const VISTA_RESERVA = citas('views', 'ReservarCitaView.tsx');
const VISTA_ANTICIPO = citas('views', 'AnticipoView.tsx');
const VISTA_CONFIRMADA = citas('views', 'CitaConfirmadaView.tsx');
const VISTAS = [
  VISTA_RESERVA,
  VISTA_ANTICIPO,
  VISTA_CONFIRMADA,
  src('app', 'reservar', '[servicioId].tsx'),
  src('app', 'anticipo', '[citaId].tsx'),
  src('app', 'cita-confirmada', '[citaId].tsx'),
];
const VM_RESERVA = citas('viewmodels', 'useReservarCitaViewModel.ts');
const VM_ANTICIPO = citas('viewmodels', 'useAnticipoViewModel.ts');
const VM_CONFIRMADA = citas('viewmodels', 'useCitaConfirmadaViewModel.ts');
const VIEWMODELS = [VM_RESERVA, VM_ANTICIPO, VM_CONFIRMADA];
const CITA_MODEL = citas('models', 'citaModel.ts');
const MODELOS = [CITA_MODEL, citas('models', 'servicioModel.ts')];
const BADGE = citas('components', 'BadgeEstado.tsx');
const COMPONENTES = [
  citas('components', 'IndicadorPasos.tsx'),
  citas('components', 'CalendarioMensual.tsx'),
  citas('components', 'SelectorHorario.tsx'),
  citas('components', 'TarjetaEspecialista.tsx'),
  citas('components', 'ResumenCita.tsx'),
  BADGE,
  src('shared', 'ui', 'useCandado.ts'),
];
const TODOS = [...VISTAS, ...VIEWMODELS, ...MODELOS, ...COMPONENTES];

const MODULO_MODELO_CITA = '../models/citaModel';

describe('GP-06.2: archivos revisados', () => {
  it('existen todos', () => {
    expect(TODOS.filter((ruta) => !fs.existsSync(ruta)).map(nombre)).toEqual([]);
  });

  it('no incluye las vistas de GP-06.3 (Mis citas y reprogramar)', () => {
    expect(TODOS.map(nombre).filter((ruta) => /MisCitasView|ReprogramarCitaView/.test(ruta))).toEqual([]);
  });
});

describe('Regla 1: vistas y rutas de la reserva no importan nada de models/', () => {
  it.each(conNombre(VISTAS))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => deModels(modulo))).toEqual([]);
  });

  it('corrección GP-06.2: ReservarCitaView toma fechaLegible de su viewmodel, que la vuelve a exportar', () => {
    const vista = importaciones(leer(VISTA_RESERVA));
    expect(vista).toContainEqual(
      expect.objectContaining({ modulo: '../viewmodels/useReservarCitaViewModel', soloTipos: false }),
    );
    expect(sinComentarios(leer(VM_RESERVA))).toMatch(
      /export\s*\{\s*fechaLegible\s*\}\s*from\s*'\.\.\/models\/citaModel'/,
    );
  });

  it.each([
    ['AnticipoView', VISTA_ANTICIPO, '../viewmodels/useAnticipoViewModel', VM_ANTICIPO],
    ['CitaConfirmadaView', VISTA_CONFIRMADA, '../viewmodels/useCitaConfirmadaViewModel', VM_CONFIRMADA],
  ])('corrección GP-06.2: %s toma el tipo Cita de su viewmodel', (_nombre, vista, moduloVm, viewmodel) => {
    expect(sinComentarios(leer(vista))).toMatch(/\btype Cita\b/);
    expect(importaciones(leer(vista))).toContainEqual(expect.objectContaining({ modulo: moduloVm }));
    // El viewmodel lo vuelve a exportar solo como tipo.
    expect(sinComentarios(leer(viewmodel))).toMatch(/export\s+type\s*\{\s*Cita\s*\}\s*from\s*'\.\.\/models\/citaModel'/);
    expect(importaciones(leer(viewmodel))).toContainEqual({
      linea: expect.any(Number),
      modulo: MODULO_MODELO_CITA,
      soloTipos: true,
    });
  });
});

describe('Regla 2: los models de la reserva no dependen de la interfaz', () => {
  it.each(conNombre(MODELOS))('%s', (_nombre, ruta) => {
    expect(importacionesProhibidas(ruta, ({ modulo }) => prohibidoEnModels(modulo))).toEqual([]);
  });

  it('corrección GP-06.2: TonoBadge vive en citaModel y BadgeEstado lo importa solo como tipo', () => {
    expect(sinComentarios(leer(CITA_MODEL))).toMatch(/export\s+type\s+TonoBadge\s*=/);
    expect(importaciones(leer(CITA_MODEL)).filter(({ modulo }) => /components\/BadgeEstado/.test(modulo))).toEqual([]);
    expect(importaciones(leer(BADGE))).toContainEqual(
      expect.objectContaining({ modulo: MODULO_MODELO_CITA, soloTipos: true }),
    );
    expect(sinComentarios(leer(BADGE))).not.toMatch(/export\s+type\s+TonoBadge\s*=/);
  });
});

describe('Regla 3: sin colores escritos, sin console y sin guion largo', () => {
  it.each(conNombre(TODOS))('%s', (_nombre, ruta) => {
    const texto = leer(ruta);
    expect(colores(texto)).toEqual([]);
    expect(usosDeConsola(texto)).toEqual([]);
    expect(texto.includes(GUION_LARGO)).toBe(false);
  });
});

describe('Regla 4: citaModel habla con el servidor solo por apiClient', () => {
  const texto = leer(CITA_MODEL);

  it('importa apiGet, apiPost y apiPatch de apiClient y no usa fetch ni XMLHttpRequest', () => {
    expect(importaciones(texto).map(({ modulo }) => modulo)).toContain('@/shared/api/apiClient');
    expect(sinComentarios(texto)).toMatch(/import\s*\{[^}]*\bapiGet\b[^}]*\bapiPatch\b[^}]*\bapiPost\b[^}]*\}\s*from\s*'@\/shared\/api\/apiClient'/);
    expect(sinComentarios(texto)).not.toMatch(/\bfetch\s*\(|XMLHttpRequest/);
  });

  it('las nueve llamadas de citas y anticipos van a /api y con sesión (ninguna es pública)', () => {
    const llamadas = llamadasApi(texto);
    expect(llamadas).toHaveLength(9);
    expect(llamadas.filter((args) => !/^\s*[`']\/api\//.test(args))).toEqual([]);
    expect(llamadas.filter((args) => /publica:\s*true/.test(args))).toEqual([]);
  });
});
