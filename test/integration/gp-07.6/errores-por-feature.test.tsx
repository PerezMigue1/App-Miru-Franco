/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { RUTA_AVISOS, respuestaAvisos } from '../../helpers/avisosFicticios';
import { respuestaCompleta, RUTA_CONFIGURACION } from '../../helpers/configuracionFicticia';
import { FALLA_500, FALLA_SIN_RED, revisarYReintentar, sinTextoTecnico, type Falla } from '../../helpers/fallasPantalla';
import { LIMITE_MS } from '../../helpers/pantallas';
import { abrirConAvisos, prepararPruebasAvisos } from '../../helpers/pantallasAvisos';
import { deslizarParaActualizar } from '../../helpers/pantallasMisCitas';
import { esperarRuta, sinTextos } from '../../helpers/pantallasReserva';
import { abrirEn } from '../../helpers/pantallasServicios';
import { fallaHastaArreglar } from '../../helpers/pantallasTienda';
import { CATALOGOS_VACIOS, llamadasA, respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import { CATALOGO_CRUDO, cuerpoDetalle, rutasServicios } from '../../helpers/serviciosFicticios';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.6, un 500 (con referencia y el texto técnico en inglés del backend) y sin conexión en una
 * pantalla de cada feature que no cubre errores-pantallas: Inicio (servicios y el carrusel de
 * productos con su propio Reintentar), la bandeja de Notificaciones, el detalle de un servicio y El
 * salón (que avisa "sin conexión" solo sin red y "no pudimos actualizar" con un 5xx). La tienda en
 * catálogo ya lo prueba gp-06.4/tienda.test.tsx ("Sin conexión" contra error del servidor). Cada
 * pantalla dice por qué no cargó, nunca el texto del servidor, y Reintentar vuelve a pedir el
 * recurso. Pantallas reales (renderRouter sobre src/app), API http://api.test y datos ficticios.
 */

interface PantallaQueFalla {
  /** "MÉTODO /ruta" del recurso que falla. */
  ruta: string;
  /** La respuesta buena, para cuando la ruta se arregla. */
  bien: Manejador;
  titulo: string;
  /** Texto propio de la pantalla para un 500 (por omisión, el general con la referencia). */
  texto500?: string;
  /** Abre la app hasta la pantalla con la ruta indicada y devuelve las peticiones. */
  abrir: (rutas: Record<string, Manejador>) => Promise<Llamada[]>;
}

const enRuta = (ruta: string) => async (rutas: Record<string, Manejador>) => (await abrirEn(ruta, rutas)).llamadas;

const PANTALLAS: Record<string, PantallaQueFalla> = {
  'Inicio (servicios)': {
    ruta: 'GET /api/servicios',
    bien: rutasServicios()['GET /api/servicios'],
    titulo: RESPALDO_TEXTOS['inicio.servicios.errorTitulo'],
    abrir: enRuta('/inicio'),
  },
  'Inicio (carrusel de productos)': {
    ruta: 'GET /api/productos',
    bien: CATALOGOS_VACIOS['GET /api/productos'],
    titulo: RESPALDO_TEXTOS['inicio.productos.errorTitulo'],
    abrir: enRuta('/inicio'),
  },
  'Detalle de un servicio': {
    ruta: 'GET /api/servicios/2',
    bien: () => respuesta(cuerpoDetalle(CATALOGO_CRUDO[1])),
    titulo: 'No pudimos cargar este servicio',
    abrir: enRuta('/servicio/2'),
  },
  'Bandeja de Notificaciones': {
    ruta: `GET ${RUTA_AVISOS}`,
    bien: () => respuesta(respuestaAvisos()),
    titulo: 'No pudimos cargar tus avisos',
    // La bandeja tiene su texto para lo que no es de red ni de sesión.
    texto500: 'No pudimos cargar tus avisos. Intenta de nuevo.',
    abrir: async (rutas) => {
      const { app, llamadas } = await abrirConAvisos('/', { rutas });
      // Sin lista no hay contador en la campana.
      await fireEvent.press(await screen.findByRole('button', { name: 'Abrir notificaciones' }));
      await esperarRuta(app, '/notificaciones');
      return llamadas;
    },
  },
};

/** Cada pantalla con el 500 y sin red: [pantalla, falla, datos, manejador, texto]. */
const CASOS = Object.entries(PANTALLAS).flatMap(([nombre, pantalla]) =>
  [FALLA_500, FALLA_SIN_RED].map(
    ([falla, manejador, texto]: Falla) =>
      [nombre, falla, pantalla, manejador, falla === FALLA_500[0] ? (pantalla.texto500 ?? texto) : texto] as const,
  ),
);

/** Cuántas veces se pidió esa ruta "MÉTODO /ruta". */
function pedidas(llamadas: Llamada[], ruta: string): number {
  const [metodo, camino] = ruta.split(' ');
  return llamadasA(llamadas, metodo, camino).length;
}

describe('Error 500 y sin conexión en una pantalla de cada feature (GP-07.6)', () => {
  const revisarConsola = prepararPruebasAvisos();

  // La configuración que llega en una prueba se queda en memoria y en el disco simulado.
  beforeEach(() => {
    reiniciarConfiguracionPublica();
    limpiarArchivos();
  });

  it.each(CASOS)(
    '%s con %s dice por qué no cargó, sin el texto del servidor, y Reintentar vuelve a pedirlo',
    async (_nombre, _falla, pantalla, manejador, texto) => {
      const recurso = fallaHastaArreglar(pantalla.bien, manejador);
      const llamadas = await pantalla.abrir({ [pantalla.ruta]: recurso.manejador });
      expect(await screen.findByRole('header', { name: pantalla.titulo })).toBeOnTheScreen();
      const antes = pedidas(llamadas, pantalla.ruta);

      await revisarYReintentar(recurso, pantalla.titulo, texto);
      expect(pedidas(llamadas, pantalla.ruta)).toBeGreaterThan(antes);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string, string]>([
    [FALLA_500[0], FALLA_500[1], RESPALDO_TEXTOS['salon.sinActualizar'], RESPALDO_TEXTOS['salon.sinRed']],
    [FALLA_SIN_RED[0], FALLA_SIN_RED[1], RESPALDO_TEXTOS['salon.sinRed'], RESPALDO_TEXTOS['salon.sinActualizar']],
  ])(
    'El salón con %s lo avisa con su texto y, al deslizar con red, pide la configuración y quita el aviso',
    async (_falla, manejador, aviso, otroAviso) => {
      const configuracion = fallaHastaArreglar(() => respuesta(respuestaCompleta()), manejador);
      const { llamadas } = await abrirEn('/salon', { [`GET ${RUTA_CONFIGURACION}`]: configuracion.manejador });
      expect(await screen.findByRole('header', { name: RESPALDO_TEXTOS['salon.titulo'] })).toBeOnTheScreen();
      expect(await screen.findByText(aviso)).toBeOnTheScreen();
      sinTextos(otroAviso);
      sinTextoTecnico();
      const antes = llamadasA(llamadas, 'GET', RUTA_CONFIGURACION).length;

      configuracion.arreglar();
      await deslizarParaActualizar();
      await waitFor(() => expect(screen.queryByText(aviso)).not.toBeOnTheScreen());
      expect(llamadasA(llamadas, 'GET', RUTA_CONFIGURACION).length).toBeGreaterThan(antes);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
