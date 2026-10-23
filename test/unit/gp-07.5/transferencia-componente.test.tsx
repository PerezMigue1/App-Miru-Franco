/// <reference types="jest" />

import { fireEvent, render, screen } from '@testing-library/react-native';
import { setStringAsync } from 'expo-clipboard';

import type { DatosTransferencia as Datos } from '@/shared/api/configuracionPublica';
import { reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';
import { DatosTransferencia } from '@/shared/ui/DatosTransferencia';
import { copiarTexto } from '@/shared/ui/portapapeles';

import { CLABE_FICTICIA } from '../../helpers/configuracionFicticia';
import { espiarConsola } from '../../helpers/consola';

/**
 * GP-07.5: datos para pagar por transferencia en el salón (src/shared/ui/DatosTransferencia.tsx) y
 * el portapapeles (src/shared/ui/portapapeles.ts). Con datos: banco, titular y CLABE (leída dígito
 * por dígito) y el botón para copiarla con su aviso; sin datos no pinta nada. expo-clipboard va
 * simulado: nunca toca el portapapeles real. Datos ficticios.
 */

jest.mock('expo-clipboard', () => ({ setStringAsync: jest.fn() }));

const DATOS: Datos = { banco: 'Banco Ficticio', titular: 'Titular Ficticia', clabe: CLABE_FICTICIA };
const OTRA_CUENTA: Datos = { ...DATOS, clabe: '1'.repeat(18) };
const COPIAR = RESPALDO_TEXTOS['pagos.transferencia.copiar'];
const COPIADA = RESPALDO_TEXTOS['pagos.transferencia.copiada'];
const NO_COPIADA = RESPALDO_TEXTOS['pagos.transferencia.noCopiada'];

/** "0 0 0 ...": como la lee el lector de pantalla. */
const porDigitos = (clabe: string) => clabe.split('').join(' ');

const copiar = jest.mocked(setStringAsync);

/**
 * Cómo responde expo-clipboard: 'bien' resuelve true, 'rechaza' (el teléfono no lo permitió) lanza y
 * 'falso' resuelve false.
 */
function simularPortapapeles(respuesta: 'bien' | 'rechaza' | 'falso' = 'bien'): jest.MockedFunction<typeof setStringAsync> {
  if (respuesta === 'rechaza') {
    copiar.mockRejectedValue(new Error('Portapapeles no disponible'));
  } else {
    copiar.mockResolvedValue(respuesta === 'bien');
  }
  return copiar;
}

beforeEach(() => {
  reiniciarConfiguracionPublica();
  copiar.mockReset();
});

espiarConsola(() => Promise.resolve(), true);

describe('copiarTexto', () => {
  it('copia el texto con expo-clipboard y resuelve true', async () => {
    const portapapeles = simularPortapapeles();

    await expect(copiarTexto(CLABE_FICTICIA)).resolves.toBe(true);
    expect(portapapeles).toHaveBeenCalledWith(CLABE_FICTICIA);
  });

  it.each([
    ['el teléfono no lo permite (rechaza)', 'rechaza'],
    ['expo-clipboard responde que no se guardó', 'falso'],
  ] as const)('%s: resuelve false y no lanza', async (_caso, respuesta) => {
    simularPortapapeles(respuesta);

    await expect(copiarTexto(CLABE_FICTICIA)).resolves.toBe(false);
  });
});

describe('DatosTransferencia', () => {
  it('con datos: banco, titular y CLABE con sus etiquetas, la CLABE leída por dígitos', async () => {
    await render(<DatosTransferencia datos={DATOS} />);

    expect(screen.getByLabelText('Banco: Banco Ficticio')).toBeOnTheScreen();
    expect(screen.getByLabelText('Titular: Titular Ficticia')).toBeOnTheScreen();
    expect(screen.getByLabelText(`CLABE: ${porDigitos(CLABE_FICTICIA)}`)).toBeOnTheScreen();
    expect(screen.getByText(CLABE_FICTICIA)).toBeOnTheScreen();
    const boton = screen.getByRole('button', { name: COPIAR });
    expect(boton).toHaveProp('accessibilityHint', RESPALDO_TEXTOS['pagos.transferencia.copiarAyuda']);
    expect(screen.queryByText(COPIADA)).not.toBeOnTheScreen();
  });

  it('sin datos (apagada o incompleta): no pinta nada', async () => {
    await render(<DatosTransferencia datos={null} />);

    expect(screen.toJSON()).toBeNull();
  });

  it('copiar bien: copia la CLABE sin espacios y avisa que se copió', async () => {
    const portapapeles = simularPortapapeles();
    await render(<DatosTransferencia datos={DATOS} />);

    await fireEvent.press(screen.getByRole('button', { name: COPIAR }));

    expect(await screen.findByText(COPIADA)).toBeOnTheScreen();
    expect(portapapeles).toHaveBeenCalledWith(CLABE_FICTICIA);
    expect(screen.queryByText(NO_COPIADA)).not.toBeOnTheScreen();
  });

  it('copiar mal: dice que mantenga presionada la CLABE para copiarla y la deja a la vista', async () => {
    simularPortapapeles('rechaza');
    await render(<DatosTransferencia datos={DATOS} />);

    await fireEvent.press(screen.getByRole('button', { name: COPIAR }));

    expect(await screen.findByText(NO_COPIADA)).toBeOnTheScreen();
    expect(screen.getByText(CLABE_FICTICIA)).toBeOnTheScreen();
    expect(screen.queryByText(COPIADA)).not.toBeOnTheScreen();
  });

  it('si la cuenta cambia después de copiar, el aviso anterior ya no se muestra', async () => {
    simularPortapapeles();
    const pantalla = await render(<DatosTransferencia datos={DATOS} />);
    await fireEvent.press(screen.getByRole('button', { name: COPIAR }));
    expect(await screen.findByText(COPIADA)).toBeOnTheScreen();

    await pantalla.rerender(<DatosTransferencia datos={OTRA_CUENTA} />);

    expect(screen.getByText(OTRA_CUENTA.clabe)).toBeOnTheScreen();
    expect(screen.queryByText(COPIADA)).not.toBeOnTheScreen();
  });
});
