import { useEffect, useMemo, useState } from 'react';

import type { Servicio } from '../models/Servicio';
import { obtenerServicios } from '../services/serviciosService';

export function useServicios() {
  const [servicios, setServicios] = useState<Servicio[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState('');

  const cargarServicios = async () => {
    try {
      setCargando(true);
      setError(null);

      const datos = await obtenerServicios();
      setServicios(datos);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'No fue posible cargar los servicios.',
      );
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    void cargarServicios();
  }, []);

  const serviciosFiltrados = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();

    if (!texto) {
      return servicios;
    }

    return servicios.filter((servicio) => {
      const nombre = servicio.nombre.toLowerCase();
      const descripcion = servicio.descripcion?.toLowerCase() ?? '';
      const categoria = servicio.categoria?.toLowerCase() ?? '';

      return (
        nombre.includes(texto) ||
        descripcion.includes(texto) ||
        categoria.includes(texto)
      );
    });
  }, [busqueda, servicios]);

  const categorias = useMemo(() => {
    const valores = servicios
      .map((servicio) => servicio.categoria)
      .filter(
        (categoria): categoria is string =>
          typeof categoria === 'string' &&
          categoria.trim().length > 0,
      );

    return Array.from(new Set(valores));
  }, [servicios]);

  return {
    servicios,
    serviciosFiltrados,
    categorias,
    cargando,
    error,
    busqueda,
    setBusqueda,
    recargar: cargarServicios,
  };
}