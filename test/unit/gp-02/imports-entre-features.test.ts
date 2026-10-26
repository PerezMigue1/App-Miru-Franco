/// <reference types="jest" />
/// <reference types="node" />

import fs from 'fs';
import path from 'path';

import { importaciones, nombre, src } from '../../helpers/reglasCodigo';

/**
 * GP-02 (corrección de GP-09): una feature no importa de otra feature, ni con '@/features/<otra>/...'
 * ni con rutas relativas que salgan de su carpeta. Se revisa el código real de src/features (lectura
 * con fs, sin ejecutarlo). Lo que comparten varias features vive en src/shared.
 *
 * Los imports entre features que ya había en main antes de esta regla están congelados en
 * IMPORTS_HEREDADOS: la prueba falla con cualquier import entre features que no esté en la lista, y
 * también si una entrada de la lista ya no existe (hay que sacarla). Así la deuda solo baja.
 */

const SRC = src();
const FEATURES = src('features');

/** Archivos .ts y .tsx bajo una carpeta, recorriendo subcarpetas. */
function codigoBajo(carpeta: string): string[] {
  return fs.readdirSync(carpeta, { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.join(carpeta, entrada.name);
    if (entrada.isDirectory()) {
      return codigoBajo(ruta);
    }
    return /\.tsx?$/.test(entrada.name) ? [ruta] : [];
  });
}

/** Feature de una ruta absoluta dentro de src/features ('auth', 'citas'...), o null si está fuera. */
function featureDe(ruta: string): string | null {
  if (!ruta.startsWith(FEATURES + path.sep)) {
    return null;
  }
  return path.relative(FEATURES, ruta).split(path.sep)[0];
}

/**
 * Destino absoluto de un módulo pedido desde `origen` si cae dentro de src/features, o null si es de
 * otro lado (shared, paquetes, assets o una carpeta que solo empieza con "features").
 */
function destinoEnFeatures(origen: string, modulo: string): string | null {
  let destino: string | null = null;
  if (modulo === '@/features' || modulo.startsWith('@/features/')) {
    destino = path.join(SRC, modulo.slice('@/'.length));
  } else if (modulo.startsWith('.')) {
    destino = path.resolve(path.dirname(origen), modulo);
  }
  return destino !== null && featureDe(destino) !== null ? destino : null;
}

interface ImportEntreFeatures {
  linea: number;
  /** El módulo tal como está escrito en el archivo. */
  modulo: string;
  /** Pareja 'src/features/<a>/... -> @/features/<b>/...', con el destino siempre con el alias. */
  clave: string;
}

/** Imports y export from de un archivo de src/features/<a> que apuntan a src/features/<b>, con a distinto de b. */
function importsEntreFeatures(origen: string, texto: string): ImportEntreFeatures[] {
  const propia = featureDe(origen);
  return importaciones(texto).flatMap(({ linea, modulo }) => {
    const destino = destinoEnFeatures(origen, modulo);
    if (destino === null || featureDe(destino) === propia) {
      return [];
    }
    const alias = `@/${path.relative(SRC, destino).split(path.sep).join('/')}`;
    return [{ linea, modulo, clave: `${nombre(origen)} -> ${alias}` }];
  });
}

/**
 * Imports entre features que ya existían en main antes de esta regla (sin los que quitó la corrección
 * de GP-09, que llevó BadgeEstado, TonoBadge y las fechas legibles a src/shared/ui). Solo se pueden
 * quitar; uno nuevo hace fallar la prueba. Ojo: se congelan parejas archivo -> módulo, no lo que se
 * importa de ese módulo: un archivo de la lista puede traer otro nombre del mismo módulo sin que la
 * prueba falle. Al tocar uno de estos archivos, lo que comparta con otra feature va a src/shared.
 */
