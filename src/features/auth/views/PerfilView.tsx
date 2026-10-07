import { Image } from 'expo-image';
import {
  CalendarDays,
  Camera,
  KeyRound,
  LogOut,
  Package,
  Palette,
  ShieldCheck,
  UserPen,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Hoja } from '@/shared/ui/Hoja';
import { ListRow } from '@/shared/ui/ListRow';
import { Monograma } from '@/shared/ui/Monograma';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { Skeleton } from '@/shared/ui/Skeleton';
import {
  borde,
  esqueleto,
  espacio,
  fuente,
  icono,
  monograma,
  pantalla,
  radio,
  tipo,
  tracking,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import { Aviso } from '../components/AuthContainer';
import { HojaApariencia } from '../components/HojaApariencia';
import { InvitacionSesion } from '../components/InvitacionSesion';
import { usePerfilViewModel, type PerfilViewModel } from '../viewmodels/usePerfilViewModel';

/** Perfil: con sesión, los datos de la cuenta y sus accesos; sin sesión, una invitación. */
export default function PerfilView() {
  const { colores } = useTheme();
  const perfil = usePerfilViewModel();

  return (
    <ScrollView style={{ backgroundColor: colores.fondo }} contentContainerStyle={styles.contenido}>
      <ScreenHeader titulo="Perfil" />
      {perfil.estado === 'sinSesion' ? (
        <InvitacionSesion
          titulo="Tu perfil en Mirú Franco"
          beneficio="Inicia sesión para ver tus datos, tu foto y tus citas."
        />
      ) : (
        <ContenidoConSesion perfil={perfil} />
      )}

      <Grupo titulo="Configuración">
        <ListRow icono={Palette} titulo="Apariencia" onPress={perfil.abrirApariencia} />
        <ListRow
          icono={ShieldCheck}
          titulo="Aviso de privacidad"
          onPress={perfil.abrirAviso}
          accessibilityHint="Se abre en el navegador"
        />
      </Grupo>

      {perfil.estado === 'sinSesion' ? null : (
        <View style={styles.cierre}>
          <View style={[styles.grupoFilas, { borderColor: colores.hairline }]}>
            <ListRow
              icono={LogOut}
              titulo="Cerrar sesión"
              destructiva
              deshabilitada={perfil.fotoOcupada}
              onPress={perfil.cerrarSesion}
            />
          </View>
          <Aviso tipo="error" texto={perfil.errorCierre} estilo={styles.margen} />
        </View>
      )}

      <HojaApariencia
        visible={perfil.hojaApariencia}
        preferencia={perfil.apariencia}
        onElegir={perfil.elegirApariencia}
        onCerrar={perfil.cerrarApariencia}
      />
      <Hoja visible={perfil.opcionesFoto} onCerrar={perfil.cerrarOpcionesFoto} titulo="Foto de perfil">
        <Button titulo="Elegir de la galería" onPress={perfil.elegirFoto} />
        {perfil.perfil?.foto ? (
          <Button titulo="Quitar foto" variante="secundario" onPress={perfil.quitarFoto} />
        ) : null}
        <Button titulo="Cancelar" variante="secundario" onPress={perfil.cerrarOpcionesFoto} />
      </Hoja>
    </ScrollView>
  );
}

function ContenidoConSesion({ perfil }: { perfil: PerfilViewModel }) {
  const { colores } = useTheme();

  if (perfil.estado === 'error') {
    return (
      <View style={styles.margen}>
        <EmptyState
          titulo="No pudimos cargar tu perfil"
          mensaje="Revisa tu conexión a internet e inténtalo de nuevo."
          accion={{ titulo: 'Reintentar', onPress: perfil.reintentar }}
        />
      </View>
    );
  }

  const datos = perfil.estado === 'listo' ? perfil.perfil : null;

  return (
    <>
      <Aviso tipo="exito" texto={perfil.avisoGuardado} estilo={styles.margen} />
      {datos ? (
        <View style={styles.identidad}>
          <Avatar
            foto={datos.foto}
            ocupada={perfil.fotoOcupada}
            onPress={perfil.abrirOpcionesFoto}
          />
          <Text style={[styles.nombre, { color: colores.texto }]}>{datos.nombre}</Text>
          <Text style={[styles.correo, { color: colores.textoSuave }]}>{datos.email}</Text>
        </View>
      ) : (
        <View style={styles.identidad} accessible accessibilityLabel="Cargando tus datos">
          <Skeleton estilo={styles.avatarEsqueleto} />
          <Skeleton estilo={styles.nombreEsqueleto} />
          <Skeleton estilo={styles.correoEsqueleto} />
        </View>
      )}

      <Aviso tipo="error" texto={perfil.errorFoto} estilo={styles.margen} />
      {perfil.permisoDenegado ? (
        <View style={[styles.permiso, { borderColor: colores.hairline }]}>
          <Text style={[styles.textoPermiso, { color: colores.texto }]}>
            Para elegir tu foto, permite que la app vea tus fotos desde los ajustes del teléfono.
          </Text>
          <Button titulo="Abrir ajustes" variante="secundario" onPress={perfil.abrirAjustes} />
        </View>
      ) : null}

      <Grupo titulo="Tu cuenta">
        <ListRow icono={UserPen} titulo="Editar perfil" onPress={perfil.editarPerfil} />
        <ListRow icono={KeyRound} titulo="Cambiar contraseña" onPress={perfil.cambiarContrasena} />
      </Grupo>

      <Grupo titulo="Tu actividad">
        {/* TODO(GP-06.1): abrir el historial de citas. */}
        <ListRow icono={CalendarDays} titulo="Mis citas" detalle="Disponible pronto" deshabilitada />
        {/* TODO(GP-06.3): abrir el historial de pedidos de la tienda. */}
        <ListRow icono={Package} titulo="Mis pedidos" detalle="Disponible pronto" deshabilitada />
      </Grupo>
    </>
  );
}

/** Avatar con la foto o el monograma; mientras se sube o se quita, muestra la carga encima. */
function Avatar({ foto, ocupada, onPress }: { foto: string | null; ocupada: boolean; onPress: () => void }) {
  const { colores, oscuro } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={foto ? 'Cambiar foto de perfil' : 'Elegir foto de perfil'}
      accessibilityState={{ busy: ocupada, disabled: ocupada }}
      disabled={ocupada}
      onPress={onPress}
      style={styles.avatar}
    >
      {foto ? (
        <Image
          source={{ uri: foto }}
          style={styles.foto}
          contentFit="cover"
          // Sin caché en disco: la foto no queda en el teléfono después de cerrar sesión.
          cachePolicy="memory"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Monograma tamano="grande" />
      )}
      {ocupada ? (
        <View style={[styles.cargaFoto, { backgroundColor: colores.velo }]}>
          <ActivityIndicator color={colores.oro} />
        </View>
      ) : (
        <View
          style={[
            styles.insignia,
            { backgroundColor: colores.accion, borderColor: oscuro ? colores.oro : colores.fondo },
          ]}
        >
          <Camera color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </View>
      )}
    </Pressable>
  );
}

