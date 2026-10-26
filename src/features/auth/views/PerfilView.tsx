import { Image } from 'expo-image';
import {
  CalendarDays,
  Camera,
  KeyRound,
  LogOut,
  Package,
  Palette,
  ShieldCheck,
  Store,
  UserCog,
  UserPen,
} from 'lucide-react-native';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { FilaAvisosEnApp } from '@/features/notificaciones/components/FilaAvisosEnApp';
import { Button } from '@/shared/ui/Button';
import { EmptyState } from '@/shared/ui/EmptyState';
import { Hoja } from '@/shared/ui/Hoja';
import { Monograma } from '@/shared/ui/Monograma';
import { useEntradaContenido, usePresion } from '@/shared/ui/movimiento';
import { ScreenHeader } from '@/shared/ui/ScreenHeader';
import { Skeleton } from '@/shared/ui/Skeleton';
import { FilaTarjeta, SeccionFilas } from '@/shared/ui/TarjetaFilas';
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
import { HojaConfirmacion } from '../components/HojaConfirmacion';
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

      <SeccionFilas titulo="Configuración" estilo={styles.separacionSeccion}>
        {/* Horario, ubicación y contacto del salón: con y sin sesión. */}
        <FilaTarjeta
          icono={Store}
          titulo={perfil.filaSalon.titulo}
          descripcion={perfil.filaSalon.descripcion}
          onPress={perfil.abrirSalon}
        />
        <FilaTarjeta
          icono={Palette}
          titulo="Apariencia"
          descripcion="Claro, oscuro o igual que tu teléfono."
          onPress={perfil.abrirApariencia}
        />
        {/* Avisos internos en vivo (GP-07.6): la preferencia es de cada clienta, solo con sesión. */}
        {perfil.estado === 'sinSesion' ? null : <FilaAvisosEnApp />}
        <FilaTarjeta
          icono={ShieldCheck}
          titulo="Aviso de privacidad"
          descripcion="Cómo cuidamos tus datos personales."
          onPress={perfil.abrirAviso}
          accessibilityHint="Se abre en el navegador"
        />
      </SeccionFilas>

      {perfil.estado === 'sinSesion' ? null : (
        <View style={[styles.cierre, styles.separacionSeccion]}>
          <SeccionFilas>
            <FilaTarjeta
              icono={LogOut}
              titulo="Cerrar sesión"
              descripcion="Sal de tu cuenta en este teléfono."
              destructiva
              deshabilitada={perfil.fotoOcupada}
              onPress={perfil.cerrarSesion}
            />
          </SeccionFilas>
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
      <HojaConfirmacion
        visible={perfil.confirmarQuitarFoto}
        titulo="¿Quitar tu foto?"
        texto="Tu perfil mostrará el monograma en su lugar."
        accion="Quitar foto"
        onConfirmar={perfil.quitarFotoConfirmada}
        onCancelar={perfil.cancelarConfirmacion}
      />
      <HojaConfirmacion
        visible={perfil.confirmarCierre}
        titulo="¿Cerrar sesión?"
        texto={
          perfil.perfil?.tienePassword === false
            ? 'Podrás volver a entrar con Google.'
            : 'Podrás volver a entrar con tu correo y tu contraseña.'
        }
        accion="Cerrar sesión"
        onConfirmar={perfil.cerrarSesionConfirmada}
        onCancelar={perfil.cancelarConfirmacion}
      />
    </ScrollView>
  );
}

