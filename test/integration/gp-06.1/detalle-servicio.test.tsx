/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { userEvent } from '@testing-library/react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import {
  abrirCatalogo,
  abrirDetalleDesdeLista,
  abrirEn,
  enSecuencia,
  errorDelServidor,
  regresarA,
  respuestaRetenida,
  TARJETA,
} from '../../helpers/pantallasServicios';
import {
  CATALOGO_CRUDO,
  cuerpoDetalle,
  ESPECIALISTA_DOS,
  ESPECIALISTA_UNO,
  imagenServicio,
} from '../../helpers/serviciosFicticios';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';

/**
 * GP-06.1: detalle de un servicio (/servicio/:id) con las pantallas reales y solo el servidor
 * simulado. GET /api/servicios/:id responde { success, data } sin especialistas y 404 para un id
 * inexistente o inactivo.
 */

const TITULO_CATALOGO = 'Explora nuestros servicios y agenda tu cita';
const ANTICIPO_ALACIADO = 'Este servicio pide un anticipo de $360 al reservar.';
const VALORACION = 'Requiere valoración previa en el salón.';
const NO_DISPONIBLE = 'Este servicio ya no está disponible';
const MENSAJE_NO_DISPONIBLE = 'Puede que el salón lo haya retirado. Mira los demás servicios del salón.';

/** Ningún texto del anticipo en el detalle visible. */
function sinAnticipo(): void {
  expect(screen.queryByText(/anticipo/)).not.toBeOnTheScreen();
}

/** Ninguna de las secciones indicadas en el detalle visible. */
function sinSecciones(...titulos: string[]): void {
  for (const titulo of titulos) {
    expect(screen.queryByRole('header', { name: titulo })).not.toBeOnTheScreen();
  }
}

