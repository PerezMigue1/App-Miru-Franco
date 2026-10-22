/// <reference types="jest" />

import * as SecureStore from 'expo-secure-store';
import { act, fireEvent, screen, waitFor } from 'expo-router/testing-library';
import type { TestInstance } from 'test-renderer';

import { RUTAS_DE_FONDO, USUARIO } from './datosClienta';
import { abrirApp, cerrarIntroSiAparece, type App } from './pantallas';
import {
  CATALOGO_CRUDO,
  imagenServicio,
  rutasServicios,
  servicioCrudo,
  type ServicioCrudo,
} from './serviciosFicticios';
import { respuesta, servidorConRutas, type Llamada, type Manejador } from './servidorSimulado';
import { sembrarSesion } from './sesionGuardada';

/**
 * Pasos comunes de las pruebas de integración de GP-06.1 (catálogo y detalle de servicios) con las
 * pantallas reales: el catálogo de pantalla (CATALOGO_CRUDO más servicios con datos incompletos),
 * abrir la app en una ruta con o sin sesión, respuestas retenidas para ver los esqueletos, la
 * galería de Inicio y el paso de la lista al detalle.
 */

/**
 * Servicios activos con datos incompletos, para las ramas de la tarjeta y del detalle: sin
 * categoría, duración, precio, foto ni textos; con categoría pero sin duración; y con duración pero
 * sin categoría.
 */
export const SERVICIOS_INCOMPLETOS: ServicioCrudo[] = [
  servicioCrudo({
    id: 6,
    nombre: 'Asesoría de imagen',
    descripcion: '',
    descripcionLarga: '',
    categoria: '',
    precio: '0.00',
    duracionMinutos: 0,
    imagen: [],
    incluye: [],
    recomendaciones: [],
  }),
  servicioCrudo({
    id: 7,
    nombre: 'Retoque de raíz',
    categoria: 'Color',
    precio: '650.00',
    duracionMinutos: 0,
    imagen: [imagenServicio('retoque')],
  }),
  servicioCrudo({
    id: 8,
    nombre: 'Lavado express',
    categoria: '',
    precio: '150.00',
    duracionMinutos: 30,
    imagen: [imagenServicio('lavado')],
  }),
];

/** Lo que responde GET /api/servicios en estas pruebas: el catálogo ficticio y los incompletos. */
export const CATALOGO_PANTALLA: ServicioCrudo[] = [...CATALOGO_CRUDO, ...SERVICIOS_INCOMPLETOS];

/** accessibilityLabel de cada tarjeta activa: "Nombre, duración, precio". */
export const TARJETA = {
  corte: 'Corte de dama, 45 min, $350',
  alaciado: 'Alaciado keratínico, 2 h 30 min, $1,200',
  unas: 'Uñas acrílicas, 1 h, Consulta el precio en el salón',
  balayage: 'Balayage, 3 h, $1,800.50',
  asesoria: 'Asesoría de imagen, Consulta el precio en el salón',
  retoque: 'Retoque de raíz, $650',
  lavado: 'Lavado express, 30 min, $150',
} as const;

/** Las tarjetas que muestra el catálogo completo (sin el peinado inactivo), en orden. */
export const TODAS_LAS_TARJETAS: string[] = Object.values(TARJETA);

/** Clienta con sesión de estas pruebas: la misma que devuelve GET /api/auth/me de fondo. */
export const CLIENTA_SERVICIOS = { ...USUARIO, id: String(USUARIO.id) };

/** Servidor con lo que piden las pantallas de fondo y el catálogo de pantalla; la prueba va encima. */
export const simularServidorCatalogo = servidorConRutas({
  ...RUTAS_DE_FONDO,
  ...rutasServicios(CATALOGO_PANTALLA),
});

/** 500 ficticio del backend. */
export function errorDelServidor(): Response {
  return respuesta({ statusCode: 500, message: 'Error interno ficticio' }, 500);
}

/** Cada llamada responde con el siguiente manejador; el último se repite. */
export function enSecuencia(...manejadores: Manejador[]): Manejador {
  let llamada = 0;
  return (cuerpo) => {
    const manejador = manejadores[Math.min(llamada, manejadores.length - 1)];
    llamada += 1;
    return manejador(cuerpo);
  };
}

export interface RespuestaRetenida {
  manejador: Manejador;
  /** Deja que la app lea el cuerpo (dentro de act). */
  soltar: () => Promise<void>;
}

/**
 * Respuesta cuyo cuerpo no llega hasta llamar a soltar(): mientras tanto la pantalla sigue
 * cargando y se puede revisar su esqueleto.
 */
export function respuestaRetenida(cuerpo: unknown): RespuestaRetenida {
  let liberar: () => void = () => undefined;
  const llegada = new Promise<void>((resolver) => {
    liberar = resolver;
  });
  const base = respuesta(cuerpo);
  const manejador: Manejador = () =>
    ({
      ok: base.ok,
      status: base.status,
      headers: base.headers,
      text: () => llegada.then(() => base.text()),
      json: () => llegada.then(() => base.json()),
    }) as unknown as Response;
  return {
    manejador,
    soltar: async () => {
      await act(async () => {
        liberar();
      });
    },
  };
}

