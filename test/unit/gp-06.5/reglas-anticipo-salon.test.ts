/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';

import { leer, nombre, piezasDe, sinComentarios, src } from '../../helpers/reglasCodigo';

/**
 * GP-06.5 (pago del anticipo en el salón): reglas revisadas sobre el código real de src/ (lectura con
 * fs, sin ejecutarlo), con los detectores de test/helpers/reglasCodigo.ts.
 *
 * Las reglas generales sobre estos mismos archivos (vistas sin models/, componentes solo con tipos,
 * citaModel sin la interfaz, sin colores escritos, sin console ni guion largo) ya las revisan
 * reglas-reserva (GP-06.2) y reglas-mis-citas (GP-06.3); aquí no se repiten. Esta suite cuida lo del
 * salón:
 *
 * Regla 1: los textos del salón que ve la clienta siguen en su archivo y no se copian a otro.
 * Regla 2: las funciones del salón de citaModel solo aparecen en los archivos que las usan.
 * Regla 3: los viewmodels las toman de citaModel; AnticipoView y CitaConfirmadaView pintan el aviso
 * ya armado (vm.avisoSalon) en lugar de llamar a la función.
 */

const citas = (...partes: string[]) => src('features', 'citas', ...partes);
const vista = (archivo: string) => citas('views', `${archivo}.tsx`);
const viewmodel = (archivo: string) => citas('viewmodels', `${archivo}.ts`);
const componente = (archivo: string) => citas('components', `${archivo}.tsx`);

const VISTA_RESERVA = vista('ReservarCitaView');
const VISTA_CONFIRMADA = vista('CitaConfirmadaView');
const VISTA_ANTICIPO = vista('AnticipoView');
const VISTA_DETALLE = vista('DetalleCitaView');
const VM_RESERVA = viewmodel('useReservarCitaViewModel');
const VM_CONFIRMADA = viewmodel('useCitaConfirmadaViewModel');
const VM_ANTICIPO = viewmodel('useAnticipoViewModel');
const VM_DETALLE = viewmodel('useDetalleCitaViewModel');
const TARJETA = componente('TarjetaCita');
const CITA_MODEL = citas('models', 'citaModel.ts');

const TODOS = [
  VISTA_RESERVA,
  VISTA_CONFIRMADA,
  VISTA_ANTICIPO,
  vista('MisCitasView'),
  VISTA_DETALLE,
  VM_RESERVA,
  VM_CONFIRMADA,
  VM_ANTICIPO,
  VM_DETALLE,
  TARJETA,
  componente('BadgeEstado'),
  componente('ResumenCita'),
  CITA_MODEL,
];

const MODULO_CITA = '../models/citaModel';

/** Código sin comentarios y con los espacios juntos: el texto de JSX se parte en varias líneas. */
const codigo = (ruta: string) => sinComentarios(leer(ruta)).replace(/\s+/g, ' ');

/** Archivos de GP-06.5 cuyo código cumple la prueba, por nombre y en orden. */
const archivosDonde = (prueba: (texto: string) => boolean) => TODOS.filter((ruta) => prueba(codigo(ruta))).map(nombre).sort();
const nombres = (rutas: string[]) => rutas.map(nombre).sort();

describe('GP-06.5: archivos revisados', () => {
  it('existen todos', () => {
    expect(TODOS.filter((ruta) => !fs.existsSync(ruta)).map(nombre)).toEqual([]);
  });
});

describe('Regla 1: los textos del salón siguen en su archivo y en ningún otro', () => {
  it.each<[string, string[]]>([
    ['Apartar y pagar en el salón', [VISTA_RESERVA]],
    [
      'Llega entre 20 y 15 minutos antes para pagarlo. Si a 15 minutos de tu cita no se ha pagado, se cancela.',
      [VISTA_RESERVA],
    ],
    ['Tu horario está apartado', [VISTA_ANTICIPO, VISTA_CONFIRMADA]],
    ['Paga en salón', [TARJETA]],
    // El aviso con el plazo lo arma citaModel (avisoAnticipoEnSalon); las vistas no lo copian.
    ['Paga tu anticipo en el salón', [CITA_MODEL]],
  ])('"%s"', (texto, rutas) => {
    expect(archivosDonde((codigoArchivo) => codigoArchivo.includes(texto))).toEqual(nombres(rutas));
  });
});

describe('Regla 2: las funciones del salón de citaModel solo aparecen donde se usan', () => {
  it.each<[string, string[]]>([
    ['avisoAnticipoEnSalon', [VM_ANTICIPO, VM_CONFIRMADA, VM_DETALLE, VISTA_DETALLE]],
    ['montoPagadoAnticipo', [VM_DETALLE]],
    ['mensajeAnticipoParaClienta', [VM_RESERVA]],
  ])('%s', (funcion, rutas) => {
    const patron = new RegExp(String.raw`\b${funcion}\b`);
    const fuera = (ruta: string) => ruta !== nombre(CITA_MODEL);
    expect(archivosDonde((codigoArchivo) => patron.test(codigoArchivo)).filter(fuera)).toEqual(nombres(rutas));
  });
});

describe('Regla 3: los viewmodels toman de citaModel lo del salón y las vistas pintan lo ya armado', () => {
  it.each<[string, string[]]>([
    ['useReservarCitaViewModel', ['mensajeAnticipoParaClienta']],
    ['useAnticipoViewModel', ['avisoAnticipoEnSalon']],
    ['useCitaConfirmadaViewModel', ['avisoAnticipoEnSalon']],
    ['useDetalleCitaViewModel', ['avisoAnticipoEnSalon', 'montoPagadoAnticipo']],
  ])('%s toma %p de citaModel', (archivo, funciones) => {
    const texto = leer(viewmodel(archivo));
    const deCitaModel = (['import', 'export'] as const).flatMap((palabra) => piezasDe(texto, palabra, MODULO_CITA).valores);
    expect(deCitaModel).toEqual(expect.arrayContaining(funciones));
  });

  it.each([
    ['AnticipoView', VISTA_ANTICIPO],
    ['CitaConfirmadaView', VISTA_CONFIRMADA],
  ])('%s pinta vm.avisoSalon', (_nombre, ruta) => {
    expect(codigo(ruta)).toMatch(/\bvm\.avisoSalon\b/);
  });
});
