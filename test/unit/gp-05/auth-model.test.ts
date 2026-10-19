/// <reference types="jest" />

import {
  AYUDA_TELEFONO,
  convertirFechaNacimiento,
  ERROR_CONSENTIMIENTO_SALUD,
  ERROR_TELEFONO,
  ErrorRolNoPermitido,
  esCodigoValido,
  esCorreoValido,
  esCuentaSinActivar,
  esErrorDeRed,
  estadoHttp,
  esTelefonoValido,
  MENSAJE_ERROR_SERVIDOR,
  MENSAJE_SIN_CONEXION,
  mensajeDelServidor,
  normalizarCorreo,
  normalizarTelefono,
  problemaDeAlergias,
  problemaDeClave,
  problemaDeConsentimiento,
  problemaDeCorreo,
  problemaDeNombre,
  problemaDeRespuesta,
  problemaDeTieneAlergias,
  problemaDeTieneTratamientos,
  problemaDeTratamientos,
  requiereConsentimiento,
  requisitosDeClave,
  ROL_CLIENTE,
  TIPOS_CABELLO,
  tieneFragmentosPeligrosos,
  urlAvisoPrivacidad,
  urlOlvidoContrasena,
  urlTerminos,
} from '@/features/auth/models/AuthModel';
import { ApiError, ErrorDeRed } from '@/shared/api/apiClient';

/**
 * GP-05: reglas del dominio de autenticación (src/features/auth/models/AuthModel.ts). Pruebas de caja
 * blanca de las validaciones (correo, teléfono, código, nombre, respuesta, contraseña), de la
 * conversión de errores para la clienta y de las URLs del sitio web. Son funciones puras: no hay
 * fetch ni SecureStore de por medio.
 */

/** Contraseña ficticia que cumple todas las reglas. */
const CLAVE_VALIDA = 'ClaveFicticia1!';

const MENSAJE_ESPECIAL = `Debe incluir al menos un carácter especial (!@#$%^&*()_+-=[]{}|;:'",.<>?/)`;

describe('constantes del dominio', () => {
  it('el único rol permitido es cliente', () => {
    expect(ROL_CLIENTE).toBe('cliente');
  });

  it('los tipos de cabello envían liso aunque la etiqueta diga Lacio', () => {
    expect(TIPOS_CABELLO).toEqual([
      { valor: 'liso', etiqueta: 'Lacio' },
      { valor: 'ondulado', etiqueta: 'Ondulado' },
      { valor: 'rizado', etiqueta: 'Rizado' },
    ]);
  });

  it('ErrorRolNoPermitido lleva su nombre y el mensaje para la clienta', () => {
    const error = new ErrorRolNoPermitido();
    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('ErrorRolNoPermitido');
    expect(error.message).toBe('Esta app es para clientas. Usa el sitio web');
  });

  it('los textos de ayuda del teléfono hablan de 10 dígitos sin +52', () => {
    expect(AYUDA_TELEFONO).toContain('10 dígitos');
    expect(ERROR_TELEFONO).toContain('sin +52');
  });
});

describe('correo', () => {
  it.each([
    'clienta@ejemplo.test',
    'a@b.c',
    '  clienta@ejemplo.test  ',
    'Clienta.Ficticia+1@sub.ejemplo.test',
  ])('acepta %p', (correo) => {
    expect(esCorreoValido(correo)).toBe(true);
  });

  it.each([
    ['vacío', ''],
    ['con espacio en medio', 'clienta @ejemplo.test'],
    ['sin arroba', 'clienta.ejemplo.test'],
    ['con dos arrobas', 'clienta@otra@ejemplo.test'],
    ['sin usuario', '@ejemplo.test'],
    ['sin dominio', 'clienta@'],
    ['dominio sin punto', 'clienta@ejemplo'],
    ['dominio que empieza con punto', 'clienta@.test'],
    ['dominio que termina con punto', 'clienta@ejemplo.'],
  ])('rechaza un correo %s', (_caso, correo) => {
    expect(esCorreoValido(correo)).toBe(false);
  });

  it('normaliza quitando espacios y pasando a minúsculas', () => {
    expect(normalizarCorreo('  Clienta@Ejemplo.TEST  ')).toBe('clienta@ejemplo.test');
  });

  it('problemaDeCorreo distingue vacío, inválido y válido', () => {
    expect(problemaDeCorreo('')).toBe('El correo electrónico es requerido');
    expect(problemaDeCorreo('   ')).toBe('El correo electrónico es requerido');
    expect(problemaDeCorreo('clienta')).toBe('El correo electrónico no es válido');
    expect(problemaDeCorreo('clienta@ejemplo.test')).toBeNull();
  });
});

