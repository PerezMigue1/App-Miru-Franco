/// <reference types="jest" />

import { actualizarPerfil, obtenerPerfil, obtenerPerfilCompleto } from '@/features/auth/models/authService';
import { invalidarPerfil, leerPerfil, olvidarPerfilReciente } from '@/features/auth/models/perfilCompartido';
import { avisarCierreSesion, type MotivoCierreSesion } from '@/shared/api/eventosSesion';
import { nuevaGeneracion } from '@/shared/api/tokenStorage';

import { CLIENTA, PERFIL_COMPLETO, respuestaPerfil } from '../../helpers/perfilClienta';
import { llamadasA, respuesta, servidorConRutas, type Llamada } from '../../helpers/servidorSimulado';
import { sembrarSesion } from '../../helpers/sesionGuardada';

/**
 * GP-07.6 Tarea 4, Repository del perfil (features/auth/models/perfilCompartido.ts): GET
 * /api/auth/me compartido para que al entrar salga una sola petición (useAuth valida la sesión y la
 * cabecera toma esa misma respuesta). Caja blanca del modelo con fetch simulado en http://api.test
 * y la sesión ficticia sembrada en SecureStore simulado.
 */

const servidor = servidorConRutas({});

function rutas(contador: { veces: number }) {
  return servidor({
    'GET /api/auth/me': () => {
      contador.veces += 1;
      return respuestaPerfil({ ...PERFIL_COMPLETO, nombre: `Lectura ${contador.veces}` });
    },
    'PATCH /api/auth/me': () => respuesta({ success: true }),
  });
}

const pedidasMe = (llamadas: Llamada[]) => llamadasA(llamadas, 'GET', '/api/auth/me');
const nombreDe = (valor: unknown) => (valor as { data: { nombre: string } }).data.nombre;

beforeEach(async () => {
  invalidarPerfil();
  await sembrarSesion(CLIENTA);
});

describe('perfilCompartido', () => {
  it('dos lecturas a la vez comparten una sola petición', async () => {
    const llamadas = rutas({ veces: 0 });
    const [a, b] = await Promise.all([obtenerPerfil(), obtenerPerfilCompleto()]);
    expect(pedidasMe(llamadas)).toHaveLength(1);
    expect(a).toBe(b);
  });

  it('la de useAuth (guardar) queda para la cabecera (reciente) una sola vez', async () => {
    const llamadas = rutas({ veces: 0 });
    const deSesion = await obtenerPerfil();
    const deCabecera = await obtenerPerfilCompleto({ reciente: true });
    expect(deCabecera).toBe(deSesion);
    expect(pedidasMe(llamadas)).toHaveLength(1);

    // Ya se tomó: otra lectura que la aceptaba va a la red.
    expect(nombreDe(await obtenerPerfilCompleto({ reciente: true }))).toBe('Lectura 2');
    expect(pedidasMe(llamadas)).toHaveLength(2);
  });

  it('las demás lecturas no usan la reciente: siempre van a la red', async () => {
    const llamadas = rutas({ veces: 0 });
    await obtenerPerfil();
    expect(nombreDe(await obtenerPerfilCompleto())).toBe('Lectura 2');
    expect(pedidasMe(llamadas)).toHaveLength(2);
  });

  it('una lectura sin guardar no deja nada para la cabecera', async () => {
    const llamadas = rutas({ veces: 0 });
    await obtenerPerfilCompleto();
    await obtenerPerfilCompleto({ reciente: true });
    expect(pedidasMe(llamadas)).toHaveLength(2);
  });

  it('si la cabecera se unió a la petición en vuelo, la respuesta no se guarda otra vez', async () => {
    const llamadas = rutas({ veces: 0 });
    await Promise.all([obtenerPerfil(), obtenerPerfilCompleto({ reciente: true })]);
    await obtenerPerfilCompleto({ reciente: true });
    expect(pedidasMe(llamadas)).toHaveLength(2);
  });

  it('quien guarda y se une a una lectura en vuelo también la ofrece', async () => {
    const llamadas = rutas({ veces: 0 });
    const enVuelo = obtenerPerfilCompleto();
    await obtenerPerfil();
    await enVuelo;
    expect(nombreDe(await obtenerPerfilCompleto({ reciente: true }))).toBe('Lectura 1');
    expect(pedidasMe(llamadas)).toHaveLength(1);
  });

  it('otra generación de sesión no comparte la petición en vuelo ni la reciente', async () => {
    const llamadas = rutas({ veces: 0 });
    const anterior = obtenerPerfil();
    nuevaGeneracion();
    const nueva = obtenerPerfilCompleto({ reciente: true });
    expect(nombreDe(await anterior)).toBe('Lectura 1');
    expect(nombreDe(await nueva)).toBe('Lectura 2');
    expect(pedidasMe(llamadas)).toHaveLength(2);

    await obtenerPerfil();
    nuevaGeneracion();
    await obtenerPerfilCompleto({ reciente: true });
    expect(pedidasMe(llamadas)).toHaveLength(4);
  });

  it.each<MotivoCierreSesion>(['salida', 'vencida', 'cambioContrasena'])('el cierre de sesión (%s) lo olvida', async (motivo) => {
    const llamadas = rutas({ veces: 0 });
    await obtenerPerfil();
    avisarCierreSesion(motivo);
    await obtenerPerfilCompleto({ reciente: true });
    expect(pedidasMe(llamadas)).toHaveLength(2);
  });

  it('guardar cambios del perfil lo olvida (la siguiente lectura trae lo guardado)', async () => {
    const llamadas = rutas({ veces: 0 });
    await obtenerPerfil();
    await actualizarPerfil({ foto: null });
    await obtenerPerfilCompleto({ reciente: true });
    expect(pedidasMe(llamadas)).toHaveLength(2);
  });

  it('al empezar a restaurar una sesión se olvida la reciente', async () => {
    const llamadas = rutas({ veces: 0 });
    await obtenerPerfil();
    olvidarPerfilReciente();
    await obtenerPerfilCompleto({ reciente: true });
    expect(pedidasMe(llamadas)).toHaveLength(2);
  });

  it('un error llega a todas las que esperaban y libera la petición', async () => {
    let veces = 0;
    const llamadas = servidor({
      'GET /api/auth/me': () => {
        veces += 1;
        return veces === 1 ? respuesta({ message: 'Error interno' }, 500) : respuestaPerfil();
      },
    });
    const resultados = await Promise.allSettled([leerPerfil({ guardar: true }), leerPerfil({ reciente: true })]);
    expect(resultados.map((r) => r.status)).toEqual(['rejected', 'rejected']);
    await expect(leerPerfil({ reciente: true })).resolves.toEqual({ data: PERFIL_COMPLETO });
    expect(pedidasMe(llamadas)).toHaveLength(2);
  });

  it('una petición olvidada (invalidar) ya no se reparte ni deja reciente', async () => {
    const llamadas = rutas({ veces: 0 });
    const vieja = obtenerPerfil();
    invalidarPerfil();
    const nueva = obtenerPerfilCompleto();
    expect(nombreDe(await vieja)).toBe('Lectura 1');
    expect(nombreDe(await nueva)).toBe('Lectura 2');
    await obtenerPerfilCompleto({ reciente: true });
    expect(pedidasMe(llamadas)).toHaveLength(3);
  });
});
