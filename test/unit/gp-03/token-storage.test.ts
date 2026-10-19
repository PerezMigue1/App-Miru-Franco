/**
 * GP-03: almacenamiento de la sesión en SecureStore (src/shared/api/tokenStorage.ts). Cubre la
 * entrada única 'auth_sesion', las generaciones que descartan escrituras viejas, la cola que
 * ordena las operaciones, la lectura de datos dañados y el borrado del formato anterior.
 *
 * El módulo guarda estado (generación, cola y la revisión del formato anterior), así que cada
 * prueba lo carga de nuevo con jest.resetModules(). Al reiniciar el registro también se crea un
 * mock nuevo de expo-secure-store (test/setup.ts), con su almacén vacío y sus jest.fn limpios.
 */

type TokenStorage = typeof import('@/shared/api/tokenStorage');
type SesionGuardada = import('@/shared/api/tokenStorage').SesionGuardada;
type UsuarioGuardado = import('@/shared/api/tokenStorage').UsuarioGuardado;

interface SecureStoreSimulado {
  __almacen: Map<string, string>;
  getItemAsync: jest.Mock<Promise<string | null>, [string]>;
  setItemAsync: jest.Mock<Promise<void>, [string, string]>;
  deleteItemAsync: jest.Mock<Promise<void>, [string]>;
}

const CLAVE_SESION = 'auth_sesion';
const CLAVES_ANTERIORES = ['auth_token', 'auth_token_emitido', 'auth_usuario'];

const USUARIO: UsuarioGuardado = { id: 'u-1', nombre: 'Clienta Prueba', email: 'clienta@test.local', rol: 'cliente' };
const OTRO_USUARIO: UsuarioGuardado = { id: 'u-1', nombre: 'Clienta Editada', email: 'editada@test.local', rol: 'cliente' };

function sesionDePrueba(cambios: Partial<SesionGuardada> = {}): SesionGuardada {
  return { token: 'token-a', emitidoEn: 1000, usuario: USUARIO, refreshToken: 'refresh-a', ...cambios };
}

let ts: TokenStorage;
let ss: SecureStoreSimulado;

beforeEach(() => {
  jest.resetModules();
  ts = jest.requireActual<TokenStorage>('@/shared/api/tokenStorage');
  ss = jest.requireMock<SecureStoreSimulado>('expo-secure-store');
});

/** Escribe directo en el almacén simulado, sin pasar por el módulo. */
function guardarCrudo(clave: string, valor: unknown): void {
  ss.__almacen.set(clave, typeof valor === 'string' ? valor : JSON.stringify(valor));
}

function sesionEnAlmacen(): SesionGuardada | null {
  const texto = ss.__almacen.get(CLAVE_SESION);
  return texto === undefined ? null : (JSON.parse(texto) as SesionGuardada);
}

/** Inicia una sesión con la generación actual y devuelve esa generación. */
async function iniciarSesion(sesion: SesionGuardada = sesionDePrueba()): Promise<number> {
  const gen = ts.generacionActual();
  await expect(ts.guardarSesion(sesion, gen)).resolves.toBe(true);
  return gen;
}

describe('generaciones', () => {
  it('empieza en 0 y nuevaGeneracion la sube de uno en uno', () => {
    expect(ts.generacionActual()).toBe(0);
    expect(ts.nuevaGeneracion()).toBe(1);
    expect(ts.nuevaGeneracion()).toBe(2);
    expect(ts.generacionActual()).toBe(2);
  });

  it('una escritura con la generación vieja no pisa la sesión nueva', async () => {
    const genVieja = await iniciarSesion();
    await ts.borrarSesion();
    const genNueva = ts.generacionActual();
    expect(genNueva).toBe(genVieja + 1);
    const nueva = sesionDePrueba({ token: 'token-b', refreshToken: 'refresh-b', emitidoEn: 5000 });
    await expect(ts.guardarSesion(nueva, genNueva)).resolves.toBe(true);

    await expect(ts.guardarUsuario(OTRO_USUARIO, genVieja)).resolves.toBe(false);
    await expect(ts.reemplazarToken('token-b', 'token-x', 9000, genVieja)).resolves.toBe(false);
    await expect(ts.reemplazarTokens('refresh-b', { token: 'token-x', refreshToken: 'refresh-x', emitidoEn: 9000 }, genVieja)).resolves.toBe(false);
    await expect(ts.guardarSesion(sesionDePrueba({ token: 'token-x' }), genVieja)).resolves.toBe(false);
    await expect(ts.borrarSesionSi('token-b', genVieja)).resolves.toBe(false);
    await expect(ts.cerrarSesionDeGeneracion(genVieja)).resolves.toBeNull();

    expect(await ts.leerSesion()).toEqual(nueva);
    expect(ts.generacionActual()).toBe(genNueva);
  });
});

