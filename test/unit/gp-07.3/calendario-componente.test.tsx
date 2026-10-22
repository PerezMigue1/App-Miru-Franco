/// <reference types="jest" />

import { fireEvent, render, screen } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';

import { CalendarioMensual } from '@/features/citas/components/CalendarioMensual';
import type { BloqueosCalendario } from '@/features/citas/viewmodels/useCalendarioCitas';

import { AHORA, DIA_CITA, DIA_DOMINGO, HOY } from '../../helpers/citasFicticias';
import {
  LEYENDA_CALENDARIO,
  TEXTO_CERRADO,
  TEXTO_INHABIL_SIN_MOTIVO,
  textoInhabil,
} from '../../helpers/calendarioFicticio';
import { espiarConsola } from '../../helpers/consola';
import { cerrarConTemporizadores } from '../../helpers/viewmodelsAuth';

/**
 * GP-07.3: CalendarioMensual con los días sin citas de la configuración. Un día cerrado (el domingo
 * 25) y uno inhábil (el martes 27) no se pueden tocar, TalkBack los anuncia deshabilitados con su
 * motivo del catálogo ("<fecha legible>, <motivo>"), se ven tachados (los pasados solo atenuados) y
 * debajo van la leyenda y la lista corta de inhábiles. Sin la prop, el calendario es el de antes.
 * Reloj fijo en AHORA (lunes 19 de octubre de 2026).
 */

const MES = { anio: 2026, mes: 9 };
const DIA_INHABIL = '2026-10-27';
const DIA_SIN_MOTIVO = '2026-10-28';

const ETIQUETA_CERRADO = `domingo 25 de octubre, ${TEXTO_CERRADO}`;
const ETIQUETA_INHABIL = `martes 27 de octubre, ${textoInhabil('Capacitación')}`;
const ETIQUETA_SIN_MOTIVO = `miércoles 28 de octubre, ${TEXTO_INHABIL_SIN_MOTIVO}`;

const BLOQUEOS: BloqueosCalendario = {
  dias: {
    [DIA_DOMINGO]: TEXTO_CERRADO,
    [DIA_INHABIL]: textoInhabil('Capacitación'),
    [DIA_SIN_MOTIVO]: TEXTO_INHABIL_SIN_MOTIVO,
  },
  leyenda: LEYENDA_CALENDARIO,
  inhabiles: [
    { fecha: DIA_INHABIL, motivo: 'Capacitación' },
    { fecha: DIA_SIN_MOTIVO, motivo: TEXTO_INHABIL_SIN_MOTIVO },
  ],
};

let onElegir: jest.Mock;
let onCambiarMes: jest.Mock;

beforeEach(() => {
  jest.useFakeTimers({ now: AHORA });
  onElegir = jest.fn();
  onCambiarMes = jest.fn();
});

// Desmonta, corre lo pendiente con los temporizadores falsos y vuelve a los reales.
espiarConsola(cerrarConTemporizadores, true);

async function pintar(bloqueos?: BloqueosCalendario, mes = MES): Promise<void> {
  await render(
    <CalendarioMensual mes={mes} seleccionada={HOY} onElegir={onElegir} onCambiarMes={onCambiarMes} bloqueos={bloqueos} />,
  );
}

/** Estilo del número de un día, ya aplanado. */
const estiloDe = (numero: string) => StyleSheet.flatten(screen.getByText(numero).props.style) as Record<string, unknown>;

