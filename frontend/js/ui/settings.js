// js/ui/settings.js — Menú "Ajustes" (tema, ayudas, sonidos). Persistente en localStorage.
(function () {
    'use strict';

    var KEYS = {
        theme: 'loquendo.theme',
        help: 'loquendo.help',
        sounds: 'loquendo.sounds'
    };
    var DEFAULTS = { theme: 'dark', help: true, sounds: true };

    var themeActual = DEFAULTS.theme;
    var sonidosActivos = DEFAULTS.sounds;

    function leer(clave, def) {
        try {
            var v = localStorage.getItem(clave);
            return v === null ? def : v;
        } catch (e) { return def; }
    }
    function guardar(clave, valor) {
        try { localStorage.setItem(clave, valor); } catch (e) { /* modo privado */ }
    }
    function borrar(clave) {
        try { localStorage.removeItem(clave); } catch (e) { /* ignore */ }
    }

    // ---------- Tema ----------
    var mql = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

    function aplicarTema(t) {
        var root = document.documentElement;
        var resuelto = t;
        if (t === 'system') {
            resuelto = (mql && mql.matches) ? 'dark' : 'light';
        }
        root.setAttribute('data-theme', resuelto === 'light' ? 'light' : 'dark');
        document.querySelectorAll('[data-theme-opt]').forEach(function (b) {
            b.classList.toggle('activo', b.getAttribute('data-theme-opt') === t);
            b.setAttribute('aria-pressed', b.getAttribute('data-theme-opt') === t ? 'true' : 'false');
        });
    }

    function setTema(t) {
        if (['dark', 'light', 'system'].indexOf(t) === -1) t = DEFAULTS.theme;
        themeActual = t;
        guardar(KEYS.theme, t);
        aplicarTema(t);
    }

    if (mql && mql.addEventListener) {
        mql.addEventListener('change', function () {
            if (themeActual === 'system') aplicarTema('system');
        });
    }

    // ---------- Ayudas ----------
    function setAyudas(v) {
        var activo = !!v;
        guardar(KEYS.help, activo ? '1' : '0');
        if (window.helpSystem && typeof window.helpSystem.setEnabled === 'function') {
            window.helpSystem.setEnabled(activo);
        }
        var chk = document.getElementById('setAyudas');
        if (chk) chk.checked = activo;
    }

    // ---------- Sonidos de notificación (Web Audio, sin archivos) ----------
    var audioCtx = null;
    function ctx() {
        if (!audioCtx) {
            var AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return null;
            try { audioCtx = new AC(); } catch (e) { return null; }
        }
        if (audioCtx.state === 'suspended') { try { audioCtx.resume(); } catch (e) {} }
        return audioCtx;
    }

    var TONOS = {
        success: [[660, 0, 0.09], [880, 0.08, 0.11]],
        error: [[220, 0, 0.18], [180, 0.14, 0.16]],
        warning: [[520, 0, 0.12], [440, 0.10, 0.12]],
        info: [[600, 0, 0.08]]
    };

    function reproducirSonido(tipo) {
        var notas = TONOS[tipo] || TONOS.info;
        var c = ctx();
        if (!c) return;
        var t0 = c.currentTime;
        notas.forEach(function (n) {
            var osc = c.createOscillator();
            var gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.value = n[0];
            var ini = t0 + n[1];
            var fin = ini + n[2];
            gain.gain.setValueAtTime(0.0001, ini);
            gain.gain.exponentialRampToValueAtTime(0.06, ini + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, fin);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(ini);
            osc.stop(fin + 0.02);
        });
    }

    function setSonidos(v) {
        sonidosActivos = !!v;
        guardar(KEYS.sounds, sonidosActivos ? '1' : '0');
        var chk = document.getElementById('setSonidos');
        if (chk) chk.checked = sonidosActivos;
        if (sonidosActivos) reproducirSonido('info');
    }

    function engancharSonidos() {
        if (!window.notifications || window.__lsSoundsHooked) return;
        var orig = window.notifications.show;
        window.notifications.show = function (mensaje, tipo, duracion) {
            if (sonidosActivos) reproducirSonido(tipo || 'info');
            return orig.call(this, mensaje, tipo, duracion);
        };
        window.__lsSoundsHooked = true;
    }

    // ---------- Menú ----------
    function menu() { return document.getElementById('menuAjustes'); }
    function boton() { return document.getElementById('btnAjustes'); }

    function abrirMenu() {
        var m = menu(), b = boton();
        if (!m) return;
        m.hidden = false;
        if (b) b.setAttribute('aria-expanded', 'true');
    }
    function cerrarMenu() {
        var m = menu(), b = boton();
        if (!m) return;
        m.hidden = true;
        if (b) b.setAttribute('aria-expanded', 'false');
    }
    function toggleAjustes() {
        var m = menu();
        if (!m) return;
        if (m.hidden) abrirMenu(); else cerrarMenu();
    }

    function alClicFuera(e) {
        var m = menu();
        if (!m || m.hidden) return;
        if (m.contains(e.target)) return;
        if (e.target.closest && e.target.closest('#btnAjustes')) return;
        cerrarMenu();
    }

    // ---------- Restaurar ----------
    function restaurarAjustes() {
        borrar(KEYS.theme);
        borrar(KEYS.help);
        borrar(KEYS.sounds);

        themeActual = DEFAULTS.theme;
        sonidosActivos = DEFAULTS.sounds;
        aplicarTema(DEFAULTS.theme);
        if (window.helpSystem && typeof window.helpSystem.setEnabled === 'function') {
            window.helpSystem.setEnabled(DEFAULTS.help);
        }
        sincronizarUI();
        if (window.notifications && typeof window.notifications.info === 'function') {
            window.notifications.info('Ajustes restaurados');
        }
    }

    // ---------- UI ----------
    function sincronizarUI() {
        var chkA = document.getElementById('setAyudas');
        var chkS = document.getElementById('setSonidos');
        var ayudas = leer(KEYS.help, DEFAULTS.help ? '1' : '0') !== '0';
        if (chkA) chkA.checked = ayudas;
        if (chkS) chkS.checked = sonidosActivos;
        aplicarTema(themeActual);
    }

    function init() {
        // Estado inicial desde localStorage
        themeActual = leer(KEYS.theme, DEFAULTS.theme);
        if (['dark', 'light', 'system'].indexOf(themeActual) === -1) themeActual = DEFAULTS.theme;
        sonidosActivos = leer(KEYS.sounds, DEFAULTS.sounds ? '1' : '0') !== '0';

        aplicarTema(themeActual);

        var ayudas = leer(KEYS.help, DEFAULTS.help ? '1' : '0') !== '0';
        if (window.helpSystem && typeof window.helpSystem.setEnabled === 'function') {
            window.helpSystem.setEnabled(ayudas);
        }

        engancharSonidos();
        sincronizarUI();

        document.addEventListener('click', alClicFuera);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') cerrarMenu();
        });
    }

    // Aplicar tema lo antes posible (evita parpadeo)
    themeActual = leer(KEYS.theme, DEFAULTS.theme);
    if (['dark', 'light', 'system'].indexOf(themeActual) === -1) themeActual = DEFAULTS.theme;
    aplicarTema(themeActual);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.toggleAjustes = toggleAjustes;
    window.setTema = setTema;
    window.setAyudas = setAyudas;
    window.setSonidos = setSonidos;
    window.restaurarAjustes = restaurarAjustes;
    window.settings = {
        setTema: setTema,
        setAyudas: setAyudas,
        setSonidos: setSonidos,
        restaurar: restaurarAjustes,
        getTema: function () { return themeActual; }
    };
})();