describe('guardarSesion, leerSesion y getToken', () => {
  it('guarda la sesión como JSON en auth_sesion y la devuelve al leer', async () => {
    const sesion = sesionDePrueba({ refreshExpiraEn: 99999 });
    await iniciarSesion(sesion);

    expect(ss.setItemAsync).toHaveBeenCalledTimes(1);
    expect(ss.setItemAsync).toHaveBeenCalledWith(CLAVE_SESION, JSON.stringify(sesion));
    expect(sesionEnAlmacen()).toEqual(sesion);
    expect(await ts.leerSesion()).toEqual(sesion);
    expect(await ts.getToken()).toBe('token-a');
  });

  it('sin sesión, leerSesion y getToken devuelven null', async () => {
    expect(await ts.leerSesion()).toBeNull();
    expect(await ts.getToken()).toBeNull();
  });

  it('con generación vieja devuelve false y no escribe', async () => {
    const gen = ts.generacionActual();
    ts.nuevaGeneracion();
    await expect(ts.guardarSesion(sesionDePrueba(), gen)).resolves.toBe(false);
    expect(ss.setItemAsync).not.toHaveBeenCalled();
    expect(ss.__almacen.size).toBe(0);
  });
});

describe('borrarSesion', () => {
  it('borra la sesión y las claves anteriores, y sube la generación', async () => {
    const gen = await iniciarSesion();
    const promesa = ts.borrarSesion();
    // La generación sube en cuanto se pide, antes de que corra el borrado.
    expect(ts.generacionActual()).toBe(gen + 1);
    await promesa;

    expect(ss.__almacen.size).toBe(0);
    const borradas = ss.deleteItemAsync.mock.calls.map(([clave]) => clave);
    expect(borradas).toEqual([CLAVE_SESION, ...CLAVES_ANTERIORES]);
    expect(await ts.leerSesion()).toBeNull();
  });

  it('descarta una guardarSesion encolada antes con la generación que se cerró', async () => {
    const gen = ts.generacionActual();
    const guardado = ts.guardarSesion(sesionDePrueba(), gen);
    const borrado = ts.borrarSesion();
    await expect(guardado).resolves.toBe(false);
    await borrado;
    expect(ss.setItemAsync).not.toHaveBeenCalled();
  });
});

describe('reemplazarToken', () => {
  it('cambia token y emitidoEn y conserva usuario y refreshToken', async () => {
    const gen = await iniciarSesion(sesionDePrueba({ refreshExpiraEn: 77777 }));
    await expect(ts.reemplazarToken('token-a', 'token-b', 2000, gen)).resolves.toBe(true);
    expect(await ts.leerSesion()).toEqual({
      token: 'token-b',
      emitidoEn: 2000,
      usuario: USUARIO,
      refreshToken: 'refresh-a',
      refreshExpiraEn: 77777,
    });
  });

  it('devuelve false si la generación cambió', async () => {
    const gen = await iniciarSesion();
    ts.nuevaGeneracion();
    await expect(ts.reemplazarToken('token-a', 'token-b', 2000, gen)).resolves.toBe(false);
    expect(sesionEnAlmacen()?.token).toBe('token-a');
  });

  it('devuelve false si el token guardado es otro', async () => {
    const gen = await iniciarSesion();
    await expect(ts.reemplazarToken('token-otro', 'token-b', 2000, gen)).resolves.toBe(false);
    expect(sesionEnAlmacen()?.token).toBe('token-a');
    expect(ss.setItemAsync).toHaveBeenCalledTimes(1);
  });

  it('devuelve false si no hay sesión', async () => {
    await expect(ts.reemplazarToken('token-a', 'token-b', 2000, ts.generacionActual())).resolves.toBe(false);
    expect(ss.setItemAsync).not.toHaveBeenCalled();
  });
});

