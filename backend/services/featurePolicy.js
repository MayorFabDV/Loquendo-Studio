'use strict';

// Política de la versión, compartida con el renderer por /api/features.js.
// No depende de preferencias antiguas ni de la presencia de binarios opcionales.
module.exports = Object.freeze({
    subtitlesUI: false,
    transcription: false,
    subtitleFiles: true,
    languageTool: true,
    subtitlesMaintenanceMessage: 'Subtítulos está temporalmente en mantenimiento. Puedes seguir trabajando con archivos SRT existentes desde Audio.'
});