/** Grupo de filas con su título. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  const { colores } = useTheme();
  return (
    <View style={styles.grupo}>
      <Text accessibilityRole="header" style={[styles.tituloGrupo, { color: colores.textoSuave }]}>
        {titulo}
      </Text>
      <View style={[styles.grupoFilas, { borderColor: colores.hairline }]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  contenido: {
    flexGrow: 1,
    paddingBottom: espacio.x3,
    gap: espacio.xxl,
  },
  margen: {
    marginHorizontal: pantalla.margen,
  },
  identidad: {
    alignItems: 'center',
    gap: espacio.m,
    paddingHorizontal: pantalla.margen,
  },
  avatar: {
    width: monograma.grande,
    height: monograma.grande,
  },
  foto: {
    width: monograma.grande,
    height: monograma.grande,
    borderRadius: radio.pastilla,
  },
  cargaFoto: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
  },
  // Señal de que el avatar se puede tocar: cámara en vino, abajo a la derecha.
  insignia: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    width: icono.tamano + espacio.m,
    height: icono.tamano + espacio.m,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radio.pastilla,
    borderWidth: borde.indicador,
  },
  avatarEsqueleto: {
    width: monograma.grande,
    height: monograma.grande,
    borderRadius: radio.pastilla,
  },
  nombre: {
    marginTop: espacio.s,
    textAlign: 'center',
    fontFamily: fuente.titulo,
    fontSize: tipo.subtitulo.tamano,
    lineHeight: tipo.subtitulo.linea,
    letterSpacing: tracking.titulo,
  },
  correo: {
    textAlign: 'center',
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
    lineHeight: tipo.cuerpo.linea,
  },
  nombreEsqueleto: {
    width: esqueleto.anchoCorto,
    height: esqueleto.lineaGrande,
    marginTop: espacio.s,
  },
  correoEsqueleto: {
    width: esqueleto.anchoMedio,
    height: esqueleto.linea,
  },
  permiso: {
    gap: espacio.m,
    marginHorizontal: pantalla.margen,
    padding: espacio.l,
    borderRadius: radio.campo,
    borderWidth: borde.hairline,
  },
  textoPermiso: {
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  grupo: {
    gap: espacio.s,
  },
  tituloGrupo: {
    paddingHorizontal: pantalla.margen,
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  grupoFilas: {
    borderTopWidth: borde.hairline,
    borderBottomWidth: borde.hairline,
  },
  cierre: {
    gap: espacio.m,
  },
});
