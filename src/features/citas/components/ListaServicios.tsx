import { useRouter, type Href } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { EmptyState } from '@/shared/ui/EmptyState';
import {
  borde,
  espacio,
  fuente,
  icono,
  pantalla,
  radio,
  tipo,
  toqueMinimo,
} from '@/shared/ui/tokens';
import { useTheme } from '@/shared/ui/useTheme';

import type { CatalogoServiciosViewModel } from '../viewmodels/useCatalogoServiciosViewModel';
import { TarjetaServicio, TarjetaServicioEsqueleto } from './TarjetaServicio';

const ESQUELETOS = [0, 1, 2];

/** Catálogo de servicios: buscador, filtro por categoría, estados de red y la lista de tarjetas. */
export function ListaServicios({ catalogo }: { catalogo: CatalogoServiciosViewModel }) {
  const { push } = useRouter();
  const {
    estado,
    recargar,
    busqueda,
    setBusqueda,
    categoria,
    setCategoria,
    categorias,
    serviciosVisibles,
    hayServicios,
  } = catalogo;

  const verTodos = () => {
    setBusqueda('');
    setCategoria(null);
  };

  let contenido;
  if (estado === 'cargando') {
    contenido = (
      <View accessible accessibilityLabel="Cargando servicios" style={styles.lista}>
        {ESQUELETOS.map((i) => (
          <TarjetaServicioEsqueleto key={i} />
        ))}
      </View>
    );
  } else if (estado === 'error') {
    contenido = (
      <EmptyState
        titulo="No pudimos cargar los servicios"
        mensaje="Revisa tu conexión e intenta de nuevo."
        accion={{ titulo: 'Reintentar', onPress: recargar }}
      />
    );
  } else if (!hayServicios) {
    contenido = (
      <EmptyState
        titulo="Pronto verás aquí los servicios"
        mensaje="El salón aún no publica servicios en la app."
      />
    );
  } else {
    contenido = (
      <>
        <Buscador valor={busqueda} onCambiar={setBusqueda} />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          style={styles.filtros}
          contentContainerStyle={styles.filas}
        >
          <Chip texto="Todas" activo={categoria === null} onPress={() => setCategoria(null)} />
          {categorias.map((c) => (
            <Chip key={c} texto={c} activo={categoria === c} onPress={() => setCategoria(c)} />
          ))}
        </ScrollView>
        {serviciosVisibles.length === 0 ? (
          <EmptyState
            titulo="Sin resultados"
            mensaje="No encontramos servicios con ese nombre. Prueba con otra palabra o elige Todas."
            accion={{ titulo: 'Ver todos', onPress: verTodos }}
          />
        ) : (
          <View style={styles.lista}>
            {serviciosVisibles.map((servicio) => (
              <TarjetaServicio
                key={servicio.id}
                servicio={servicio}
                onPress={() => push(`/servicio/${servicio.id}` as Href)}
              />
            ))}
          </View>
        )}
      </>
    );
  }

  return (
    <View style={styles.seccion}>
      {contenido}
    </View>
  );
}

/** Campo de búsqueda con el aspecto de SearchBar, pero que sí escribe. */
function Buscador({ valor, onCambiar }: { valor: string; onCambiar: (texto: string) => void }) {
  const { colores } = useTheme();
  const [enfocado, setEnfocado] = useState(false);

  return (
    <View
      style={[
        styles.buscador,
        {
          backgroundColor: colores.campoFondo,
          borderColor: enfocado ? colores.foco : colores.campoBorde,
        },
      ]}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Search color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <TextInput
        value={valor}
        onChangeText={onCambiar}
        placeholder="Buscar un servicio"
        placeholderTextColor={colores.campoPlaceholder}
        accessibilityLabel="Buscar un servicio por nombre"
        returnKeyType="search"
        autoCorrect={false}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        selectionColor={colores.foco}
        cursorColor={colores.foco}
        style={[styles.entrada, { color: colores.campoTexto }]}
      />
      {valor ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Borrar búsqueda"
          onPress={() => onCambiar('')}
          style={styles.borrar}
        >
          <X color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
        </Pressable>
      ) : null}
    </View>
  );
}

function Chip({ texto, activo, onPress }: { texto: string; activo: boolean; onPress: () => void }) {
  const { colores } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: activo }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: activo ? colores.accion : colores.superficieSecundaria },
      ]}
    >
      <Text style={[styles.textoChip, { color: activo ? colores.textoSobreAccion : colores.texto }]}>
        {texto}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  seccion: {
    gap: espacio.l,
  },
  buscador: {
    minHeight: toqueMinimo,
    flexDirection: 'row',
    alignItems: 'center',
    gap: espacio.s,
    paddingLeft: espacio.l,
    borderRadius: radio.pastilla,
    borderWidth: borde.hairline,
  },
  entrada: {
    flex: 1,
    minHeight: toqueMinimo,
    paddingRight: espacio.l,
    fontFamily: fuente.texto,
    fontSize: tipo.pequeno.tamano,
  },
  borrar: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Los chips llegan hasta el borde de la pantalla al desplazarse; el relleno conserva el margen.
  filtros: {
    marginHorizontal: -pantalla.margen,
  },
  filas: {
    gap: espacio.s,
    paddingHorizontal: pantalla.margen,
  },
  chip: {
    minHeight: toqueMinimo,
    justifyContent: 'center',
    paddingHorizontal: espacio.l,
    borderRadius: radio.pastilla,
  },
  textoChip: {
    fontFamily: fuente.textoMedio,
    fontSize: tipo.pequeno.tamano,
    lineHeight: tipo.pequeno.linea,
  },
  lista: {
    gap: espacio.m,
  },
});
