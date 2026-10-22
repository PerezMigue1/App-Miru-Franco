/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { userEvent } from '@testing-library/react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { rutaAviso, rutasAvisos } from '../../helpers/avisosFicticios';
import { CLIENTA_CITAS } from '../../helpers/citasFicticias';
import { CLAVE, CORREO } from '../../helpers/datosClienta';
import { abrirAcceso, entrarCon, LIMITE_MS, ultimoBoton } from '../../helpers/pantallas';
import {
  abrirBandeja,
  abrirConAvisos,
  abrirSinSesionConAvisos,
  AVISO_EN_VIVO,
  avisosSinLeer,
  cambiarAppState,
  enVivo,
  esperarCampana,
  esperarFlujo,
  filaSinLeer,
  ID_CITA_AVISO,
  pedidasDeLista,
  prepararPruebasAvisos,
  revisarPeticionFlujo,
  simularServidorAvisos,
  volverAInicio,
} from '../../helpers/pantallasAvisos';
import { esperarDetalle } from '../../helpers/pantallasMisCitas';
import { esperarRuta } from '../../helpers/pantallasReserva';
import { jwtFicticio, sesionGuardada } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';
import { abrirFlujo, flujosVivos, llamadasFlujo, responderEstado } from '../../helpers/streamSimulado';

/**
 * GP-07.2: la campana de la cabecera y los avisos que llegan en vivo, con las pantallas reales
 * (renderRouter sobre src/app), el servidor simulado y el flujo en vivo simulado (expo/fetch). No hay
 * notificaciones push: los avisos llegan solo con sesión y con la app en primer plano. Aquí van el
 * contador al iniciar sesión, el aviso en pantalla, el cierre de sesión, el segundo plano y el 401
 * del flujo. La bandeja (abrir, marcar y borrar) va en bandeja.test.tsx.
 */

/** Campana con AVISOS_FICTICIOS: el de la cita y el general siguen sin leer. */
const CAMPANA_DOS = 'Abrir notificaciones, 2 avisos sin leer';
const CAMPANA_TRES = 'Abrir notificaciones, 3 avisos sin leer';
const CAMPANA_SIN_AVISOS = 'Abrir notificaciones';
const TITULO_EN_VIVO = String(AVISO_EN_VIVO.titulo);
const TARJETA_EN_VIVO = `Aviso nuevo: ${TITULO_EN_VIVO}. Toca para abrirlo`;

