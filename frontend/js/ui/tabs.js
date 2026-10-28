// js/ui/tabs.js — conmutador de pestañas por módulo + barra de flujo + auto-cambio a Audio
(function () {
    'use strict';

    function activar(tabId) {
        var paneles = document.querySelectorAll('.tab-panel');
        for (var i = 0; i < paneles.length; i++) {
            paneles[i].classList.toggle('tab-panel-activo', paneles[i].id === tabId);
        }

        var botones = document.querySelectorAll('.tab-btn[data-tab]');
        for (var j = 0; j < botones.length; j++) {
            var activo = botones[j].getAttribute('data-tab') === tabId;
            botones[j].classList.toggle('tab-btn-activo', activo);
            botones[j].setAttribute('aria-selected', activo ? 'true' : 'false');
        }

        // Barra de flujo: marcar activo y anteriores como hechos
        var pasos = document.querySelectorAll('.flow-step');
        var idx = -1;
        for (var k = 0; k < pasos.length; k++) {
            if (pasos[k].getAttribute('data-tab') === tabId) { idx = k; break; }
        }
        for (var m = 0; m < pasos.length; m++) {
            pasos[m].classList.toggle('flow-step-activo', m === idx);
            pasos[m].classList.toggle('flow-step-hecho', idx > -1 && m < idx);
        }

        try {
            document.dispatchEvent(new CustomEvent('loquendo:tab-activada', { detail: { tabId: tabId } }));
        } catch (e) { /* noop */ }
    }

    function irA(nombre) {
        activar('tab-' + nombre);
    }

    window.tabs = { activar: activar, irA: irA };

    document.addEventListener('DOMContentLoaded', function () {
        var botones = document.querySelectorAll('.tab-btn[data-tab]');
        for (var i = 0; i < botones.length; i++) {
            botones[i].addEventListener('click', function () {
                activar(this.getAttribute('data-tab'));
            });
        }

        var pasos = document.querySelectorAll('.flow-step[data-tab]');
        for (var j = 0; j < pasos.length; j++) {
            pasos[j].addEventListener('click', function () {
                activar(this.getAttribute('data-tab'));
            });
        }

        var tabInicial = 'tab-guion';
        try {
            if (window.settings && typeof window.settings.get === 'function') {
                var guardada = window.settings.get('startTab');
                if (guardada && document.getElementById(guardada)) tabInicial = guardada;
            }
        } catch (e) { /* usar Guion */ }
        activar(tabInicial);

        // Mantener oculto el placeholder cuando el reproductor ya está visible.
        // El cambio a la pestaña Audio lo hace cargarYReproducir() en cada audio.
        var player = document.getElementById('contenedorReproductor');
        var placeholder = document.getElementById('audioPlaceholder');
        function sincronizarPlaceholder() {
            if (!placeholder || !player) return;
            placeholder.style.display = (player.style.display === 'block') ? 'none' : '';
        }
        sincronizarPlaceholder();
        if (player && window.MutationObserver) {
            var obs = new MutationObserver(function (muts) {
                for (var n = 0; n < muts.length; n++) {
                    if (muts[n].attributeName === 'style') sincronizarPlaceholder();
                }
            });
            obs.observe(player, { attributes: true, attributeFilter: ['style'] });
        }
    });
})();
