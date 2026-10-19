/// <reference types="jest" />

// Primero los mocks: tienen que quedar registrados antes de cargar expo-router/testing-library.
import '../../helpers/mocksPantallas';

import { fireEvent, screen, waitFor } from 'expo-router/testing-library';

import { abrirApp, cerrarIntroSiAparece, LIMITE_MS, prepararPruebasDePantalla } from '../../helpers/pantallas';
import { abrirPerfilConSesion } from '../../helpers/pantallasPerfil';
import { CLIENTA, PERFIL_COMPLETO, respuestaPerfil, simularServidorPerfil } from '../../helpers/perfilClienta';
import { sembrarSesion, sesionGuardada } from '../../helpers/sesionGuardada';
import { llamadasA, respuesta, type Llamada, type Manejador } from '../../helpers/servidorSimulado';

/**
 * GP-05.2: Editar perfil con las pantallas reales (renderRouter sobre src/app) y solo el servidor
 * simulado. Carga los datos y el perfil capilar de GET /api/auth/me, valida en pantalla, guarda con
 * PATCH /api/auth/me solo lo que cambió y Perfil muestra lo nuevo. Un error del servidor se explica
 * en español, nunca con el mensaje técnico.
 */

const FILA_EDITAR = 'Editar perfil, Nombre, teléfono, fecha de nacimiento y datos de tu cabello.';
const GUARDAR = 'Guardar cambios';
const ERROR_TELEFONO = 'Ingresa exactamente 10 dígitos (número mexicano, sin +52).';
const REVISA_CAMPOS = 'Revisa los campos marcados.';
const TRATAMIENTOS_SI = '¿Has tenido tratamientos químicos?: Sí';
const TRATAMIENTOS_NO = '¿Has tenido tratamientos químicos?: No';

/** /me y PATCH /me con memoria: lo que se guarda con PATCH es lo que devuelve el siguiente /me. */
function rutasQueGuardan(): Record<string, Manejador> {
  let perfil: Record<string, unknown> = { ...PERFIL_COMPLETO };
  return {
    'GET /api/auth/me': () => respuestaPerfil(perfil),
    'PATCH /api/auth/me': (cambios) => {
      perfil = { ...perfil, ...(cambios as Record<string, unknown>) };
      return respuesta({ success: true, message: 'Perfil actualizado correctamente', data: perfil });
    },
  };
}

/** Abre Editar perfil directamente, con la sesión de CLIENTA y el formulario ya cargado. */
async function abrirEditarPerfil(rutas: Record<string, Manejador>): Promise<Llamada[]> {
  await sembrarSesion(CLIENTA);
  const llamadas = simularServidorPerfil(rutas);
  const app = await abrirApp('/editar-perfil');
  await cerrarIntroSiAparece();
  expect(await screen.findByLabelText('Nombre completo')).toHaveDisplayValue(CLIENTA.nombre);
  expect(app.getPathname()).toBe('/editar-perfil');
  return llamadas;
}

function cambiosEnviados(llamadas: Llamada[]): unknown[] {
  return llamadasA(llamadas, 'PATCH', '/api/auth/me').map((llamada) => llamada.cuerpo);
}