describe('Campana y avisos en vivo con las pantallas reales (GP-07.2)', () => {
  const revisarConsola = prepararPruebasAvisos();

  it.each([
    ['2', undefined, CAMPANA_DOS],
    ['9+', avisosSinLeer(10), 'Abrir notificaciones, 10 avisos sin leer'],
  ])(
    'con la sesión guardada la campana muestra "%s" y lo dice en su etiqueta',
    async (cifra, lista, etiqueta) => {
      const { flujo, llamadas, sesion } = await abrirConAvisos('/', { lista });

      await esperarCampana(etiqueta, cifra);
      await esperarFlujo(flujo);
      expect(pedidasDeLista(llamadas)).toHaveLength(1);
      expect(pedidasDeLista(llamadas)[0].cabeceras.Authorization).toBe(`Bearer ${sesion.token}`);
      expect(llamadasFlujo()).toHaveLength(1);
      revisarPeticionFlujo(llamadasFlujo()[0], sesion.token);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'al iniciar sesión la campana muestra el contador y el flujo abre con el token nuevo',
    async () => {
      const token = jwtFicticio('clienta-ficticia-login');
      const llamadas = simularServidorAvisos({
        ...rutasAvisos(),
        'POST /api/auth/login': () =>
          respuesta({ success: true, token, refreshToken: 'refresh-ficticio-login', usuario: CLIENTA_CITAS }),
      });
      const abierto = abrirFlujo();
      const app = await abrirAcceso();

      // Sin sesión todavía no hay lista ni flujo.
      expect(llamadasFlujo()).toHaveLength(0);
      expect(pedidasDeLista(llamadas)).toHaveLength(0);
      await entrarCon(CORREO, CLAVE);

      await esperarRuta(app, '/inicio');
      await esperarCampana(CAMPANA_DOS, '2');
      await esperarFlujo(abierto);
      revisarPeticionFlujo(llamadasFlujo()[0], token);
      expect(pedidasDeLista(llamadas)).toHaveLength(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'un aviso en vivo sube el contador, sale en pantalla y ya está en la bandeja sin pedir la lista otra vez',
    async () => {
      const { app, flujo, llamadas } = await abrirConAvisos();
      await esperarCampana(CAMPANA_DOS, '2');
      const vivo = await esperarFlujo(flujo);

      // El keep-alive no cambia nada.
      await enVivo(() => vivo.enviarKeepAlive());
      await esperarCampana(CAMPANA_DOS, '2');
      expect(screen.queryByText('Aviso nuevo')).not.toBeOnTheScreen();

      await enVivo(() => vivo.enviarAviso(AVISO_EN_VIVO));

      await esperarCampana(CAMPANA_TRES, '3');
      expect(screen.getByRole('button', { name: TARJETA_EN_VIVO })).toBeOnTheScreen();
      expect(screen.getByText(TITULO_EN_VIVO)).toBeOnTheScreen();

      await abrirBandeja(app, CAMPANA_TRES);

      // En la bandeja el aviso en pantalla se quita: el nuevo ya está en la lista.
      expect(await filaSinLeer(TITULO_EN_VIVO)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: TARJETA_EN_VIVO })).not.toBeOnTheScreen();
      expect(screen.getAllByLabelText('No leído')).toHaveLength(3);
      expect(pedidasDeLista(llamadas)).toHaveLength(1);
      expect(llamadasFlujo()).toHaveLength(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'tocar el aviso en pantalla lo marca como leído, baja el contador y abre el detalle de su cita',
    async () => {
      const { app, flujo, llamadas } = await abrirConAvisos();
      const vivo = await esperarFlujo(flujo);
      await enVivo(() => vivo.enviarAviso(AVISO_EN_VIVO));
      await esperarCampana(CAMPANA_TRES, '3');

      await fireEvent.press(screen.getByRole('button', { name: TARJETA_EN_VIVO }));

      await esperarDetalle(app, ID_CITA_AVISO);
      const marcadas = llamadasA(llamadas, 'PUT', rutaAviso(String(AVISO_EN_VIVO.id)));
      expect(marcadas).toHaveLength(1);
      expect(marcadas[0].cuerpo).toEqual({ leida: true });
      expect(screen.queryByRole('button', { name: TARJETA_EN_VIVO })).not.toBeOnTheScreen();

      await volverAInicio(app);
      await esperarCampana(CAMPANA_DOS, '2');
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin sesión la campana no muestra contador, no abre el flujo y al tocarla pide iniciar sesión',
    async () => {
      const { app, llamadas } = await abrirSinSesionConAvisos();

      await esperarCampana(CAMPANA_SIN_AVISOS);
      await fireEvent.press(screen.getByRole('button', { name: CAMPANA_SIN_AVISOS }));

      expect(await screen.findByText('Inicia sesión para continuar')).toBeOnTheScreen();
      expect(app.getPathname()).toBe('/inicio');
      expect(llamadasFlujo()).toHaveLength(0);
      expect(pedidasDeLista(llamadas)).toHaveLength(0);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'al cerrar sesión desaparece el contador y se corta el flujo',
    async () => {
      const { app, flujo } = await abrirConAvisos();
      await esperarCampana(CAMPANA_DOS, '2');
      await esperarFlujo(flujo);
      expect(flujosVivos()).toBe(1);

      // Con userEvent la foto pasa por presionada, como bajo el dedo, y abre Perfil.
      await userEvent.setup().press(screen.getByRole('button', { name: 'Abrir perfil' }));
      await esperarRuta(app, '/perfil');
      await esperarCampana(CAMPANA_DOS, '2');

      await fireEvent.press(
        await screen.findByRole('button', { name: 'Cerrar sesión, Sal de tu cuenta en este teléfono.' }),
      );
      expect(await screen.findByText('¿Cerrar sesión?')).toBeOnTheScreen();
      await fireEvent.press(ultimoBoton('Cerrar sesión'));

      await esperarRuta(app, '/inicio');
      await esperarCampana(CAMPANA_SIN_AVISOS);
      expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeOnTheScreen();
      expect(sesionGuardada()).toBeNull();
      expect(flujosVivos()).toBe(0);
      expect(llamadasFlujo()).toHaveLength(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'en segundo plano corta el flujo y al volver abre una sola conexión y pide la lista una vez',
    async () => {
      const { flujo, llamadas, oyentesPrevios, sesion } = await abrirConAvisos();
      await esperarCampana(CAMPANA_DOS, '2');
      await esperarFlujo(flujo);

      await cambiarAppState(oyentesPrevios, 'background');
      expect(flujosVivos()).toBe(0);

      const otro = abrirFlujo();
      await cambiarAppState(oyentesPrevios, 'active');
      await esperarFlujo(otro);

      await waitFor(() => expect(pedidasDeLista(llamadas)).toHaveLength(2));
      expect(flujosVivos()).toBe(1);
      expect(llamadasFlujo()).toHaveLength(2);
      revisarPeticionFlujo(llamadasFlujo()[1], sesion.token);
      await esperarCampana(CAMPANA_DOS, '2');
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'un 401 del flujo renueva la sesión móvil y lo reabre con el token nuevo',
    async () => {
      const nuevo = { token: jwtFicticio('clienta-ficticia-renovada'), refreshToken: 'refresh-ficticio-rotado' };
      const { flujo, llamadas, sesion } = await abrirConAvisos('/', {
        rutas: { 'POST /api/auth/movil/renovar': () => respuesta(nuevo) },
        flujo: () => {
          responderEstado(401);
          return abrirFlujo();
        },
      });

      const vivo = await esperarFlujo(flujo);

      const renovaciones = llamadasA(llamadas, 'POST', '/api/auth/movil/renovar');
      expect(renovaciones).toHaveLength(1);
      expect(renovaciones[0].cuerpo).toEqual({ refreshToken: sesion.refreshToken });
      expect(renovaciones[0].cabeceras.Authorization).toBeUndefined();
      expect(llamadasFlujo()).toHaveLength(2);
      revisarPeticionFlujo(llamadasFlujo()[0], sesion.token);
      revisarPeticionFlujo(llamadasFlujo()[1], nuevo.token);
      expect(sesionGuardada()).toMatchObject(nuevo);

      // El flujo reabierto entrega avisos.
      await enVivo(() => vivo.enviarAviso(AVISO_EN_VIVO));
      await esperarCampana(CAMPANA_TRES, '3');
      expect(screen.getByRole('button', { name: TARJETA_EN_VIVO })).toBeOnTheScreen();
      expect(flujosVivos()).toBe(1);
      revisarConsola();
    },
    LIMITE_MS,
  );
});