const IMPORTS_HEREDADOS: readonly string[] = [
  // auth
  'src/features/auth/views/PerfilView.tsx -> @/features/notificaciones/components/FilaAvisosEnApp',

  // citas
  'src/features/citas/components/SeccionFormaPago.tsx -> @/features/tienda/components/OpcionPago',
  'src/features/citas/models/citaModel.ts -> @/features/inicio/models/FluidoModel',
  'src/features/citas/models/citaModel.ts -> @/features/inicio/models/inicioService',
  'src/features/citas/models/formaPagoModel.ts -> @/features/inicio/models/FluidoModel',
  'src/features/citas/models/gestionCitaModel.ts -> @/features/inicio/models/FluidoModel',
  'src/features/citas/models/gestionCitaModel.ts -> @/features/salon/models/salonModel',
  'src/features/citas/models/servicioModel.ts -> @/features/inicio/models/FluidoModel',
  'src/features/citas/models/servicioModel.ts -> @/features/inicio/models/inicioService',
  'src/features/citas/viewmodels/formaPagoReserva.ts -> @/features/inicio/models/FluidoModel',
  'src/features/citas/viewmodels/useDetalleServicioViewModel.ts -> @/features/auth/viewmodels/useAuth',
  'src/features/citas/viewmodels/useMisCitasViewModel.ts -> @/features/auth/viewmodels/useAuth',
  'src/features/citas/viewmodels/useRegresoReserva.ts -> @/features/auth/viewmodels/useAuth',
  'src/features/citas/viewmodels/useReservarCitaViewModel.ts -> @/features/auth/viewmodels/useAuth',
  'src/features/citas/views/AnticipoView.tsx -> @/features/auth/components/EncabezadoVolver',
  'src/features/citas/views/DetalleCitaView.tsx -> @/features/auth/components/EncabezadoVolver',
  'src/features/citas/views/DetalleServicioView.tsx -> @/features/auth/components/InvitacionSesion',
  'src/features/citas/views/MisCitasView.tsx -> @/features/auth/components/EncabezadoVolver',
  'src/features/citas/views/MisCitasView.tsx -> @/features/auth/components/InvitacionSesion',
  'src/features/citas/views/MisCitasView.tsx -> @/features/auth/viewmodels/useAuth',
  'src/features/citas/views/ReprogramarCitaView.tsx -> @/features/auth/components/EncabezadoVolver',
  'src/features/citas/views/ReservarCitaView.tsx -> @/features/auth/components/EncabezadoVolver',

  // inicio
  'src/features/inicio/components/SeccionCarrusel.tsx -> @/features/citas/components/TarjetaServicio',
  'src/features/inicio/components/SeccionCarrusel.tsx -> @/features/citas/models/servicioModel',
  'src/features/inicio/components/SeccionCarrusel.tsx -> @/features/tienda/components/TarjetaProducto',
  'src/features/inicio/components/SeccionCarrusel.tsx -> @/features/tienda/models/productoModel',
  'src/features/inicio/components/SeccionesContenido.tsx -> @/features/auth/components/AuthContainer',
  'src/features/inicio/components/SeccionesContenido.tsx -> @/features/salon/models/contenidoSalonModel',
  'src/features/inicio/models/FotoModel.ts -> @/features/salon/models/contenidoSalonModel',
  'src/features/inicio/viewmodels/useContenidoInicio.ts -> @/features/citas/viewmodels/presentacionCita',
  'src/features/inicio/viewmodels/useContenidoInicio.ts -> @/features/salon/models/contenidoSalonModel',
  'src/features/inicio/viewmodels/useContenidoInicio.ts -> @/features/salon/viewmodels/useListaContenido',
  'src/features/inicio/viewmodels/useInicioViewModel.ts -> @/features/citas/models/servicioModel',
  'src/features/inicio/viewmodels/useInicioViewModel.ts -> @/features/tienda/models/productoModel',
  'src/features/inicio/views/InicioView.tsx -> @/features/auth/components/AuthContainer',
  'src/features/inicio/views/InicioView.tsx -> @/features/auth/viewmodels/useAuth',

  // notificaciones
  'src/features/notificaciones/models/avisoModel.ts -> @/features/inicio/models/inicioService',
  'src/features/notificaciones/viewmodels/useNotificaciones.ts -> @/features/auth/viewmodels/useAuth',
  'src/features/notificaciones/views/NotificacionesView.tsx -> @/features/auth/components/EncabezadoVolver',
  'src/features/notificaciones/views/NotificacionesView.tsx -> @/features/auth/components/InvitacionSesion',

  // salon
  'src/features/salon/models/contenidoSalonModel.ts -> @/features/inicio/models/inicioService',
  'src/features/salon/viewmodels/useSalonViewModel.ts -> @/features/citas/viewmodels/presentacionCita',
  'src/features/salon/views/SalonView.tsx -> @/features/auth/components/EncabezadoVolver',

  // tienda
  'src/features/tienda/models/carritoModel.ts -> @/features/inicio/models/inicioService',
  'src/features/tienda/models/compraLegal.ts -> @/features/citas/models/formaPagoModel',
  'src/features/tienda/models/compraLegal.ts -> @/features/salon/models/salonModel',
  'src/features/tienda/models/devolucionesModel.ts -> @/features/inicio/models/inicioService',
  'src/features/tienda/models/pedidoModel.ts -> @/features/inicio/models/inicioService',
  'src/features/tienda/models/productoModel.ts -> @/features/inicio/models/FluidoModel',
  'src/features/tienda/models/productoModel.ts -> @/features/inicio/models/inicioService',
  'src/features/tienda/models/revocacionModel.ts -> @/features/inicio/models/inicioService',
  'src/features/tienda/models/solicitudDevolucionModel.ts -> @/features/inicio/models/inicioService',
  'src/features/tienda/viewmodels/detallePedido.ts -> @/features/citas/viewmodels/formaPagoReserva',
  'src/features/tienda/viewmodels/useCarritoViewModel.ts -> @/features/auth/viewmodels/useAuth',
  'src/features/tienda/viewmodels/useCheckoutViewModel.ts -> @/features/auth/models/AuthModel',
  'src/features/tienda/viewmodels/useCheckoutViewModel.ts -> @/features/salon/models/salonModel',
  'src/features/tienda/viewmodels/useDetallePedidoViewModel.ts -> @/features/auth/models/AuthModel',
  'src/features/tienda/viewmodels/useDetallePedidoViewModel.ts -> @/features/salon/models/salonModel',
  'src/features/tienda/viewmodels/useDetalleProductoViewModel.ts -> @/features/auth/viewmodels/useRequiereSesion',
  'src/features/tienda/viewmodels/useMisPedidosViewModel.ts -> @/features/auth/viewmodels/useAuth',
  'src/features/tienda/viewmodels/usePiezasCarrito.ts -> @/features/auth/viewmodels/useAuth',
  'src/features/tienda/viewmodels/useSolicitudDevolucion.ts -> @/features/auth/models/AuthModel',
  'src/features/tienda/views/CarritoView.tsx -> @/features/auth/components/InvitacionSesion',
  'src/features/tienda/views/CheckoutView.tsx -> @/features/auth/components/EncabezadoVolver',
  'src/features/tienda/views/CheckoutView.tsx -> @/features/citas/components/IndicadorPasos',
  'src/features/tienda/views/DetallePedidoView.tsx -> @/features/auth/components/EncabezadoVolver',
  'src/features/tienda/views/MisPedidosView.tsx -> @/features/auth/components/EncabezadoVolver',
  'src/features/tienda/views/MisPedidosView.tsx -> @/features/auth/components/InvitacionSesion',
];