describe('CalendarioMensual con días bloqueados (GP-07.3)', () => {
  it.each([
    ['el día cerrado', ETIQUETA_CERRADO],
    ['el día inhábil con motivo', ETIQUETA_INHABIL],
    ['el día inhábil sin motivo', ETIQUETA_SIN_MOTIVO],
  ])('%s se anuncia deshabilitado con su motivo y no se puede tocar', async (_caso, etiqueta) => {
    await pintar(BLOQUEOS);
    const boton = screen.getByRole('button', { name: etiqueta });
    expect(boton).toBeDisabled();
    expect(boton.props.accessibilityState).toEqual(expect.objectContaining({ disabled: true }));

    await fireEvent.press(boton);
    expect(onElegir).not.toHaveBeenCalled();
  });

  it('un día libre sigue con su fecha sola y se puede elegir', async () => {
    await pintar(BLOQUEOS);
    const boton = screen.getByRole('button', { name: 'martes 20 de octubre' });
    expect(boton).toBeEnabled();
    await fireEvent.press(boton);
    expect(onElegir).toHaveBeenCalledWith(DIA_CITA);
  });

  it('hoy bloqueado conserva el "Hoy" al principio de su etiqueta', async () => {
    await pintar({ ...BLOQUEOS, dias: { [HOY]: TEXTO_CERRADO } });
    expect(screen.getByRole('button', { name: `Hoy, lunes 19 de octubre, ${TEXTO_CERRADO}` })).toBeDisabled();
  });

  it('debajo van la leyenda y la lista corta de inhábiles con su fecha y motivo', async () => {
    await pintar(BLOQUEOS);
    expect(screen.getByText(LEYENDA_CALENDARIO)).toBeOnTheScreen();
    expect(screen.getByText('martes 27 de octubre: Capacitación')).toBeOnTheScreen();
    expect(screen.getByText(`miércoles 28 de octubre: ${TEXTO_INHABIL_SIN_MOTIVO}`)).toBeOnTheScreen();
  });

  it('con solo días cerrados va la leyenda sin lista', async () => {
    await pintar({ ...BLOQUEOS, dias: { [DIA_DOMINGO]: TEXTO_CERRADO }, inhabiles: [] });
    expect(screen.getByText(LEYENDA_CALENDARIO)).toBeOnTheScreen();
    // Ningún renglón "<fecha legible>: <motivo>".
    expect(screen.queryByText(/^\S+ \d+ de \S+: /)).not.toBeOnTheScreen();
  });

  it('un día bloqueado se ve atenuado como uno pasado pero tachado; uno pasado no', async () => {
    await pintar(BLOQUEOS);
    expect(estiloDe('25')).toEqual(expect.objectContaining({ textDecorationLine: 'line-through', opacity: 0.5 }));
    expect(estiloDe('18')).toEqual(expect.objectContaining({ opacity: 0.5 }));
    expect(estiloDe('18').textDecorationLine).toBeUndefined();
    expect(estiloDe('20')).toEqual(expect.objectContaining({ opacity: 1 }));
  });

  it('en otro mes pinta los bloqueos que recibe y los botones de mes cambian de mes', async () => {
    const enero = '2027-01-01';
    await pintar(
      { dias: { [enero]: textoInhabil('Año nuevo') }, leyenda: LEYENDA_CALENDARIO, inhabiles: [{ fecha: enero, motivo: 'Año nuevo' }] },
      { anio: 2027, mes: 0 },
    );
    expect(screen.getByRole('header', { name: 'Enero 2027' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: `viernes 1 de enero, ${textoInhabil('Año nuevo')}` })).toBeDisabled();
    expect(screen.getByText('viernes 1 de enero: Año nuevo')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Mes anterior' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Mes siguiente' }));
    expect(onCambiarMes.mock.calls).toEqual([[-1], [1]]);
  });

  it.each([
    ['sin la prop', undefined],
    ['con bloqueos vacíos', { dias: {}, leyenda: '', inhabiles: [] }],
  ])('%s el calendario es el de antes: el domingo se puede elegir y no hay leyenda', async (_caso, bloqueos) => {
    await pintar(bloqueos);
    const domingo = screen.getByRole('button', { name: 'domingo 25 de octubre' });
    expect(domingo).toBeEnabled();
    await fireEvent.press(domingo);
    expect(onElegir).toHaveBeenCalledWith(DIA_DOMINGO);
    expect(screen.queryByText(LEYENDA_CALENDARIO)).not.toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'domingo 18 de octubre' })).toBeDisabled();
  });
});
