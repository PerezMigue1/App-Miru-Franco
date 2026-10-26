/// <reference types="jest" />

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { reiniciarReaceptacion } from '@/features/auth/viewmodels/useDocumentosPendientes';
import { DocumentosPendientesView } from '@/features/auth/views/DocumentosPendientesView';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';
import { obtenerTexto } from '@/shared/api/textosSitio';

import { RUTA_PENDIENTES, pendienteCrudo, respuestaPendientes, vigenteCrudo } from '../../helpers/documentosPendientes';
import { authSimulada, reiniciarSimulaciones, servidorVm } from '../../helpers/viewmodelsAuth';

/**
 * GP-09, bloque A: la pantalla de documentos pendientes pintada con su viewmodel real y useAuth
 * simulado. "Cerrar sesión" que no se pudo completar deja la pantalla con su aviso y se puede volver
 * a intentar; un documento sin página en el sitio avisa que no se pudo abrir; sin habilitar (la intro
 * sigue a la vista) no se muestra. fetch simulado en http://api.test con datos ficticios.
 */

jest.mock('@/features/auth/viewmodels/useAuth', () => require('../../helpers/viewmodelsAuth').useAuthSimulado());
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

const MEDIDAS = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 24, left: 0, right: 0, bottom: 16 } };
const CLIENTA = { id: 'clienta-vista-legal-1', nombre: 'Clienta Legal', email: 'legal@ejemplo.test', rol: 'cliente' };
const CERRAR = obtenerTexto('legal.pendientes.cerrarSesion');
const SIN_RUTA = pendienteCrudo({ tipo: 'nuevo', documentoSlug: 'documento-nuevo' });

async function pintar(habilitada = true): Promise<void> {
  await render(
    <SafeAreaProvider initialMetrics={MEDIDAS}>
      <DocumentosPendientesView habilitada={habilitada} />
    </SafeAreaProvider>,
  );
}

beforeEach(() => {
  reiniciarSimulaciones();
  reiniciarReaceptacion();
  reiniciarDocumentosLegales();
  authSimulada.estado = 'autenticado';
  authSimulada.usuario = CLIENTA;
  servidorVm({ [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([SIN_RUTA]) });
});

afterEach(async () => {
  await cleanup();
});

describe('DocumentosPendientesView', () => {
  it('sin título del servidor usa el de respaldo y, sin página en el sitio, avisa que no se pudo abrir', async () => {
    await pintar();

    expect(await screen.findByText(obtenerTexto('legal.pendientes.tituloRespaldo'))).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Leer el documento completo' }));

    expect(await screen.findByText(obtenerTexto('legal.pendientes.sinAbrir'))).toBeOnTheScreen();
  });

  it('si no se pudo cerrar la sesión, lo dice y deja intentarlo otra vez', async () => {
    authSimulada.salir.mockImplementationOnce(() => Promise.resolve(false));
    authSimulada.salir.mockImplementationOnce(() => Promise.reject(new Error('sin almacén')));
    await pintar();

    await fireEvent.press(await screen.findByRole('button', { name: CERRAR }));
    expect(await screen.findByText(obtenerTexto('legal.pendientes.errorCerrar'))).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: CERRAR })).toBeEnabled();

    await fireEvent.press(screen.getByRole('button', { name: CERRAR }));
    expect(await screen.findByText(obtenerTexto('legal.pendientes.errorCerrar'))).toBeOnTheScreen();
    expect(authSimulada.salir).toHaveBeenCalledTimes(2);
  });

  it('la pantalla obligatoria sale sin esperar el título del documento, que llega después', async () => {
    let soltar: (respuesta: Response) => void = () => undefined;
    const titulo = new Promise<Response>((resolver) => {
      soltar = resolver;
    });
    servidorVm({
      [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([pendienteCrudo()]),
      'GET /api/documentos-legales/aviso-privacidad/vigente': () => titulo,
    });
    await pintar();

    // Con el título de respaldo mientras el del servidor no llega.
    expect(await screen.findByText('Aviso de Privacidad')).toBeOnTheScreen();
    soltar(vigenteCrudo('aviso-privacidad', 'Aviso de Privacidad del salón', '/aviso-de-privacidad'));
    expect(await screen.findByText('Aviso de Privacidad del salón')).toBeOnTheScreen();
  });

  it('un documento desconocido sin página todavía no se puede aceptar; al llegar su página sí, con la casilla otra vez sin marcar', async () => {
    let soltar: (respuesta: Response) => void = () => undefined;
    const vigente = new Promise<Response>((resolver) => {
      soltar = resolver;
    });
    servidorVm({
      [`GET ${RUTA_PENDIENTES}`]: () => respuestaPendientes([SIN_RUTA]),
      'GET /api/documentos-legales/documento-nuevo/vigente': () => vigente,
    });
    await pintar();
    const ACEPTAR = obtenerTexto('legal.pendientes.aceptar');
    const respaldo = obtenerTexto('legal.pendientes.tituloRespaldo');

    await fireEvent.press(
      await screen.findByRole('checkbox', { name: obtenerTexto('legal.pendientes.casilla', { titulo: respaldo, version: '2.1' }) }),
    );
    // Marcada, pero sin la página del documento todavía no se puede aceptar.
    expect(screen.getByRole('button', { name: ACEPTAR })).toBeDisabled();
    // "Leer el documento completo" espera a la página en lugar de decir que no abrió.
    await fireEvent.press(screen.getByRole('button', { name: 'Leer el documento completo' }));
    expect(screen.queryByText(obtenerTexto('legal.pendientes.sinAbrir'))).not.toBeOnTheScreen();

    soltar(vigenteCrudo('documento-nuevo', 'Documento nuevo del salón', '/documento-nuevo'));

    const casilla = await screen.findByRole('checkbox', {
      name: obtenerTexto('legal.pendientes.casilla', { titulo: 'Documento nuevo del salón', version: '2.1' }),
    });
    // Cambió el título: lo marcado con el anterior ya no cuenta.
    expect(casilla).not.toBeChecked();
    await fireEvent.press(casilla);
    expect(screen.getByRole('button', { name: ACEPTAR })).toBeEnabled();
    await waitFor(() =>
      expect(jest.requireMock<{ openBrowserAsync: jest.Mock }>('expo-web-browser').openBrowserAsync).toHaveBeenCalledWith(
        'http://web.test/documento-nuevo',
      ),
    );
  });

  it('mientras la intro sigue a la vista no se muestra', async () => {
    await pintar(false);

    expect(screen.queryByRole('button', { name: CERRAR })).not.toBeOnTheScreen();
  });
});
