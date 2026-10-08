export interface EspecialistaServicio {
  id: string | number;
  usuarioId: string;
  nombre?: string;
  rol?: string;
  avatarUrl?: string;
}

export interface Servicio {
  id: string | number;
  nombre: string;

  descripcion?: string;
  descripcionLarga?: string;

  duracion?: string;
  duracionMinutos?: number;

  precio?: string;
  categoria?: string;

  anticipoMonto?: number | null;

  requiereEvaluacion?: boolean;
  activo?: boolean;

  imagen?: string;
  imagenes?: string[];

  incluye?: string[];
  recomendaciones?: string[];

  especialistas?: EspecialistaServicio[];
}