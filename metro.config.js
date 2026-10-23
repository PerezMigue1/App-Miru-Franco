const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// OFUSCAR_JS solo se define en los perfiles preview y production de eas.json.
// Sin ella se exporta la configuración de Expo intacta (Expo Go, desarrollo y Jest).
if (process.env.OFUSCAR_JS !== '1') {
  module.exports = config;
} else {
  const transformador = require.resolve('./metro-transformador-ofuscacion');
  const { claveCacheOfuscacion } = require(transformador);

  module.exports = {
    ...config,
    // Expo CLI lo envuelve con su supervisor, que delega en esta ruta.
    transformerPath: transformador,
    transformer: {
      ...config.transformer,
      // Metro manda config.transformer a cada worker y lo hashea en la llave de caché.
      miruOfuscacion: {
        // El worker que puso getDefaultConfig, relativo para no meter rutas absolutas en la caché.
        transformadorBase: path.relative(config.projectRoot, config.transformerPath),
        claveCache: claveCacheOfuscacion(),
      },
    },
  };
}