describe('Detalle de un servicio con las pantallas reales (GP-06.1)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'de la lista al detalle con todo su contenido y "Regresar" vuelve a la lista',
    async () => {
      const { app, llamadas } = await abrirCatalogo();

      await abrirDetalleDesdeLista(app, TARJETA.alaciado, 2, 'Alaciado keratínico');
      expect(screen.getByLabelText('Foto de Alaciado keratínico')).toBeOnTheScreen();
      expect(screen.getByText('Tratamientos')).toBeOnTheScreen();
      expect(screen.getByLabelText('Duración: 2 h 30 min')).toBeOnTheScreen();
      expect(screen.getByLabelText('Precio: $1,200')).toHaveTextContent('$1,200');
      expect(screen.getByText(ANTICIPO_ALACIADO)).toBeOnTheScreen();
      expect(screen.queryByText(VALORACION)).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Reservar' })).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Descripción' })).toBeOnTheScreen();
      expect(screen.getByText('Tratamiento con keratina para alaciar.')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Incluye' })).toBeOnTheScreen();
      expect(screen.getByText('Diagnóstico')).toBeOnTheScreen();
      expect(screen.getByText('Aplicación de keratina')).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Recomendaciones' })).toBeOnTheScreen();
      expect(screen.getByText('No lavar el cabello en 72 horas')).toBeOnTheScreen();
      // En la lista el servicio trae dos especialistas, pero el detalle por id no las manda.
      sinSecciones('Especialistas');
      expect(screen.queryByText(ESPECIALISTA_UNO.nombre)).not.toBeOnTheScreen();
      const detalle = llamadasA(llamadas, 'GET', '/api/servicios/2');
      expect(detalle[0].cabeceras.Authorization).toBeUndefined();

      await regresarA(app, '/citas', TITULO_CATALOGO);
      expect(screen.getByRole('button', { name: TARJETA.alaciado })).toBeOnTheScreen();

      // Balayage: 3 h, precio con centavos, valoración previa y sin anticipo.
      await abrirDetalleDesdeLista(app, TARJETA.balayage, 4, 'Balayage');
      expect(screen.getByLabelText('Foto de Balayage')).toBeOnTheScreen();
      expect(screen.getByLabelText('Duración: 3 h')).toBeOnTheScreen();
      expect(screen.getByText('Color')).toBeOnTheScreen();
      expect(screen.getByLabelText('Precio: $1,800.50')).toBeOnTheScreen();
      expect(screen.getByText(VALORACION)).toBeOnTheScreen();
      sinAnticipo();
      await regresarA(app, '/citas', TITULO_CATALOGO);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'corrección GP-06.1: con anticipoAplica en false no muestra el anticipo aunque llegue anticipoMonto',
    async () => {
      const { app } = await abrirCatalogo();
      // Corte de dama llega con anticipoMonto "105.00" y anticipoAplica false.
      expect(CATALOGO_CRUDO[0]).toMatchObject({ anticipoMonto: '105.00', anticipoAplica: false });

      await abrirDetalleDesdeLista(app, TARJETA.corte, 1, 'Corte de dama');
      expect(screen.getByLabelText('Precio: $350')).toBeOnTheScreen();
      expect(screen.getByLabelText('Duración: 45 min')).toBeOnTheScreen();
      sinAnticipo();
      expect(screen.queryByText('$105')).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Reservar' })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'servicios con datos incompletos: sin precio, sin foto, sin textos, sin duración o sin categoría',
    async () => {
      const { app } = await abrirCatalogo();

      // Uñas: sin precio ni foto; la descripción corta reemplaza a la larga vacía.
      await abrirDetalleDesdeLista(app, TARJETA.unas, 3, 'Uñas acrílicas');
      expect(screen.getByText('Consulta el precio en el salón')).toBeOnTheScreen();
      expect(screen.queryByLabelText('Foto de Uñas acrílicas')).not.toBeOnTheScreen();
      expect(screen.getByText('Uñas esculpidas')).toBeOnTheScreen();
      expect(screen.getByLabelText('Duración: 1 h')).toBeOnTheScreen();
      sinSecciones('Incluye', 'Recomendaciones', 'Especialistas');
      await regresarA(app, '/citas', TITULO_CATALOGO);

      // Asesoría: sin duración, categoría, precio, foto ni textos.
      await abrirDetalleDesdeLista(app, TARJETA.asesoria, 6, 'Asesoría de imagen');
      expect(screen.getByText('Consulta el precio en el salón')).toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Duración/)).not.toBeOnTheScreen();
      sinSecciones('Descripción', 'Incluye', 'Recomendaciones', 'Especialistas');
      expect(screen.getByRole('button', { name: 'Reservar' })).toBeOnTheScreen();
      await regresarA(app, '/citas', TITULO_CATALOGO);

      // Retoque: con categoría y sin duración.
      await abrirDetalleDesdeLista(app, TARJETA.retoque, 7, 'Retoque de raíz');
      expect(screen.getByText('Color')).toBeOnTheScreen();
      expect(screen.queryByLabelText(/^Duración/)).not.toBeOnTheScreen();
      expect(screen.getByLabelText('Precio: $650')).toBeOnTheScreen();
      await regresarA(app, '/citas', TITULO_CATALOGO);

      // Lavado: con duración y sin categoría.
      await abrirDetalleDesdeLista(app, TARJETA.lavado, 8, 'Lavado express');
      expect(screen.getByLabelText('Duración: 30 min')).toBeOnTheScreen();
      expect(screen.queryByText('Cabello')).not.toBeOnTheScreen();
      expect(screen.getByLabelText('Precio: $150')).toBeOnTheScreen();
      await regresarA(app, '/citas', TITULO_CATALOGO);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'abierto directo muestra su esqueleto y "Regresar" sin historial lleva al catálogo',
    async () => {
      const retenida = respuestaRetenida(cuerpoDetalle(CATALOGO_CRUDO[3]));
      const { app } = await abrirEn('/servicio/4', { 'GET /api/servicios/4': retenida.manejador });

      expect(app.getPathname()).toBe('/servicio/4');
      expect(
        await screen.findByRole('progressbar', { name: 'Cargando servicio' }),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Regresar' })).toBeOnTheScreen();

      await retenida.soltar();
      expect(await screen.findByRole('header', { name: 'Balayage' })).toBeOnTheScreen();
      expect(screen.queryByRole('progressbar', { name: 'Cargando servicio' })).not.toBeOnTheScreen();

      await regresarA(app, '/citas', TITULO_CATALOGO);
      expect(await screen.findByRole('button', { name: TARJETA.balayage })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'corrección GP-06.1: un servicio inactivo (404) dice que ya no está disponible y "Ver servicios" lleva al catálogo',
    async () => {
      const { app } = await abrirEn('/servicio/5');

      expect(await screen.findByRole('header', { name: NO_DISPONIBLE })).toBeOnTheScreen();
      expect(screen.getByText(MENSAJE_NO_DISPONIBLE)).toBeOnTheScreen();
      expect(screen.queryByText(/en Citas/)).not.toBeOnTheScreen();
      expect(screen.queryByText('Servicio no encontrado')).not.toBeOnTheScreen();
      expect(screen.queryByRole('header', { name: 'Peinado de evento' })).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Ver servicios' }));
      await waitFor(() => expect(app.getPathname()).toBe('/citas'));
      expect(await screen.findByRole('button', { name: TARJETA.corte })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un id que no existe muestra el mismo aviso y "Regresar" lleva al catálogo',
    async () => {
      const { app } = await abrirEn('/servicio/999');

      expect(await screen.findByRole('header', { name: NO_DISPONIBLE })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Ver servicios' })).toBeOnTheScreen();

      // Toque completo (presionar y soltar) sobre el botón sin foto debajo.
      await userEvent.setup().press(screen.getByRole('button', { name: 'Regresar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/citas'));
      expect(await screen.findByText(TITULO_CATALOGO)).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si falla la carga muestra "No pudimos cargar este servicio" y "Reintentar" sí carga',
    async () => {
      const { llamadas } = await abrirEn('/servicio/2', {
        'GET /api/servicios/2': enSecuencia(errorDelServidor, () =>
          respuesta(cuerpoDetalle(CATALOGO_CRUDO[1])),
        ),
      });

      expect(
        await screen.findByRole('header', { name: 'No pudimos cargar este servicio' }),
      ).toBeOnTheScreen();
      expect(screen.getByText('Revisa tu conexión e intenta de nuevo.')).toBeOnTheScreen();
      expect(screen.queryByText('Error interno ficticio')).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));
      expect(await screen.findByRole('header', { name: 'Alaciado keratínico' })).toBeOnTheScreen();
      expect(screen.getByText(ANTICIPO_ALACIADO)).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'GET', '/api/servicios/2')).toHaveLength(2);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si el detalle trajera especialistas (hoy el backend no las manda) se listan por nombre',
    async () => {
      const conEspecialistas = {
        success: true,
        data: {
          ...CATALOGO_CRUDO[1],
          especialistas: [
            {
              usuarioId: ESPECIALISTA_UNO.usuarioId,
              usuario: { nombre: ESPECIALISTA_UNO.nombre, foto: imagenServicio('persona') },
            },
            { usuarioId: ESPECIALISTA_DOS.usuarioId, usuario: { nombre: ESPECIALISTA_DOS.nombre } },
          ],
        },
      };
      await abrirEn('/servicio/2', { 'GET /api/servicios/2': () => respuesta(conEspecialistas) });

      expect(await screen.findByRole('header', { name: 'Especialistas' })).toBeOnTheScreen();
      expect(screen.getByText(ESPECIALISTA_UNO.nombre)).toBeOnTheScreen();
      expect(screen.getByText(ESPECIALISTA_DOS.nombre)).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin sesión, "Reservar" muestra la invitación a iniciar sesión y no sale del detalle',
    async () => {
      const { app } = await abrirEn('/servicio/2');
      expect(await screen.findByRole('header', { name: 'Alaciado keratínico' })).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Reservar' }));
      expect(
        await screen.findByRole('header', { name: 'Inicia sesión para reservar' }),
      ).toBeOnTheScreen();
      expect(
        screen.getByText('Con tu cuenta eliges día y hora y pagas tu anticipo desde la app.'),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Crear cuenta' })).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Reservar' })).not.toBeOnTheScreen();
      expect(app.getPathname()).toBe('/servicio/2');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con sesión, "Reservar" abre la reserva del servicio en el paso de especialista',
    async () => {
      const { app, llamadas } = await abrirEn(
        '/servicio/2',
        {
          'GET /api/citas/especialistas': () =>
            respuesta({
              success: true,
              data: [
                { id: ESPECIALISTA_UNO.usuarioId, nombre: ESPECIALISTA_UNO.nombre, puesto: 'Estilista' },
              ],
            }),
        },
        true,
      );
      expect(await screen.findByRole('header', { name: 'Alaciado keratínico' })).toBeOnTheScreen();
      expect(screen.queryByText('Inicia sesión para reservar')).not.toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Reservar' }));
      await waitFor(() => expect(app.getPathname()).toBe('/reservar/2'));
      expect(
        await screen.findByRole('header', { name: 'Paso 1 de 3: Especialista' }),
      ).toBeOnTheScreen();
      expect(screen.getByText('¿Con quién quieres tu cita?')).toBeOnTheScreen();
      expect(
        screen.getByRole('button', { name: `${ESPECIALISTA_UNO.nombre}, Estilista` }),
      ).toBeOnTheScreen();
      expect(screen.queryByText('Inicia sesión para reservar')).not.toBeOnTheScreen();

      const agenda = llamadasA(llamadas, 'GET', '/api/citas/especialistas');
      expect(agenda.length).toBeGreaterThan(0);
      expect(agenda[0].cabeceras.Authorization).toMatch(/^Bearer /);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
