/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';
import { Linking } from 'react-native';
import type { TestInstance } from 'test-renderer';

import { reiniciarConfiguracionPublica, RESPALDO_CONFIGURACION } from '@/shared/api/configuracionPublica';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { respuestaCompleta, rutaConfiguracion, RUTA_CONFIGURACION } from '../../helpers/configuracionFicticia';
import { sinRedEnRuta } from '../../helpers/citasFicticias';
import {
  cuerpoLista,
  GALERIA_ESPERADA,
  promocionesCrudas,
  RUTA_PROMOCIONES,
  rutasContenido,
  type SeccionContenido,
} from '../../helpers/contenidoFicticio';
import { LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { deslizarParaActualizar } from '../../helpers/pantallasMisCitas';
import { movimientoReducido } from '../../helpers/pantallasReserva';
import {
  abrirEn,
  abrirFoto,
  medirGaleria,
  regresarA,
  simularServidorCatalogo,
  type PantallaAbierta,
} from '../../helpers/pantallasServicios';
import { API, llamadasA, respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';
import { rutasCatalogoTienda } from '../../helpers/tiendaFicticia';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.3: Inicio con el contenido del salón, con las pantallas reales y solo el servidor simulado
 * (sin sesión, la bienvenida ya vista). Los textos salen de la configuración pública
 * (GET /api/configuracion-publica) y del catálogo de textos; la galería, las promociones, el equipo
 * y las preguntas frecuentes, de sus rutas públicas. Se revisa lo que ve la clienta con contenido,
 * con las listas vacías, sin red, con una sola sección caída y al deslizar para actualizar.
 */

const NOMBRE_SALON = 'Salón Ficticio de Prueba';
const ERROR_SECCION = 'No pudimos cargar esta sección';
const GALERIA_VACIA = 'Pronto verás aquí nuestro trabajo';
const PRIMERA_FOTO = GALERIA_ESPERADA[0].alt;
const VIGENCIA_OTONO = 'Válida hasta el lunes 30 de noviembre.';
/** Enlace https ficticio de una promoción: se abre fuera de la app. */
const PAGINA_PROMOCION = 'https://promociones.test/otono';

/** Título de cada lista de contenido en Inicio (textos del respaldo del catálogo). */
const TITULOS: Record<SeccionContenido, string> = {
  promociones: 'Promociones',
  equipo: 'Nuestro equipo',
  preguntas: 'Preguntas frecuentes',
  galeria: 'Nuestro trabajo',
};

/** Espera el primer dato ficticio de cada sección a la vista (la galería se mide antes). */
const VER_DATOS: Record<SeccionContenido, () => Promise<void>> = {
  promociones: async () => {
    expect(await screen.findByText('Promoción ficticia de otoño')).toBeOnTheScreen();
  },
  equipo: async () => {
    expect(await screen.findByText('Integrante Ficticia Uno')).toBeOnTheScreen();
  },
  preguntas: async () => {
    expect(await screen.findByRole('button', { name: '¿Pregunta ficticia uno?' })).toBeOnTheScreen();
  },
  galeria: async () => {
    await waitFor(() => expect(screen.queryByLabelText('Cargando fotos del salón')).not.toBeOnTheScreen());
    await medirGaleria(PRIMERA_FOTO);
  },
};

const SECCIONES = Object.keys(TITULOS) as SeccionContenido[];

/** Lo que pide Inicio sin sesión: configuración, catálogos y las cuatro listas de contenido. */
const RUTAS_DE_INICIO = [
  `GET ${RUTA_CONFIGURACION}`,
  'GET /api/servicios',
  'GET /api/productos',
  ...Object.keys(rutasContenido()),
];

/** Configuración y contenido completos, con un producto para el carrusel de la tienda. */
const conContenido = (extra: Record<string, Manejador> = {}): Record<string, Manejador> => ({
  ...rutasCatalogoTienda(),
  ...rutaConfiguracion(),
  ...rutasContenido('llenas'),
  ...extra,
});

/** Sección de Inicio que lleva ese título (el título es hijo directo de la sección). */
function seccion(titulo: string) {
  return within(screen.getByRole('header', { name: titulo }).parent as TestInstance);
}

/**
 * Mide la pantalla para que aparezca el hero (con el nombre del salón) y luego su composición (la
 * vista que sigue a la marca), donde va la frase grande de contenido.inicio.heroDestacado.
 */
async function mostrarHero(nombre: string): Promise<void> {
  const [scroll] = screen.container.queryAll((nodo) => nodo.props.refreshControl != null);
  await fireEvent.layout(scroll, { x: 0, y: 0, width: 390, height: 844 });
  const marca = await screen.findByRole('header', { name: nombre });
  const hermanos = (marca.parent as TestInstance).children;
  const composicion = hermanos[hermanos.indexOf(marca) + 1] as TestInstance;
  expect(typeof composicion.props.onLayout).toBe('function');
  await fireEvent.layout(composicion, { x: 0, y: 0, width: 390, height: 600 });
}

/** La frase grande del hero, línea por línea (decorativa: oculta al lector de pantalla). */
function revisarFrase(...lineas: string[]): void {
  for (const linea of lineas) {
    expect(screen.getByText(linea, { includeHiddenElements: true })).toBeOnTheScreen();
  }
}

/** Ningún texto ni etiqueta a la vista con llaves de una variable sin llenar. */
function sinLlaves(): void {
  const textos = screen.container
    .queryAll((nodo) => nodo.type === 'Text' || typeof nodo.props.accessibilityLabel === 'string')
    .flatMap((nodo) => [
      nodo.props.accessibilityLabel as string | undefined,
      ...nodo.children.filter((hijo): hijo is string => typeof hijo === 'string'),
    ])
    .filter((texto): texto is string => typeof texto === 'string');
  expect(textos.length).toBeGreaterThan(0);
  expect(textos.filter((texto) => /[{}]/.test(texto))).toEqual([]);
}

/** Toca cada Reintentar a la vista, uno por uno, hasta que no quede ninguno. */
async function reintentarTodo(): Promise<void> {
  for (let vuelta = 0; vuelta < 10; vuelta += 1) {
    const botones = screen.queryAllByRole('button', { name: 'Reintentar' });
    if (botones.length === 0) {
      return;
    }
    await fireEvent.press(botones[0]);
  }
  expect(screen.queryByRole('button', { name: 'Reintentar' })).not.toBeOnTheScreen();
}

/** Cuántas veces se pidió cada ruta "MÉTODO /ruta". */
function vecesPorRuta(llamadas: Llamada[], rutas: string[]): Record<string, number> {
  return Object.fromEntries(
    rutas.map((ruta) => {
      const [metodo, camino] = ruta.split(' ');
      return [ruta, llamadasA(llamadas, metodo, camino).length];
    }),
  );
}

/** Abre Inicio sin sesión con esas rutas y mide la pantalla para ver el hero. */
async function abrirInicio(rutas: Record<string, Manejador>, nombre = NOMBRE_SALON): Promise<PantallaAbierta> {
  const abierta = await abrirEn('/inicio', rutas);
  expect(abierta.app.getPathname()).toBe('/inicio');
  await mostrarHero(nombre);
  return abierta;
}

/**
 * El mock de Reanimated devuelve en useScrollOffset un objeto sin get(), y el hero lo lee con get():
 * mientras dura cada prueba devuelve un valor compartido del mismo mock, quieto en 0.
 */
function desplazamientoQuieto(): void {
  const reanimado = jest.requireMock<Record<string, (inicial?: number) => unknown>>('react-native-reanimated');
  let espia: jest.SpyInstance;
  beforeEach(() => {
    espia = jest.spyOn(reanimado, 'useScrollOffset').mockImplementation(() => reanimado.useSharedValue(0));
  });
  afterEach(() => {
    espia.mockRestore();
  });
}

describe('Inicio con el contenido del salón (GP-07.3)', () => {
  // La configuración que llega en una prueba se queda en memoria: cada prueba empieza con el respaldo.
  beforeEach(() => {
    reiniciarConfiguracionPublica();
    limpiarArchivos();
    movimientoReducido(false);
  });
  desplazamientoQuieto();
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'con contenido pinta la frase del hero, las descripciones, promociones con vigencia, equipo, preguntas que se abren, sobre nosotros y el cierre',
    async () => {
      const { app } = await abrirInicio(conContenido());

      // Hero y descripciones de la configuración.
      revisarFrase('Frase', 'ficticia');
      expect(await screen.findByText('Productos ficticios')).toBeOnTheScreen();
      expect(await screen.findByText('Servicios ficticios')).toBeOnTheScreen();
      expect(screen.getByText('Galería ficticia')).toBeOnTheScreen();

      // Promociones: la de otoño lleva vigencia y es un enlace; la otra solo se lee.
      await VER_DATOS.promociones();
      expect(
        screen.getByRole('link', {
          name: `Promoción ficticia de otoño, Descuento inventado en servicios de prueba. ${VIGENCIA_OTONO}`,
        }),
      ).toBeOnTheScreen();
      expect(screen.getByText(VIGENCIA_OTONO)).toBeOnTheScreen();
      expect(screen.getByLabelText('Promoción ficticia sin imagen, Texto de prueba.')).toBeOnTheScreen();
      expect(screen.queryByRole('link', { name: /^Promoción ficticia sin imagen/ })).not.toBeOnTheScreen();

      // Equipo: cada integrante se lee como un solo elemento.
      const equipo = seccion(TITULOS.equipo);
      expect(equipo.getByLabelText('Integrante Ficticia Uno, Estilista de prueba, Presentación inventada.')).toBeOnTheScreen();
      expect(equipo.getByLabelText('Integrante Ficticio Dos, Colorista de prueba')).toBeOnTheScreen();

      // Preguntas: cerradas al llegar; tocar una la abre y muestra solo su respuesta.
      const pregunta = screen.getByRole('button', { name: '¿Pregunta ficticia uno?' });
      expect(pregunta).not.toBeExpanded();
      expect(screen.queryByText('Respuesta ficticia uno.')).not.toBeOnTheScreen();
      await fireEvent.press(pregunta);
      expect(screen.getByRole('button', { name: '¿Pregunta ficticia uno?' })).toBeExpanded();
      expect(screen.getByText('Respuesta ficticia uno.')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: '¿Pregunta ficticia dos?' })).not.toBeExpanded();
      expect(screen.queryByText('Respuesta ficticia dos.')).not.toBeOnTheScreen();

      // Sobre nosotros y cierre.
      const sobreNosotros = seccion('Sobre nosotros');
      expect(sobreNosotros.getByText('Párrafo ficticio uno')).toBeOnTheScreen();
      expect(sobreNosotros.getByText('Párrafo ficticio dos')).toBeOnTheScreen();
      expect(sobreNosotros.getByLabelText('El salón')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Cierre ficticio' })).toBeOnTheScreen();
      expect(screen.getByText('Texto de cierre ficticio')).toBeOnTheScreen();

      // "Conoce el salón" abre El salón; al regresar, "Reservar una cita" lleva a Servicios.
      await fireEvent.press(sobreNosotros.getByRole('link', { name: 'Conoce el salón' }));
      await waitFor(() => expect(app.getPathname()).toBe('/salon'));
      expect(await screen.findByRole('header', { name: 'Historia ficticia' })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));
      await waitFor(() => expect(app.getPathname()).toBe('/inicio'));

      await fireEvent.press(screen.getByRole('button', { name: 'Reservar una cita' }));
      await waitFor(() => expect(app.getPathname()).toBe('/citas'));
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'la galería sigue el orden del servidor con su texto alternativo y solo la foto con servicio ofrece "Ver servicio", que abre su detalle',
    async () => {
      const { app } = await abrirInicio(conContenido());
      await VER_DATOS.galeria();

      expect(screen.getAllByRole('imagebutton').map((foto) => foto.props.accessibilityLabel)).toEqual(
        GALERIA_ESPERADA.map((foto) => foto.alt),
      );

      // Sin servicio: el visor no ofrece verlo.
      await abrirFoto('Peinado ficticio', '2 de 3');
      expect(screen.queryByRole('button', { name: /^Ver el servicio/ })).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar galería' }));
      await waitFor(() => expect(screen.queryByText('2 de 3')).not.toBeOnTheScreen());

      // Con servicio: "Ver servicio" abre el detalle del servicio de la foto.
      await abrirFoto(PRIMERA_FOTO, 'Cortes · 1 de 3');
      expect(screen.getByText('Ver servicio')).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Ver el servicio Corte de prueba' }));
      await waitFor(() => expect(app.getPathname()).toBe('/servicio/1'));
      expect(await screen.findByRole('header', { name: 'Corte de dama' })).toBeOnTheScreen();
      await regresarA(app, '/inicio', 'Nuestro trabajo');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con las listas vacías oculta promociones, equipo y preguntas, y la galería invita a esperar sus fotos',
    async () => {
      await abrirInicio({ ...rutaConfiguracion(), ...rutasContenido('vacias') });

      expect(await screen.findByText(GALERIA_VACIA)).toBeOnTheScreen();
      for (const titulo of [TITULOS.promociones, TITULOS.equipo, TITULOS.preguntas]) {
        expect(screen.queryByRole('header', { name: titulo })).not.toBeOnTheScreen();
      }
      expect(screen.queryByRole('progressbar')).not.toBeOnTheScreen();
      expect(screen.queryByText(ERROR_SECCION)).not.toBeOnTheScreen();
      // Lo que sale de la configuración sigue a la vista.
      expect(screen.getByRole('header', { name: 'Sobre nosotros' })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Cierre ficticio' })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin red usa los textos del respaldo sin llaves, pide reintentar en cada sección y, con red, Reintentar las muestra',
    async () => {
      const sinRed = Object.fromEntries(RUTAS_DE_INICIO.map((ruta) => [ruta, sinRedEnRuta]));
      const { llamadas } = await abrirInicio(sinRed, RESPALDO_CONFIGURACION.salon.nombre);

      // Textos del respaldo de la configuración y del catálogo.
      const inicio = RESPALDO_CONFIGURACION.contenido.inicio;
      revisarFrase('Brillo', 'que se', 'nota');
      expect(screen.getByText(inicio.trabajoDescripcion)).toBeOnTheScreen();
      expect(screen.getByText(inicio.sobreNosotrosParrafos[0])).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: inicio.cierreTitulo })).toBeOnTheScreen();
      expect(screen.getByRole('link', { name: 'Conoce el salón' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Reservar una cita' })).toBeOnTheScreen();

      // Cada sección dice que no pudo cargar y ofrece Reintentar; también los catálogos.
      expect(await screen.findByText('No pudimos cargar el inicio')).toBeOnTheScreen();
      await waitFor(() => expect(screen.getAllByText(ERROR_SECCION)).toHaveLength(SECCIONES.length));
      for (const seccionContenido of SECCIONES) {
        const lista = seccion(TITULOS[seccionContenido]);
        expect(lista.getByText(ERROR_SECCION)).toBeOnTheScreen();
        expect(lista.getByRole('button', { name: 'Reintentar' })).toBeOnTheScreen();
      }
      expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(SECCIONES.length + 1);
      sinLlaves();
      // Solo se pidió lo de Inicio, y todo falló por la red.
      expect(llamadas.every((llamada) => RUTAS_DE_INICIO.includes(`${llamada.metodo} ${llamada.ruta}`))).toBe(true);

      // Vuelve la red: Reintentar pinta cada sección y los catálogos.
      simularServidorCatalogo(conContenido());
      await reintentarTodo();
      for (const seccionContenido of SECCIONES) {
        await VER_DATOS[seccionContenido]();
      }
      // Reintentar no vuelve a pedir la configuración: los catálogos llegan con las descripciones del respaldo.
      expect(await screen.findByText(inicio.productosDescripcion)).toBeOnTheScreen();
      expect(screen.getByText(inicio.serviciosDescripcion)).toBeOnTheScreen();
      expect(screen.queryByText(ERROR_SECCION)).not.toBeOnTheScreen();
      expect(screen.queryByText('No pudimos cargar el inicio')).not.toBeOnTheScreen();
      sinLlaves();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each(SECCIONES)(
    'si solo falla %s, esa sección pide reintentar y las demás se ven; Reintentar la recupera',
    async (fallida) => {
      await abrirInicio({ ...rutaConfiguracion(), ...rutasContenido({ [fallida]: 'error' }) });

      expect(await seccion(TITULOS[fallida]).findByText(ERROR_SECCION)).toBeOnTheScreen();
      expect(screen.getAllByText(ERROR_SECCION)).toHaveLength(1);
      for (const otra of SECCIONES.filter((s) => s !== fallida)) {
        await VER_DATOS[otra]();
      }

      simularServidorCatalogo(conContenido());
      await fireEvent.press(seccion(TITULOS[fallida]).getByRole('button', { name: 'Reintentar' }));
      await VER_DATOS[fallida]();
      expect(screen.queryByText(ERROR_SECCION)).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'deslizar para actualizar vuelve a pedir la configuración, el contenido y los catálogos, y pinta lo nuevo',
    async () => {
      await abrirInicio(conContenido());
      await VER_DATOS.promociones();
      expect(screen.getByRole('header', { name: 'Cierre ficticio' })).toBeOnTheScreen();

      // El servidor ya tiene otro cierre y otra promoción.
      const nueva = respuestaCompleta();
      (nueva.contenido as { inicio: Record<string, unknown> }).inicio.cierreTitulo = 'Cierre ficticio actualizado';
      const promocionNueva = { ...promocionesCrudas()[1], id: 13, titulo: 'Promoción ficticia nueva' };
      const llamadas = simularServidorCatalogo(
        conContenido({
          ...rutaConfiguracion(nueva),
          [`GET ${RUTA_PROMOCIONES}`]: () => respuesta(cuerpoLista([promocionNueva])),
        }),
      );

      await deslizarParaActualizar();

      expect(await screen.findByRole('header', { name: 'Cierre ficticio actualizado' })).toBeOnTheScreen();
      expect(await screen.findByText('Promoción ficticia nueva')).toBeOnTheScreen();
      expect(screen.queryByText('Promoción ficticia de otoño')).not.toBeOnTheScreen();
      // Una petición de cada cosa, y el indicador se apaga al terminar.
      expect(vecesPorRuta(llamadas, RUTAS_DE_INICIO)).toEqual(
        Object.fromEntries(RUTAS_DE_INICIO.map((ruta) => [ruta, 1])),
      );
      const [scroll] = screen.container.queryAll((nodo) => nodo.props.refreshControl != null);
      await waitFor(() =>
        expect((scroll.props.refreshControl as { props: { refreshing: boolean } }).props.refreshing).toBe(false),
      );
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si al deslizar para actualizar no hay red, se queda lo que ya estaba a la vista, sin errores',
    async () => {
      await abrirInicio(conContenido());
      for (const seccionContenido of SECCIONES) {
        await VER_DATOS[seccionContenido]();
      }

      const llamadas = simularServidorCatalogo(Object.fromEntries(RUTAS_DE_INICIO.map((ruta) => [ruta, sinRedEnRuta])));
      await deslizarParaActualizar();

      await waitFor(() => expect(llamadas).toHaveLength(RUTAS_DE_INICIO.length));
      expect(screen.getByText('Promoción ficticia de otoño')).toBeOnTheScreen();
      expect(screen.getByText('Integrante Ficticia Uno')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: '¿Pregunta ficticia uno?' })).toBeOnTheScreen();
      expect(screen.getByRole('imagebutton', { name: PRIMERA_FOTO })).toBeOnTheScreen();
      expect(screen.getByText('Servicios ficticios')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Cierre ficticio' })).toBeOnTheScreen();
      expect(screen.queryByText(ERROR_SECCION)).not.toBeOnTheScreen();
      expect(screen.queryByText('No pudimos cargar el inicio')).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, string, string, string[][]]>([
    ['una ruta del sitio abre su pantalla en la app', '/cliente/tienda-online', '/tienda', []],
    ['una página https se abre fuera de la app', PAGINA_PROMOCION, '/inicio', [[PAGINA_PROMOCION]]],
  ])(
    'tocar una promoción con enlace: %s',
    async (_caso, enlace, rutaEsperada, abiertas) => {
      // Sin una app que abra el enlace, la promesa rechaza y la pantalla sigue igual.
      const abrirUrl = jest.spyOn(Linking, 'openURL').mockRejectedValue(new Error('Sin app ficticia'));
      try {
        const [otono, otra] = promocionesCrudas();
        const { app } = await abrirInicio(
          conContenido({ [`GET ${RUTA_PROMOCIONES}`]: () => respuesta(cuerpoLista([{ ...otono, enlace }, otra])) }),
        );

        await fireEvent.press(await screen.findByRole('link', { name: /^Promoción ficticia de otoño/ }));

        await waitFor(() => expect(app.getPathname()).toBe(rutaEsperada));
        expect(abrirUrl.mock.calls).toEqual(abiertas);
      } finally {
        abrirUrl.mockRestore();
      }
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'nunca usa la API real: todo lo que pide Inicio, al actualizar y El salón va a la API de prueba',
    async () => {
      const { app, llamadas } = await abrirInicio(conContenido());
      await VER_DATOS.galeria();
      await deslizarParaActualizar();
      await fireEvent.press(screen.getByRole('link', { name: 'Conoce el salón' }));
      await waitFor(() => expect(app.getPathname()).toBe('/salon'));
      expect(await screen.findByRole('header', { name: 'El salón' })).toBeOnTheScreen();

      expect(llamadas.length).toBeGreaterThan(RUTAS_DE_INICIO.length);
      expect(llamadas.filter((llamada) => !llamada.url.startsWith(`${API}/`))).toEqual([]);
      expect(process.env.EXPO_PUBLIC_API_URL).toBe(API);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
