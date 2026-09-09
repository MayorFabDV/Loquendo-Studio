// frontend/js/index.js
// Este archivo se encarga de cargar y orquestar todos los módulos del frontend

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Iniciando Loquendo Studio Frontend...');

    // 1. Verificar que las dependencias críticas estén cargadas
    if (typeof WaveSurfer === 'undefined') {
        console.error('❌ WaveSurfer no está cargado. Verifica los scripts en index.html');
        return;
    }

    // 2. Inicializar el procesador de audio
    if (window.audioProcessor) {
        window.audioProcessor.inicializar('#waveform');
        window.audioProcessor.inicializarMusica('#waveform-musica-inner');
        console.log('✅ AudioProcessor listo');
    }

    // 3. Inicializar la UI (tu main.js actual)
    // Compatibilidad: si `mainUI` está expuesto por `main.js` como módulo, inicializarlo
    if (window.mainUI && typeof window.mainUI.init === 'function') {
        window.mainUI.init();
    } else if (typeof iniciarUI === 'function') {
        iniciarUI();
    }

    console.log('🎉 Loquendo Studio Frontend cargado correctamente');
});