import { Button } from '@/shared/ui/Button';
import { Hoja } from '@/shared/ui/Hoja';

interface HojaPermisoGaleriaProps {
  visible: boolean;
  textos: { titulo: string; texto: string; continuar: string; ahoraNo: string };
  /** Pide el permiso de fotos. */
  onContinuar: () => void;
  /** "Ahora no", el velo o Atrás: se cierra sin pedir nada. */
  onCerrar: () => void;
}

/**
 * Explicación antes de pedir el permiso de fotos (Android 12 o anterior): para qué es y qué se sube.
 * El título se anuncia al abrir (Hoja lo marca como encabezado) y con movimiento reducido solo se
 * funde, como las demás hojas de Perfil.
 */
export function HojaPermisoGaleria({ visible, textos, onContinuar, onCerrar }: HojaPermisoGaleriaProps) {
  return (
    <Hoja visible={visible} onCerrar={onCerrar} titulo={textos.titulo} texto={textos.texto}>
      <Button titulo={textos.continuar} onPress={onContinuar} />
      <Button titulo={textos.ahoraNo} variante="secundario" onPress={onCerrar} />
    </Hoja>
  );
}
