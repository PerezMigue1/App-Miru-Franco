/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen } from 'expo-router/testing-library';

import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import {
  BANDERAS_ESPECIALISTA,
  DIAS_SEMANA,
  LEYENDA_CALENDARIO,
  rutaAgendaConOculta,
  rutaCalendario,
  TEXTO_CERRADO,
  textoInhabil,
  type OpcionesCalendario,
} from '../../helpers/calendarioFicticio';
import { AYER, DIA_CITA, DIA_DOMINGO, HOY, ID_CITA } from '../../helpers/citasFicticias';
import { LIMITE_MS } from '../../helpers/pantallas';
import { abrirConCitas } from '../../helpers/pantallasMisCitas';
import {
  abrirReserva,
  botonDia,
  diaLegible,
  elegirEspecialista,
  esperarPaso,
  PASO,
  prepararPruebasReserva,
  TARJETA_DOS,
  TARJETA_UNO,
  type PantallaReserva,
} from '../../helpers/pantallasReserva';

jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.3: los días sin citas de la configuración pública en el calendario de la reserva y de
 * reprogramar, con las pantallas reales y el servidor simulado (reloj en AHORA, lunes 19 de
 * octubre de 2026). Un día cerrado y uno inhábil se ven deshabilitados con su motivo, tocarlos no
 * pide horarios y el calendario explica la leyenda y el día inhábil. También: sin ningún día libre
 * se pide elegir otro, y una especialista oculta no se ofrece.
 */

/** Miércoles inhábil de estas pruebas. */
const MIERCOLES = '2026-10-21';
/** Jueves: un día abierto cualquiera. */
const JUEVES = '2026-10-22';
const MOTIVO = 'Capacitación';

/** El salón no abre el domingo y el miércoles es inhábil por capacitación. */
const CALENDARIO: OpcionesCalendario = { cerrados: ['domingo'], inhabiles: [{ fecha: MIERCOLES, motivo: MOTIVO }] };
/** El salón no abre ningún día. */
const SIN_DIAS_LIBRES: OpcionesCalendario = { cerrados: DIAS_SEMANA };

/** Cómo llegar al calendario de cada pantalla y qué día queda elegido al abrirla. */
interface Pantalla {
  abrir: (calendario: OpcionesCalendario) => Promise<PantallaReserva>;
  diaInicial: string;
}

const PANTALLAS: Record<'la reserva' | 'reprogramar', Pantalla> = {
  'la reserva': {
    abrir: async (calendario) => {
      const abierta = await abrirReserva('/reservar/1', { rutas: rutaCalendario(calendario) });
      await elegirEspecialista();
      return abierta;
    },
    diaInicial: HOY,
  },
  reprogramar: {
    abrir: async (calendario) => {
      const abierta = await abrirConCitas(`/cita/${ID_CITA}/reprogramar`, { rutas: rutaCalendario(calendario) });
      expect(await screen.findByRole('header', { name: 'Reprogramar cita' })).toBeOnTheScreen();
      return abierta;
    },
    diaInicial: DIA_CITA,
  },
};

const NOMBRES = Object.keys(PANTALLAS) as (keyof typeof PANTALLAS)[];

/** Peticiones de horarios que recibió el servidor (de un día, o de todos). */
function pedidasDeHorarios(abierta: PantallaReserva, fecha?: string) {
  const deHorarios = (ruta: string) => ruta.startsWith('/api/citas/disponibilidad?');
  return abierta.llamadas.filter(
    ({ ruta }) => deHorarios(ruta) && (fecha === undefined || ruta.includes(`fecha=${fecha}`)),
  );
}

describe('Días sin citas de la configuración en el calendario (GP-07.3)', () => {
  // La configuración que siembra una prueba se queda en memoria: cada prueba empieza con el respaldo.
  beforeEach(reiniciarConfiguracionPublica);
  const esperarConsolaLimpia = prepararPruebasReserva();

  it.each(NOMBRES)(
    'en %s el día cerrado y el inhábil se ven deshabilitados con su motivo, no piden horarios y la leyenda los explica',
    async (nombre) => {
      const { abrir, diaInicial } = PANTALLAS[nombre];
      const abierta = await abrir(CALENDARIO);

      const domingo = screen.getByRole('button', { name: `${diaLegible(DIA_DOMINGO)}, ${TEXTO_CERRADO}` });
      const miercoles = screen.getByRole('button', { name: `${diaLegible(MIERCOLES)}, ${textoInhabil(MOTIVO)}` });
      expect(domingo).toBeDisabled();
      expect(miercoles).toBeDisabled();
      // Un día pasado sigue deshabilitado sin motivo; un día abierto se puede elegir.
      expect(screen.getByRole('button', { name: diaLegible(AYER) })).toBeDisabled();
      expect(botonDia(JUEVES)).toBeEnabled();

      expect(screen.getByText(LEYENDA_CALENDARIO)).toBeOnTheScreen();
      expect(screen.getByText(`${diaLegible(MIERCOLES)}: ${MOTIVO}`)).toBeOnTheScreen();

      await fireEvent.press(domingo);
      await fireEvent.press(miercoles);
      expect(botonDia(diaInicial)).toBeSelected();
      expect(domingo).not.toBeSelected();
      expect(miercoles).not.toBeSelected();
      expect(pedidasDeHorarios(abierta, DIA_DOMINGO)).toEqual([]);
      expect(pedidasDeHorarios(abierta, MIERCOLES)).toEqual([]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each(NOMBRES)(
    'en %s, si el salón no abre ningún día, pide elegir otro día y no pide horarios',
    async (nombre) => {
      const abierta = await PANTALLAS[nombre].abrir(SIN_DIAS_LIBRES);

      expect(await screen.findByText('Elige otro día.')).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: /m\.$/ })).not.toBeOnTheScreen();
      expect(screen.queryAllByRole('button', { selected: true })).toHaveLength(0);
      expect(screen.getByRole('button', { name: `${diaLegible(JUEVES)}, ${TEXTO_CERRADO}` })).toBeDisabled();
      expect(pedidasDeHorarios(abierta)).toEqual([]);
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it.each(BANDERAS_ESPECIALISTA)(
    'una especialista con %s en false no se ofrece en la reserva',
    async (bandera) => {
      await abrirReserva('/reservar/1', { rutas: rutaAgendaConOculta(bandera) });

      await esperarPaso(PASO.especialista);
      expect(await screen.findByRole('button', { name: TARJETA_UNO })).toBeOnTheScreen();
      expect(screen.queryByRole('button', { name: TARJETA_DOS })).not.toBeOnTheScreen();
      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
