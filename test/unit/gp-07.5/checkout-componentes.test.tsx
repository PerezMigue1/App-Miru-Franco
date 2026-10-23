/// <reference types="jest" />

import { act, fireEvent, render, screen } from '@testing-library/react-native';
import { Linking } from 'react-native';

import { DatosRecogerSalon } from '@/features/tienda/components/DatosRecogerSalon';
import { InformacionCompra } from '@/features/tienda/components/InformacionCompra';
import { abrirEnlace } from '@/features/tienda/viewmodels/checkoutTienda';
import { refrescar, reiniciarConfiguracionPublica } from '@/shared/api/configuracionPublica';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { configuracionTienda, rutaConfiguracionTienda } from '../../helpers/checkoutFicticio';
import { servidorConRutas } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.5: los componentes del checkout por separado con la configuración ficticia en memoria
 * (servidor simulado en http://api.test): DatosRecogerSalon sin datos opcionales (sin domicilio, mapa
 * ni teléfono), el aviso y el enlace del mapa, y los teléfonos de Profeco de InformacionCompra.
 */

const simular = servidorConRutas({});
const abrirUrl = jest.mocked(Linking.openURL);

async function conConfiguracion(cambios: Parameters<typeof configuracionTienda>[0] = {}) {
  simular(rutaConfiguracionTienda(configuracionTienda(cambios)));
  await act(async () => {
    await refrescar();
  });
}

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
  abrirUrl.mockReset().mockResolvedValue(true);
});

describe('DatosRecogerSalon', () => {
  it('sin domicilio, mapa ni teléfono: solo el nombre y el horario, sin enlaces ni aviso', async () => {
    await conConfiguracion({ salon: { direccion: '', ciudad: '', mapaUrl: '', telefono: '' } });
    await render(<DatosRecogerSalon />);
    expect(screen.getByText('Salón Ficticio de Prueba')).toBeOnTheScreen();
    expect(screen.getByText('Martes a jueves de 10:00 a 18:00 h.')).toBeOnTheScreen();
    expect(screen.queryByRole('link')).not.toBeOnTheScreen();
    expect(screen.queryByText(/Te avisamos en la app/)).not.toBeOnTheScreen();
  });

  it('con aviso: el tiempo de preparación, y el enlace del mapa se hunde y abre el mapa', async () => {
    await conConfiguracion();
    await render(<DatosRecogerSalon conAviso />);
    expect(screen.getByText('Listo en un día hábil. Te avisamos en la app y por correo cuando puedas pasar por él.')).toBeOnTheScreen();
    const mapa = screen.getByRole('link', { name: 'Ver cómo llegar en el mapa, Salón Ficticio de Prueba' });
    await fireEvent(mapa, 'pressIn');
    await fireEvent(mapa, 'pressOut');
    await fireEvent.press(mapa);
    expect(abrirUrl).toHaveBeenCalledWith('https://maps.app.goo.gl/ficticio');
  });
});

describe('InformacionCompra', () => {
  it('los dos teléfonos de Profeco abren el marcador con su número', async () => {
    await conConfiguracion();
    await render(<InformacionCompra />);
    await fireEvent.press(screen.getByRole('link', { name: 'Llamar a Profeco, 55 5568 8722 (CDMX y zona metropolitana)' }));
    await fireEvent.press(screen.getByRole('link', { name: 'Llamar a Profeco, 800 468 8722 (resto del país)' }));
    expect(abrirUrl.mock.calls).toEqual([['tel:+525555688722'], ['tel:+528004688722']]);
  });

  it('sin domicilio en la configuración: quién vende solo dice el nombre, sin un párrafo vacío', async () => {
    await conConfiguracion({ salon: { direccion: '', ciudad: '' } });
    await render(<InformacionCompra />);
    expect(screen.getAllByText('Salón Ficticio de Prueba').length).toBeGreaterThan(0);
    expect(screen.queryByText(/Calle Inventada/)).not.toBeOnTheScreen();
    expect(screen.queryByText(/Ciudad Ficticia/)).not.toBeOnTheScreen();
  });
});

describe('abrirEnlace', () => {
  it('sin enlace no abre nada; si no hay app para abrirlo, no rompe', async () => {
    abrirEnlace(null);
    expect(abrirUrl).not.toHaveBeenCalled();
    abrirUrl.mockRejectedValueOnce(new Error('Sin app ficticia'));
    abrirEnlace('tel:+527000000000');
    await act(async () => {
      await Promise.resolve();
    });
    expect(abrirUrl).toHaveBeenCalledTimes(1);
  });
});