describe('teléfono', () => {
  it('normaliza dejando solo dígitos, hasta 10', () => {
    expect(normalizarTelefono('(771) 123-4567')).toBe('7711234567');
    expect(normalizarTelefono('77112345678999')).toBe('7711234567');
    expect(normalizarTelefono('')).toBe('');
  });

  it('con +52 no quita la lada: corta los primeros 10 dígitos', () => {
    // La lada se quita en otro lado (telefonoSinLada); aquí solo se toman los primeros 10 dígitos.
    expect(normalizarTelefono('+52 771 123 4567')).toBe('5277112345');
  });

  it.each(['7711234567', '771 123 4567', '771-123-4567'])('acepta %p', (telefono) => {
    expect(esTelefonoValido(telefono)).toBe(true);
  });

  it.each([
    ['que empieza con 0', '0711234567'],
    ['de 9 dígitos', '771123456'],
    ['de 11 dígitos', '77112345678'],
    ['con +52', '+52 7711234567'],
    ['vacío', ''],
  ])('rechaza un teléfono %s', (_caso, telefono) => {
    expect(esTelefonoValido(telefono)).toBe(false);
  });
});

describe('código de verificación', () => {
  it('acepta exactamente 6 dígitos', () => {
    expect(esCodigoValido('123456')).toBe(true);
    expect(esCodigoValido('000000')).toBe(true);
  });

  it.each([
    ['vacío', ''],
    ['de 5 dígitos', '12345'],
    ['de 7 dígitos', '1234567'],
    ['con una letra', '12345a'],
    ['con un espacio', ' 12345'],
    ['con guion', '123-45'],
  ])('rechaza un código %s', (_caso, codigo) => {
    expect(esCodigoValido(codigo)).toBe(false);
  });
});

describe('fragmentos peligrosos', () => {
  it.each([
    '<script',
    '</script>',
    '<iframe',
    '<img',
    'onerror',
    'onload',
    'onclick',
    'onmouseover',
    'javascript:',
    '<svg',
    '<style',
    '<link',
    '<meta',
    '<object',
    '<embed',
  ])('detecta %p dentro de un texto', (fragmento) => {
    expect(tieneFragmentosPeligrosos(`texto ${fragmento} texto`)).toBe(true);
  });

  it('no distingue mayúsculas', () => {
    expect(tieneFragmentosPeligrosos('<SCRIPT>alert(1)</SCRIPT>')).toBe(true);
    expect(tieneFragmentosPeligrosos('JavaScript:void(0)')).toBe(true);
  });

  it('un texto normal con acentos y signos no es peligroso', () => {
    expect(tieneFragmentosPeligrosos('María José Pérez Ñuñez')).toBe(false);
    expect(tieneFragmentosPeligrosos('Me gustan mis rizos <3 & el corte')).toBe(false);
    expect(tieneFragmentosPeligrosos('')).toBe(false);
  });
});

describe('nombre y respuesta de seguridad', () => {
  it('problemaDeNombre: requerido, peligroso, corto y válido', () => {
    expect(problemaDeNombre('')).toBe('El nombre completo es requerido');
    expect(problemaDeNombre('   ')).toBe('El nombre completo es requerido');
    expect(problemaDeNombre('<script>Ana')).toBe(
      'El nombre no puede contener caracteres especiales peligrosos',
    );
    expect(problemaDeNombre('A')).toBe('El nombre debe tener al menos 2 caracteres');
    expect(problemaDeNombre('  A  ')).toBe('El nombre debe tener al menos 2 caracteres');
    expect(problemaDeNombre('Al')).toBeNull();
    expect(problemaDeNombre('Clienta de Prueba')).toBeNull();
  });

  it('problemaDeNombre revisa lo peligroso antes que el largo', () => {
    expect(problemaDeNombre('<img')).toBe('El nombre no puede contener caracteres especiales peligrosos');
  });

  it('problemaDeRespuesta: requerida, peligrosa, corta y válida', () => {
    expect(problemaDeRespuesta('')).toBe('La respuesta a la pregunta de seguridad es requerida');
    expect(problemaDeRespuesta('  ')).toBe('La respuesta a la pregunta de seguridad es requerida');
    expect(problemaDeRespuesta('onerror=x')).toBe(
      'La respuesta no puede contener caracteres especiales peligrosos',
    );
    expect(problemaDeRespuesta(' x ')).toBe('La respuesta debe tener al menos 2 caracteres');
    expect(problemaDeRespuesta('Perla')).toBeNull();
  });
});

