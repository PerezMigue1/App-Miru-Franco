/// <reference types="jest" />

/**
 * Registra el beforeEach y el afterEach que espían console.error y console.warn en cada prueba.
 * Al terminar corre `alTerminar` (desmontar y vaciar lo pendiente) y quita los espías aunque falle.
 * Con `revisarAlTerminar` revisa ahí mismo que React y la app no hayan escrito ningún error ni aviso;
 * sin él, cada prueba llama a la revisión que devuelve.
 */
export function espiarConsola(alTerminar: () => Promise<void>, revisarAlTerminar = false): () => void {
  let espiaError: jest.SpyInstance;
  let espiaAviso: jest.SpyInstance;

  const revisar = () => {
    expect(espiaError).not.toHaveBeenCalled();
    expect(espiaAviso).not.toHaveBeenCalled();
  };

  beforeEach(() => {
    espiaError = jest.spyOn(console, 'error');
    espiaAviso = jest.spyOn(console, 'warn');
  });

  afterEach(async () => {
    try {
      await alTerminar();
      if (revisarAlTerminar) revisar();
    } finally {
      espiaError.mockRestore();
      espiaAviso.mockRestore();
    }
  });

  return revisar;
}
