import { useRouter, type Href } from 'expo-router';
import { Search, X } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { EmptyState } from '@/shared/ui/EmptyState';
import { FilaPastillas } from '@/shared/ui/FilaPastillas';
import { PastillaFiltro } from '@/shared/ui/PastillaFiltro';
import { transicionBorde, useEntradaContenido, usePresion } from '@/shared/ui/movimiento';
import {
  borde,
  controles,
  espacio,
  fuente,
  icono,
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
  // El catálogo aparece una sola vez al terminar de cargar (no en cada tarjeta).
  const entrada = useEntradaContenido();

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
      <Animated.View entering={entrada} style={styles.seccion}>
        <Buscador valor={busqueda} onCambiar={setBusqueda} />
        <FilaPastillas>
          <PastillaFiltro
            texto="Todas"
            activo={categoria === null}
            onPress={() => setCategoria(null)}
            accessibilityLabel="Categoría Todas"
          />
          {categorias.map((c) => (
            <PastillaFiltro
              key={c}
              texto={c}
              activo={categoria === c}
              onPress={() => setCategoria(c)}
              accessibilityLabel={`Categoría ${c}`}
            />
          ))}
        </FilaPastillas>
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
      </Animated.View>
    );
  }

  return (
    <View style={styles.seccion}>
      {contenido}
    </View>
  );
}

/**
 * Campo de búsqueda con el aspecto de .mf-campo de la web (el mismo que el buscador de la tienda):
 * rectángulo de radio 10, borde de 1px, y al enfocar el borde toma el color de foco con su halo de 3px.
 */
function Buscador({ valor, onCambiar }: { valor: string; onCambiar: (texto: string) => void }) {
  const { colores } = useTheme();
  // Solo apariencia del campo: el texto buscado vive en el viewmodel.
  const [enfocado, setEnfocado] = useState(false);

  return (
    <Animated.View
      style={[
        styles.buscador,
        transicionBorde,
        {
          backgroundColor: colores.campoFondo,
          borderColor: enfocado ? colores.foco : colores.campoBorde,
        },
        // Halo del foco como .mf-campo:focus (3px de --mf-foco al 22 %).
        enfocado ? { boxShadow: `0 0 0 ${controles.halo}px ${colores.focoHalo}` } : null,
      ]}
    >
      <View accessible={false} importantForAccessibility="no-hide-descendants">
        <Search color={colores.campoPlaceholder} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </View>
      <TextInput
        value={valor}
        onChangeText={onCambiar}
        placeholder="Buscar servicio por nombre"
        placeholderTextColor={colores.campoPlaceholder}
        accessibilityLabel="Buscar un servicio por nombre"
        returnKeyType="search"
        autoCorrect={false}
        onFocus={() => setEnfocado(true)}
        onBlur={() => setEnfocado(false)}
        selectionColor={colores.foco}
        cursorColor={colores.foco}
        style={[styles.entrada, { color: colores.campoTexto }, valor ? null : styles.entradaSinBorrar]}
      />
      {valor ? <BotonBorrar onPress={() => onCambiar('')} /> : null}
    </Animated.View>
  );
}

/** Borra la búsqueda (48dp): se hunde a 0.97 al tocarlo como cualquier botón. */
function BotonBorrar({ onPress }: { onPress: () => void }) {
  const { colores } = useTheme();
  const { estilo, hundir, soltar } = usePresion();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Borrar búsqueda"
      onPress={onPress}
      onPressIn={hundir}
      onPressOut={soltar}
    >
      <Animated.View style={[styles.borrar, estilo]}>
        <X color={colores.campoTexto} size={icono.tamanoPequeno} strokeWidth={icono.trazo} />
      </Animated.View>
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
    borderRadius: radio.campo,
    borderWidth: borde.entrada,
  },
  entrada: {
    flex: 1,
    minHeight: toqueMinimo,
    fontFamily: fuente.texto,
    fontSize: tipo.cuerpo.tamano,
  },
  entradaSinBorrar: {
    paddingRight: espacio.l,
  },
  borrar: {
    width: toqueMinimo,
    height: toqueMinimo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  lista: {
    gap: espacio.m,
  },
});
