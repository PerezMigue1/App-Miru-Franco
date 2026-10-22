/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { userEvent } from '@testing-library/react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import {
  AVISO_CITA,
  AVISO_PEDIDO,
  AVISO_SIN_DESTINO,
  AVISOS_FICTICIOS,
  avisoCrudo,
  ID_AVISO_CITA,
  ID_AVISO_PEDIDO,
  ID_AVISO_SIN_DESTINO,
  RUTA_AVISOS,
  RUTA_AVISOS_LEIDOS,
  rutaAviso,
  respuestaAvisos,
} from '../../helpers/avisosFicticios';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirBandeja,
  abrirConAvisos,
  abrirSinSesionConAvisos,
  esperarCampana,
  filaSinLeer,
  ID_CITA_AVISO,
  ID_PEDIDO_AVISO,
  pedidasDeLista,
  prepararPruebasAvisos,
  volverAInicio,
} from '../../helpers/pantallasAvisos';
import { deslizarParaActualizar } from '../../helpers/pantallasMisCitas';
import { esperarRuta, retener } from '../../helpers/pantallasReserva';
import { enSecuencia } from '../../helpers/pantallasServicios';
import { fallaHastaArreglar, reintentarTrasError } from '../../helpers/pantallasTienda';
import { llamadasA, respuesta } from '../../helpers/servidorSimulado';

/**
 * GP-07.2: la bandeja de Notificaciones con las pantallas reales (renderRouter sobre src/app), la
 * sesión de una clienta, el servidor simulado y el flujo en vivo simulado. La clienta la abre con la
 * campana de Inicio: tocar un aviso abre su cita o su pedido y lo marca como leído, "Marcar todas"
 * quita las marcas, borrar lo quita (o avisa con un mensaje amable si falla), y la bandeja vacía o
 * con error dicen qué pasa sin mostrar el texto técnico del servidor.
 */

const CAMPANA_DOS = 'Abrir notificaciones, 2 avisos sin leer';
const CAMPANA_SIN_AVISOS = 'Abrir notificaciones';
const TITULO_CITA = String(AVISO_CITA.titulo);
const TITULO_PEDIDO = String(AVISO_PEDIDO.titulo);
const TITULO_SIN_DESTINO = String(AVISO_SIN_DESTINO.titulo);

/** El aviso del pedido todavía sin leer: con él hay tres avisos sin leer. */
const AVISO_PEDIDO_SIN_LEER: Record<string, unknown> = { ...AVISO_PEDIDO, leida: false, leidaEn: null };

/** Aviso general sin fecha ni mensaje: solo se lee su título y no abre nada. */
const AVISO_SOLO_TITULO = avisoCrudo({
  id: '00000000-0000-4000-8000-000000000005',
  titulo: 'Aviso solo con título',
  mensaje: '',
  creadoEn: null,
});

/** Mensaje amable de la carga que falló; el técnico del servidor nunca sale. */
const ERROR_CARGA = 'No pudimos cargar tus avisos. Intenta de nuevo.';
const TECNICO_CARGA = 'Internal server error: connection pool timeout';

/** Abre la app con sesión en Inicio, espera la campana y toca para abrir la bandeja. */
async function abrirDesdeCampana(
  etiqueta: string,
  cifra: string | undefined,
  opciones: Parameters<typeof abrirConAvisos>[1] = {},
) {
  const abierta = await abrirConAvisos('/', opciones);
  await esperarCampana(etiqueta, cifra);
  await abrirBandeja(abierta.app, etiqueta);
  return abierta;
}

