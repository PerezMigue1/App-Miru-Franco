/// <reference types="jest" />

import {
  BUSQUEDA_MAPA,
  diaDeLaSemana,
  diasInhabilesProximos,
  domicilio,
  enlaceCorreo,
  enlaceMapa,
  enlaceTelefono,
  enlaceWhatsApp,
  horaCorta,
  horarioDeLaSemana,
  MAXIMO_DIAS_INHABILES,
  NOMBRE_DIA,
} from '@/features/salon/models/salonModel';
import { RESPALDO_CONFIGURACION, type DiaInhabil } from '@/shared/api/configuracionPublica';

/**
 * GP-07.3: reglas puras de la pantalla El salón (src/features/salon/models/salonModel.ts): enlaces
 * de contacto, horario de la semana y próximos días sin servicio. Datos ficticios; sin red ni React.
 * Las fechas se arman en hora local (new Date(año, mes, día)).
 */

describe('enlaceTelefono', () => {
  it.each<[string, string]>([
    ['+52 771 268 1432', 'tel:+527712681432'],
    ['771 000 0000', 'tel:+527710000000'],
    ['(771) 000-0000', 'tel:+527710000000'],
    ['+1 555 000 0000 1', 'tel:+155500000001'],
  ])('%s llama a %s (10 dígitos llevan 52)', (telefono, esperado) => {
    expect(enlaceTelefono(telefono)).toBe(esperado);
  });

  it.each(['', '   ', '771 000', 'sin número'])('con menos de 10 dígitos (%p) no hay enlace', (telefono) => {
    expect(enlaceTelefono(telefono)).toBeNull();
  });
});

describe('enlaceWhatsApp', () => {
  it.each<[string, string]>([
    ['771 000 0000', 'https://wa.me/527710000000'],
    ['+52 1 771 000 0000', 'https://wa.me/5217710000000'],
    ['52-771-000-0000', 'https://wa.me/527710000000'],
  ])('%s abre %s con solo dígitos', (numero, esperado) => {
    expect(enlaceWhatsApp(numero)).toBe(esperado);
  });

  it.each(['', '12345'])('con menos de 10 dígitos (%p) no hay enlace', (numero) => {
    expect(enlaceWhatsApp(numero)).toBeNull();
  });
});

describe('enlaceCorreo', () => {
  it('un correo recortado va a mailto:', () => {
    expect(enlaceCorreo('  contacto@salon.test ')).toBe('mailto:contacto@salon.test');
  });

  it.each(['', '   ', 'sin-arroba', 'dos @ espacios.test', '@salon.test', 'contacto@'])(
    'algo que no es un correo (%p) no da enlace',
    (correo) => {
      expect(enlaceCorreo(correo)).toBeNull();
    },
  );
});

describe('domicilio y enlaceMapa', () => {
  const salon = { direccion: 'Calle Ficticia 10, Centro', ciudad: 'Ciudad de Prueba', mapaUrl: '' };

  it('domicilio junta dirección y ciudad y omite lo vacío', () => {
    expect(domicilio(salon)).toBe('Calle Ficticia 10, Centro, Ciudad de Prueba');
    expect(domicilio({ direccion: '', ciudad: ' Ciudad de Prueba ' })).toBe('Ciudad de Prueba');
    expect(domicilio({ direccion: '  ', ciudad: '' })).toBe('');
  });

  it('con mapaUrl https usa ese enlace', () => {
    expect(enlaceMapa({ ...salon, mapaUrl: ' https://maps.test/salon ' })).toBe('https://maps.test/salon');
  });

  it('sin mapaUrl y con dirección busca en Google Maps el domicilio codificado', () => {
    expect(enlaceMapa(salon)).toBe(
      `${BUSQUEDA_MAPA}${encodeURIComponent('Calle Ficticia 10, Centro, Ciudad de Prueba')}`,
    );
    expect(BUSQUEDA_MAPA).toBe('https://www.google.com/maps/search/?api=1&query=');
  });

  it('un mapaUrl que no es https no se abre: se usa la búsqueda', () => {
    expect(enlaceMapa({ ...salon, mapaUrl: 'http://maps.test/salon' })).toBe(
      `${BUSQUEDA_MAPA}${encodeURIComponent(domicilio(salon))}`,
    );
  });

  it('sin mapaUrl ni dirección no hay enlace aunque haya ciudad', () => {
    expect(enlaceMapa({ direccion: '', ciudad: 'Ciudad de Prueba', mapaUrl: '' })).toBeNull();
  });
});