function ContenidoConSesion({ perfil }: { perfil: PerfilViewModel }) {
  const { colores } = useTheme();
  const entrada = useEntradaContenido();

  if (perfil.estado === 'error') {
    return (
      <View style={styles.margen}>
        <EmptyState
          titulo="No pudimos cargar tu perfil"
          mensaje={perfil.mensajeError ?? ''}
          accion={{ titulo: 'Reintentar', onPress: perfil.reintentar }}
        />
      </View>
    );
  }

  const datos = perfil.estado === 'listo' ? perfil.perfil : null;

  return (
    <>
      <Aviso tipo="exito" texto={perfil.avisoGuardado} estilo={styles.margen} />
      {/* Al llegar los datos, la identidad reemplaza al skeleton apareciendo en 220 ms. */}
      {datos ? (
        <Animated.View entering={entrada} style={styles.identidad}>
          <Avatar
            foto={datos.foto}
            ocupada={perfil.fotoOcupada}
            onPress={perfil.abrirOpcionesFoto}
          />
          <Text style={[styles.nombre, { color: colores.texto }]}>{datos.nombre}</Text>
          <Text style={[styles.correo, { color: colores.textoSuave }]}>{datos.email}</Text>
        </Animated.View>
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

      <SeccionFilas titulo="Tu cuenta" estilo={styles.separacionSeccion}>
        <FilaTarjeta
          icono={UserPen}
          titulo="Editar perfil"
          descripcion="Nombre, teléfono, fecha de nacimiento y datos de tu cabello."
          onPress={perfil.editarPerfil}
        />
        {datos?.tienePassword === false ? (
          <FilaTarjeta
            icono={KeyRound}
            titulo="Cambiar contraseña"
            descripcion="Entras con Google, así que no usas contraseña."
            deshabilitada
          />
        ) : (
          // Mientras carga no se sabe si la cuenta tiene contraseña: se habilita al tener los datos.
          <FilaTarjeta
            icono={KeyRound}
            titulo="Cambiar contraseña"
            descripcion="Confirma el cambio con un código que llega a tu correo."
            deshabilitada={!datos}
            onPress={perfil.cambiarContrasena}
          />
        )}
        <FilaTarjeta
          icono={UserCog}
          titulo={perfil.filaMiCuenta.titulo}
          descripcion={perfil.filaMiCuenta.descripcion}
          onPress={perfil.abrirMiCuenta}
        />
      </SeccionFilas>

      <SeccionFilas titulo="Tu actividad" estilo={styles.separacionSeccion}>
        <FilaTarjeta
          icono={CalendarDays}
          titulo="Mis citas"
          descripcion="Tus próximas citas y tu historial."
          onPress={perfil.abrirMisCitas}
        />
        <FilaTarjeta
          icono={Package}
          titulo="Mis pedidos"
          descripcion="Tus compras y cuándo puedes recogerlas."
          onPress={perfil.abrirMisPedidos}
        />
      </SeccionFilas>
    </>
  );
}

/** Avatar con la foto o el monograma; mientras se sube o se quita, muestra la carga encima. */
function Avatar({ foto, ocupada, onPress }: { foto: string | null; ocupada: boolean; onPress: () => void }) {
  const { colores } = useTheme();
  const { estilo: estiloPresion, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={etiquetaAvatar(foto, ocupada)}
      accessibilityState={{ busy: ocupada, disabled: ocupada }}
      disabled={ocupada}
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      {/* Se hunde como un botón al tocarlo (140 ms). */}
      <Animated.View style={[styles.avatar, estiloPresion]}>
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
          <View style={[styles.cargaFoto, { backgroundColor: colores.veloVisor }]}>
            <ActivityIndicator color={colores.oroTextoPequeno} />
          </View>
        ) : (
          <View
            style={[
              styles.insignia,
              // Anillo --oro-grande: 3.7:1 sobre lino y 6.7:1 sobre carbón; separa el vino del fondo.
              { backgroundColor: colores.accion, borderColor: colores.oroGrande },
            ]}
          >
            <Camera color={colores.textoSobreAccion} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
          </View>
        )}
      </Animated.View>
    </Pressable>
  );
}

function etiquetaAvatar(foto: string | null, ocupada: boolean): string {
  if (ocupada) {
    return 'Guardando foto de perfil';
  }
  return foto ? 'Cambiar foto de perfil' : 'Elegir foto de perfil';
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
    letterSpacing: tracking.subtitulo,
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
    fontSize: tipo.parrafo.tamano,
    lineHeight: tipo.parrafo.linea,
  },
  // 32 entre secciones como .mf-perfil de la web: el contenido ya separa 24 con su gap.
  separacionSeccion: {
    marginTop: espacio.x3 - espacio.xxl,
  },
  cierre: {
    gap: espacio.m,
  },
});
