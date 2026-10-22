/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { userEvent } from '@testing-library/react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { Dimensions } from 'react-native';
import type { TestInstance } from 'test-renderer';

import { LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import {
  abrirEn,
  abrirFoto,
  medir,
  medirGaleria,
  regresarA,
  respuestaRetenida,
} from '../../helpers/pantallasServicios';
import { cuerpoLista, imagenServicio } from '../../helpers/serviciosFicticios';
import { respuesta } from '../../helpers/servidorSimulado';

/**
 * GP-06.1: de la galería "Nuestro trabajo" de Inicio al detalle del servicio, con las pantallas
 * reales y solo el servidor simulado. Desde GP-07.3 las fotos salen de GET /api/galeria (Admin >
 * Galería), en su orden y con su texto alternativo; el detalle sigue saliendo de GET /api/servicios/:id
 * del catálogo de pantalla. Fotos: corte, alaciado, balayage, retoque, lavado (servicio sin
 * categoría), un peinado sin servicio y una foto oculta que no se publica.
 */

/** Foto cruda de la galería ligada a un servicio del catálogo de pantalla. */
function fotoDeServicio(id: number, servicio: { id: number; nombre: string; categoria: string }, imagen: string) {
  return { id, url: imagenServicio(imagen), alt: `${servicio.nombre} terminado`, servicio };
}

const GALERIA = [
  fotoDeServicio(101, { id: 1, nombre: 'Corte de dama', categoria: 'Cabello' }, 'corte'),
  fotoDeServicio(102, { id: 2, nombre: 'Alaciado keratínico', categoria: 'Tratamientos' }, 'alaciado'),
  fotoDeServicio(103, { id: 4, nombre: 'Balayage', categoria: 'Color' }, 'balayage'),
  fotoDeServicio(104, { id: 7, nombre: 'Retoque de raíz', categoria: 'Color' }, 'retoque'),
  fotoDeServicio(105, { id: 8, nombre: 'Lavado express', categoria: '' }, 'lavado'),
  { id: 106, url: imagenServicio('peinado'), alt: 'Peinado de novia sin servicio', servicio: null },
  // Oculta en Admin > Galería: no se publica.
  { ...fotoDeServicio(107, { id: 5, nombre: 'Peinado de evento', categoria: 'Peinados' }, 'evento'), visible: false },
];

/** GET /api/galeria de Inicio. */
const GALERIA_INICIO = {
  'GET /api/galeria': () => respuesta(cuerpoLista(GALERIA)),
};

const FOTO_CORTE = 'Corte de dama terminado';
const VER_ALACIADO = 'Ver el servicio Alaciado keratínico';

/** Lista horizontal del visor (la única con paginación). */
function listaDelVisor(): TestInstance {
  const [lista] = screen.container.queryAll(
    (nodo) => typeof nodo.type === 'string' && nodo.props.pagingEnabled === true,
  );
  return lista;
}

/** Suelta el deslizamiento del visor en la página indicada. */
async function deslizarA(pagina: number): Promise<void> {
  const ancho = Dimensions.get('window').width;
  await fireEvent(listaDelVisor(), 'momentumScrollEnd', {
    nativeEvent: { contentOffset: { x: ancho * pagina, y: 0 } },
  });
}

/** Abre Inicio sin sesión con las fotos de la galería y mide el mosaico. */
async function abrirInicioConFotos() {
  const abierta = await abrirEn('/inicio', GALERIA_INICIO);
  expect(abierta.app.getPathname()).toBe('/inicio');
  await medirGaleria(FOTO_CORTE);
  return abierta;
}

describe('Del visor de la galería de Inicio al detalle del servicio (GP-06.1)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'tocar una foto abre el visor, deslizar cambia de foto y "Ver el servicio" abre su detalle; "Regresar" vuelve a Inicio',
    async () => {
      const { app } = await abrirInicioConFotos();
      // Solo las fotos visibles, cada una anunciada con su texto alternativo.
      expect(screen.getAllByRole('imagebutton')).toHaveLength(6);
      expect(screen.queryByRole('imagebutton', { name: 'Peinado de evento terminado' })).not.toBeOnTheScreen();

      await abrirFoto(FOTO_CORTE, 'Cabello · 1 de 6');
      expect(screen.getByRole('button', { name: 'Ver el servicio Corte de dama' })).toBeOnTheScreen();

      await deslizarA(1);
      expect(await screen.findByText('Tratamientos · 2 de 6')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: VER_ALACIADO })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Ver el servicio Corte de dama' })).not.toBeOnTheScreen();

      // Más allá de la última página se queda en la última (sin servicio, sin categoría).
      await deslizarA(9);
      expect(await screen.findByText('6 de 6')).toBeOnTheScreen();
      await deslizarA(1);
      expect(await screen.findByText('Tratamientos · 2 de 6')).toBeOnTheScreen();

      // Toque completo: el botón se marca presionado y al soltar cierra el visor y abre el detalle.
      await userEvent.setup().press(screen.getByRole('button', { name: VER_ALACIADO }));
      await waitFor(() => expect(app.getPathname()).toBe('/servicio/2'));
      expect(await screen.findByRole('header', { name: 'Alaciado keratínico' })).toBeOnTheScreen();
      expect(screen.getByText('Este servicio pide un anticipo de $360 al reservar.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Cerrar galería' })).not.toBeOnTheScreen();

      await regresarA(app, '/inicio', 'Nuestro trabajo');
      expect(screen.queryByText('Tratamientos · 2 de 6')).not.toBeOnTheScreen();
      expect(screen.getByRole('imagebutton', { name: 'Alaciado keratínico terminado' })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    '"Cerrar galería" cierra el visor; una foto sin categoría solo cuenta y una sin servicio no ofrece verlo',
    async () => {
      const { app } = await abrirInicioConFotos();

      await abrirFoto('Lavado express terminado', '5 de 6');
      expect(screen.getByRole('button', { name: 'Ver el servicio Lavado express' })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar galería' }));
      await waitFor(() => expect(screen.queryByText('5 de 6')).not.toBeOnTheScreen());
      expect(screen.queryByRole('button', { name: 'Cerrar galería' })).not.toBeOnTheScreen();

      // Al volver a abrir con otra foto, el contador arranca en ella; sin servicio no hay botón.
      await abrirFoto('Peinado de novia sin servicio', '6 de 6');
      expect(screen.queryByRole('button', { name: /^Ver el servicio/ })).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar galería' }));
      await waitFor(() => expect(screen.queryByText('6 de 6')).not.toBeOnTheScreen());
      expect(app.getPathname()).toBe('/inicio');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'mientras llega la galería muestra su esqueleto',
    async () => {
      const retenida = respuestaRetenida(cuerpoLista(GALERIA));
      await abrirEn('/inicio', { 'GET /api/galeria': retenida.manejador });

      const esqueleto = await screen.findByLabelText('Cargando fotos del salón');
      await medir(esqueleto);
      expect(screen.getByLabelText('Cargando fotos del salón')).toBeOnTheScreen();

      await retenida.soltar();
      await waitFor(() =>
        expect(screen.queryByLabelText('Cargando fotos del salón')).not.toBeOnTheScreen(),
      );
      await medirGaleria(FOTO_CORTE);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin fotos publicadas la galería muestra su estado vacío, como GaleriaVacia de la web',
    async () => {
      await abrirEn('/inicio', { 'GET /api/galeria': () => respuesta(cuerpoLista([])) });

      expect(await screen.findByText('Pronto verás aquí nuestro trabajo')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Estamos reuniendo las fotos de nuestros cortes, color y tratamientos. Mientras tanto, puedes conocer los servicios y reservar tu cita.',
        ),
      ).toBeOnTheScreen();
      expect(screen.queryByRole('imagebutton')).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