describe('detector de imports entre features', () => {
  const ORIGEN = src('features', 'auth', 'views', 'Ejemplo.tsx');
  const PROPIO = 'src/features/auth/views/Ejemplo.tsx';
  const claves = (texto: string) => importsEntreFeatures(ORIGEN, texto).map(({ clave }) => clave);

  it.each([
    ["import { a } from '@/features/citas/models/citaModel';", '@/features/citas/models/citaModel'],
    ["import { b } from '../../citas/components/TarjetaCita';", '@/features/citas/components/TarjetaCita'],
    ["export { c } from '@/features/tienda/models/pedidoModel';", '@/features/tienda/models/pedidoModel'],
    ["export * from '../../../features/salon/models/salonModel';", '@/features/salon/models/salonModel'],
    ["import type { D } from '@/features/inicio/models/inicioService';", '@/features/inicio/models/inicioService'],
    ["import { e, type F } from '../../notificaciones/models/avisoModel';", '@/features/notificaciones/models/avisoModel'],
    ["import '@/features/citas/models/efecto';", '@/features/citas/models/efecto'],
  ])('detecta %s', (texto, destino) => {
    expect(claves(texto)).toEqual([`${PROPIO} -> ${destino}`]);
  });

  it.each([
    "import { a } from '@/features/auth/models/AuthModel';",
    "import { b } from '../models/AuthModel';",
    "import { c } from '../../auth/components/EncabezadoVolver';",
    "import { d } from '@/shared/ui/BadgeEstado';",
    "import type { E } from '@/shared/ui/tonoBadge';",
    "import { f } from 'react-native';",
    "import { g } from '@/featuresExtra/algo';",
    "import { h } from '../../../featuresExtra/algo';",
    "// import { i } from '@/features/citas/models/citaModel';",
    "/* export { j } from '@/features/tienda/models/pedidoModel'; */",
  ])('no marca %s', (texto) => {
    expect(claves(texto)).toEqual([]);
  });

  it('da la línea y el módulo como están escritos', () => {
    const texto = [
      "import { a } from '../models/AuthModel';",
      '',
      'import {',
      '  fechaLegible,',
      "} from '../../citas/models/citaModel';",
    ].join('\n');
    expect(importsEntreFeatures(ORIGEN, texto)).toEqual([
      { linea: 3, modulo: '../../citas/models/citaModel', clave: `${PROPIO} -> @/features/citas/models/citaModel` },
    ]);
  });
});

