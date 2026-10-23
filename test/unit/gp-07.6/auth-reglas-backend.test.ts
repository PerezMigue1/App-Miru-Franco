/// <reference types="jest" />

import {
  CODIGO_CUENTA_NO_ACTIVADA,
  esCuentaSinActivar,
  esTelefonoValido,
  normalizarTelefono,
  problemaDeClave,
  requisitosDeClave,
} from '@/features/auth/models/AuthModel';
import { obtenerPreguntasSeguridad } from '@/features/auth/models/authService';
import { ApiError } from '@/shared/api/apiClient';

import { respuesta, servidorConRutas } from '../../helpers/servidorSimulado';

/**
 * GP-07.6 Tarea 4, reglas de autenticación que deben coincidir con el backend (backend-miru):
 * - 403 de cuenta sin activar por su code CUENTA_NO_ACTIVADA (usuarios.service.ts), no por el texto.
 * - Contraseña: password.validator.ts (COMMON_PASSWORDS contenidas, KEYBOARD_SEQUENCES, letras y
 *   números consecutivos que suben con 890, repetición de 3, /[A-Z]/ y /[a-z]/ sin acentos).
 * - Teléfono: /^\d{10}$/ de create-usuario.dto.ts y update-usuario.dto.ts, sin la lada 52 o 521.
 * - Preguntas de seguridad: la forma real de GET /api/pregunta-seguridad.
 * fetch simulado en http://api.test y datos ficticios.
 */

describe('esCuentaSinActivar: por el code del backend', () => {
  it.each<[string, ApiError, boolean]>([
    ['403 con el code y el texto del backend', new ApiError(403, 'Tu cuenta no está activada. Revisa tu correo para activar tu cuenta.', CODIGO_CUENTA_NO_ACTIVADA), true],
    ['403 con el code y otro texto', new ApiError(403, 'Account not activated', CODIGO_CUENTA_NO_ACTIVADA), true],
    ['403 con el texto pero sin code', new ApiError(403, 'Tu cuenta no está activada. Revisa tu correo.'), false],
    ['403 de cuenta bloqueada', new ApiError(403, 'Cuenta bloqueada temporalmente por múltiples intentos fallidos.'), false],
    ['otro status con el code', new ApiError(400, 'x', CODIGO_CUENTA_NO_ACTIVADA), false],
  ])('%s: %p', (_caso, error, esperado) => {
    expect(esCuentaSinActivar(error)).toBe(esperado);
  });

  it('el code es el del backend', () => {
    expect(CODIGO_CUENTA_NO_ACTIVADA).toBe('CUENTA_NO_ACTIVADA');
  });
});

const COMUN = 'Esta contraseña es muy común, elige otra más segura';
const TECLADO = 'La contraseña no puede seguir patrones simples de teclado';
const NUMEROS = 'La contraseña no puede contener números consecutivos';
const MAYUSCULA = 'Debe incluir al menos una letra mayúscula';
const MINUSCULA = 'Debe incluir al menos una letra minúscula';

describe('problemaDeClave: la app rechaza lo que el backend rechaza', () => {
  it.each<[string, string, string]>([
    ['contiene una contraseña común (hello)', 'Hello#29xQ', COMUN],
    ['contiene una contraseña común (admin)', 'Admin#29xQ', COMUN],
    ['contiene una contraseña común (batman)', 'Batman#29x', COMUN],
    ['contiene una contraseña común (jordan)', 'Jordan#29x', COMUN],
    ['contiene una secuencia de teclado larga', 'Asdfghjkl#2', TECLADO],
    ['890 cuenta como números consecutivos', 'Clave#890x', NUMEROS],
    ['sin mayúscula sin acento (Ñ no cuenta)', 'Ñandú#29xq', MAYUSCULA],
    ['sin minúscula sin acento (ñ y á no cuentan)', 'RIZOS#29ñá', MINUSCULA],
  ])('%s', (_caso, clave, mensaje) => {
    expect(problemaDeClave(clave)).toBe(mensaje);
  });
});

describe('problemaDeClave: la app acepta lo que el backend acepta', () => {
  it.each<[string, string]>([
    ['números que bajan', 'Clave#321x'],
    ['654321 (no está en las secuencias del backend)', 'Clv#654321x'],
    ['901 (no está en los números consecutivos del backend)', 'Clave#901x'],
    ['una palabra que la web tenía como común y el backend no (ninja)', 'Ninja#29xQ'],
    ['una palabra que la web tenía como común y el backend no (root)', 'Root#29xQe'],
    ['con letras con acento además de las requeridas', 'Rizos#29xñÁ'],
  ])('%s', (_caso, clave) => {
    expect(problemaDeClave(clave)).toBeNull();
  });

  it('el requisito de mayúscula de la lista usa la misma regla (É no cuenta)', () => {
    const mayuscula = (clave: string) => requisitosDeClave(clave).find((r) => r.id === 'mayuscula')?.cumplido;
    expect(mayuscula('Élite#29x')).toBe(false);
    expect(mayuscula('Elite#29x')).toBe(true);
  });
});

describe('normalizarTelefono: como lo exige el backend', () => {
  it.each<[string, string]>([
    ['+52 771 268 1432', '7712681432'],
    ['521 771 268 1432', '7712681432'],
    ['52 (771) 268-1432', '7712681432'],
    ['771 268 1432', '7712681432'],
  ])('%p se envía como %p', (escrito, esperado) => {
    expect(normalizarTelefono(escrito)).toBe(esperado);
    expect(esTelefonoValido(normalizarTelefono(escrito))).toBe(true);
  });

  it.each(['771 268 14329', '77126814', '6 771 268 1432'])('%p no se recorta a otro número: no es válido', (escrito) => {
    expect(esTelefonoValido(normalizarTelefono(escrito))).toBe(false);
  });

  it('el teléfono en la regla de la contraseña también va sin lada', () => {
    expect(problemaDeClave('Xy#7712681432', { telefono: '+52 771 268 1432' })).toBe(
      'La contraseña no puede contener tu teléfono',
    );
  });
});

describe('obtenerPreguntasSeguridad: la forma real del backend', () => {
  const PREGUNTAS = [
    { id: 'pregunta-ficticia-1', pregunta: '¿Cuál es el nombre de tu mascota favorita?' },
    { id: 'pregunta-ficticia-2', pregunta: '¿En qué ciudad naciste?' },
  ];

  it('{ success, message, data, count } (pregunta-seguridad.service.ts) devuelve data', async () => {
    const llamadas = servidorConRutas({})({
      'GET /api/pregunta-seguridad': () =>
        respuesta({ success: true, message: 'Preguntas de seguridad disponibles', data: PREGUNTAS, count: 2 }),
    });
    await expect(obtenerPreguntasSeguridad()).resolves.toEqual(PREGUNTAS);
    expect(llamadas).toHaveLength(1);
    expect(llamadas[0].cabeceras).not.toHaveProperty('Authorization');
  });
});
