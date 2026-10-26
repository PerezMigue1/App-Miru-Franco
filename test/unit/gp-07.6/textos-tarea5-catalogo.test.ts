/// <reference types="jest" />

import { act, renderHook } from '@testing-library/react-native';

import { useTextosAuth } from '@/features/auth/viewmodels/textosAuth';
import { useTextosTienda } from '@/features/tienda/viewmodels/textosTienda';
import { refrescar, reiniciarConfiguracionPublica, RESPALDO_CONFIGURACION } from '@/shared/api/configuracionPublica';
import { obtenerTexto, RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

import { limpiarArchivos } from '../../helpers/archivosLocales';
import { cadenas, leer, nombre, sinComentarios, src } from '../../helpers/reglasCodigo';
import { servidorConRutas } from '../../helpers/servidorSimulado';
import { configuracionConTextos, rutaConTextos } from '../../helpers/textosFicticios';

jest.mock('expo-file-system', () => require('../../helpers/archivosLocales').moduloArchivos);

/**
 * GP-07.6 Tarea 5, textos que salieron del código al catálogo (textosSitio.ts):
 * 1. Cada clave nueva existe en el respaldo, con texto y sin llaves al llenarse.
 * 2. Con plantilla del servidor se usa la del servidor; rota (variable desconocida o llave suelta),
 *    el respaldo; nunca se ven llaves.
 * 3. useTextosAuth y useTextosTienda dan los del respaldo y siguen a la configuración del servidor.
 * 4. Las vistas y componentes migrados ya no escriben esos textos a mano (lectura del código).
 */

const conPrefijo = (prefijo: string, claves: string[]) => claves.map((clave) => `${prefijo}.${clave}`);

const CLAVES_NUEVAS = [
  'citas.cancelar.anticipoRetenido',
  'citas.cancelar.anticipoEnRevision',
  'anticipos.pendienteSinFormas',
  'citas.reprogramar.servicioInactivo',
  'salon.sinActualizar',
  'inicio.servicios.errorTitulo',
  'inicio.productos.errorTitulo',
  ...conPrefijo('auth.acceso', ['iniciarSesion', 'crearCuenta', 'ahoraNo', 'hojaTitulo', 'hojaTexto', 'cerrarAyuda']),
  ...conPrefijo('auth.bienvenida', ['titulo', 'texto', 'explorar']),
  ...conPrefijo('auth.pestana', ['acceso', 'registro']),
  ...conPrefijo('auth.login', ['titulo', 'texto', 'olvidaste', 'entrar', 'entrando', 'bloqueo', 'credenciales', 'noSePudo']),
  ...conPrefijo('auth.google', ['boton', 'abriendo', 'ayuda', 'error']),
  ...conPrefijo('auth.registro', [
    'titulo', 'texto', 'pasoCuenta', 'pasoCabello', 'pasoDe', 'correoVerificando', 'correoRegistrado',
    'correoRevisando', 'correoSinRed', 'correoSinVerificar', 'correoConCuenta', 'faltanRequisitos',
    'cabelloTitulo', 'finalizar', 'registrando', 'preguntasAyuda', 'preguntasCargando', 'preguntasVacias',
    'preguntasNoCargadas', 'noSePudo', 'revisaDatos',
  ]),
  'auth.revisaCampos',
  'auth.avisoPrivacidad.noAbre',
  'auth.terminos.noAbre',
  ...conPrefijo('auth.activar', [
    'titulo', 'instrucciones', 'instruccionesSinCorreo', 'vigencia', 'verificar', 'verificando', 'espera',
    'reenviar', 'reenviando', 'volver', 'codigoInvalido', 'noSeVerifico', 'noSeReenvio', 'sinCorreo',
  ]),
  'auth.codigo.reenviado',
  'auth.recuperar.neutro',
  'perfil.foto.pesada',
  'perfil.cierreFallido',
  'perfil.guardado',
  'perfil.editar.noSeGuardo',
  ...conPrefijo('perfil.contrasena', ['codigoInvalido', 'sesionNoConfirmada', 'noSePudo', 'nuevaRechazada', 'recuperacionNoAbre']),
  ...conPrefijo('perfil.apariencia', ['titulo', 'sistema', 'sistemaDetalle', 'claro', 'claroDetalle', 'oscuro', 'oscuroDetalle']),
  'tienda.total',
  'tienda.totalEtiqueta',
  'tienda.totalPiezasEtiqueta',
  ...conPrefijo('tienda.carrito', [
    'titulo', 'subtitulo', 'cargando', 'sesionTitulo', 'sesionBeneficio', 'errorTitulo', 'vacioTitulo', 'vacioTexto',
    'verTienda', 'recoges', 'ajusta', 'continuar', 'quitarTitulo', 'quitar', 'conservar',
  ]),
  ...conPrefijo('tienda.checkout', [
    'titulo', 'subtitulo', 'cargando', 'revisarCarrito', 'confirmarPedido', 'ayudaLinea', 'ayudaSalon', 'llamarSalon',
    'comoPagar', 'revisaTitulo', 'revisaTexto', 'recogesEn',
  ]),
  'tienda.recoger.llamarEtiqueta',
  ...conPrefijo('tienda.catalogo', [
    'titulo', 'subtitulo', 'cargando', 'sinRedTitulo', 'sinRedTexto', 'errorTitulo', 'errorTexto', 'vacioTitulo',
    'vacioTexto', 'refresco', 'sinResultadosTitulo', 'sinResultadosTexto', 'verTodos',
  ]),
  ...conPrefijo('tienda.producto', [
    'cargando', 'errorTitulo', 'errorTexto', 'noEncontradoTitulo', 'noEncontradoTexto', 'irATienda', 'agregar',
    'verCarrito', 'descripcion', 'caracteristicas', 'modoUso', 'ingredientes', 'resultado',
  ]),
  ...conPrefijo('tienda.pedido.detalle', [
    'titulo', 'tituloSinNumero', 'noEncontradoTexto', 'hechoEl', 'hechoElEtiqueta', 'queSigue', 'completarPago',
    'articulos', 'formaPagoEtiqueta', 'recoger',
  ]),
  ...conPrefijo('tienda.pedido.cancelar', ['boton', 'titulo', 'confirmar', 'cancelando', 'conservar']),
];

/** Valores de contexto para llenar cualquier plantilla nueva (las de reglas salen de la configuración). */
const CONTEXTO = {
  anticipo: '$360', plazoAnticipo: '2 horas', digitos: 6, correo: 'ana@correo.test', minutos: 2, segundos: 30,
  megas: 5, numero: 1, total: '$450.00', paso: 'Tu cuenta', piezas: '2 piezas', formaPago: 'Pago en línea',
  pedido: 12, telefono: '+52 700 000 0000', fecha: '19 de octubre de 2026',
};

const simular = servidorConRutas({});

beforeEach(() => {
  reiniciarConfiguracionPublica();
  limpiarArchivos();
});

describe('claves nuevas del catálogo (respaldo)', () => {
  it('no hay claves repetidas en la lista', () => {
    expect(new Set(CLAVES_NUEVAS).size).toBe(CLAVES_NUEVAS.length);
  });

  it('auth.activar.yaActivada ya no existe: ningún error de Activar puede decir que la cuenta ya está activada', () => {
    expect(Object.prototype.hasOwnProperty.call(RESPALDO_TEXTOS, 'auth.activar.yaActivada')).toBe(false);
    expect(Object.values(RESPALDO_TEXTOS).some((texto) => /ya está activad/i.test(texto))).toBe(false);
  });

  it.each(CLAVES_NUEVAS)('%s existe en el respaldo y se llena sin llaves', (clave) => {
    expect(Object.prototype.hasOwnProperty.call(RESPALDO_TEXTOS, clave)).toBe(true);
    const texto = obtenerTexto(clave, CONTEXTO, RESPALDO_CONFIGURACION);
    expect(texto.trim()).not.toBe('');
    expect(texto).not.toMatch(/[{}]/);
  });

  it.each<[string, Record<string, string | number>, string, string]>([
    ['auth.activar.instrucciones', { digitos: 6, correo: 'ana@correo.test' }, 'Código ficticio de {digitos} para {correo}.', 'Código ficticio de 6 para ana@correo.test.'],
    ['perfil.foto.pesada', { megas: 5 }, 'Foto ficticia de más de {megas} MB.', 'Foto ficticia de más de 5 MB.'],
    ['tienda.pedido.detalle.titulo', { pedido: 12 }, 'Compra ficticia {pedido}', 'Compra ficticia 12'],
    ['citas.cancelar.anticipoRetenido', { anticipo: '$360' }, 'Retenido ficticio {anticipo}.', 'Retenido ficticio $360.'],
  ])('%s: usa la plantilla del servidor; rota, el respaldo', (clave, contexto, delServidor, esperado) => {
    expect(obtenerTexto(clave, contexto, configuracionConTextos({ [clave]: delServidor }))).toBe(esperado);
    for (const rota of ['Rota {variableQueNoExiste}', 'Rota con llave { suelta']) {
      const texto = obtenerTexto(clave, contexto, configuracionConTextos({ [clave]: rota }));
      expect(texto).toBe(obtenerTexto(clave, contexto, RESPALDO_CONFIGURACION));
      expect(texto).not.toMatch(/[{}]/);
    }
  });
});

describe('textos por feature para las vistas', () => {
  it('useTextosAuth: respaldo, funciones con datos y nombre del salón; sigue al servidor', async () => {
    const { result } = await renderHook(() => useTextosAuth());
    expect(result.current.login.titulo).toBe(RESPALDO_TEXTOS['auth.login.titulo']);
    expect(result.current.registro.pasoDe(1, 2, 'Tu cuenta')).toBe('Paso 1 de 2: Tu cuenta');
    expect(result.current.nombreSalon).toBe(RESPALDO_CONFIGURACION.salon.nombre);
    expect(result.current.apariencia.oscuroDetalle).toBe(RESPALDO_TEXTOS['perfil.apariencia.oscuroDetalle']);

    simular(rutaConTextos({ 'auth.login.titulo': 'Entrada ficticia' }));
    await act(async () => {
      await refrescar();
    });
    expect(result.current.login.titulo).toBe('Entrada ficticia');
  });

  it('useTextosTienda: respaldo y funciones con datos', async () => {
    const { result } = await renderHook(() => useTextosTienda());
    const t = result.current;
    expect(t.total).toBe('Total');
    expect(t.totalEtiqueta('$450.00')).toBe('Total: $450.00');
    expect(t.totalPiezasEtiqueta('$450.00', '2 piezas')).toBe('Total: $450.00, 2 piezas');
    expect(t.llamarSalonEtiqueta('+52 700 000 0000')).toBe('Llamar al salón, +52 700 000 0000');
    expect(t.pedido.titulo('12')).toBe('Pedido #12');
    expect(t.pedido.titulo(null)).toBe('Tu pedido');
    expect(t.pedido.hechoEl('19 de octubre')).toBe('Hecho el 19 de octubre');
    expect(t.pedido.hechoElEtiqueta('19 de octubre')).toBe('Pedido hecho el 19 de octubre');
    expect(t.pedido.formaPagoEtiqueta('Pago en línea')).toBe('Forma de pago: Pago en línea');
    expect(t.cancelarPedido.titulo(12)).toBe('¿Cancelar el pedido #12?');
    expect(t.pedido.revisarMiPago).toBe(RESPALDO_TEXTOS['tienda.pago.botonRevisarMiPago']);
  });
});

// ── Reglas sobre el código ───────────────────────────────────────────────────────────────────

const AUTH = (...partes: string[]) => src('features', 'auth', ...partes);
const TIENDA = (...partes: string[]) => src('features', 'tienda', ...partes);

/** Por archivo, los textos que ya no deben estar escritos a mano en sus cadenas ni en el JSX. */
const MIGRADOS: [string, string[]][] = [
  [AUTH('components', 'AuthContainer.tsx'), [
    'Inicia sesión', 'Consulta tus citas, tus pedidos y tus recordatorios.', '¿Olvidaste tu contraseña?', 'Entrando…',
    'Continuar con Google', 'Abriendo Google…', 'Crea tu cuenta', 'Tu cuenta', 'Tu cabello', 'Verificando correo…',
    'Este correo ya está registrado', 'Te faltan requisitos de la contraseña.', 'Cuéntanos sobre tu cabello',
    'Finalizar registro', 'Registrando…', 'Abre la lista de preguntas', 'Cargando preguntas de seguridad',
    'Todavía no hay preguntas de seguridad disponibles.', 'Vuelve a la app sin iniciar sesión', 'Mirú Franco Beauty Salón',
  ]],
  [AUTH('components', 'HojaAcceso.tsx'), ['Inicia sesión para continuar', 'Iniciar sesión', 'Crear cuenta', 'Ahora no']],
  [AUTH('components', 'HojaBienvenida.tsx'), ['Te damos la bienvenida', 'Explorar primero', 'Crear cuenta']],
  [AUTH('components', 'InvitacionSesion.tsx'), ['Crear cuenta', 'Iniciar sesión']],
  [AUTH('components', 'HojaApariencia.tsx'), ['Apariencia', 'Sigue la configuración del teléfono', 'Lino y vino', 'Carbón y oro']],
  [AUTH('views', 'ActivarView.tsx'), ['Activa tu cuenta', 'Escribe el código', 'El código vence', 'Verificar código', 'Reenviar código', 'Volver a iniciar sesión', 'Podrás pedir']],
  [AUTH('models', 'PerfilModel.ts'), ['La foto pesa más de 5 MB']],
  [src('shared', 'ui', 'Logotipo.tsx'), ['Mirú Franco Beauty Salón']],
  [TIENDA('views', 'CarritoView.tsx'), ['Revisa tus productos antes de finalizar', 'Tu carrito te espera', 'Tu carrito está vacío', 'Continuar compra', '¿Quitar este producto?', 'Total']],
  [TIENDA('views', 'CheckoutView.tsx'), ['Finalizar compra', 'Revisar mi carrito', 'Confirmar pedido', 'Llamar al salón', '¿Cómo quieres pagar?', 'Revisa y confirma', 'Recoges en']],
  [TIENDA('views', 'DetallePedidoView.tsx'), ['Qué sigue', 'Artículos', 'Total', 'Revisar mi pago', 'Completar el pago', 'Recoger en el salón', 'Cancelar pedido', 'Hecho el']],
  [TIENDA('views', 'TiendaView.tsx'), ['Explora nuestro catálogo', 'No pudimos cargar la tienda', 'Aún no hay productos', 'No encontramos productos']],
  [TIENDA('views', 'DetalleProductoView.tsx'), ['No pudimos cargar este producto', 'Agregar al carrito', 'Modo de uso', 'Ingredientes', 'Ver carrito']],
  [TIENDA('components', 'ResumenCompra.tsx'), ['Total']],
  [TIENDA('components', 'DatosRecogerSalon.tsx'), ['Llamar al salón']],
  [TIENDA('components', 'HojaCancelarPedido.tsx'), ['Sí, cancelar pedido', 'No, conservarlo', 'Cancelar el pedido']],
];

/** Cadenas y textos de JSX (entre > y <) del código sin comentarios. */
function textosEscritos(ruta: string): string[] {
  const codigo = sinComentarios(leer(ruta));
  const jsx = Array.from(codigo.matchAll(/>([^<>{}]*[A-Za-zÁÉÍÓÚáéíóúñ¿][^<>{}]*)</g), (m) => m[1].trim());
  return [...cadenas(codigo).map(({ valor }) => valor), ...jsx].filter(Boolean);
}

describe('los textos migrados ya no están escritos a mano', () => {
  it.each(MIGRADOS.map(([ruta, textos]) => [nombre(ruta), ruta, textos] as const))('%s', (_nombre, ruta, textos) => {
    const escritos = textosEscritos(ruta);
    expect(textos.filter((texto) => escritos.some((escrito) => escrito.includes(texto)))).toEqual([]);
  });

  it('el detector encuentra un texto en una cadena y en el JSX', () => {
    const codigo = "const a = 'Qué sigue';\nconst b = <Text>\n  Artículos\n</Text>;";
    const jsx = Array.from(codigo.matchAll(/>([^<>{}]*[A-Za-zÁÉÍÓÚáéíóúñ¿][^<>{}]*)</g), (m) => m[1].trim());
    expect([...cadenas(codigo).map(({ valor }) => valor), ...jsx]).toEqual(['Qué sigue', 'Artículos']);
  });
});
