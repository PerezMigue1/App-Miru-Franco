/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import { useDocumentoVisto } from '@/features/tienda/viewmodels/checkoutTienda';
import type { DocumentoLegalVigente } from '@/shared/api/documentosLegales';

/**
 * GP-07.5: useDocumentoVisto con la memoria de documentos simulada. Con la casilla marcada, si llega
 * la misma versión con otro hash o el documento deja de estar en memoria, se pide desmarcarla: el
 * consentimiento nunca se registra con un documento distinto del que la clienta tuvo a la vista.
 */

let mockEnMemoria: DocumentoLegalVigente | null = null;
const mockOyentes = new Set<() => void>();

jest.mock('@/shared/api/documentosLegales', () => ({
  documentoEnMemoria: () => mockEnMemoria,
  suscribir: (oyente: () => void) => {
    mockOyentes.add(oyente);
    return () => mockOyentes.delete(oyente);
  },
}));

const documento = (cambios: Partial<DocumentoLegalVigente> = {}): DocumentoLegalVigente =>
  ({
    slug: 'terminos',
    titulo: 'Términos ficticios',
    ruta: '/terminos',
    version: '2.3',
    hash: 'hash-ficticio-uno',
    vigenteDesde: '2026-10-01',
    requiereAceptacion: false,
    html: '<p>Documento ficticio</p>',
    ...cambios,
  }) as DocumentoLegalVigente;

async function cambiarMemoria(nuevo: DocumentoLegalVigente | null) {
  await act(async () => {
    mockEnMemoria = nuevo;
    mockOyentes.forEach((oyente) => oyente());
  });
}

beforeEach(() => {
  mockEnMemoria = documento();
  mockOyentes.clear();
});

describe('useDocumentoVisto con la casilla marcada', () => {
  it.each([
    ['la misma versión con otro hash', documento({ hash: 'hash-ficticio-dos' })],
    ['el documento deja de estar en memoria', null],
  ])('%s: pide desmarcar y ya no hay versión vista', async (_caso, nuevo) => {
    const alCambiar = jest.fn();
    const { result } = await renderHook(() => useDocumentoVisto('terminos', true, alCambiar));
    expect(result.current()).toEqual(documento());

    await cambiarMemoria(nuevo);

    expect(alCambiar).toHaveBeenCalledTimes(1);
    expect(result.current()).toBeNull();
  });

  it('el mismo documento vuelto a leer (otro objeto, misma versión y hash) no desmarca', async () => {
    const alCambiar = jest.fn();
    const { result } = await renderHook(() => useDocumentoVisto('terminos', true, alCambiar));

    await cambiarMemoria(documento());

    expect(alCambiar).not.toHaveBeenCalled();
    expect(result.current()).toEqual(documento());
  });
});
