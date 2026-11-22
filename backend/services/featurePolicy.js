'use strict';

// Política de la versión, compartida con el renderer por /api/features.js.
// No depende de preferencias antiguas ni de la presencia de binarios opcionales.
module.exports = Object.freeze({
    subtitlesUI: false,
    transcription: false,
    subtitleFiles: true,
    languageTool: false,
    subtitlesMaintenanceMessage: 'Subtítulos está temporalmente en mantenimiento. Puedes seguir trabajando con archivos SRT existentes desde Audio.',
    languageToolMaintenanceMessage: 'La corrección con LanguageTool está temporalmente desactivada por optimización. Los diccionarios locales y la optimización de texto siguen activos.'
});