describe('problemaDeClave: reglas básicas en orden', () => {
  it('una contraseña que cumple todo devuelve null', () => {
    expect(problemaDeClave(CLAVE_VALIDA)).toBeNull();
  });

  it.each([
    ['vacía', '', 'La contraseña debe tener al menos 8 caracteres'],
    ['de 7 caracteres', 'Ab1!xyq', 'La contraseña debe tener al menos 8 caracteres'],
    ['sin mayúscula', 'clave#9x', 'Debe incluir al menos una letra mayúscula'],
    ['sin minúscula', 'CLAVE#9X', 'Debe incluir al menos una letra minúscula'],
    ['sin número', 'Clave#Ficta', 'Debe incluir al menos un número'],
    ['sin carácter especial', 'ClaveFicta9', MENSAJE_ESPECIAL],
    ['con un símbolo que no está en la lista', 'ClaveFicta9~', MENSAJE_ESPECIAL],
  ])('%s', (_caso, clave, mensaje) => {
    expect(problemaDeClave(clave)).toBe(mensaje);
  });

  it('las letras con acento cuentan como mayúscula y minúscula', () => {
    expect(problemaDeClave('ÉSTA#CLAVE9')).toBe('Debe incluir al menos una letra minúscula');
    expect(problemaDeClave('Ésta#clave9')).toBeNull();
  });

  it('solo números o solo letras se reportan antes por la regla de mayúscula o de número', () => {
    // Las reglas "solo números" y "solo letras" nunca llegan a ser la primera que falla.
    expect(problemaDeClave('98765430')).toBe('Debe incluir al menos una letra mayúscula');
    expect(problemaDeClave('Claveficta')).toBe('Debe incluir al menos un número');
  });

  it('una contraseña común se reporta antes por otra regla', () => {
    expect(problemaDeClave('password')).toBe('Debe incluir al menos una letra mayúscula');
    expect(problemaDeClave('Password1')).toBe(MENSAJE_ESPECIAL);
  });
});

describe('problemaDeClave: datos personales', () => {
  it('rechaza el nombre completo (sin importar mayúsculas)', () => {
    expect(problemaDeClave('Ana#Clave9z', { nombre: ' ANA ' })).toBe(
      'La contraseña no puede contener tu nombre',
    );
  });

  it('compara el nombre completo, no cada palabra', () => {
    expect(problemaDeClave('Ana#Clave9z', { nombre: 'Ana Pérez' })).toBeNull();
  });

  it('un dato de menos de 3 caracteres no se compara', () => {
    expect(problemaDeClave('Al#Clave9z', { nombre: 'Al' })).toBeNull();
  });

  it('rechaza el usuario del correo', () => {
    expect(problemaDeClave('Mar#Clave9z', { email: '  MAR@ejemplo.test' })).toBe(
      'La contraseña no puede contener tu email',
    );
  });

  it('no compara el dominio del correo', () => {
    expect(problemaDeClave('Ejemplo#Clv9', { email: 'mar@ejemplo.test' })).toBeNull();
  });

  it('rechaza el teléfono normalizado', () => {
    expect(problemaDeClave('Xy#7711234560', { telefono: '771 123 4560' })).toBe(
      'La contraseña no puede contener tu teléfono',
    );
  });

  it('rechaza el año de nacimiento', () => {
    expect(problemaDeClave('Clave#1995x', { fechaNacimiento: '1995-04-27' })).toBe(
      'La contraseña no puede contener tu fecha de nacimiento',
    );
  });

  it('el día de nacimiento (2 caracteres) nunca se compara', () => {
    expect(problemaDeClave('Clave#27xz', { fechaNacimiento: '1995-04-27' })).toBeNull();
  });

  it('rechaza la respuesta de seguridad recortada', () => {
    expect(problemaDeClave('Perla#Clave9', { respuesta: '  Perla  ' })).toBe(
      'La contraseña no puede contener la respuesta de tu pregunta de seguridad',
    );
  });

  it('sin datos personales (valor por defecto) no falla por ellos', () => {
    expect(problemaDeClave('Perla#Clave9')).toBeNull();
  });

  it('el nombre se revisa antes que el correo', () => {
    expect(problemaDeClave('Mar#Ana#Clv9', { nombre: 'Ana', email: 'mar@ejemplo.test' })).toBe(
      'La contraseña no puede contener tu nombre',
    );
  });
});

