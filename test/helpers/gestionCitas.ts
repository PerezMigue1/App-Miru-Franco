/// <reference types="jest" />

import { act } from '@testing-library/react-native';

import { normalizarCita, type Cita } from '@/features/citas/models/citaModel';
import { reglasDeCita, type ReglasCita } from '@/features/citas/models/formaPagoModel';
import {
  normalizarConfiguracion,
  refrescar,
  reiniciarConfiguracionPublica,
  type ConfiguracionPublica,
} from '@/shared/api/configuracionPublica';
import { reiniciarDocumentosLegales } from '@/shared/api/documentosLegales';

import { cuerpoCita, estadoAnticipoCrudo, ID_CITA, simularServidorMisCitas, type CitaCruda } from './citasFicticias';
import { configuracionReserva, rutaConfiguracionReserva, rutasConsentimientos, type ConfiguracionReservaFicticia } from './reservaFicticia';
import { respuesta, type Llamada, type Manejador } from './servidorSimulado';
import { diferida, enSecuencia, type Salida } from './viewmodelsAuth';

/**
 * Andamiaje de las pruebas de GP-07.4 sobre una cita ya agendada (detalle, anticipo en el salón,
 * cancelar, reprogramar y defectos): reglas guardadas en la cita distintas de las vigentes, la
 * configuración vigente cargada en memoria, las rutas nuevas del backend y los turnos del servidor
 * simulado. Todo es inventado.
 */

/**
 * Reglas guardadas en las citas de estas pruebas: todas distintas de las vigentes de la configuración
 * ficticia (REGLAS_FICTICIAS de reservaFicticia: 3 horas, 25 minutos, 6 horas de aviso, 8 y 6 días,
 * pierde el anticipo), para notar si una pantalla usa la regla vigente en lugar de la de la cita.
 */
export const REGLAS_CITA: ReglasCita = {
  plazoAnticipoHoras: 5,
  minutosAntesPagoSalon: 40,
  horasAvisoCancelarReagendar: 12,
  diasHabilesExcepcionAnticipo: 9,
  diasHabilesCancelarConReembolso: 7,
  pierdeAnticipoSiNoAsiste: false,
  diasInhabiles: [],
};

/** Reglas de omisión (las de una cita que no guarda reglas). */
export const REGLAS_OMISION: ReglasCita = reglasDeCita(null);

/** La cita cruda con sus reglas guardadas. */
export function conReglas(cita: CitaCruda, reglas: Partial<ReglasCita> = REGLAS_CITA): CitaCruda {
  return { ...cita, reglas: { ...REGLAS_CITA, ...reglas } };
}

/** La cita cruda ya normalizada como la entrega obtenerCita. */
export const normalizada = (cita: CitaCruda): Cita => normalizarCita(cita as unknown as Record<string, unknown>);

/** La configuración vigente ficticia ya normalizada (para las funciones puras de los models). */
export function configVigente(opciones?: ConfiguracionReservaFicticia, textos: Record<string, string> = {}): ConfiguracionPublica {
  return normalizarConfiguracion({ ...configuracionReserva(opciones), textos });
}

/** "5 horas" / "1 hora", como conUnidad. */
export const horas = (n: number) => `${n} ${n === 1 ? 'hora' : 'horas'}`;

// ── Servidor ─────────────────────────────────────────────────────────────────────────────────

export type Turno = () => Salida;

/** Cada llamada a la ruta toma el siguiente turno (el último se repite). */
export const turnos = (...salidas: Turno[]): Manejador => enSecuencia(...salidas) as unknown as Manejador;

/** La cita como respuesta de GET /api/citas/:id. */
export const citaComo = (cita: CitaCruda): Turno => () => respuesta(cuerpoCita(cita));

/** Respuesta de error con el cuerpo de NestJS. */
export const errorCon = (status: number, message: string): Turno => () => respuesta({ statusCode: status, message }, status);

/** Sin red solo en esa ruta. */
export const sinRedTurno: Turno = () => Promise.reject(new TypeError('Network request failed'));

/** Un turno que no responde hasta que la prueba lo suelta. */
export function enPausa(): { turno: Turno; soltar: (r: Response) => Promise<void> } {
  const pendiente = diferida();
  return { turno: () => pendiente.promesa, soltar: (r) => act(async () => pendiente.soltar(r)) };
}

/** "PATCH /api/citas/:id/anticipo-en-salon" (sin ?propios, como la web). */
export const rutaAnticipoEnSalon = (id: string | number = ID_CITA) => `PATCH /api/citas/${id}/anticipo-en-salon`;

/** 200 de anticipo-en-salon con el plazo nuevo. */
export const anticipoEnSalonOk = (anticipoVenceEn: string): Turno => () =>
  respuesta({ success: true, citaId: ID_CITA, anticipoEnSalon: true, anticipoVenceEn });

/** Estado del anticipo pagado con la política de cancelación indicada (o null). */
export const estadoConPolitica = (cancelacion: unknown): Turno => () =>
  respuesta(estadoAnticipoCrudo('aprobado', { cancelacion }));

/**
 * Servidor de Mis citas con la configuración ficticia (opciones), la Política de anticipos vigente y
 * el registro de consentimientos, más las rutas de la prueba. Carga la configuración en memoria.
 */
export async function servidorGestion(
  rutas: Record<string, Manejador> = {},
  opciones?: ConfiguracionReservaFicticia,
): Promise<Llamada[]> {
  const llamadas = simularServidorMisCitas({ ...rutasConsentimientos(), ...rutaConfiguracionReserva(opciones), ...rutas });
  await refrescar();
  return llamadas;
}

/** Corre una acción del viewmodel dentro de act. */
export const hacer = (accion: () => void) =>
  act(async () => {
    accion();
  });

/** Cuántas peticiones llegaron a "MÉTODO /ruta". */
export const vecesRuta = (llamadas: Llamada[], ruta: string) =>
  llamadas.filter((l) => `${l.metodo} ${l.ruta}` === ruta).length;

/** "MÉTODO /ruta" de las peticiones que no son lecturas, en orden. */
export const escriturasDe = (llamadas: Llamada[]) =>
  llamadas.filter((l) => l.metodo !== 'GET').map((l) => `${l.metodo} ${l.ruta}`);

/** Vuelve la configuración y los documentos legales al respaldo antes de cada prueba. */
export function reiniciarRepositorios(): void {
  beforeEach(() => {
    reiniciarConfiguracionPublica();
    reiniciarDocumentosLegales();
  });
}
