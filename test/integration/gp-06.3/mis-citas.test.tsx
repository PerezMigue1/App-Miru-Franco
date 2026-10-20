/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { screen, waitFor } from 'expo-router/testing-library';

import {
  AHORA,
  citaConAnticipo,
  citaCruda,
  conError,
  cuerpoMisCitas,
  DIA_CITA,
  ERRORES_MIS_CITAS,
  FIN_CITA_CON_ANTICIPO_ISO,
  HOY,
  ID_CITA,
  INICIO_CITA_ISO,
  isoMexico,
  MENSAJES_MIS_CITAS,
  rutaCita,
  RUTA_MIS_CITAS,
  sinRedEnRuta,
  VENCE_ANTICIPO_ISO,
  venceAnticipo,
  type CitaCruda,
} from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirConCitas,
  abrirSinSesion,
  abrirTarjeta,
  CITAS_DE_LA_LISTA,
  citaTrasUnError,
  deslizarParaActualizar,
  esperarDetalle,
  esperarTarjetas,
  etiquetasDeTarjetas,
  revisarInsignias,
  TARJETAS,
  verPestana,
  type TarjetaEsperada,
} from '../../helpers/pantallasMisCitas';
import {
  diaConMayuscula,
  diaLegible,
  horaEnTelefono,
  horarioEnTelefono,
  movimientoReducido,
  plazoEsperado,
  prepararPruebasReserva,
  revisarDatos,
  sinTextos,
  tocar,
  tocarYEsperar,
  vecesEn,
} from '../../helpers/pantallasReserva';
import { enSecuencia, errorDelServidor } from '../../helpers/pantallasServicios';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-06.3: Mis citas con las pantallas reales (renderRouter sobre src/app), la sesión de una
 * clienta, el reloj fijo el lunes 19 de octubre de 2026 a las 10:00 de México y el servidor
 * simulado con memoria. Lo que ve la clienta al llegar desde Perfil, las próximas y el historial con
 * sus insignias, los estados vacío y de error, el pull to refresh, el detalle de una cita y el paso
 * a pagar el anticipo. Cancelar y reprogramar van en sus propios archivos.
 */

const PROXIMAS = [TARJETAS[505], TARJETAS[501], TARJETAS[502]];
const HISTORIAL = [TARJETAS[504], TARJETAS[503]];

const TITULO_ERROR = 'No pudimos cargar tus citas';
const AVISO_REFRESCO = 'No pudimos actualizar tus citas. Desliza hacia abajo para intentar de nuevo.';

/** Alaciado del martes apartado para pagar el anticipo en el salón, con notas de la clienta. */
const CITA_PAGO_EN_SALON = citaConAnticipo({
  id: 506,
  anticipoEnSalon: true,
  anticipoVenceEn: venceAnticipo(INICIO_CITA_ISO, AHORA, true),
  notas: 'Traigo foto de referencia',
});
const LIMITE_EN_SALON = `antes del ${diaLegible(DIA_CITA)}, ${horaEnTelefono(String(CITA_PAGO_EN_SALON.anticipoVenceEn))}`;

/** Corte del 1 de octubre ya terminado con una especialista que ya no está en la agenda. */
const SIN_ESPECIALISTA = null as unknown as never;
const CITA_SIN_ESPECIALISTA: CitaCruda = citaCruda({
  id: 507,
  estado: 'completada',
  especialistaId: SIN_ESPECIALISTA,
  especialista: SIN_ESPECIALISTA,
  fechaHoraInicio: isoMexico('2026-10-01', '12:00'),
  fechaHoraFin: isoMexico('2026-10-01', '12:45'),
});

/** Alaciado de hoy en curso que el salón agendó con el anticipo por cobrar y sin plazo. */
const EN_CURSO_POR_COBRAR: CitaCruda = citaConAnticipo({
  id: 508,
  estado: 'en_curso',
  origen: 'salon',
  anticipoVenceEn: null,
  fechaHoraInicio: isoMexico(HOY, '09:30'),
  fechaHoraFin: isoMexico(HOY, '12:00'),
});

