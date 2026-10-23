/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { renderHook } from '@testing-library/react-native';
import { fireEvent, screen, waitFor } from 'expo-router/testing-library';
import { useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';

import DocumentoLegalRuta from '@/app/legal/[slug]';
import { obtenerDocumentoVigente, reiniciarDocumentosLegales, rutaVisorDocumento } from '@/shared/api/documentosLegales';
import { useDocumentoLegal } from '@/shared/api/useDocumentoLegal';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import {
  abrirNavegadorSimulado,
  documentoCrudo,
  rutaDocumento,
  rutaSinVersion,
  rutaVigente,
  sembrarDocumentosGuardados,
  sinRed,
  WEB,
} from '../../helpers/documentosFicticios';
import { cerrarRouter, iniciarRouter } from '../../helpers/router';
import { respuesta, servidorConRutas, type Llamada } from '../../helpers/servidorSimulado';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);
jest.mock('expo-web-browser', () => require('../../helpers/google').navegadorSimulado());

/**
 * GP-07.4: visor de documentos legales (ruta src/app/legal/[slug].tsx con useDocumentoLegal y
 * VisorDocumentoLegal), montado en un router en memoria. Muestra título, versión y vigencia y abre el
 * texto completo en el sitio; sin red usa lo guardado y sin nada ofrece reintentar. El servidor, el
 * disco y el navegador son ficticios.
 */

const simularServidor = servidorConRutas({});
const BOTON_LEER = 'Leer el documento completo';
const pedidas = (llamadas: Llamada[]) => llamadas.filter((l) => l.ruta.startsWith('/api/documentos-legales/'));

/** Pantalla de inicio con un botón que abre el visor (para tener a dónde volver). */
function PantallaConEnlace() {
  const { push } = useRouter();
  return (
    <Pressable accessibilityRole="button" onPress={() => push(rutaVisorDocumento('anticipos'))}>
      <Text>Abrir la política</Text>
    </Pressable>
  );
}

function abrir(slug = 'anticipos') {
  return iniciarRouter(
    { index: () => <Text>Pantalla de inicio</Text>, 'legal/[slug]': DocumentoLegalRuta },
    { initialUrl: `/legal/${slug}` },
  );
}

beforeEach(() => {
  reiniciarDocumentosLegales();
  limpiarArchivos();
  abrirNavegadorSimulado().mockClear();
});