describe('problemaDeClave: patrones', () => {
  it.each([
    ['patrón de teclado', 'Qwerty#Clv9', 'La contraseña no puede seguir patrones simples de teclado'],
    ['patrón de teclado numérico', 'Clv#654321x', 'La contraseña no puede seguir patrones simples de teclado'],
    ['letras consecutivas', 'Abc#Clave9z', 'La contraseña no puede contener letras consecutivas'],
    ['letras consecutivas con mayúsculas mezcladas', 'Clave#XyZ9', 'La contraseña no puede contener letras consecutivas'],
    ['números consecutivos que suben', 'Clave#123x', 'La contraseña no puede contener números consecutivos'],
    ['números consecutivos que bajan', 'Clave#321x', 'La contraseña no puede contener números consecutivos'],
    ['carácter repetido 3 veces', 'Claaave#9x', 'La contraseña no puede tener el mismo carácter repetido 3 o más veces'],
    ['dígito repetido 3 veces', 'Clave#999x', 'La contraseña no puede tener el mismo carácter repetido 3 o más veces'],
  ])('rechaza %s', (_caso, clave, mensaje) => {
    expect(problemaDeClave(clave)).toBe(mensaje);
  });

  it('letras que bajan no cuentan como consecutivas', () => {
    expect(problemaDeClave('Cba#Clave9z')).toBeNull();
  });

  it('dos caracteres repetidos o dos números seguidos sí se permiten', () => {
    expect(problemaDeClave('Claave#12x')).toBeNull();
  });
});

describe('requisitosDeClave', () => {
  it('sin texto, ninguno se cumple y vienen en orden', () => {
    expect(requisitosDeClave('')).toEqual([
      { id: 'largo', etiqueta: 'Al menos 8 caracteres', cumplido: false },
      { id: 'mayuscula', etiqueta: 'Una letra mayúscula', cumplido: false },
      { id: 'minuscula', etiqueta: 'Una letra minúscula', cumplido: false },
      { id: 'numero', etiqueta: 'Un número', cumplido: false },
      { id: 'especial', etiqueta: 'Un carácter especial', cumplido: false },
    ]);
  });

  it('marca cada requisito por separado', () => {
    const cumplidos = (clave: string) =>
      requisitosDeClave(clave)
        .filter((requisito) => requisito.cumplido)
        .map((requisito) => requisito.id);
    expect(cumplidos('abc')).toEqual(['minuscula']);
    expect(cumplidos('ABC')).toEqual(['mayuscula']);
    expect(cumplidos('12345678')).toEqual(['largo', 'numero']);
    expect(cumplidos('#')).toEqual(['especial']);
    expect(cumplidos(CLAVE_VALIDA)).toEqual(['largo', 'mayuscula', 'minuscula', 'numero', 'especial']);
  });

  it('cumplir todo no revisa datos personales ni patrones (eso lo hace problemaDeClave)', () => {
    expect(requisitosDeClave('Abc#1234').every((requisito) => requisito.cumplido)).toBe(true);
    expect(problemaDeClave('Abc#1234')).not.toBeNull();
  });
});