export interface PantallaAbierta {
  app: App;
  /** Peticiones que recibió el servidor simulado (se van agregando durante la prueba). */
  llamadas: Llamada[];
}

/**
 * Abre la app real en la ruta indicada con el servidor de catálogo y las rutas de la prueba encima.
 * Sin sesión, la clienta ya vio la bienvenida antes (no sale la hoja); con sesión, se siembra la de
 * CLIENTA_SERVICIOS. Cierra la intro de la grieta si aparece.
 */
export async function abrirEn(
  ruta: string,
  rutas: Record<string, Manejador> = {},
  conSesion = false,
): Promise<PantallaAbierta> {
  if (conSesion) {
    await sembrarSesion(CLIENTA_SERVICIOS);
  } else {
    await SecureStore.setItemAsync('bienvenida_vista', '1');
  }
  const llamadas = simularServidorCatalogo(rutas);
  const app = await abrirApp(ruta);
  await cerrarIntroSiAparece();
  return { app, llamadas };
}

/** Espera las tarjetas indicadas y revisa que sean las únicas del catálogo. */
export async function esperarTarjetas(etiquetas: readonly string[]): Promise<void> {
  await waitFor(() => {
    for (const etiqueta of etiquetas) {
      expect(screen.getByRole('button', { name: etiqueta })).toBeOnTheScreen();
    }
  });
  for (const etiqueta of TODAS_LAS_TARJETAS.filter((e) => !etiquetas.includes(e))) {
    expect(screen.queryByRole('button', { name: etiqueta })).not.toBeOnTheScreen();
  }
}

/** Abre la pestaña Servicios sin sesión y espera el catálogo completo. */
export async function abrirCatalogo(rutas: Record<string, Manejador> = {}): Promise<PantallaAbierta> {
  const abierta = await abrirEn('/citas', rutas);
  await esperarTarjetas(TODAS_LAS_TARJETAS);
  expect(abierta.app.getPathname()).toBe('/citas');
  return abierta;
}

/** Toca la tarjeta con esa etiqueta y espera el detalle del servicio con su nombre como título. */
export async function abrirDetalleDesdeLista(
  app: App,
  etiqueta: string,
  id: number,
  nombre: string,
): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: etiqueta }));
  await waitFor(() => expect(app.getPathname()).toBe(`/servicio/${id}`));
  expect(await screen.findByRole('header', { name: nombre })).toBeOnTheScreen();
}

/** Toca "Regresar" en el detalle y espera la ruta y el título indicados. */
export async function regresarA(app: App, ruta: string, texto: string): Promise<void> {
  await fireEvent.press(screen.getByRole('button', { name: 'Regresar' }));
  await waitFor(() => expect(app.getPathname()).toBe(ruta));
  expect(await screen.findByText(texto)).toBeOnTheScreen();
}

/** Escribe en el buscador del catálogo. */
export async function buscar(texto: string): Promise<void> {
  await fireEvent.changeText(screen.getByLabelText('Buscar un servicio por nombre'), texto);
}

/** Capa del mosaico de la galería de Inicio: la vista con onLayout junto al título "Nuestro trabajo". */
function capaGaleria(): TestInstance {
  const galeria = screen.getByRole('header', { name: 'Nuestro trabajo' }).parent;
  const capa = galeria?.children.find(
    (hijo): hijo is TestInstance =>
      typeof hijo !== 'string' && typeof hijo.props.onLayout === 'function',
  );
  if (!capa) {
    throw new Error('La galería no tiene una capa con onLayout');
  }
  return capa;
}

/** Ancho de la galería en las pruebas (el de un teléfono menos los márgenes). */
const ANCHO_GALERIA = 358;

/** Manda la medida a una vista con onLayout (la galería o su esqueleto). */
export async function medir(vista: TestInstance): Promise<void> {
  await fireEvent.layout(vista, { x: 0, y: 0, width: ANCHO_GALERIA, height: 0 });
}

/**
 * Mide el mosaico de la galería y espera la foto indicada. Desde GP-07.3 cada miniatura se anuncia
 * con el texto alternativo de su foto (GET /api/galeria).
 */
export async function medirGaleria(primeraFoto: string): Promise<void> {
  await medir(capaGaleria());
  expect(await screen.findByRole('imagebutton', { name: primeraFoto })).toBeOnTheScreen();
}

/** Toca la foto con ese texto alternativo y espera el visor con su contador. */
export async function abrirFoto(alt: string, contador: string): Promise<void> {
  const foto = screen.getByRole('imagebutton', { name: alt });
  await fireEvent.press(foto);
  expect(await screen.findByText(contador)).toBeOnTheScreen();
  expect(screen.getByRole('button', { name: 'Cerrar galería' })).toBeOnTheScreen();
}