/** La lista de la clienta tal como la guarda el servidor. */
const LISTA_COMPLETA: Manejador = () => respuesta(cuerpoMisCitas(CITAS_DE_LA_LISTA));

describe('Mis citas con las pantallas reales (GP-06.3)', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();

  it(
    'de Perfil a Mis citas tocando "Mis citas": título, Próximas elegida y Volver regresa a Perfil',
    async () => {
      const { app, llamadas } = await abrirConCitas('/perfil');
      await tocarYEsperar(app, 'Mis citas, Tus próximas citas y tu historial.', '/mis-citas');

      expect(await screen.findByRole('header', { name: 'Mis citas' })).toBeOnTheScreen();
      expect(screen.getByText('Gestiona todas tus citas agendadas')).toBeOnTheScreen();
      expect(screen.getByRole('tab', { name: 'Próximas' })).toBeSelected();
      expect(screen.getByRole('tab', { name: 'Historial' })).not.toBeSelected();
      await esperarTarjetas(PROXIMAS);
      expect(llamadas.filter((l) => `${l.metodo} ${l.ruta}` === RUTA_MIS_CITAS)).toHaveLength(1);

      await tocarYEsperar(app, 'Volver', '/perfil');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'próximas de la más cercana a la más lejana e historial de la más reciente, con sus insignias en la hora del teléfono',
    async () => {
      const { app } = await abrirConCitas('/mis-citas');
      await esperarTarjetas(PROXIMAS);
      // El plazo del anticipo de hoy y el estado en curso se anuncian en la tarjeta.
      expect(etiquetasDeTarjetas()[1]).toContain(`Anticipo pendiente, ${plazoEsperado(VENCE_ANTICIPO_ISO)}`);
      expect(etiquetasDeTarjetas()[0]).toMatch(/, En curso$/);
      expect(screen.queryByRole('button', { name: /^Reservar .* otra vez/ })).not.toBeOnTheScreen();

      await verPestana('Historial');
      await esperarTarjetas(HISTORIAL);
      // El historial ofrece reservar lo mismo con la misma especialista.
      await tocarYEsperar(app, `Reservar Corte de dama otra vez con ${ESPECIALISTA_UNO.nombre}`, '/reservar/1');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin citas y con movimiento reducido: próximas invita a reservar y el historial dice dónde aparecerán',
    async () => {
      movimientoReducido(true);
      const { app } = await abrirConCitas('/mis-citas', { citas: [] });
      expect(await screen.findByRole('header', { name: 'Aquí verás tus próximas citas' })).toBeOnTheScreen();
      expect(screen.getByText('Cada cita aparecerá con su fecha, su hora y el estado de su anticipo.')).toBeOnTheScreen();

      await verPestana('Historial');
      expect(await screen.findByRole('header', { name: 'Aquí verás tus citas anteriores' })).toBeOnTheScreen();
      expect(screen.getByText('Tu historial de visitas al salón aparecerá en esta sección.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Reservar una cita' })).not.toBeOnTheScreen();

      await verPestana('Próximas');
      await tocarYEsperar(app, 'Reservar una cita', '/citas');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string, string]>([
    ['un 500', errorDelServidor, 'Algo salió mal al traer tus citas. Intenta de nuevo en un momento.', 'Error interno ficticio'],
    ['la red caída', sinRedEnRuta, 'Sin conexión. Revisa tu internet e intenta de nuevo', 'Network request failed'],
  ])(
    'con %s dice que no pudo cargar y Reintentar trae la lista',
    async (_caso, falla, mensaje, tecnico) => {
      const abierta = await abrirConCitas('/mis-citas', { rutas: { [RUTA_MIS_CITAS]: enSecuencia(falla, LISTA_COMPLETA) } });
      expect(await screen.findByRole('header', { name: TITULO_ERROR })).toBeOnTheScreen();
      expect(screen.getByText(mensaje)).toBeOnTheScreen();
      sinTextos(tecnico);

      await tocar('Reintentar');
      await esperarTarjetas(PROXIMAS);
      sinTextos(TITULO_ERROR);
      expect(vecesEn(abierta, RUTA_MIS_CITAS)).toBe(2);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si falla el pull to refresh conserva la lista con un aviso, y el siguiente lo quita',
    async () => {
      const abierta = await abrirConCitas('/mis-citas', {
        rutas: { [RUTA_MIS_CITAS]: enSecuencia(LISTA_COMPLETA, errorDelServidor, LISTA_COMPLETA) },
      });
      await esperarTarjetas(PROXIMAS);

      await deslizarParaActualizar();
      expect(await screen.findByRole('alert')).toHaveTextContent(AVISO_REFRESCO);
      await esperarTarjetas(PROXIMAS);
      sinTextos(TITULO_ERROR, 'Error interno ficticio');

      await deslizarParaActualizar();
      await waitFor(() => expect(screen.queryByText(AVISO_REFRESCO)).not.toBeOnTheScreen());
      await esperarTarjetas(PROXIMAS);
      expect(vecesEn(abierta, RUTA_MIS_CITAS)).toBe(3);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'de la lista al detalle de la cita con sus datos y de regreso con Volver',
    async () => {
      const { app } = await abrirConCitas('/mis-citas');
      await abrirTarjeta(app, ID_CITA);

      revisarInsignias('Pendiente', 'Anticipo pendiente');
      revisarDatos({
        Fecha: diaConMayuscula(DIA_CITA),
        Hora: horarioEnTelefono(INICIO_CITA_ISO, FIN_CITA_CON_ANTICIPO_ISO),
        Especialista: ESPECIALISTA_UNO.nombre,
        'Precio del servicio': '$1,200',
        Anticipo: '$360',
      });
      expect(screen.getByText('Alaciado keratínico')).toBeOnTheScreen();
      expect(screen.getByLabelText(plazoEsperado(VENCE_ANTICIPO_ISO))).toBeOnTheScreen();
      expect(screen.getByText('Si el anticipo no se paga a tiempo, la cita se cancela sola.')).toBeOnTheScreen();
      for (const boton of ['Pagar anticipo', 'Reprogramar', 'Cancelar cita']) {
        expect(screen.getByRole('button', { name: boton })).toBeEnabled();
      }

      await tocarYEsperar(app, 'Volver', '/mis-citas');
      await esperarTarjetas(PROXIMAS);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'el detalle de una cita pagada lo dice y solo ofrece reprogramar y cancelar',
    async () => {
      const { app } = await abrirConCitas('/mis-citas');
      await abrirTarjeta(app, 502);

      revisarInsignias('Confirmada', 'Anticipo pagado');
      expect(
        screen.getByText('Recibimos tu anticipo. Si reprogramas tu cita con aviso, tu anticipo se respeta.'),
      ).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: 'Pagar anticipo' })).not.toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Reprogramar' })).toBeOnTheScreen();
      sinTextos(/Paga antes/);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'con el anticipo a pagar en el salón y la apariencia oscura: "Paga en salón" en la tarjeta y el plazo y las notas en el detalle',
    async () => {
      const { app } = await abrirConCitas('/mis-citas', { citas: [CITA_PAGO_EN_SALON], oscuro: true });
      const tarjeta: TarjetaEsperada = { ...TARJETAS[ID_CITA], enSalon: true, plazo: `Paga ${LIMITE_EN_SALON}` };
      await esperarTarjetas([tarjeta]);

      await abrirTarjeta(app, 506, tarjeta);
      expect(
        screen.getByText(
          `Paga tu anticipo en el salón ${LIMITE_EN_SALON} (15 minutos antes de tu cita). También puedes pagarlo en línea.`,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByRole('header', { name: 'Tus notas' })).toBeOnTheScreen();
      expect(screen.getByText('Traigo foto de referencia')).toBeOnTheScreen();
      expect(screen.getByRole('button', { name: 'Pagar anticipo' })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'una cita del historial sin especialista se anuncia sin ella y ofrece reservar el mismo servicio',
    async () => {
      await abrirConCitas('/mis-citas', { citas: [CITA_SIN_ESPECIALISTA] });
      expect(await screen.findByRole('header', { name: 'Aquí verás tus próximas citas' })).toBeOnTheScreen();

      await verPestana('Historial');
      await esperarTarjetas([
        {
          servicio: 'Corte de dama',
          dia: '2026-10-01',
          inicio: CITA_SIN_ESPECIALISTA.fechaHoraInicio,
          estado: 'Completada',
          sinEspecialista: true,
        },
      ]);
      expect(screen.getByRole('button', { name: 'Reservar Corte de dama otra vez' })).toBeOnTheScreen();
      sinTextos(/^Con /);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'una cita en curso con el anticipo por cobrar en el salón no ofrece pagar, reprogramar ni cancelar',
    async () => {
      const { app } = await abrirConCitas('/cita/508', { citas: [EN_CURSO_POR_COBRAR] });
      await esperarDetalle(app, 508);
      revisarInsignias('En curso', 'Anticipo pendiente');
      expect(screen.getByLabelText('Anticipo: $360')).toBeOnTheScreen();
      for (const boton of ['Pagar anticipo', 'Reprogramar', 'Cancelar cita']) {
        expect(screen.queryByRole('button', { name: boton })).not.toBeOnTheScreen();
      }
      sinTextos(/Paga antes/, 'Si el anticipo no se paga a tiempo, la cita se cancela sola.');
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'desde el detalle con el anticipo pendiente, "Pagar anticipo" abre la pantalla del pago',
    async () => {
      const { app } = await abrirConCitas(`/cita/${ID_CITA}`);
      await esperarDetalle(app, ID_CITA);
      await tocarYEsperar(app, 'Pagar anticipo', `/anticipo/${ID_CITA}`);
      expect(await screen.findByRole('header', { name: 'Paga tu anticipo' })).toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each<[string, Manejador, string, string, string]>([
    [
      'un 500',
      citaTrasUnError(),
      'No pudimos cargar tu cita',
      'Reintentar',
      `/cita/${ID_CITA}`,
    ],
    ['un 404', conError(ERRORES_MIS_CITAS.citaNoEncontrada), 'No encontramos esta cita', 'Ver mis citas', '/mis-citas'],
  ])(
    'si el detalle recibe %s lo dice sin el texto técnico y su botón sigue',
    async (_caso, cita, titulo, boton, destino) => {
      const { app } = await abrirConCitas(`/cita/${ID_CITA}`, { rutas: { [rutaCita()]: cita } });
      expect(await screen.findByRole('header', { name: titulo })).toBeOnTheScreen();
      sinTextos('Error interno ficticio', MENSAJES_MIS_CITAS.citaNoEncontrada);

      await tocarYEsperar(app, boton, destino);
      await waitFor(() => expect(screen.queryByRole('header', { name: titulo })).not.toBeOnTheScreen());
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'sin sesión invita a iniciar sesión y no pide ninguna cita',
    async () => {
      const { llamadas } = await abrirSinSesion('/mis-citas');
      expect(await screen.findByText('Reserva y sigue tus citas')).toBeOnTheScreen();
      expect(
        screen.getByText('Inicia sesión para agendar, pagar tu anticipo y ver tus próximas visitas.'),
      ).toBeOnTheScreen();
      expect(screen.queryByRole('tab', { name: 'Historial' })).not.toBeOnTheScreen();
      expect(llamadas.some((l) => l.ruta.startsWith('/api/citas'))).toBe(false);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