describe('conversión de errores', () => {
  it('esErrorDeRed solo con ErrorDeRed', () => {
    expect(esErrorDeRed(new ErrorDeRed())).toBe(true);
    expect(esErrorDeRed(new ApiError(500, 'Falla'))).toBe(false);
    expect(esErrorDeRed(new Error('Sin conexión con el servidor.'))).toBe(false);
    expect(esErrorDeRed(null)).toBe(false);
    expect(esErrorDeRed('red')).toBe(false);
  });

  it('estadoHttp devuelve el status de un ApiError o null', () => {
    expect(estadoHttp(new ApiError(429, 'Demasiadas solicitudes'))).toBe(429);
    expect(estadoHttp(new ApiError(401, 'No autorizado'))).toBe(401);
    expect(estadoHttp(new ErrorDeRed())).toBeNull();
    expect(estadoHttp(new Error('x'))).toBeNull();
    expect(estadoHttp(undefined)).toBeNull();
  });

  it.each([
    'Tu cuenta no está activada',
    'TU CUENTA NO ESTÁ ACTIVADA',
    'Debes activar tu cuenta con el código del correo',
  ])('esCuentaSinActivar: 403 con %p', (mensaje) => {
    expect(esCuentaSinActivar(new ApiError(403, mensaje))).toBe(true);
  });

  it('esCuentaSinActivar: otro status, otro mensaje u otro error no cuentan', () => {
    expect(esCuentaSinActivar(new ApiError(401, 'Tu cuenta no está activada'))).toBe(false);
    expect(esCuentaSinActivar(new ApiError(403, 'Acceso denegado'))).toBe(false);
    expect(esCuentaSinActivar(new Error('Tu cuenta no está activada'))).toBe(false);
    expect(esCuentaSinActivar(new ErrorDeRed())).toBe(false);
    expect(esCuentaSinActivar(null)).toBe(false);
  });

  it('mensajeDelServidor usa el mensaje de un 4xx', () => {
    expect(mensajeDelServidor(new ApiError(409, 'El correo ya está registrado'), 'Genérico')).toBe(
      'El correo ya está registrado',
    );
    expect(mensajeDelServidor(new ApiError(429, 'Demasiadas solicitudes'), 'Genérico')).toBe(
      'Demasiadas solicitudes',
    );
  });

  it('mensajeDelServidor usa el genérico si el 4xx no trae mensaje', () => {
    expect(mensajeDelServidor(new ApiError(400, ''), 'Genérico')).toBe('Genérico');
  });

  it('mensajeDelServidor nunca muestra el texto de un 5xx', () => {
    const interno = 'PrismaClientKnownRequestError en usuarios.service.ts:42';
    expect(mensajeDelServidor(new ApiError(500, interno), 'Genérico')).toBe(MENSAJE_ERROR_SERVIDOR);
    expect(mensajeDelServidor(new ApiError(503, interno), 'Genérico')).toBe(MENSAJE_ERROR_SERVIDOR);
  });

  it('mensajeDelServidor usa el genérico con errores que no son ApiError', () => {
    expect(mensajeDelServidor(new ErrorDeRed(), 'Genérico')).toBe('Genérico');
    expect(mensajeDelServidor(new Error('detalle técnico'), 'Genérico')).toBe('Genérico');
    expect(mensajeDelServidor(undefined, 'Genérico')).toBe('Genérico');
  });

  it('los mensajes fijos son para la clienta, sin detalles técnicos', () => {
    expect(MENSAJE_SIN_CONEXION).toBe('Sin conexión. Revisa tu internet e intenta de nuevo');
    expect(MENSAJE_ERROR_SERVIDOR).toBe('Ocurrió un problema en el servidor. Intenta de nuevo.');
  });
});

describe('URLs del sitio web', () => {
  const webOriginal = process.env.EXPO_PUBLIC_WEB_URL;

  afterEach(() => {
    process.env.EXPO_PUBLIC_WEB_URL = webOriginal;
  });

  it('arma cada página con la URL de prueba', () => {
    expect(urlAvisoPrivacidad()).toBe('http://web.test/aviso-de-privacidad');
    expect(urlTerminos()).toBe('http://web.test/terminos-y-condiciones');
    expect(urlOlvidoContrasena()).toBe('http://web.test/forgot-password');
  });

  it('quita espacios y diagonales finales de la base', () => {
    process.env.EXPO_PUBLIC_WEB_URL = '  https://www.ejemplo.test///  ';
    expect(urlAvisoPrivacidad()).toBe('https://www.ejemplo.test/aviso-de-privacidad');
  });

  it('devuelve null si falta la variable o está vacía', () => {
    delete process.env.EXPO_PUBLIC_WEB_URL;
    expect(urlTerminos()).toBeNull();
    process.env.EXPO_PUBLIC_WEB_URL = '   ';
    expect(urlTerminos()).toBeNull();
  });

  it('devuelve null con un esquema no permitido', () => {
    process.env.EXPO_PUBLIC_WEB_URL = 'javascript:alert(1)';
    expect(urlOlvidoContrasena()).toBeNull();
    process.env.EXPO_PUBLIC_WEB_URL = 'ftp://www.ejemplo.test';
    expect(urlOlvidoContrasena()).toBeNull();
  });

  it('fuera de desarrollo solo acepta https', () => {
    const global = globalThis as unknown as { __DEV__: boolean };
    const devOriginal = global.__DEV__;
    try {
      global.__DEV__ = false;
      expect(urlAvisoPrivacidad()).toBeNull();
      process.env.EXPO_PUBLIC_WEB_URL = 'https://www.ejemplo.test';
      expect(urlAvisoPrivacidad()).toBe('https://www.ejemplo.test/aviso-de-privacidad');
    } finally {
      global.__DEV__ = devOriginal;
    }
  });
});

