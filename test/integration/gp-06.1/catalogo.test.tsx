/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor, within } from 'expo-router/testing-library';

import { LIMITE_MS, prepararPruebasDePantalla, ultimoBoton } from '../../helpers/pantallas';
import {
  abrirCatalogo,
  abrirEn,
  buscar,
  enSecuencia,
  errorDelServidor,
  esperarTarjetas,
  respuestaRetenida,
  TARJETA,
  TODAS_LAS_TARJETAS,
} from '../../helpers/pantallasServicios';
import { CATALOGO_CRUDO, cuerpoLista } from '../../helpers/serviciosFicticios';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';

/**
 * GP-06.1: catálogo de servicios en la pestaña Servicios (ruta /citas) con las pantallas reales y
 * solo el servidor simulado: carga, tarjetas, búsqueda, categorías, filtros avanzados y estados de
 * vacío y error, tal como los ve la clienta.
 */

const BUSCADOR = 'Buscar un servicio por nombre';
const CASILLA_EVALUACION = 'Solo servicios que requieren evaluación previa';

describe('Catálogo de servicios con las pantallas reales (GP-06.1)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'muestra el esqueleto mientras carga y luego las tarjetas activas con su etiqueta, sin el servicio inactivo',
    async () => {
      const retenida = respuestaRetenida(cuerpoLista());
      const { app, llamadas } = await abrirEn('/citas', { 'GET /api/servicios': retenida.manejador });

      expect(app.getPathname()).toBe('/citas');
      expect(screen.getByText('Explora nuestros servicios y agenda tu cita')).toBeOnTheScreen();
      expect(await screen.findByLabelText('Cargando servicios')).toBeOnTheScreen();
      expect(screen.queryByLabelText(BUSCADOR)).not.toBeOnTheScreen();

      await retenida.soltar();
      await waitFor(() => expect(screen.queryByLabelText('Cargando servicios')).not.toBeOnTheScreen());
      await esperarTarjetas([TARJETA.corte, TARJETA.alaciado, TARJETA.unas, TARJETA.balayage]);
      expect(screen.queryByText('Peinado de evento')).not.toBeOnTheScreen();

      // La tarjeta muestra nombre, categoría, duración y precio (o el aviso sin precio).
      const alaciado = within(screen.getByRole('button', { name: TARJETA.alaciado }));
      expect(alaciado.getByText('Alaciado keratínico')).toBeOnTheScreen();
      expect(alaciado.getByText('Tratamientos')).toBeOnTheScreen();
      expect(alaciado.getByText('2 h 30 min')).toBeOnTheScreen();
      expect(alaciado.getByText('$1,200')).toBeOnTheScreen();
      const unas = within(screen.getByRole('button', { name: TARJETA.unas }));
      expect(unas.getByText('Consulta el precio en el salón')).toBeOnTheScreen();

      // Una sola lectura pública del catálogo, sin token.
      const lecturas = llamadasA(llamadas, 'GET', '/api/servicios');
      expect(lecturas).toHaveLength(1);
      expect(lecturas[0].cabeceras.Authorization).toBeUndefined();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'busca sin importar acentos ni mayúsculas y "Borrar búsqueda" regresa la lista completa',
    async () => {
      await abrirCatalogo();
      const campo = screen.getByLabelText(BUSCADOR);

      // El campo cambia de aspecto al enfocarse y vuelve al salir.
      await fireEvent(campo, 'focus');
      await buscar('unas');
      await esperarTarjetas([TARJETA.unas]);
      await fireEvent(campo, 'blur');

      await buscar('ALACIADO');
      await esperarTarjetas([TARJETA.alaciado]);

      await buscar('Raiz');
      await esperarTarjetas([TARJETA.retoque]);

      await fireEvent.press(screen.getByRole('button', { name: 'Borrar búsqueda' }));
      await esperarTarjetas(TODAS_LAS_TARJETAS);
      expect(screen.getByLabelText(BUSCADOR)).toHaveDisplayValue('');
      expect(screen.queryByRole('button', { name: 'Borrar búsqueda' })).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'filtra por categoría y "Categoría Todas" vuelve a mostrar todo',
    async () => {
      await abrirCatalogo();
      expect(screen.getByRole('button', { name: 'Categoría Todas' })).toBeSelected();

      await fireEvent.press(screen.getByRole('button', { name: 'Categoría Color' }));
      await esperarTarjetas([TARJETA.balayage, TARJETA.retoque]);
      expect(screen.getByRole('button', { name: 'Categoría Color' })).toBeSelected();
      expect(screen.getByRole('button', { name: 'Categoría Todas' })).not.toBeSelected();

      await fireEvent.press(screen.getByRole('button', { name: 'Categoría Uñas' }));
      await esperarTarjetas([TARJETA.unas]);

      // Sin categoría para el servicio inactivo.
      expect(screen.queryByRole('button', { name: 'Categoría Peinados' })).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Categoría Todas' }));
      await esperarTarjetas(TODAS_LAS_TARJETAS);
      expect(screen.getByRole('button', { name: 'Categoría Todas' })).toBeSelected();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin resultados por la búsqueda, "Ver todos" borra la búsqueda y la categoría',
    async () => {
      await abrirCatalogo();

      await fireEvent.press(screen.getByRole('button', { name: 'Categoría Cabello' }));
      await esperarTarjetas([TARJETA.corte]);
      await buscar('balayage');

      expect(await screen.findByText('Sin resultados')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'No encontramos servicios con ese nombre. Prueba con otra palabra o elige Todas.',
        ),
      ).toBeOnTheScreen();
      await esperarTarjetas([]);

      await fireEvent.press(screen.getByRole('button', { name: 'Ver todos' }));
      await esperarTarjetas(TODAS_LAS_TARJETAS);
      expect(screen.queryByText('Sin resultados')).not.toBeOnTheScreen();
      expect(screen.getByLabelText(BUSCADOR)).toHaveDisplayValue('');
      expect(screen.getByRole('button', { name: 'Categoría Todas' })).toBeSelected();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si el salón no tiene servicios activos muestra "Pronto verás aquí los servicios", sin buscador',
    async () => {
      const soloInactivos = CATALOGO_CRUDO.filter((servicio) => !servicio.activo);
      await abrirEn('/citas', {
        'GET /api/servicios': () => respuesta(cuerpoLista(soloInactivos)),
      });

      expect(await screen.findByText('Pronto verás aquí los servicios')).toBeOnTheScreen();
      expect(screen.getByText('El salón aún no publica servicios en la app.')).toBeOnTheScreen();
      expect(screen.queryByLabelText(BUSCADOR)).not.toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Filtros' })).not.toBeOnTheScreen();
      expect(screen.queryByText('Peinado de evento')).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'los filtros de la hoja reducen la lista hasta el vacío y "Limpiar filtros" la regresa',
    async () => {
      await abrirCatalogo();

      // Precio y duración en la hoja: la lista no cambia hasta "Aplicar".
      await fireEvent.press(screen.getByRole('button', { name: 'Filtros' }));
      expect(await screen.findByRole('header', { name: 'Filtros' })).toBeOnTheScreen();
      expect(ultimoBoton('Limpiar filtros')).toBeDisabled();
      await fireEvent.changeText(screen.getByLabelText('Mínimo'), '1000');
      await fireEvent.changeText(screen.getByLabelText('Máximo'), '1500');
      await fireEvent.changeText(screen.getByLabelText('Mínima'), '100');
      await fireEvent.changeText(screen.getByLabelText('Máxima'), '200');
      expect(ultimoBoton('Limpiar filtros')).toBeEnabled();
      await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));

      await esperarTarjetas([TARJETA.alaciado]);
      expect(await screen.findByRole('button', { name: 'Filtros, 2 activos' })).toBeOnTheScreen();

      // Al volver a abrir, la hoja trae lo aplicado; con evaluación previa ya no queda ninguno.
      await fireEvent.press(screen.getByRole('button', { name: 'Filtros, 2 activos' }));
      expect(await screen.findByRole('header', { name: 'Filtros' })).toBeOnTheScreen();
      expect(screen.getByLabelText('Mínimo')).toHaveDisplayValue('1000');
      expect(screen.getByRole('checkbox', { name: CASILLA_EVALUACION })).not.toBeChecked();
      await fireEvent.press(screen.getByRole('checkbox', { name: CASILLA_EVALUACION }));
      expect(screen.getByRole('checkbox', { name: CASILLA_EVALUACION })).toBeChecked();
      await fireEvent.press(screen.getByRole('button', { name: 'Aplicar' }));

      expect(await screen.findByText('Sin servicios con estos filtros')).toBeOnTheScreen();
      expect(
        screen.getByText(
          'Ningún servicio coincide con el precio, la duración o la evaluación que elegiste. Cambia los valores o limpia los filtros.',
        ),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Filtros, 3 activos' })).toBeOnTheScreen();
      await esperarTarjetas([]);

      await fireEvent.press(screen.getAllByRole('button', { name: 'Limpiar filtros' })[0]);
      await esperarTarjetas(TODAS_LAS_TARJETAS);
      expect(screen.getByRole('button', { name: 'Filtros' })).toBeOnTheScreen();
      expect(screen.queryByText('Sin servicios con estos filtros')).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si falla la carga muestra "No pudimos cargar los servicios" y "Reintentar" sí carga',
    async () => {
      const { llamadas } = await abrirEn('/citas', {
        'GET /api/servicios': enSecuencia(errorDelServidor, () => respuesta(cuerpoLista())),
      });

      expect(await screen.findByText('No pudimos cargar los servicios')).toBeOnTheScreen();
      expect(screen.getByText('Revisa tu conexión e intenta de nuevo.')).toBeOnTheScreen();
      expect(screen.queryByText('Error interno ficticio')).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
      await esperarTarjetas([TARJETA.corte, TARJETA.alaciado, TARJETA.unas, TARJETA.balayage]);
      expect(screen.queryByText('No pudimos cargar los servicios')).not.toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', '/api/servicios')).toHaveLength(2);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
