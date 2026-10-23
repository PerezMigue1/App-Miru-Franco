/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import {
  conError,
  DIA_CITA,
  disponibilidadComoServidor,
  ERRORES,
  isoMexico,
  llamadasDeRuta,
  masMinutos,
  rutaDisponibilidad,
  RUTA_CREAR_CITA,
  RUTA_RENOVAR_MOVIL,
  SERVICIO_SIN_ANTICIPO,
} from '../../helpers/citasFicticias';
import { CLAVE, CORREO, USUARIO } from '../../helpers/datosClienta';
import { entrarCon, LIMITE_MS } from '../../helpers/pantallas';
import {
  abrirReserva,
  BOTON,
  diaConMayuscula,
  esperarPaso,
  esperarRuta,
  horaDelServidor,
  llegarAlResumen,
  PASO,
  prepararPruebasReserva,
  revisarDatos,
  tocar,
  type PantallaReserva,
} from '../../helpers/pantallasReserva';
import { enSecuencia } from '../../helpers/pantallasServicios';
import { ESPECIALISTA_UNO } from '../../helpers/serviciosFicticios';
import { respuesta, type Manejador } from '../../helpers/servidorSimulado';
import { jwtFicticio } from '../../helpers/sesionGuardada';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.6 Tarea 4, regreso a la reserva tras una sesión vencida, con las pantallas reales
 * (renderRouter sobre src/app) y el servidor simulado (http://api.test, datos ficticios): la sesión
 * vence al confirmar (401 y la renovación también 401), la app queda en Inicio con el aviso, la
 * clienta inicia sesión otra vez y la app regresa sola a la reserva en Confirmar con lo elegido. Si
 * el horario ya no está libre lo dice y deja elegir otro; si entra otra cuenta, no se recupera nada.
 */

const SERVICIO = SERVICIO_SIN_ANTICIPO;
const RUTA = `/reservar/${SERVICIO.id}`;
const NOTAS = 'Traigo foto de referencia';
const SESION_TERMINADA = 'Tu sesión terminó. Inicia sesión de nuevo.';
const AVISO_OCUPADO = RESPALDO_TEXTOS['citas.reserva.regresoOcupado'];
const RUTA_DIA = rutaDisponibilidad(ESPECIALISTA_UNO.usuarioId, DIA_CITA, SERVICIO.id);

/** Disponibilidad del martes como el servidor; con `ocupada`, sin el horario de las 11:00. */
function martes(ocupada = false): Manejador {
  const inicio = isoMexico(DIA_CITA, '11:00');
  const ocupadas = ocupada ? [{ inicio, fin: masMinutos(inicio, 30).toISOString() }] : [];
  return () =>
    respuesta(
      disponibilidadComoServidor({
        fecha: DIA_CITA,
        duracionMinutos: SERVICIO.duracionMinutos,
        especialistaId: ESPECIALISTA_UNO.usuarioId,
        servicioId: SERVICIO.id,
        ocupadas,
      }),
    );
}

/** POST /api/auth/login correcto con la cuenta indicada (por omisión, la misma clienta). */
function login(usuario: typeof USUARIO = USUARIO): Manejador {
  return () =>
    respuesta({
      success: true,
      token: jwtFicticio(`login-${usuario.id}`),
      refreshToken: `refresh-ficticio-login-${usuario.id}`,
      refreshExpiraEn: '2026-11-18T12:00:00.000Z',
      usuario,
    });
}

/**
 * Abre la reserva, llega a Confirmar con UNO, el martes a las 11:00 y notas, y confirma: el
 * servidor rechaza la sesión y no la renueva, así que la app queda en Inicio con el aviso.
 */
async function venceAlConfirmar(rutas: Record<string, Manejador>): Promise<PantallaReserva> {
  const abierta = await abrirReserva(RUTA, {
    rutas: { [RUTA_RENOVAR_MOVIL]: conError(ERRORES.sesionVencida), ...rutas },
    crear: (comoServidor) => enSecuencia(conError(ERRORES.noAutorizado), comoServidor),
  });
  await llegarAlResumen();
  await fireEvent.changeText(screen.getByLabelText('Notas para el salón (opcional)'), NOTAS);
  await tocar(BOTON.confirmar);
  await esperarRuta(abierta.app, '/inicio');
  expect(await screen.findByText(SESION_TERMINADA)).toBeOnTheScreen();
  return abierta;
}

/** Desde la cabecera de Inicio abre Acceso e inicia sesión. */
async function iniciarSesionDeNuevo(abierta: PantallaReserva): Promise<void> {
  await tocar('Iniciar sesión');
  await esperarRuta(abierta.app, '/login');
  await entrarCon(CORREO, CLAVE);
}

describe('GP-07.6 Tarea 4: regreso a la reserva tras una sesión vencida', () => {
  const esperarConsolaLimpia = prepararPruebasReserva();

  it(
    'la misma clienta vuelve a entrar y regresa a Confirmar con lo elegido; al confirmar se crea la cita',
    async () => {
      const abierta = await venceAlConfirmar({ 'POST /api/auth/login': login(), [RUTA_DIA]: martes() });

      await iniciarSesionDeNuevo(abierta);
      await esperarRuta(abierta.app, RUTA);
      await esperarPaso(PASO.confirmar);
      // Lo elegido antes de que venciera la sesión: servicio, especialista, día, hora y notas.
      revisarDatos({
        Servicio: SERVICIO.nombre,
        Especialista: ESPECIALISTA_UNO.nombre,
        Fecha: diaConMayuscula(DIA_CITA),
        Hora: horaDelServidor(DIA_CITA, '11:00'),
      });
      expect(screen.getByDisplayValue(NOTAS)).toBeOnTheScreen();
      expect(screen.queryByText(AVISO_OCUPADO)).not.toBeOnTheScreen();

      await tocar(BOTON.confirmar);
      await esperarRuta(abierta.app, '/cita-confirmada/501');
      const creadas = llamadasDeRuta(abierta.llamadas, RUTA_CREAR_CITA);
      expect(creadas).toHaveLength(2);
      expect(creadas[1].cuerpo).toMatchObject({
        especialistaId: ESPECIALISTA_UNO.usuarioId,
        servicioId: SERVICIO.id,
        fechaHoraInicio: isoMexico(DIA_CITA, '11:00'),
        notas: NOTAS,
      });
      expect(creadas[1].cabeceras.Authorization).toBe(`Bearer ${jwtFicticio(`login-${USUARIO.id}`)}`);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si el horario ya no está libre, regresa a Día y hora con el aviso y deja elegir otro',
    async () => {
      const abierta = await venceAlConfirmar({
        'POST /api/auth/login': login(),
        [RUTA_DIA]: enSecuencia(martes(), martes(true)),
      });

      await iniciarSesionDeNuevo(abierta);
      await esperarRuta(abierta.app, RUTA);
      await esperarPaso(PASO.diaHora);
      expect(await screen.findByText(AVISO_OCUPADO)).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: horaDelServidor(DIA_CITA, '11:00') })).not.toBeOnTheScreen();

      await tocar(horaDelServidor(DIA_CITA, '11:30'));
      await esperarPaso(PASO.confirmar);
      expect(screen.getByDisplayValue(NOTAS)).toBeOnTheScreen();
      expect(llamadasDeRuta(abierta.llamadas, RUTA_CREAR_CITA)).toHaveLength(1);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si entra otra cuenta no regresa a la reserva ni recupera lo elegido',
    async () => {
      const otra = { ...USUARIO, id: 77, nombre: 'Otra Clienta Ficticia', email: 'otra@ejemplo.test' };
      const abierta = await venceAlConfirmar({ 'POST /api/auth/login': login(otra), [RUTA_DIA]: martes() });
      const diasAntes = llamadasDeRuta(abierta.llamadas, RUTA_DIA).length;

      await iniciarSesionDeNuevo(abierta);
      await esperarRuta(abierta.app, '/inicio');
      expect(await screen.findByRole('button', { name: 'Abrir perfil' })).toBeOnTheScreen();
      expect(screen.queryByRole('header', { name: PASO.confirmar })).not.toBeOnTheScreen();
      expect(llamadasDeRuta(abierta.llamadas, RUTA_DIA)).toHaveLength(diasAntes);
      expect(llamadasDeRuta(abierta.llamadas, RUTA_CREAR_CITA)).toHaveLength(1);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