describe('Editar perfil con las pantallas reales (GP-05.2)', () => {
  const esperarConsolaLimpia = prepararPruebasDePantalla();

  it(
    'desde Perfil edita datos y perfil capilar, guarda solo lo que cambió y Perfil muestra lo nuevo',
    async () => {
      const { app, llamadas } = await abrirPerfilConSesion(rutasQueGuardan());

      await fireEvent.press(screen.getByRole('button', { name: FILA_EDITAR }));
      await waitFor(() => expect(app.getPathname()).toBe('/editar-perfil'));

      // El formulario trae lo de /me: datos, correo fijo y perfil capilar.
      expect(await screen.findByLabelText('Nombre completo')).toHaveDisplayValue(CLIENTA.nombre);
      expect(screen.getByLabelText('Teléfono')).toHaveDisplayValue('7710000000');
      expect(screen.getByLabelText('Fecha de nacimiento')).toHaveDisplayValue('12/04/1995');
      expect(
        screen.getByLabelText(`Correo electrónico: ${CLIENTA.email}. El correo no se puede cambiar desde aquí.`),
      ).toBeOnTheScreen();
      expect(screen.getByRole('radio', { name: 'Tipo de cabello: Ondulado' })).toBeChecked();
      expect(screen.getByLabelText('Color natural')).toHaveDisplayValue('Castaño');
      expect(screen.getByLabelText('Color actual')).toHaveDisplayValue('Castaño claro');
      expect(screen.getByRole('radio', { name: TRATAMIENTOS_NO })).toBeChecked();
      expect(screen.queryByLabelText('Especifica los tratamientos')).not.toBeOnTheScreen();

      // Nombre, tipo de cabello y tratamientos químicos con su detalle.
      await fireEvent.changeText(screen.getByLabelText('Nombre completo'), 'Clienta Editada');
      await fireEvent.press(screen.getByRole('radio', { name: 'Tipo de cabello: Rizado' }));
      await fireEvent.press(screen.getByRole('radio', { name: TRATAMIENTOS_SI }));
      await fireEvent.changeText(await screen.findByLabelText('Especifica los tratamientos'), '  Alaciado ficticio ');
      expect(screen.getByRole('radio', { name: 'Tipo de cabello: Rizado' })).toBeChecked();

      await fireEvent.press(screen.getByRole('button', { name: GUARDAR }));

      // Regresa a Perfil con el aviso y el nombre nuevo.
      await waitFor(() => expect(app.getPathname()).toBe('/perfil'));
      expect(await screen.findByText('Tus cambios se guardaron.')).toBeOnTheScreen();
      expect(await screen.findByText('Clienta Editada')).toBeOnTheScreen();
      await waitFor(() => expect(sesionGuardada()?.usuario.nombre).toBe('Clienta Editada'));

      // Un solo PATCH, con el acceso de la sesión y solo lo que cambió (el detalle recortado).
      expect(cambiosEnviados(llamadas)).toEqual([
        { nombre: 'Clienta Editada', tipoCabello: 'rizado', tratamientosQuimicos: true, tratamientos: 'Alaciado ficticio' },
      ]);
      const patch = llamadasA(llamadas, 'PATCH', '/api/auth/me')[0];
      expect(patch.cabeceras.Authorization).toBe(`Bearer ${sesionGuardada()?.token}`);

      // Al volver a Editar perfil, el formulario trae lo guardado.
      await fireEvent.press(screen.getByRole('button', { name: FILA_EDITAR }));
      await waitFor(() => expect(app.getPathname()).toBe('/editar-perfil'));
      expect(await screen.findByLabelText('Nombre completo')).toHaveDisplayValue('Clienta Editada');
      expect(screen.getByRole('radio', { name: 'Tipo de cabello: Rizado' })).toBeChecked();
      expect(screen.getByRole('radio', { name: TRATAMIENTOS_SI })).toBeChecked();
      expect(screen.getByLabelText('Especifica los tratamientos')).toHaveDisplayValue('Alaciado ficticio');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'un teléfono inválido muestra el error en pantalla y no se guarda hasta corregirlo',
    async () => {
      const llamadas = await abrirEditarPerfil({});
      const telefono = screen.getByLabelText('Teléfono');

      // Al salir del campo se marca el error.
      await fireEvent.changeText(telefono, '12345');
      await fireEvent(telefono, 'blur');
      expect(await screen.findByText(ERROR_TELEFONO)).toBeOnTheScreen();

      // Guardar con el error no envía nada y lo explica.
      await fireEvent.press(screen.getByRole('button', { name: GUARDAR }));
      expect(await screen.findByText(REVISA_CAMPOS)).toBeOnTheScreen();
      expect(cambiosEnviados(llamadas)).toHaveLength(0);

      // Al corregirlo, el error se quita mientras escribe.
      await fireEvent.changeText(telefono, '7719998888');
      await waitFor(() => expect(screen.queryByText(ERROR_TELEFONO)).not.toBeOnTheScreen());
      expect(cambiosEnviados(llamadas)).toHaveLength(0);

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );

  it(
    'si el servidor falla, avisa en español sin el mensaje técnico y conserva lo escrito',
    async () => {
      let intentos = 0;
      const llamadas = await abrirEditarPerfil({
        'PATCH /api/auth/me': () => {
          intentos += 1;
          if (intentos === 1) {
            return respuesta(
              { statusCode: 500, message: 'PrismaClientKnownRequestError: fallo ficticio en usuario.update()' },
              500,
            );
          }
          // Segundo intento: sin conexión.
          throw new TypeError('Network request failed');
        },
      });

      await fireEvent.changeText(screen.getByLabelText('Color actual'), 'Rubio ficticio');
      await fireEvent.press(screen.getByRole('button', { name: GUARDAR }));

      expect(await screen.findByText('Ocurrió un problema en el servidor. Intenta de nuevo.')).toBeOnTheScreen();
      expect(screen.queryByText(/Prisma/)).not.toBeOnTheScreen();
      expect(cambiosEnviados(llamadas)).toEqual([{ colorActual: 'Rubio ficticio' }]);

      // Sigue en Editar perfil con lo escrito y puede reintentar.
      expect(screen.getByLabelText('Color actual')).toHaveDisplayValue('Rubio ficticio');
      expect(screen.getByRole('button', { name: GUARDAR })).toBeEnabled();

      await fireEvent.press(screen.getByRole('button', { name: GUARDAR }));
      expect(await screen.findByText('Sin conexión. Revisa tu internet e intenta de nuevo')).toBeOnTheScreen();
      expect(screen.queryByText(/Network request failed/)).not.toBeOnTheScreen();
      expect(cambiosEnviados(llamadas)).toHaveLength(2);
      expect(screen.getByLabelText('Color actual')).toHaveDisplayValue('Rubio ficticio');

      esperarConsolaLimpia();
    },
    LIMITE_MS,
  );
});