describe('Bandeja de avisos con las pantallas reales (GP-07.2)', () => {
  const revisarConsola = prepararPruebasAvisos();

  it.each([
    {
      nombre: 'de una cita abre su detalle',
      lista: AVISOS_FICTICIOS,
      aviso: AVISO_CITA,
      ruta: `/cita/${ID_CITA_AVISO}`,
      encabezado: 'Tu cita',
      antes: [CAMPANA_DOS, '2'],
      despues: ['Abrir notificaciones, 1 aviso sin leer', '1'],
    },
    {
      nombre: 'de un pedido abre su detalle',
      lista: [AVISO_CITA, AVISO_PEDIDO_SIN_LEER, AVISO_SIN_DESTINO],
      aviso: AVISO_PEDIDO_SIN_LEER,
      ruta: `/pedido/${ID_PEDIDO_AVISO}`,
      encabezado: `Pedido #${ID_PEDIDO_AVISO}`,
      antes: ['Abrir notificaciones, 3 avisos sin leer', '3'],
      despues: [CAMPANA_DOS, '2'],
    },
  ])(
    'tocar el aviso $nombre, lo marca como leído y baja el contador',
    async ({ lista, aviso, ruta, encabezado, antes, despues }) => {
      const { app, llamadas } = await abrirDesdeCampana(antes[0], antes[1], { lista });

      await fireEvent.press(await filaSinLeer(String(aviso.titulo)));

      await esperarRuta(app, ruta);
      expect(await screen.findByRole('header', { name: encabezado })).toBeOnTheScreen();
      const marcadas = llamadasA(llamadas, 'PUT', rutaAviso(String(aviso.id)));
      expect(marcadas).toHaveLength(1);
      expect(marcadas[0].cuerpo).toEqual({ leida: true });

      await volverAInicio(app);
      await esperarCampana(despues[0], despues[1]);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    '"Marcar todas como leídas" quita las marcas de no leído y el contador',
    async () => {
      const { app, llamadas } = await abrirDesdeCampana(CAMPANA_DOS, '2');
      expect(screen.getAllByLabelText('No leído')).toHaveLength(2);

      // Con userEvent el botón pasa por presionado, como bajo el dedo.
      await userEvent.setup().press(screen.getByRole('button', { name: 'Marcar todas como leídas' }));

      await waitFor(() => expect(screen.queryAllByLabelText('No leído')).toHaveLength(0));
      const marcadas = llamadasA(llamadas, 'PATCH', RUTA_AVISOS_LEIDOS);
      expect(marcadas).toHaveLength(1);
      expect(marcadas[0].cabeceras.Authorization).toMatch(/^Bearer /);
      expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled();

      await volverAInicio(app);
      await esperarCampana(CAMPANA_SIN_AVISOS);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'borrar un aviso lo quita de la lista y del contador',
    async () => {
      const { app, llamadas } = await abrirDesdeCampana(CAMPANA_DOS, '2');

      await userEvent.setup().press(await screen.findByRole('button', { name: `Borrar aviso: ${TITULO_CITA}` }));

      await waitFor(() => expect(screen.queryByText(TITULO_CITA)).not.toBeOnTheScreen());
      expect(llamadasA(llamadas, 'DELETE', rutaAviso(ID_AVISO_CITA))).toHaveLength(1);
      expect(screen.getByText(TITULO_PEDIDO)).toBeOnTheScreen();
      expect(screen.getByText(TITULO_SIN_DESTINO)).toBeOnTheScreen();

      await volverAInicio(app);
      await esperarCampana('Abrir notificaciones, 1 aviso sin leer', '1');
      revisarConsola();
    },
    LIMITE_MS,
  );

  it.each([
    [404, 'Notification not found', 'Ese aviso ya no existe.', false, 1],
    [500, 'Internal server error: PrismaClientKnownRequestError', 'No pudimos borrar el aviso. Intenta de nuevo.', true, 2],
  ])(
    'si borrar responde %i sale el texto amable, nunca el del servidor (con 404 el aviso ya no vuelve)',
    async (status, tecnico, amable, regresa, noLeidos) => {
      const { llamadas } = await abrirDesdeCampana(CAMPANA_DOS, '2', {
        rutas: {
          [`DELETE ${rutaAviso(ID_AVISO_SIN_DESTINO)}`]: () => respuesta({ statusCode: status, message: tecnico }, status),
        },
      });

      await fireEvent.press(await screen.findByRole('button', { name: `Borrar aviso: ${TITULO_SIN_DESTINO}` }));

      expect(await screen.findByText(amable)).toBeOnTheScreen();
      expect(screen.queryByText(new RegExp(tecnico))).not.toBeOnTheScreen();
      expect(screen.queryByText(TITULO_SIN_DESTINO) !== null).toBe(regresa);
      expect(screen.getAllByLabelText('No leído')).toHaveLength(noLeidos);
      expect(llamadasA(llamadas, 'DELETE', rutaAviso(ID_AVISO_SIN_DESTINO))).toHaveLength(1);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin avisos la bandeja lo dice y la campana no muestra número',
    async () => {
      await abrirDesdeCampana(CAMPANA_SIN_AVISOS, undefined, { lista: [] });

      expect(await screen.findByRole('header', { name: 'Aquí verás tus avisos' })).toBeOnTheScreen();
      expect(
        screen.getByText('Los recordatorios de tus citas y el estado de tus pedidos llegarán aquí.'),
      ).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Marcar todas como leídas' })).toBeDisabled();
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'si la lista no carga sale un mensaje amable y "Reintentar" la pide otra vez y la muestra',
    async () => {
      const lista = fallaHastaArreglar(() => respuesta(respuestaAvisos()));
      const { llamadas } = await abrirConAvisos('/', { rutas: { [`GET ${RUTA_AVISOS}`]: lista.manejador } });
      // Sin lista no hay contador.
      await esperarCampana(CAMPANA_SIN_AVISOS);
      await fireEvent.press(screen.getByRole('button', { name: CAMPANA_SIN_AVISOS }));

      // La bandeja vuelve a pedir la lista porque la carga de Inicio falló.
      await reintentarTrasError(lista, 'No pudimos cargar tus avisos', 'No pudimos cargar tus avisos. Intenta de nuevo.');

      expect(await filaSinLeer(TITULO_CITA)).toBeOnTheScreen();
      expect(screen.getByText(TITULO_PEDIDO)).toBeOnTheScreen();
      // Al abrir la app, al entrar a la bandeja con el error y con Reintentar.
      expect(pedidasDeLista(llamadas)).toHaveLength(3);
      revisarConsola();
    },
    LIMITE_MS,
  );
  it(
    'un aviso sin destino solo se marca como leído y uno ya leído abre su pedido sin marcarlo otra vez',
    async () => {
      const { app, llamadas } = await abrirDesdeCampana(CAMPANA_DOS, '2', {
        lista: [AVISO_CITA, AVISO_PEDIDO, AVISO_SOLO_TITULO],
      });

      // Sin fecha ni mensaje la fila solo lee su título; sin destino, tocarla lo marca como leído.
      const soloTitulo = screen.getByRole('button', { name: 'No leído. Aviso solo con título' });
      expect(soloTitulo.props.accessibilityHint).toBe('Marca el aviso como leído');
      await fireEvent.press(soloTitulo);

      await waitFor(() => expect(screen.getAllByLabelText('No leído')).toHaveLength(1));
      expect(llamadasA(llamadas, 'PUT', rutaAviso(String(AVISO_SOLO_TITULO.id)))).toHaveLength(1);
      expect(app.getPathname()).toBe('/notificaciones');

      const leido = screen.getByRole('button', { name: new RegExp(String.raw`^${TITULO_PEDIDO}\.`) });
      expect(leido.props.accessibilityHint).toBe('Abre el aviso');
      await fireEvent.press(leido);

      await esperarRuta(app, `/pedido/${ID_PEDIDO_AVISO}`);
      expect(await screen.findByRole('header', { name: `Pedido #${ID_PEDIDO_AVISO}` })).toBeOnTheScreen();
      expect(llamadasA(llamadas, 'PUT', rutaAviso(ID_AVISO_PEDIDO))).toHaveLength(0);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'deslizar para actualizar pide la lista; si falla la lista se queda con un aviso amable',
    async () => {
      const bien = () => respuesta(respuestaAvisos());
      const { llamadas } = await abrirDesdeCampana(CAMPANA_DOS, '2', {
        rutas: {
          [`GET ${RUTA_AVISOS}`]: enSecuencia(bien, () => respuesta({ message: TECNICO_CARGA }, 500), bien),
        },
      });

      await deslizarParaActualizar();

      expect(await screen.findByRole('alert')).toHaveTextContent(ERROR_CARGA);
      expect(screen.getByText(TITULO_CITA)).toBeOnTheScreen();
      expect(screen.queryByText(TECNICO_CARGA)).not.toBeOnTheScreen();

      await deslizarParaActualizar();

      await waitFor(() => expect(screen.queryByRole('alert')).not.toBeOnTheScreen());
      expect(screen.getByText(TITULO_CITA)).toBeOnTheScreen();
      // Al abrir la app y con cada deslizamiento.
      expect(pedidasDeLista(llamadas)).toHaveLength(3);
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'abierta desde un enlace, sin nada debajo, "Volver" lleva a Inicio',
    async () => {
      const { app } = await abrirConAvisos('/notificaciones');
      expect(await filaSinLeer(TITULO_CITA)).toBeOnTheScreen();

      await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

      await esperarRuta(app, '/inicio');
      await esperarCampana(CAMPANA_DOS, '2');
      revisarConsola();
    },
    LIMITE_MS,
  );

  it(
    'sin sesión la bandeja invita a iniciar sesión y no pide avisos',
    async () => {
      const { llamadas } = await abrirSinSesionConAvisos('/notificaciones');

      expect(await screen.findByText('Tus avisos en un solo lugar')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Marcar todas como leídas' })).not.toBeOnTheScreen();
      expect(pedidasDeLista(llamadas)).toHaveLength(0);
      revisarConsola();
    },
    LIMITE_MS,
  );
  it(
    'si sale de la bandeja con un borrado y una actualización sin respuesta, al llegar el error el aviso regresa',
    async () => {
      const retenida = retener();
      const bien = () => respuesta(respuestaAvisos());
      const { app, llamadas } = await abrirDesdeCampana(CAMPANA_DOS, '2', {
        rutas: {
          [`GET ${RUTA_AVISOS}`]: enSecuencia(bien, retenida.envolver(bien)),
          [`DELETE ${rutaAviso(ID_AVISO_CITA)}`]: retenida.envolver(() => respuesta({ message: TECNICO_CARGA }, 500)),
        },
      });

      await fireEvent.press(await screen.findByRole('button', { name: `Borrar aviso: ${TITULO_CITA}` }));
      await waitFor(() => expect(screen.queryByText(TITULO_CITA)).not.toBeOnTheScreen());
      await deslizarParaActualizar();
      await volverAInicio(app);
      await esperarCampana('Abrir notificaciones, 1 aviso sin leer', '1');

      await retenida.soltar();

      // El borrado falló y la lista llegó: el aviso de la cita vuelve a contar sin la bandeja abierta.
      await esperarCampana(CAMPANA_DOS, '2');
      expect(llamadasA(llamadas, 'DELETE', rutaAviso(ID_AVISO_CITA))).toHaveLength(1);
      expect(pedidasDeLista(llamadas)).toHaveLength(2);
      expect(screen.queryByText(TECNICO_CARGA)).not.toBeOnTheScreen();
      revisarConsola();
    },
    LIMITE_MS,
  );
});
