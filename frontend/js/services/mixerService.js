// services/mixerService.js - Fachada pública del mezclador (la lógica vive en services/mixer/*)
(function (global) {
    'use strict';

    const app = global.MixerApp;

    function init() {
        const raiz = document.getElementById('mezcladorPistas');
        if (!raiz) return;
        app.inspector.init();
        app.timeline.inicializar(raiz);
    }

    function renderizarMezcla(formato) {
        const selector = document.getElementById('mixerRenderFormato');
        const elegido = formato || (selector && selector.value) || 'wav';
        return app.project.renderizarMezcla(elegido);
    }

    global.mixer = {
        init,
        agregarVozActual: app.media.agregarVozActual,
        agregarMusicaActual: app.media.agregarMusicaActual,
        cargarArchivosSfx: app.media.cargarArchivosSfx,
        vaciar: app.media.vaciar,
        play: app.transport.play,
        pausa: app.transport.pausa,
        detener: app.transport.detener,
        irA: app.transport.irA,
        zoomIn: app.transport.zoomIn,
        zoomOut: app.transport.zoomOut,
        zoomReset: app.transport.zoomReset,
        guardarProyecto: app.project.exportarProyecto,
        importarProyecto: app.project.importarProyecto,
        renderizarMezcla,
        estado: app.store.state,
        app
    };
})(window);