describe('fecha de nacimiento', () => {
  /** 19 de octubre de 2026, hora local. */
  const HOY = new Date(2026, 9, 19, 12, 0, 0);

  it('convierte DD/MM/AAAA a AAAA-MM-DD', () => {
    expect(convertirFechaNacimiento('27/04/1995', HOY)).toEqual({ fecha: '1995-04-27' });
  });

  it.each([
    ['vacía', '', 'La fecha de nacimiento es requerida'],
    ['con otro formato', '1995-04-27', 'Escribe la fecha como DD/MM/AAAA'],
    ['con el día de un dígito', '7/04/1995', 'Escribe la fecha como DD/MM/AAAA'],
    ['con el año de dos dígitos', '27/04/95', 'Escribe la fecha como DD/MM/AAAA'],
    ['que no existe', '31/02/2000', 'Escribe una fecha que exista'],
    ['con letras', 'aa/bb/cccc', 'Escribe una fecha que exista'],
    ['futura', '20/10/2026', 'La fecha de nacimiento no puede ser futura'],
    ['de una menor de edad', '20/10/2008', 'Debes ser mayor de 18 años'],
  ])('rechaza una fecha %s', (_caso, texto, problema) => {
    expect(convertirFechaNacimiento(texto, HOY)).toEqual({ problema });
  });

  it('acepta a quien cumple 18 años hoy', () => {
    expect(convertirFechaNacimiento('19/10/2008', HOY)).toEqual({ fecha: '2008-10-19' });
  });

  it('un 29 de febrero de hoy usa el 28 en un año no bisiesto', () => {
    const bisiesto = new Date(2028, 1, 29, 12, 0, 0);
    expect(convertirFechaNacimiento('28/02/2010', bisiesto)).toEqual({ fecha: '2010-02-28' });
    expect(convertirFechaNacimiento('01/03/2010', bisiesto)).toEqual({
      problema: 'Debes ser mayor de 18 años',
    });
  });
});

describe('perfil capilar del registro', () => {
  it('pide indicar si tiene alergias y si tuvo tratamientos', () => {
    expect(problemaDeTieneAlergias(null)).toBe('Debes indicar si tienes alergias a productos');
    expect(problemaDeTieneAlergias(false)).toBeNull();
    expect(problemaDeTieneTratamientos(null)).toBe(
      'Debes indicar si has tenido tratamientos químicos previos',
    );
    expect(problemaDeTieneTratamientos(true)).toBeNull();
  });

  it('las alergias solo se piden si dijo que sí', () => {
    expect(problemaDeAlergias(false, '')).toBeNull();
    expect(problemaDeAlergias(null, '')).toBeNull();
    expect(problemaDeAlergias(true, '  ')).toBe('Especifica tus alergias');
    expect(problemaDeAlergias(true, '<script>')).toBe(
      'Las alergias no pueden contener caracteres especiales peligrosos',
    );
    expect(problemaDeAlergias(true, 'Amoniaco')).toBeNull();
  });

  it('los tratamientos solo se piden si dijo que sí', () => {
    expect(problemaDeTratamientos(false, '')).toBeNull();
    expect(problemaDeTratamientos(true, '')).toBe('Especifica los tratamientos');
    expect(problemaDeTratamientos(true, 'onload')).toBe(
      'Los tratamientos no pueden contener caracteres especiales peligrosos',
    );
    expect(problemaDeTratamientos(true, 'Alaciado')).toBeNull();
  });

  it('el consentimiento de datos de salud solo se exige con texto de alergias', () => {
    expect(requiereConsentimiento(true, 'Amoniaco')).toBe(true);
    expect(requiereConsentimiento(true, '   ')).toBe(false);
    expect(requiereConsentimiento(false, 'Amoniaco')).toBe(false);
    expect(problemaDeConsentimiento(true, 'Amoniaco', false)).toBe(ERROR_CONSENTIMIENTO_SALUD);
    expect(problemaDeConsentimiento(true, 'Amoniaco', true)).toBeNull();
    expect(problemaDeConsentimiento(false, 'Amoniaco', false)).toBeNull();
  });
});