describe('las features no importan de otras features', () => {
  const archivos = codigoBajo(FEATURES);
  const encontrados = archivos.flatMap((ruta) => importsEntreFeatures(ruta, fs.readFileSync(ruta, 'utf8')));
  const heredados = new Set(IMPORTS_HEREDADOS);

  it('hay archivos de código que revisar en src/features', () => {
    expect(archivos.length).toBeGreaterThan(0);
  });

  it('ningún import entre features fuera de la lista heredada', () => {
    const nuevos = encontrados
      .filter(({ clave }) => !heredados.has(clave))
      .map(({ clave, linea, modulo }) => {
        const origen = clave.split(' -> ')[0];
        return `${origen}:${linea} importa '${modulo}' de otra feature; lo compartido va en src/shared`;
      });
    expect(nuevos).toEqual([]);
  });

  it('cada entrada de la lista heredada sigue existiendo (si se quitó el import, hay que sacarla)', () => {
    const actuales = new Set(encontrados.map(({ clave }) => clave));
    const sobrantes = IMPORTS_HEREDADOS.filter((clave) => !actuales.has(clave)).map(
      (clave) => `'${clave}' ya no existe: sácala de IMPORTS_HEREDADOS`,
    );
    expect(sobrantes).toEqual([]);
  });

  it('la lista heredada no repite entradas ni apunta a la misma feature', () => {
    const repetidas = IMPORTS_HEREDADOS.filter((clave, i) => IMPORTS_HEREDADOS.indexOf(clave) !== i);
    const mismaFeature = IMPORTS_HEREDADOS.filter((clave) => {
      const [origen, destino] = clave.split(' -> ');
      return origen.split('/')[2] === destino.split('/')[2];
    });
    expect([...repetidas, ...mismaFeature]).toEqual([]);
  });

  it('src/features/auth no importa nada de src/features/citas', () => {
    const deAuthACitas = encontrados
      .filter(({ clave }) => /^src\/features\/auth\/.* -> @\/features\/citas\//.test(clave))
      .map(({ clave }) => clave);
    expect(deAuthACitas).toEqual([]);
  });
});