describe('visor de documentos legales', () => {
  afterEach(cerrarRouter);

  it('con red: título, versión, vigencia y el botón abre la página del documento en el sitio', async () => {
    const llamadas = simularServidor(rutaDocumento());
    await abrir();

    expect(await screen.findByText('Versión 2.3')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Documento ficticio anticipos' })).toBeOnTheScreen();
    expect(screen.getByText('Vigente desde el 14 de octubre de 2026')).toBeOnTheScreen();
    expect(screen.getByText(/se abre en un navegador dentro de la app/)).toBeOnTheScreen();
    expect(screen.queryByText(/Sin conexión/)).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: BOTON_LEER }));

    expect(abrirNavegadorSimulado()).toHaveBeenCalledWith(`${WEB}/politica-de-reembolsos#anticipos`);
    expect(pedidas(llamadas).map((l) => l.ruta)).toEqual([rutaVigente('anticipos')]);
  });

  it('mientras carga: el título de respaldo y los bloques de carga anunciados', async () => {
    let responder: (valor: Response) => void = () => undefined;
    globalThis.fetch = jest.fn(
      () =>
        new Promise<Response>((resolver) => {
          responder = resolver;
        }),
    ) as unknown as typeof fetch;
    await abrir();

    expect(await screen.findByLabelText('Cargando el documento')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Política de Anticipos' })).toBeOnTheScreen();
    expect(screen.queryByText(/Versión/)).not.toBeOnTheScreen();

    responder(respuesta({ success: true, data: documentoCrudo() }));

    expect(await screen.findByText('Versión 2.3')).toBeOnTheScreen();
  });

  it('en memoria vigente no vuelve a pedir el documento', async () => {
    const llamadas = simularServidor(rutaDocumento());
    await obtenerDocumentoVigente('anticipos');
    await abrir();

    expect(await screen.findByText('Versión 2.3')).toBeOnTheScreen();
    expect(pedidas(llamadas)).toHaveLength(1);
  });

  it('sin red con versión guardada: el aviso, la versión guardada y el botón', async () => {
    sembrarDocumentosGuardados();
    sinRed();
    await abrir();

    expect(await screen.findByText('Sin conexión. Te mostramos la versión que guardamos la última vez.')).toBeOnTheScreen();
    expect(screen.getByText('Versión 2.2')).toBeOnTheScreen();
    expect(screen.getByText('Vigente desde el 1 de septiembre de 2026')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: BOTON_LEER }));
    expect(abrirNavegadorSimulado()).toHaveBeenCalledWith(`${WEB}/politica-de-reembolsos#anticipos`);
  });

  it('sin red ni nada guardado: no muestra versión y Reintentar la trae', async () => {
    sinRed();
    await abrir();

    expect(await screen.findByText('No pudimos cargar el documento')).toBeOnTheScreen();
    expect(screen.queryByText(/Versión/)).not.toBeOnTheScreen();
    expect(screen.queryByRole('button', { name: BOTON_LEER })).not.toBeOnTheScreen();

    simularServidor(rutaDocumento());
    await fireEvent.press(screen.getByRole('button', { name: 'Reintentar' }));

    expect(await screen.findByText('Versión 2.3')).toBeOnTheScreen();
    expect(screen.queryByText(/Sin conexión/)).not.toBeOnTheScreen();
  });

  it('respuesta con hash mal formado: no se usa', async () => {
    simularServidor(rutaDocumento('anticipos', { success: true, data: documentoCrudo('anticipos', { hash: 'f'.repeat(10) }) }));
    await abrir();

    expect(await screen.findByText('No pudimos cargar el documento')).toBeOnTheScreen();
    expect(screen.queryByText(/Versión/)).not.toBeOnTheScreen();
  });

  it('sin versión publicada (404): lo dice y ofrece abrirlo en el sitio', async () => {
    simularServidor(rutaSinVersion('terminos'));
    await abrir('terminos');

    expect(await screen.findByText('Este documento no está disponible')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Términos y Condiciones' })).toBeOnTheScreen();
    expect(screen.queryByText(/Versión/)).not.toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Abrir en el sitio' }));
    expect(abrirNavegadorSimulado()).toHaveBeenCalledWith(`${WEB}/terminos-y-condiciones`);
  });

  it('slug desconocido: "Este documento no existe" sin pedir nada', async () => {
    const llamadas = simularServidor({});
    await abrir('contrato-ficticio');

    expect(await screen.findByText('Este documento no existe')).toBeOnTheScreen();
    expect(screen.getByRole('header', { name: 'Documento legal' })).toBeOnTheScreen();
    expect(pedidas(llamadas)).toHaveLength(0);
  });

  it('si el navegador no abre, avisa sin texto técnico', async () => {
    simularServidor(rutaDocumento());
    abrirNavegadorSimulado().mockRejectedValueOnce(new Error('ActivityNotFoundException ficticia'));
    await abrir();

    await fireEvent.press(await screen.findByRole('button', { name: BOTON_LEER }));

    expect(await screen.findByText('No pudimos abrir el documento. Revisa tu conexión e intenta de nuevo.')).toBeOnTheScreen();
    expect(screen.queryByText(/ActivityNotFoundException/)).not.toBeOnTheScreen();
  });

  it('Volver regresa a la pantalla anterior', async () => {
    simularServidor(rutaDocumento());
    const app = iniciarRouter({ index: PantallaConEnlace, 'legal/[slug]': DocumentoLegalRuta }, { initialUrl: '/' });
    await app;
    await fireEvent.press(await screen.findByRole('button', { name: 'Abrir la política' }));
    expect(await screen.findByText('Versión 2.3')).toBeOnTheScreen();

    await fireEvent.press(screen.getByRole('button', { name: 'Volver' }));

    await waitFor(() => expect(app.getPathname()).toBe('/'));
  });
});

describe('useDocumentoLegal con un slug que no sirve', () => {
  it.each([
    ['desconocido', 'contrato-ficticio'],
    ['repetido en la ruta', ['anticipos', 'terminos']],
    ['sin slug', undefined],
  ])('%s: no pide nada, no abre nada y no está sin red', async (_caso, slug) => {
    const llamadas = simularServidor(rutaDocumento());
    const { result } = await renderHook(() => useDocumentoLegal(slug));

    expect(result.current).toMatchObject({ desconocido: true, cargando: false, sinRed: false, documento: null, titulo: '' });
    result.current.reintentar();
    await expect(result.current.abrirCompleto()).resolves.toBe(false);
    expect(pedidas(llamadas)).toHaveLength(0);
    expect(abrirNavegadorSimulado()).not.toHaveBeenCalled();
  });
});