describe('reemplazarTokens', () => {
  it('guarda token, refreshToken, emitidoEn y refreshExpiraEn conservando el usuario', async () => {
    const gen = await iniciarSesion();
    const nuevos = { token: 'token-b', refreshToken: 'refresh-b', emitidoEn: 3000, refreshExpiraEn: 88888 };
    await expect(ts.reemplazarTokens('refresh-a', nuevos, gen)).resolves.toBe(true);
    expect(await ts.leerSesion()).toEqual({ ...nuevos, usuario: USUARIO });
  });

  it('sin refreshExpiraEn no lo guarda, aunque la sesión anterior lo tuviera', async () => {
    const gen = await iniciarSesion(sesionDePrueba({ refreshExpiraEn: 55555 }));
    await expect(ts.reemplazarTokens('refresh-a', { token: 'token-b', refreshToken: 'refresh-b', emitidoEn: 3000 }, gen)).resolves.toBe(true);
    const guardada = sesionEnAlmacen();
    expect(guardada).toEqual({ token: 'token-b', refreshToken: 'refresh-b', emitidoEn: 3000, usuario: USUARIO });
    expect(guardada).not.toHaveProperty('refreshExpiraEn');
  });

  it('devuelve false con generación vieja', async () => {
    const gen = await iniciarSesion();
    ts.nuevaGeneracion();
    await expect(ts.reemplazarTokens('refresh-a', { token: 'token-b', refreshToken: 'refresh-b', emitidoEn: 3000 }, gen)).resolves.toBe(false);
    expect(sesionEnAlmacen()?.refreshToken).toBe('refresh-a');
  });

  it('devuelve false sin sesión', async () => {
    await expect(ts.reemplazarTokens('refresh-a', { token: 'token-b', refreshToken: 'refresh-b', emitidoEn: 3000 }, ts.generacionActual())).resolves.toBe(false);
    expect(ss.setItemAsync).not.toHaveBeenCalled();
  });

  it('devuelve false si el refreshToken guardado es distinto (o no hay)', async () => {
    const gen = await iniciarSesion();
    await expect(ts.reemplazarTokens('refresh-otro', { token: 'token-b', refreshToken: 'refresh-b', emitidoEn: 3000 }, gen)).resolves.toBe(false);
    expect(sesionEnAlmacen()?.token).toBe('token-a');

    const sinRefresh = sesionDePrueba();
    delete sinRefresh.refreshToken;
    await iniciarSesion(sinRefresh);
    await expect(ts.reemplazarTokens('refresh-a', { token: 'token-b', refreshToken: 'refresh-b', emitidoEn: 3000 }, gen)).resolves.toBe(false);
  });
});

describe('guardarUsuario', () => {
  it('actualiza el usuario con la generación correcta y conserva lo demás', async () => {
    const gen = await iniciarSesion();
    await expect(ts.guardarUsuario(OTRO_USUARIO, gen)).resolves.toBe(true);
    expect(await ts.leerSesion()).toEqual(sesionDePrueba({ usuario: OTRO_USUARIO }));
  });

  it('devuelve false con generación vieja', async () => {
    const gen = await iniciarSesion();
    ts.nuevaGeneracion();
    await expect(ts.guardarUsuario(OTRO_USUARIO, gen)).resolves.toBe(false);
    expect(sesionEnAlmacen()?.usuario).toEqual(USUARIO);
  });

  it('devuelve false sin sesión', async () => {
    await expect(ts.guardarUsuario(OTRO_USUARIO, ts.generacionActual())).resolves.toBe(false);
    expect(ss.setItemAsync).not.toHaveBeenCalled();
  });
});

