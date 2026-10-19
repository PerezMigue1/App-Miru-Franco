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
  CATALOGO_PANTALLA,
  medir,
  medirGaleria,
  regresarA,
  respuestaRetenida,
} from '../../helpers/pantallasServicios';
import {
  CATALOGO_CRUDO,
  cuerpoLista,
  imagenServicio,
  servicioCrudo,
} from '../../helpers/serviciosFicticios';
import { respuesta } from '../../helpers/servidorSimulado';

/**
 * GP-06.1: de la galería "Nuestro trabajo" de Inicio al detalle del servicio, con las pantallas
 * reales y solo el servidor simulado. Inicio pide GET /api/servicios (galería y carrusel) y
 * GET /api/productos (hero y carrusel de productos, vacío aquí). Las fotos salen de los servicios
 * activos con imagen, en orden: corte, alaciado, balayage, retoque, lavado y un maquillaje que llega
 * sin id.
 */

/** Servicio con foto pero sin id: su foto no puede abrir un detalle. */
const SIN_ID = {
  ...servicioCrudo({
    nombre: 'Maquillaje social',
    categoria: 'Maquillaje',
    imagen: [imagenServicio('maquillaje')],
  }),
  id: null,
};

/** GET /api/servicios de Inicio: el catálogo de pantalla y el servicio sin id. */
const SERVICIOS_INICIO = {
  'GET /api/servicios': () => respuesta(cuerpoLista([...CATALOGO_PANTALLA, SIN_ID])),
};

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

/** Abre Inicio sin sesión con las fotos de los servicios y mide la galería. */
async function abrirInicioConFotos() {
  const abierta = await abrirEn('/inicio', SERVICIOS_INICIO);
  expect(abierta.app.getPathname()).toBe('/inicio');
  await medirGaleria('Corte de dama');
  return abierta;
}

describe('Del visor de la galería de Inicio al detalle del servicio (GP-06.1)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'tocar una foto abre el visor, deslizar cambia de foto y "Ver el servicio" abre su detalle; "Regresar" vuelve a Inicio',
    async () => {
      const { app } = await abrirInicioConFotos();
      // Una foto por servicio activo con imagen: ni el peinado inactivo ni los servicios sin foto.
      expect(screen.getAllByRole('imagebutton', { name: /^Ver foto de/ })).toHaveLength(6);
      expect(
        screen.queryByRole('imagebutton', { name: 'Ver foto de Peinado de evento en grande' }),
      ).not.toBeOnTheScreen();

      await abrirFoto('Corte de dama', 'Cabello · 1 de 6');
      expect(screen.getByRole('button', { name: 'Ver el servicio Corte de dama' })).toBeOnTheScreen();

      await deslizarA(1);
      expect(await screen.findByText('Tratamientos · 2 de 6')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: VER_ALACIADO })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Ver el servicio Corte de dama' })).not.toBeOnTheScreen();

      // Más allá de la última página se queda en la última.
      await deslizarA(9);
      expect(await screen.findByText('Maquillaje · 6 de 6')).toBeOnTheScreen();
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
      expect(
        screen.getByRole('imagebutton', { name: 'Ver foto de Alaciado keratínico en grande' }),
      ).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    '"Cerrar galería" cierra el visor; una foto sin categoría solo cuenta y una sin servicio no ofrece verlo',
    async () => {
      const { app } = await abrirInicioConFotos();

      await abrirFoto('Lavado express', '5 de 6');
      expect(screen.getByRole('button', { name: 'Ver el servicio Lavado express' })).toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar galería' }));
      await waitFor(() => expect(screen.queryByText('5 de 6')).not.toBeOnTheScreen());
      expect(screen.queryByRole('button', { name: 'Cerrar galería' })).not.toBeOnTheScreen();

      // Al volver a abrir con otra foto, el contador arranca en ella.
      await abrirFoto('Maquillaje social', 'Maquillaje · 6 de 6');
      expect(screen.queryByRole('button', { name: /^Ver el servicio/ })).not.toBeOnTheScreen();
      await fireEvent.press(screen.getByRole('button', { name: 'Cerrar galería' }));
      await waitFor(() => expect(screen.queryByText('Maquillaje · 6 de 6')).not.toBeOnTheScreen());
      expect(app.getPathname()).toBe('/inicio');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'mientras llegan los servicios la galería muestra su esqueleto',
    async () => {
      const retenida = respuestaRetenida(cuerpoLista(CATALOGO_PANTALLA));
      await abrirEn('/inicio', { 'GET /api/servicios': retenida.manejador });

      const esqueleto = await screen.findByLabelText('Cargando fotos del salón');
      await medir(esqueleto);
      expect(screen.getByLabelText('Cargando fotos del salón')).toBeOnTheScreen();

      await retenida.soltar();
      await waitFor(() =>
        expect(screen.queryByLabelText('Cargando fotos del salón')).not.toBeOnTheScreen(),
      );
      await medirGaleria('Corte de dama');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin fotos de servicios la galería dice que aún no hay fotos publicadas',
    async () => {
      const sinFotos = CATALOGO_CRUDO.map((servicio) => ({ ...servicio, imagen: [] }));
      await abrirEn('/inicio', { 'GET /api/servicios': () => respuesta(cuerpoLista(sinFotos)) });

      expect(await screen.findByText('Aún no hay fotos publicadas')).toBeOnTheScreen();
      expect(
        screen.getByText('Cuando el salón publique fotos de sus servicios, las verás aquí.'),
      ).toBeOnTheScreen();
      expect(screen.queryByRole('imagebutton', { name: /^Ver foto de/ })).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
