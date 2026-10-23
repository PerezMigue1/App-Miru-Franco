import { MENSAJE_SIN_CONEXION } from '@/shared/api/mensajesError';
import { RESPALDO_TEXTOS } from '@/shared/api/textosSitio';

/**
 * GP-07.6: los textos de error para la clienta que da shared/api/mensajesError (respaldo de las
 * claves errores.* del catálogo), para que las pruebas los lean de un solo lugar.
 */
export const TEXTO_SIN_CONEXION = MENSAJE_SIN_CONEXION;
export const TEXTO_SERVIDOR = RESPALDO_TEXTOS['errores.servidor'];
export const TEXTO_TIEMPO_AGOTADO = RESPALDO_TEXTOS['errores.tiempoAgotado'];
export const TEXTO_SESION_TERMINADA = RESPALDO_TEXTOS['errores.sesionTerminada'];
export const TEXTO_DEMASIADAS_SOLICITUDES = RESPALDO_TEXTOS['errores.demasiadasSolicitudes'];