describe('borrarSesionSi', () => {
  it('con token y generación correctos borra, abre generación nueva y devuelve true', async () => {
    const gen = await iniciarSesion();
    await expect(ts.borrarSesionSi('token-a', gen)).resolves.toBe(true);
    expect(ts.generacionActual()).toBe(gen + 1);
    expect(ss.__almacen.has(CLAVE_SESION)).toBe(false);
  });

  it('con token distinto devuelve false y no borra', async () => {
    const gen = await iniciarSesion();
    await expect(ts.borrarSesionSi('token-otro', gen)).resolves.toBe(false);
    expect(ts.generacionActual()).toBe(gen);
    expect(sesionEnAlmacen()?.token).toBe('token-a');
    expect(ss.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('con generación vieja devuelve false y no borra', async () => {
    const gen = await iniciarSesion();
    ts.nuevaGeneracion();
    await expect(ts.borrarSesionSi('token-a', gen)).resolves.toBe(false);
    expect(sesionEnAlmacen()?.token).toBe('token-a');
    expect(ss.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('sin sesión devuelve false', async () => {
    await expect(ts.borrarSesionSi('token-a', ts.generacionActual())).resolves.toBe(false);
    expect(ts.generacionActual()).toBe(0);
  });

  it('si el borrado falla una vez, reintenta y devuelve true', async () => {
    const gen = await iniciarSesion();
    ss.deleteItemAsync.mockRejectedValueOnce(new Error('fallo simulado'));
    await expect(ts.borrarSesionSi('token-a', gen)).resolves.toBe(true);
    expect(ss.__almacen.has(CLAVE_SESION)).toBe(false);
    const borradasSesion = ss.deleteItemAsync.mock.calls.filter(([clave]) => clave === CLAVE_SESION);
    expect(borradasSesion).toHaveLength(2);
  });

  it('si el borrado falla dos veces, igual devuelve true y la sesión queda guardada', async () => {
    const gen = await iniciarSesion();
    ss.deleteItemAsync.mockRejectedValueOnce(new Error('fallo simulado')).mockRejectedValueOnce(new Error('fallo simulado'));
    await expect(ts.borrarSesionSi('token-a', gen)).resolves.toBe(true);
    expect(ts.generacionActual()).toBe(gen + 1);
    expect(sesionEnAlmacen()?.token).toBe('token-a');
    // Con la generación nueva, la siguiente llamada la puede cerrar.
    await expect(ts.borrarSesionSi('token-a', ts.generacionActual())).resolves.toBe(true);
    expect(ss.__almacen.has(CLAVE_SESION)).toBe(false);
  });
});

describe('cerrarSesionDeGeneracion', () => {
  it('devuelve la sesión cerrada, la borra y abre generación nueva', async () => {
    const sesion = sesionDePrueba({ refreshExpiraEn: 12345 });
    const gen = await iniciarSesion(sesion);
    // Una renovación cambia el token sin cambiar la generación: igual se cierra.
    await ts.reemplazarToken('token-a', 'token-b', 2000, gen);
    await expect(ts.cerrarSesionDeGeneracion(gen)).resolves.toEqual({ ...sesion, token: 'token-b', emitidoEn: 2000 });
    expect(ts.generacionActual()).toBe(gen + 1);
    expect(ss.__almacen.has(CLAVE_SESION)).toBe(false);
  });

  it('devuelve null con generación vieja y no borra', async () => {
    const gen = await iniciarSesion();
    ts.nuevaGeneracion();
    await expect(ts.cerrarSesionDeGeneracion(gen)).resolves.toBeNull();
    expect(sesionEnAlmacen()?.token).toBe('token-a');
  });

  it('devuelve null sin sesión y no cambia la generación', async () => {
    await expect(ts.cerrarSesionDeGeneracion(0)).resolves.toBeNull();
    expect(ts.generacionActual()).toBe(0);
  });

  it('si el borrado falla dos veces, igual devuelve la sesión', async () => {
    const gen = await iniciarSesion();
    ss.deleteItemAsync.mockRejectedValueOnce(new Error('fallo simulado')).mockRejectedValueOnce(new Error('fallo simulado'));
    await expect(ts.cerrarSesionDeGeneracion(gen)).resolves.toEqual(sesionDePrueba());
    expect(ts.generacionActual()).toBe(gen + 1);
    expect(sesionEnAlmacen()?.token).toBe('token-a');
  });
});

describe('cola de operaciones', () => {
  it('aplica las operaciones lanzadas sin await en el orden en que se pidieron', async () => {
    const gen = ts.generacionActual();
    const p1 = ts.guardarSesion(sesionDePrueba(), gen);
    const p2 = ts.guardarUsuario(OTRO_USUARIO, gen);
    const p3 = ts.reemplazarToken('token-a', 'token-b', 2000, gen);
    const p4 = ts.leerSesion();

    await expect(Promise.all([p1, p2, p3])).resolves.toEqual([true, true, true]);
    const esperada = sesionDePrueba({ usuario: OTRO_USUARIO, token: 'token-b', emitidoEn: 2000 });
    await expect(p4).resolves.toEqual(esperada);

    const escritas = ss.setItemAsync.mock.calls.map(([, valor]) => JSON.parse(valor) as SesionGuardada);
    expect(escritas).toEqual([
      sesionDePrueba(),
      sesionDePrueba({ usuario: OTRO_USUARIO }),
      esperada,
    ]);
  });

  it('una lectura pedida antes de una escritura no la ve', async () => {
    const gen = ts.generacionActual();
    const antes = ts.leerSesion();
    const guardado = ts.guardarSesion(sesionDePrueba(), gen);
    const despues = ts.getToken();
    await expect(antes).resolves.toBeNull();
    await expect(guardado).resolves.toBe(true);
    await expect(despues).resolves.toBe('token-a');
  });

  it('un fallo en una operación no rompe las siguientes', async () => {
    const gen = ts.generacionActual();
    ss.setItemAsync.mockRejectedValueOnce(new Error('fallo simulado'));
    const p1 = ts.guardarSesion(sesionDePrueba(), gen);
    const p2 = ts.reemplazarToken('token-a', 'token-b', 2000, gen);
    const p3 = ts.guardarSesion(sesionDePrueba({ token: 'token-c' }), gen);
    const p4 = ts.guardarUsuario(OTRO_USUARIO, gen);
    const p5 = ts.leerSesion();

    await expect(p1).rejects.toThrow('fallo simulado');
    await expect(p2).resolves.toBe(false);
    await expect(p3).resolves.toBe(true);
    await expect(p4).resolves.toBe(true);
    await expect(p5).resolves.toEqual(sesionDePrueba({ token: 'token-c', usuario: OTRO_USUARIO }));
  });
});

describe('aMarcaDeTiempo', () => {
  it('un número en segundos (menor que 1e12) se pasa a milisegundos', () => {
    expect(ts.aMarcaDeTiempo(1_700_000_000)).toBe(1_700_000_000_000);
    expect(ts.aMarcaDeTiempo(1)).toBe(1000);
    expect(ts.aMarcaDeTiempo(999_999_999_999)).toBe(999_999_999_999_000);
  });

  it('un número en milisegundos se queda igual', () => {
    expect(ts.aMarcaDeTiempo(1e12)).toBe(1e12);
    expect(ts.aMarcaDeTiempo(1_700_000_000_000)).toBe(1_700_000_000_000);
  });

  it('un texto ISO se convierte con Date.parse, aunque traiga espacios alrededor', () => {
    const iso = '2026-10-19T12:00:00.000Z';
    expect(ts.aMarcaDeTiempo(iso)).toBe(Date.parse(iso));
    expect(ts.aMarcaDeTiempo(`  ${iso}\n`)).toBe(Date.parse(iso));
  });

  it.each([
    ['0', 0],
    ['negativo', -5],
    ['negativo en ms', -1_700_000_000_000],
    ['NaN', Number.NaN],
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['texto vacío', ''],
    ['solo espacios', '   '],
    ['texto que no es fecha', 'mañana'],
    ['null', null],
    ['undefined', undefined],
    ['objeto', { fecha: '2026-10-19' }],
    ['Date', new Date('2026-10-19T00:00:00Z')],
    ['booleano true', true],
    ['booleano false', false],
  ])('%s devuelve undefined', (_nombre, valor) => {
    expect(ts.aMarcaDeTiempo(valor)).toBeUndefined();
  });
});

describe('datos dañados en SecureStore', () => {
  const base = { token: 'token-a', emitidoEn: 1000, usuario: USUARIO };

  it.each<[string, unknown]>([
    ['JSON inválido', '{no es json'],
    ['JSON que es texto', '"token-a"'],
    ['JSON que es número', '42'],
    ['JSON null', 'null'],
    ['JSON arreglo', JSON.stringify([base])],
    ['token vacío', { ...base, token: '' }],
    ['token que no es texto', { ...base, token: 123 }],
    ['sin token', { emitidoEn: 1000, usuario: USUARIO }],
    ['emitidoEn texto', { ...base, emitidoEn: '1000' }],
    ['emitidoEn 0', { ...base, emitidoEn: 0 }],
    ['emitidoEn negativo', { ...base, emitidoEn: -1 }],
    ['emitidoEn null (NaN o Infinity en JSON)', { ...base, emitidoEn: Number.NaN }],
    ['sin usuario', { token: 'token-a', emitidoEn: 1000 }],
    ['usuario null', { ...base, usuario: null }],
    ['usuario sin email', { ...base, usuario: { id: 'u-1', nombre: 'Clienta', rol: 'cliente' } }],
    ['usuario con id numérico', { ...base, usuario: { ...USUARIO, id: 1 } }],
    ['usuario sin rol', { ...base, usuario: { id: 'u-1', nombre: 'Clienta', email: 'c@test.local' } }],
    ['usuario sin nombre', { ...base, usuario: { id: 'u-1', email: 'c@test.local', rol: 'cliente' } }],
  ])('%s se trata como sin sesión', async (_nombre, valor) => {
    guardarCrudo(CLAVE_SESION, valor);
    expect(await ts.leerSesion()).toBeNull();
    expect(await ts.getToken()).toBeNull();
  });

  it('una sesión mínima sin opcionales es válida', async () => {
    guardarCrudo(CLAVE_SESION, base);
    expect(await ts.leerSesion()).toEqual(base);
  });

  it('el usuario se recorta a id, nombre, email y rol', async () => {
    guardarCrudo(CLAVE_SESION, { ...base, usuario: { ...USUARIO, password: 'no-se-guarda', extra: 1 } });
    expect((await ts.leerSesion())?.usuario).toEqual(USUARIO);
  });

  it('un refreshToken vacío o que no es texto se omite', async () => {
    guardarCrudo(CLAVE_SESION, { ...base, refreshToken: '' });
    expect(await ts.leerSesion()).toEqual(base);
    guardarCrudo(CLAVE_SESION, { ...base, refreshToken: 99 });
    expect(await ts.leerSesion()).not.toHaveProperty('refreshToken');
  });

  it.each<[string, unknown]>([
    ['texto', '2026-10-19'],
    ['0', 0],
    ['negativo', -10],
    ['null', null],
  ])('un refreshExpiraEn inválido (%s) se omite y la sesión sigue', async (_nombre, valor) => {
    guardarCrudo(CLAVE_SESION, { ...base, refreshToken: 'refresh-a', refreshExpiraEn: valor });
    expect(await ts.leerSesion()).toEqual({ ...base, refreshToken: 'refresh-a' });
  });

  it('getItemAsync que lanza al leer la sesión devuelve null y borra la entrada', async () => {
    guardarCrudo(CLAVE_SESION, sesionDePrueba());
    const original = ss.getItemAsync.getMockImplementation();
    ss.getItemAsync.mockImplementation((clave: string) =>
      clave === CLAVE_SESION ? Promise.reject(new Error('llave cambiada')) : Promise.resolve(ss.__almacen.get(clave) ?? null),
    );
    try {
      expect(await ts.leerSesion()).toBeNull();
    } finally {
      ss.getItemAsync.mockImplementation(original);
    }
    expect(ss.deleteItemAsync).toHaveBeenCalledWith(CLAVE_SESION);
    expect(ss.__almacen.has(CLAVE_SESION)).toBe(false);
  });

  it('si además el borrado falla, igual devuelve null sin lanzar', async () => {
    guardarCrudo(CLAVE_SESION, sesionDePrueba());
    const original = ss.getItemAsync.getMockImplementation();
    ss.getItemAsync.mockImplementation((clave: string) =>
      clave === CLAVE_SESION ? Promise.reject(new Error('llave cambiada')) : Promise.resolve(null),
    );
    ss.deleteItemAsync.mockRejectedValueOnce(new Error('fallo simulado'));
    try {
      await expect(ts.leerSesion()).resolves.toBeNull();
    } finally {
      ss.getItemAsync.mockImplementation(original);
    }
    expect(ss.__almacen.has(CLAVE_SESION)).toBe(true);
  });
});

describe('formato anterior', () => {
  it.each(CLAVES_ANTERIORES)('si existe %s, leerSesion devuelve null y borra todo', async (clave) => {
    guardarCrudo(clave, 'valor-viejo');
    guardarCrudo(CLAVE_SESION, sesionDePrueba());
    expect(await ts.leerSesion()).toBeNull();
    expect(ss.__almacen.size).toBe(0);
    const borradas = ss.deleteItemAsync.mock.calls.map(([c]) => c);
    expect(borradas).toEqual([CLAVE_SESION, ...CLAVES_ANTERIORES]);
  });

  it('se revisa una sola vez por carga del módulo', async () => {
    expect(await ts.leerSesion()).toBeNull();
    const lecturasAnteriores = () => ss.getItemAsync.mock.calls.filter(([c]) => CLAVES_ANTERIORES.includes(c)).length;
    expect(lecturasAnteriores()).toBe(3);

    // Una clave anterior que aparece después ya no se revisa: la sesión se lee normal.
    guardarCrudo('auth_token', 'valor-viejo');
    await iniciarSesion();
    expect(await ts.leerSesion()).toEqual(sesionDePrueba());
    expect(lecturasAnteriores()).toBe(3);
    expect(ss.__almacen.get('auth_token')).toBe('valor-viejo');
  });

  it('después de borrar el formato anterior no lo vuelve a revisar', async () => {
    guardarCrudo('auth_usuario', 'valor-viejo');
    expect(await ts.leerSesion()).toBeNull();
    await iniciarSesion();
    guardarCrudo('auth_usuario', 'valor-viejo');
    expect(await ts.leerSesion()).toEqual(sesionDePrueba());
  });

  it('al recargar el módulo se vuelve a revisar', async () => {
    expect(await ts.leerSesion()).toBeNull();
    const almacen = ss.__almacen;
    jest.resetModules();
    const recargado: TokenStorage = jest.requireActual<TokenStorage>('@/shared/api/tokenStorage');
    const ssNuevo = jest.requireMock<SecureStoreSimulado>('expo-secure-store');
    ssNuevo.__almacen.set('auth_token', 'valor-viejo');
    ssNuevo.__almacen.set(CLAVE_SESION, JSON.stringify(sesionDePrueba()));
    expect(await recargado.leerSesion()).toBeNull();
    expect(ssNuevo.__almacen.size).toBe(0);
    expect(almacen).not.toBe(ssNuevo.__almacen);
  });

  it('una clave anterior que no se puede leer no cuenta como formato anterior', async () => {
    guardarCrudo(CLAVE_SESION, sesionDePrueba());
    ss.getItemAsync.mockRejectedValueOnce(new Error('ilegible'));
    expect(await ts.leerSesion()).toEqual(sesionDePrueba());
  });

  it('si borrar la sesión del formato anterior falla, leerSesion se rechaza', async () => {
    guardarCrudo('auth_token', 'valor-viejo');
    ss.deleteItemAsync.mockRejectedValueOnce(new Error('fallo simulado'));
    await expect(ts.leerSesion()).rejects.toThrow('fallo simulado');
    // Ya no se vuelve a revisar: la siguiente lectura sigue normal aunque la clave siga ahí.
    expect(ss.__almacen.get('auth_token')).toBe('valor-viejo');
    expect(await ts.leerSesion()).toBeNull();
  });
});
