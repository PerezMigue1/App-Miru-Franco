/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Linking } from 'react-native';

import {
  reiniciarConfiguracionPublica,
  RESPALDO_CONFIGURACION,
  type ConfiguracionPublica,
} from '@/shared/api/configuracionPublica';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { AHORA, sinRedEnRuta } from '../../helpers/citasFicticias';
import {
  contenidoArchivo,
  CONFIGURACION_COMPLETA,
  respuestaCompleta,
  rutaConfiguracion,
  RUTA_CONFIGURACION,
  sembrarConfiguracionGuardada,
} from '../../helpers/configuracionFicticia';
import { LIMITE_MS, prepararPruebasDePantalla, type App } from '../../helpers/pantallas';
import { deslizarParaActualizar } from '../../helpers/pantallasMisCitas';
import { abrirPerfilConSesion } from '../../helpers/pantallasPerfil';
import { abrirEn } from '../../helpers/pantallasServicios';
import { simularServidorPerfil } from '../../helpers/perfilClienta';
import { llamadasA, type Llamada, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.3: la pantalla El salón desde la fila de Perfil, con las pantallas reales, la sesión de la
 * clienta de Perfil y solo el servidor y el disco simulados. Todo sale de la configuración pública:
 * sobre nosotros, valores, contacto (cada enlace abre la app que toca), el horario de la semana con
 * hoy marcado y los próximos días sin servicio. El reloj se fija en AHORA (lunes 19 de octubre de
 * 2026). Sin red muestra lo guardado en el archivo o el respaldo, con su aviso.
 */

const FILA_SALON = 'El salón, Horario, ubicación y cómo contactarnos.';
const AVISO_SIN_RED = 'Sin conexión. Te mostramos los últimos datos guardados del salón.';

/** respuestaCompleta() con un día inhábil ya pasado y tres por venir (uno sin motivo), desordenados. */
function respuestaConInhabiles(): Record<string, unknown> {
  const cuerpo = respuestaCompleta();
  const reglas = cuerpo.reglas as Record<string, unknown>;
  reglas.diasInhabiles = [
    { fecha: '2026-12-25', motivo: 'Navidad' },
    { fecha: '2026-10-01', motivo: 'Inventario ficticio pasado' },
    { fecha: '2026-10-21', motivo: 'Capacitación' },
    { fecha: '2026-11-02', motivo: '' },
  ];
  return cuerpo;
}

/** Enlaces de contacto de respuestaCompleta(): etiqueta de la fila y la URL que debe abrir. */
const ENLACES: [string, string][] = [
  ['Llamar al +52 700 000 0000', 'tel:+527000000000'],
  ['Escribir por WhatsApp, +52 700 000 0001', 'https://wa.me/527000000001'],
  ['Escribir a contacto@salon.test', 'mailto:contacto@salon.test'],
  ['Ver en el mapa', 'https://maps.app.goo.gl/ficticio'],
];

/** Horario de respuestaCompleta() como lo anuncia cada fila; el lunes (hoy) va marcado. */
const HORARIO = [
  'Lunes, hoy: Cerrado',
  'Martes: 10:00 a 18:00',
  'Miércoles: 10:00 a 18:00',
  'Jueves: 10:00 a 18:00',
  'Viernes: 10:00 a 20:00',
  'Sábado: 9:00 a 15:00',
  'Domingo: Cerrado',
];

/** Configuración guardada en el archivo con un título propio, para distinguirla de la red y del respaldo. */
const GUARDADA: ConfiguracionPublica = {
  ...CONFIGURACION_COMPLETA,
  contenido: {
    ...CONFIGURACION_COMPLETA.contenido,
    sobreNosotros: { ...CONFIGURACION_COMPLETA.contenido.sobreNosotros, titulo: 'Historia guardada en archivo' },
  },
};

interface SalonAbierto {
  app: App;
  llamadas: Llamada[];
}

/** Con el reloj en AHORA abre Perfil con sesión, toca la fila "El salón" y espera la pantalla. */
async function abrirSalon(rutas: Record<string, Manejador>): Promise<SalonAbierto> {
  jest.useFakeTimers({ now: AHORA });
  const { app, llamadas } = await abrirPerfilConSesion(rutas);
  await fireEvent.press(screen.getByRole('button', { name: FILA_SALON }));
  await waitFor(() => expect(app.getPathname()).toBe('/salon'));
  expect(await screen.findByRole('header', { name: 'El salón' })).toBeOnTheScreen();
  return { app, llamadas };
}

describe('El salón desde Perfil (GP-07.3)', () => {
  // La configuración que llega en una prueba se queda en memoria y en el disco simulado.
  beforeEach(() => {
    reiniciarConfiguracionPublica();
    limpiarArchivos();
  });
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'con red muestra sobre nosotros, valores, contacto que abre cada app, el horario con hoy marcado y solo los días sin servicio por venir',
    async () => {
      // La primera vez el teléfono no tiene app para el enlace: la pantalla sigue igual.
      const abrirUrl = jest
        .spyOn(Linking, 'openURL')
        .mockResolvedValue(true)
        .mockRejectedValueOnce(new Error('Sin app ficticia'));
      try {
        const { app } = await abrirSalon(rutaConfiguracion(respuestaConInhabiles()));

        expect(screen.queryByText(AVISO_SIN_RED)).not.toBeOnTheScreen();
        // Sobre nosotros y valores.
        expect(screen.getByRole('header', { name: 'Historia ficticia' })).toBeOnTheScreen();
        expect(screen.getByText('Historia ficticia uno')).toBeOnTheScreen();
        expect(screen.getByRole('header', { name: 'Lo que nos distingue' })).toBeOnTheScreen();
        expect(screen.getByText('Valor ficticio')).toBeOnTheScreen();
        expect(screen.getByText('Descripción de valor ficticio')).toBeOnTheScreen();

        // Contacto: cada enlace abre su URL; el domicilio solo se lee.
        expect(screen.getByRole('header', { name: 'Contacto' })).toBeOnTheScreen();
        expect(screen.getByText('Introducción ficticia')).toBeOnTheScreen();
        for (const [etiqueta, url] of ENLACES) {
          await fireEvent.press(screen.getByRole('link', { name: etiqueta }));
          expect(abrirUrl).toHaveBeenLastCalledWith(url);
        }
        expect(abrirUrl).toHaveBeenCalledTimes(ENLACES.length);
        expect(screen.getByLabelText('Calle Inventada 123, Centro, Ciudad Ficticia, Estado')).toBeOnTheScreen();
        expect(screen.queryByRole('link', { name: /^Calle Inventada/ })).not.toBeOnTheScreen();

        // Horario de lunes a domingo, con hoy (lunes) marcado.
        const dias = screen.getAllByLabelText(/^(Lunes|Martes|Miércoles|Jueves|Viernes|Sábado|Domingo)(, hoy)?: /);
        expect(dias.map((dia) => dia.props.accessibilityLabel)).toEqual(HORARIO);
        expect(screen.getByText('Hoy')).toBeOnTheScreen();

        // Días sin servicio: los que vienen, del más cercano al más lejano; el pasado no aparece.
        expect(screen.getByRole('header', { name: 'Días sin servicio' })).toBeOnTheScreen();
        expect(screen.getAllByLabelText(/^\S+ \d+ de \S+(: |$)/).map((dia) => dia.props.accessibilityLabel)).toEqual([
          'Miércoles 21 de octubre: Capacitación',
          'Lunes 2 de noviembre',
          'Viernes 25 de diciembre: Navidad',
        ]);
        expect(screen.queryByText('Inventario ficticio pasado')).not.toBeOnTheScreen();

        // Volver regresa a Perfil.
        await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
        await waitFor(() => expect(app.getPathname()).toBe('/perfil'));
      } finally {
        abrirUrl.mockRestore();
      }
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'deslizar para actualizar vuelve a pedir la configuración y pinta la versión nueva',
    async () => {
      await abrirSalon(rutaConfiguracion());
      expect(screen.getByLabelText('Viernes 25 de diciembre: Navidad')).toBeOnTheScreen();

      const { llamadas } = await actualizarConVersionNueva();

      expect(await screen.findByRole('header', { name: 'Historia ficticia actualizada' })).toBeOnTheScreen();
      expect(screen.getByLabelText('Miércoles 21 de octubre: Capacitación')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Viernes 25 de diciembre: Navidad')).not.toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', RUTA_CONFIGURACION)).toHaveLength(1);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin valores ni datos de contacto no pinta esas piezas vacías, y abierta directo sin sesión Volver lleva a Perfil',
    async () => {
      const cuerpo = respuestaCompleta();
      cuerpo.salon = Object.fromEntries(
        ['telefono', 'whatsapp', 'correoContacto', 'direccion', 'ciudad', 'mapaUrl'].map((campo) => [campo, '']),
      );
      const contenido = cuerpo.contenido as { sobreNosotros: Record<string, unknown> };
      contenido.sobreNosotros.valores = [];
      contenido.sobreNosotros.imagen = '';
      const { app } = await abrirEn('/salon', rutaConfiguracion(cuerpo));

      expect(await screen.findByRole('header', { name: 'Historia ficticia' })).toBeOnTheScreen();
      expect(screen.queryByLabelText('El salón')).not.toBeOnTheScreen();
      expect(screen.queryByRole('header', { name: 'Lo que nos distingue' })).not.toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Contacto' })).toBeOnTheScreen();
      expect(screen.getByText('Introducción ficticia')).toBeOnTheScreen();
      expect(screen.queryByRole('link')).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
      await waitFor(() => expect(app.getPathname()).toBe('/perfil'));
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, () => void, string, string]>([
    [
      'lo guardado en el archivo',
      () => sembrarConfiguracionGuardada(contenidoArchivo(GUARDADA)),
      'Historia guardada en archivo',
      'Llamar al +52 700 000 0000',
    ],
    [
      'el respaldo, sin nada guardado',
      () => undefined,
      RESPALDO_CONFIGURACION.contenido.sobreNosotros.titulo,
      'Llamar al +52 771 268 1432',
    ],
  ])(
    'sin red avisa y muestra %s',
    async (_caso, sembrar, titulo, telefono) => {
      sembrar();
      await abrirSalon({ [`GET ${RUTA_CONFIGURACION}`]: sinRedEnRuta });

      expect(screen.getByText(AVISO_SIN_RED)).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: titulo })).toBeOnTheScreen();
      expect(screen.getByRole('link', { name: telefono })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Horario' })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});

/**
 * El servidor ya tiene otra versión (otro título y un día sin servicio) y la clienta desliza para
 * actualizar. Devuelve las peticiones del servidor nuevo.
 */
async function actualizarConVersionNueva(): Promise<{ llamadas: Llamada[] }> {
  const nueva = respuestaCompleta();
  const contenido = nueva.contenido as { sobreNosotros: Record<string, unknown> };
  contenido.sobreNosotros.titulo = 'Historia ficticia actualizada';
  (nueva.reglas as Record<string, unknown>).diasInhabiles = [{ fecha: '2026-10-21', motivo: 'Capacitación' }];
  const llamadas = simularServidorPerfil(rutaConfiguracion(nueva));
  await deslizarParaActualizar();
  return { llamadas };
}
