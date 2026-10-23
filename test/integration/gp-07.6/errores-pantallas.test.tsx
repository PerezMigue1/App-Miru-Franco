/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen } from 'expo-router/testing-library';

import { CITA_CON_ANTICIPO, cuerpoCita, rutaCita } from '../../helpers/citasFicticias';
import { FALLAS, revisarYReintentar, sinTextoTecnico } from '../../helpers/fallasPantalla';
import { abrirApp, cerrarIntroSiAparece, LIMITE_MS } from '../../helpers/pantallas';
import { abrirReserva, prepararPruebasReserva } from '../../helpers/pantallasReserva';
import { abrirTienda, conTextos, fallaHastaArreglar } from '../../helpers/pantallasTienda';
import { CLIENTA, respuestaPerfil, simularServidorPerfil } from '../../helpers/perfilClienta';
import { respuesta } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';
import { RUTA_CARRITO } from '../../helpers/tiendaFicticia';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.6, pantallas reales con el servidor simulado: cada pantalla que antes decía "Revisa tu
 * conexión" ante cualquier falla ahora dice por qué no cargó (sin red, falla del servidor con su
 * referencia o límite de solicitudes), nunca el texto técnico del servidor, y "Reintentar" vuelve a
 * pedir. La API es http://api.test; nada sale a la red.
 */

/** Cada pantalla [ruta, título] por cada falla: [ruta, título, falla, manejador, texto]. */
const conFallas = (pantallas: [string, string][]) =>
  pantallas.flatMap(([ruta, titulo]) => FALLAS.map(([falla, manejador, texto]) => [ruta, titulo, falla, manejador, texto] as const));

describe('Errores de carga con las pantallas reales (GP-07.6)', () => {
  const revisarConsola = prepararPruebasReserva();

  describe('Mi cuenta', () => {
    it.each(
      conFallas([
        ['/perfil', 'No pudimos cargar tu perfil'],
        ['/editar-perfil', 'No pudimos cargar tu perfil'],
        ['/cambiar-contrasena', 'No pudimos cargar tu cuenta'],
      ]),
    )(
      '%s (%s) con %s dice por qué no cargó y Reintentar la trae',
      async (ruta, titulo, _falla, manejador, texto) => {
        await sembrarSesion(CLIENTA);
        // La primera lectura de /me es la de la sesión al abrir; la de la pantalla es la que falla.
        let lecturas = 0;
        const me = fallaHastaArreglar(() => respuestaPerfil(), manejador);
        simularServidorPerfil({
          'GET /api/auth/me': (cuerpo) => {
            lecturas += 1;
            return lecturas === 1 ? respuestaPerfil() : me.manejador(cuerpo);
          },
        });
        await abrirApp(ruta);
        await cerrarIntroSiAparece();

        await revisarYReintentar(me, titulo, texto);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('Citas', () => {
    it.each(
      conFallas([
        ['/cita/501', 'No pudimos cargar tu cita'],
        ['/cita/501/reprogramar', 'No pudimos cargar tu cita'],
      ]),
    )(
      '%s (%s) con %s dice por qué no cargó y Reintentar la trae',
      async (ruta, titulo, _falla, manejador, texto) => {
        const cita = fallaHastaArreglar(() => respuesta(cuerpoCita(CITA_CON_ANTICIPO)), manejador);
        await abrirReserva(ruta, { rutas: { [rutaCita()]: cita.manejador } });

        await revisarYReintentar(cita, titulo, texto);
        revisarConsola();
      },
      LIMITE_MS,
    );
  });

  describe('Tienda', () => {
    it.each(
      conFallas([
        ['/carrito', 'No pudimos cargar tu carrito'],
        ['/checkout', 'No pudimos cargar tu carrito'],
      ]),
    )(
      '%s (%s) con %s dice por qué no cargó',
      async (ruta, titulo, _falla, manejador, texto) => {
        await abrirTienda(ruta, { rutas: { [RUTA_CARRITO]: manejador } });

        expect(await screen.findByRole('header', { name: titulo })).toBeOnTheScreen();
        conTextos(texto);
        sinTextoTecnico();
        revisarConsola();
      },
      LIMITE_MS,
    );
  });
});