describe('respaldo del salón sin red', () => {
  const salon = RESPALDO_CONFIGURACION.salon;

  // GP-07.5: el respaldo ya trae el mapa con las coordenadas del salón (antes venía vacío).
  const MAPA_SALON = 'https://www.google.com/maps/search/?api=1&query=21.144534,-98.4205943';

  it('trae los datos públicos de contacto que publica el salón y el mapa con sus coordenadas', () => {
    expect(salon).toEqual({
      nombre: 'Mirú Franco Salón Beauty',
      direccion: 'Segunda Cerrada de Allende No. 15, Col. Juárez',
      ciudad: 'Huejutla de Reyes, Hidalgo',
      telefono: '+52 771 268 1432',
      whatsapp: '+52 771 186 7645',
      mapaUrl: MAPA_SALON,
      correoContacto: 'contacto@mirufranco.com',
    });
  });

  it('con el respaldo, El salón arma llamada, WhatsApp, correo, domicilio y mapa', () => {
    expect(enlaceTelefono(salon.telefono)).toBe('tel:+527712681432');
    expect(enlaceWhatsApp(salon.whatsapp)).toBe('https://wa.me/527711867645');
    expect(enlaceCorreo(salon.correoContacto)).toBe('mailto:contacto@mirufranco.com');
    expect(domicilio(salon)).toBe('Segunda Cerrada de Allende No. 15, Col. Juárez, Huejutla de Reyes, Hidalgo');
    expect(enlaceMapa(salon)).toBe(MAPA_SALON);
  });
});

describe('horario', () => {
  it('horaCorta quita el cero de la hora', () => {
    expect(horaCorta('09:30')).toBe('9:30');
    expect(horaCorta('19:00')).toBe('19:00');
    expect(horaCorta('00:15')).toBe('0:15');
  });

  it('diaDeLaSemana usa el día local', () => {
    // 22 de octubre de 2026: jueves; 25: domingo.
    expect(diaDeLaSemana(new Date(2026, 9, 22))).toBe('jueves');
    expect(diaDeLaSemana(new Date(2026, 9, 25))).toBe('domingo');
  });

  it('los siete días del respaldo con nombre en español y acentos, horas cortas y hoy marcado', () => {
    const dias = horarioDeLaSemana(RESPALDO_CONFIGURACION.horario.dias, new Date(2026, 9, 21));
    expect(dias.map((dia) => dia.nombre)).toEqual([
      'Lunes',
      'Martes',
      'Miércoles',
      'Jueves',
      'Viernes',
      'Sábado',
      'Domingo',
    ]);
    expect(dias[0]).toEqual({ dia: 'lunes', nombre: 'Lunes', cerrado: false, abre: '9:30', cierra: '19:30', hoy: false });
    expect(dias[5]).toMatchObject({ nombre: 'Sábado', abre: '9:30', cierra: '19:00' });
    expect(dias[6]).toEqual({ dia: 'domingo', nombre: 'Domingo', cerrado: true, abre: '', cierra: '', hoy: false });
    // 21 de octubre de 2026 es miércoles: solo ese día es hoy.
    expect(dias.filter((dia) => dia.hoy).map((dia) => dia.dia)).toEqual(['miercoles']);
  });

  it('NOMBRE_DIA tiene los siete días', () => {
    expect(Object.keys(NOMBRE_DIA)).toHaveLength(7);
  });
});

describe('diasInhabilesProximos', () => {
  const HOY = new Date(2026, 9, 22, 18, 45);
  const dia = (fecha: string, motivo = `Motivo ficticio ${fecha}`): DiaInhabil => ({ fecha, motivo });

  it('deja los de hoy en adelante (fecha local), ordenados del más cercano al más lejano', () => {
    const lista = [dia('2026-12-25'), dia('2026-10-21'), dia('2026-10-22'), dia('2026-11-02'), dia('2025-12-31')];
    expect(diasInhabilesProximos(lista, HOY).map((d) => d.fecha)).toEqual(['2026-10-22', '2026-11-02', '2026-12-25']);
  });

  it(`muestra como máximo ${MAXIMO_DIAS_INHABILES}`, () => {
    const lista = Array.from({ length: 9 }, (_, i) => dia(`2026-11-${String(10 + i)}`)).reverse();
    const proximos = diasInhabilesProximos(lista, HOY);
    expect(proximos).toHaveLength(MAXIMO_DIAS_INHABILES);
    expect(proximos.map((d) => d.fecha)).toEqual([
      '2026-11-10',
      '2026-11-11',
      '2026-11-12',
      '2026-11-13',
      '2026-11-14',
      '2026-11-15',
    ]);
  });

  it('no cambia la lista original y sin días da []', () => {
    const lista = [dia('2026-12-01'), dia('2026-11-01')];
    diasInhabilesProximos(lista, HOY);
    expect(lista.map((d) => d.fecha)).toEqual(['2026-12-01', '2026-11-01']);
    expect(diasInhabilesProximos([], HOY)).toEqual([]);
  });
});
