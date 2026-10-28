// js/ui/settings.js — Ajustes persistentes (interfaz, reproducción y mantenimiento).
(function () {
    'use strict';

    var KEYS = {
        theme: 'loquendo.theme',
        help: 'loquendo.help',
        tooltips: 'loquendo.tooltips',
        helpButtons: 'loquendo.help_buttons',
        tooltipDelay: 'loquendo.tooltip_delay',
        sounds: 'loquendo.sounds',
        soundVolume: 'loquendo.sound_volume',
        notifDuration: 'loquendo.notif_duration',
        startTab: 'loquendo.start_tab',
        rememberAutomation: 'loquendo.remember_automation',
        automationState: 'loquendo.automation_state',
        defaultVoice: 'loquendo.default_voice',
        defaultQuality: 'loquendo.default_quality',
        defaultNarration: 'loquendo.default_narration',
        autoplay: 'loquendo.autoplay',
        zoomInicial: 'loquendo.zoom_inicial',
        subtitleWords: 'loquendo.subtitle_words',
        subtitleDynamic: 'loquendo.subtitle_dynamic',
        subtitleSRTIA: 'loquendo.subtitle_srt_ia',
        audioMode: 'loquendo.audio_mode'
    };

    var DEFAULTS = {
        theme: 'dark',
        tooltips: true,
        helpButtons: true,
        tooltipDelay: 0,
        sounds: true,
        soundVolume: 50,
        notifDuration: 4000,
        startTab: 'tab-guion',
        rememberAutomation: true,
        defaultVoice: '',
        defaultQuality: '48k',
        defaultNarration: 'normal',
        autoplay: false,
        zoomInicial: 50,
        subtitleWords: 7,
        subtitleDynamic: true,
        subtitleSRTIA: false,
        audioMode: 'basico'
    };

    var AUTOMATION_IDS = [
        'chkComas', 'chkPuntos', 'chkOrtografia', 'chkGramatica',
        'chkPuntuacion', 'chkLoquendo', 'chkNeutro', 'chkSinonimos'
    ];

    var state = {};
    var audioCtx = null;

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

    function leerBool(clave, def) {
        var v = leer(clave, def ? '1' : '0');
        return v !== '0';
    }

    function leerNumero(clave, def) {
        var v = Number(leer(clave, def));
        return isFinite(v) ? v : def;
    }

    function cargarEstado() {
        var legacyHelp = leerBool(KEYS.help, true);
        state = {
            theme: ['dark', 'light', 'system'].indexOf(leer(KEYS.theme, DEFAULTS.theme)) !== -1
                ? leer(KEYS.theme, DEFAULTS.theme) : DEFAULTS.theme,
            tooltips: leerBool(KEYS.tooltips, legacyHelp),
            helpButtons: leerBool(KEYS.helpButtons, legacyHelp),
            tooltipDelay: leerNumero(KEYS.tooltipDelay, DEFAULTS.tooltipDelay),
            sounds: leerBool(KEYS.sounds, DEFAULTS.sounds),
            soundVolume: leerNumero(KEYS.soundVolume, DEFAULTS.soundVolume),
            notifDuration: leerNumero(KEYS.notifDuration, DEFAULTS.notifDuration),
            startTab: leer(KEYS.startTab, DEFAULTS.startTab),
            rememberAutomation: leerBool(KEYS.rememberAutomation, DEFAULTS.rememberAutomation),
            defaultVoice: leer(KEYS.defaultVoice, DEFAULTS.defaultVoice),
            defaultQuality: leer(KEYS.defaultQuality, DEFAULTS.defaultQuality),
            defaultNarration: leer(KEYS.defaultNarration, DEFAULTS.defaultNarration),
            autoplay: leerBool(KEYS.autoplay, DEFAULTS.autoplay),
            zoomInicial: leerNumero(KEYS.zoomInicial, DEFAULTS.zoomInicial),
            subtitleWords: leerNumero(KEYS.subtitleWords, DEFAULTS.subtitleWords),
            subtitleDynamic: leerBool(KEYS.subtitleDynamic, DEFAULTS.subtitleDynamic),
            subtitleSRTIA: leerBool(KEYS.subtitleSRTIA, DEFAULTS.subtitleSRTIA),
            audioMode: leer(KEYS.audioMode, DEFAULTS.audioMode) === 'avanzado' ? 'avanzado' : 'basico'
        };
    }

    function claveDe(k) {
        var mapa = {
            theme: KEYS.theme,
            tooltips: KEYS.tooltips,
            helpButtons: KEYS.helpButtons,
            tooltipDelay: KEYS.tooltipDelay,
            sounds: KEYS.sounds,
            soundVolume: KEYS.soundVolume,
            notifDuration: KEYS.notifDuration,
            startTab: KEYS.startTab,
            rememberAutomation: KEYS.rememberAutomation,
            defaultVoice: KEYS.defaultVoice,
            defaultQuality: KEYS.defaultQuality,
            defaultNarration: KEYS.defaultNarration,
            autoplay: KEYS.autoplay,
            zoomInicial: KEYS.zoomInicial,
            subtitleWords: KEYS.subtitleWords,
            subtitleDynamic: KEYS.subtitleDynamic,
            subtitleSRTIA: KEYS.subtitleSRTIA,
            audioMode: KEYS.audioMode
        };
        return mapa[k] || null;
    }

    function persistir(k) {
        var clave = claveDe(k);
        if (!clave) return;
        var valor = state[k];
        guardar(clave, typeof valor === 'boolean' ? (valor ? '1' : '0') : String(valor));
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

    if (mql && mql.addEventListener) {
        mql.addEventListener('change', function () {
            if (state.theme === 'system') aplicarTema('system');
        });
    }

    // ---------- Sonidos de notificación (Web Audio, sin archivos) ----------
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
        if (!state.sounds || state.soundVolume <= 0) return;
        var notas = TONOS[tipo] || TONOS.info;
        var c = ctx();
        if (!c) return;
        var volumen = Math.max(0, Math.min(1, state.soundVolume / 100)) * 0.12;
        var t0 = c.currentTime;
        notas.forEach(function (n) {
            var osc = c.createOscillator();
            var gain = c.createGain();
            osc.type = 'sine';
            osc.frequency.value = n[0];
            var ini = t0 + n[1];
            var fin = ini + n[2];
            gain.gain.setValueAtTime(0.0001, ini);
            gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volumen), ini + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, fin);
            osc.connect(gain);
            gain.connect(c.destination);
            osc.start(ini);
            osc.stop(fin + 0.02);
        });
    }

    function engancharSonidos() {
        if (!window.notifications || window.__lsSoundsHooked) return;
        var orig = window.notifications.show;
        window.notifications.show = function (mensaje, tipo, duracion) {
            reproducirSonido(tipo || 'info');
            return orig.call(this, mensaje, tipo, duracion);
        };
        window.__lsSoundsHooked = true;
    }

    // ---------- Aplicación de valores ----------
    function aplicarCalidad() {
        var sel = document.getElementById('calidadSeleccionada');
        if (sel && state.defaultQuality) sel.value = state.defaultQuality;
    }

    function aplicarNarracion() {
        var sel = document.getElementById('modo');
        if (sel && state.defaultNarration) sel.value = state.defaultNarration;
    }

    function aplicarZoomActual() {
        var editor = window.audioEditor;
        if (editor && editor.wavesurfer) {
            editor.wavesurfer.zoom(Number(state.zoomInicial) || 50);
        }
    }

    function aplicarSubtitulos() {
        var rango = document.getElementById('palabrasSubtitulo');
        var valor = document.getElementById('palabrasSubtituloValue');
        if (rango) rango.value = state.subtitleWords;
        if (valor) valor.textContent = state.subtitleWords;
        var dinamicos = document.getElementById('chkSubtitulosDinamicos');
        if (dinamicos) dinamicos.checked = state.subtitleDynamic;
        var srtIA = document.getElementById('chkSRT_IA');
        if (srtIA) srtIA.checked = state.subtitleSRTIA;
    }

    function aplicarModoAudio() {
        if (window.audioEditorUI && typeof window.audioEditorUI.setMode === 'function') {
            window.audioEditorUI.setMode(state.audioMode);
        }
    }

    function aplicarVozPorDefecto() {
        var select = document.getElementById('vozSeleccionada');
        if (!select || select.disabled || !select.options.length) return;
        if (!state.defaultVoice) return;
        var existe = Array.prototype.some.call(select.options, function (opt) {
            return opt.value === state.defaultVoice;
        });
        if (existe) select.value = state.defaultVoice;
    }

    function aplicar(k) {
        switch (k) {
            case 'theme':
                aplicarTema(state.theme);
                break;
            case 'tooltips':
                if (window.helpSystem) window.helpSystem.setTooltips(state.tooltips);
                break;
            case 'helpButtons':
                if (window.helpSystem) window.helpSystem.setHelpButtons(state.helpButtons);
                break;
            case 'tooltipDelay':
                if (window.helpSystem) window.helpSystem.setTooltipDelay(state.tooltipDelay);
                break;
            case 'notifDuration':
                if (window.notifications) window.notifications.defaultDuration = state.notifDuration;
                break;
            case 'rememberAutomation':
                if (state.rememberAutomation) guardarEstadoAutomatizacion();
                else borrar(KEYS.automationState);
                break;
            case 'defaultVoice':
                aplicarVozPorDefecto();
                break;
            case 'defaultQuality':
                aplicarCalidad();
                break;
            case 'defaultNarration':
                aplicarNarracion();
                break;
            case 'zoomInicial':
                aplicarZoomActual();
                break;
            case 'audioMode':
                aplicarModoAudio();
                break;
            case 'subtitleWords':
            case 'subtitleDynamic':
            case 'subtitleSRTIA':
                aplicarSubtitulos();
                break;
            default:
                break;
        }
    }

    function set(k, v) {
        if (!claveDe(k)) return v;
        if (typeof DEFAULTS[k] === 'boolean') v = !!v;
        else if (typeof DEFAULTS[k] === 'number') {
            var n = Number(v);
            v = isFinite(n) ? n : DEFAULTS[k];
        } else {
            v = String(v);
        }

        if (k === 'theme' && ['dark', 'light', 'system'].indexOf(v) === -1) v = DEFAULTS.theme;
        if (k === 'audioMode' && v !== 'avanzado') v = 'basico';

        state[k] = v;
        persistir(k);
        aplicar(k);
        sincronizarUI();
        return v;
    }

    function get(k) {
        return state[k];
    }

    // ---------- Automatización ----------
    function guardarEstadoAutomatizacion() {
        if (!state.rememberAutomation) return;
        var datos = {};
        AUTOMATION_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) datos[id] = !!el.checked;
        });
        guardar(KEYS.automationState, JSON.stringify(datos));
    }

    function aplicarEstadoAutomatizacion() {
        if (!state.rememberAutomation) return;
        var raw = leer(KEYS.automationState, null);
        if (!raw) return;
        try {
            var datos = JSON.parse(raw);
            AUTOMATION_IDS.forEach(function (id) {
                var el = document.getElementById(id);
                if (el && Object.prototype.hasOwnProperty.call(datos, id)) {
                    el.checked = !!datos[id];
                }
            });
        } catch (e) { /* JSON inválido */ }
    }

    function actualizarEstadoAutomatizacionDesdeUI() {
        if (state.rememberAutomation) guardarEstadoAutomatizacion();
    }

    // ---------- Menú ----------
    function menu() { return document.getElementById('menuAjustes'); }
    function boton() { return document.getElementById('btnAjustes'); }

    function activarTab(nombre, enfocar) {
        var tabs = document.querySelectorAll('[data-settings-tab]');
        var activa = null;
        for (var i = 0; i < tabs.length; i++) {
            var activo = tabs[i].getAttribute('data-settings-tab') === nombre;
            tabs[i].classList.toggle('activo', activo);
            tabs[i].setAttribute('aria-selected', activo ? 'true' : 'false');
            tabs[i].tabIndex = activo ? 0 : -1;
            if (activo) activa = tabs[i];
        }
        var paneles = document.querySelectorAll('[data-settings-panel]');
        for (var j = 0; j < paneles.length; j++) {
            var visible = paneles[j].getAttribute('data-settings-panel') === nombre;
            paneles[j].classList.toggle('activo', visible);
            paneles[j].setAttribute('aria-hidden', visible ? 'false' : 'true');
        }
        if (enfocar && activa) activa.focus();
    }

    function posicionarMenu() {
        var m = menu(), b = boton();
        if (!m || !b) return;
        var rectBoton = b.getBoundingClientRect();
        var parent = m.offsetParent || m.parentElement;
        var rectParent = parent.getBoundingClientRect();
        var ancho = m.offsetWidth;
        var margen = 12;
        var left = rectBoton.right - ancho;
        if (left < margen) left = margen;
        if (left + ancho > window.innerWidth - margen) left = window.innerWidth - ancho - margen;
        if (left < margen) left = margen;
        m.style.left = Math.round(left - rectParent.left) + 'px';
        m.style.right = 'auto';
    }

    function abrirMenu() {
        var m = menu(), b = boton();
        if (!m) return;
        sincronizarUI();
        m.hidden = false;
        posicionarMenu();
        if (b) b.setAttribute('aria-expanded', 'true');
        var activa = document.querySelector('[data-settings-tab].activo');
        if (activa) activa.focus();
    }

    function cerrarMenu(devolverFoco) {
        var m = menu(), b = boton();
        if (!m) return;
        m.hidden = true;
        if (b) b.setAttribute('aria-expanded', 'false');
        if (devolverFoco && b) b.focus();
    }

    function toggleAjustes() {
        var m = menu();
        if (!m) return;
        if (m.hidden) abrirMenu(); else cerrarMenu(true);
    }

    function alClicFuera(e) {
        var m = menu();
        if (!m || m.hidden) return;
        if (m.contains(e.target)) return;
        if (e.target.closest && e.target.closest('#btnAjustes')) return;
        cerrarMenu(false);
    }

    // ---------- Restaurar ----------
    function restaurarAjustes() {
        var confirmado = typeof window.confirm !== 'function'
            || window.confirm('Se restaurarán todos los ajustes. Los diccionarios y tus archivos no se tocan. ¿Continuar?');
        if (!confirmado) return false;
        Object.keys(KEYS).forEach(function (k) { borrar(KEYS[k]); });
        cargarEstado();
        aplicarTodo();
        sincronizarUI();
        if (window.notifications && typeof window.notifications.info === 'function') {
            window.notifications.info('Ajustes restaurados');
        }
        return true;
    }

    // ---------- Limpieza de temporales ----------
    function apiBase() {
        return (window.CONFIG && window.CONFIG.API_BASE) || window.API_BASE || 'http://localhost:3000';
    }

    function formatearBytes(bytes) {
        var n = Number(bytes) || 0;
        if (n < 1024) return n + ' B';
        if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
        return (n / (1024 * 1024)).toFixed(1) + ' MB';
    }

    async function limpiarTemporales() {
        var ok = window.confirm('Se borrarán audios y PNGtuber de más de 24 horas. ¿Continuar?');
        if (!ok) return;
        var botonLimpiar = document.getElementById('btnLimpiarTemporales');
        var htmlOriginal = botonLimpiar ? botonLimpiar.innerHTML : '';
        if (botonLimpiar) {
            botonLimpiar.disabled = true;
            botonLimpiar.setAttribute('aria-busy', 'true');
            botonLimpiar.textContent = 'Limpiando…';
        }
        try {
            var conservar = [];
            [
                window.voiceAudioRealPath,
                window.voiceAudioOriginalPath,
                window.musicaFondoPath,
                window.pngtuberIdlePath,
                window.pngtuberTalkingPath,
                window.pngtuberBlinkPath
            ].forEach(function (ruta) {
                if (ruta && conservar.indexOf(ruta) === -1) conservar.push(ruta);
            });
            var res = await fetch(apiBase() + '/api/limpiar-temporales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conservar: conservar })
            });
            var data = await res.json();
            if (!res.ok) throw new Error(data.error || 'No se pudieron limpiar los temporales');
            var mensaje = 'Temporales limpiados: ' + (data.eliminados || 0) + ' archivo(s), ' + formatearBytes(data.bytes) + ' liberados';
            if (window.notifications) {
                if (data.errores) {
                    window.notifications.warning(mensaje + ' (' + data.errores + ' en uso, no borrados)');
                } else {
                    window.notifications.success(mensaje);
                }
            }
        } catch (e) {
            if (window.notifications) window.notifications.error('Error al limpiar temporales: ' + e.message);
        } finally {
            if (botonLimpiar) {
                botonLimpiar.innerHTML = htmlOriginal;
                botonLimpiar.disabled = false;
                botonLimpiar.removeAttribute('aria-busy');
            }
        }
    }

    // ---------- UI ----------
    function valor(id, v) {
        var el = document.getElementById(id);
        if (el) el.value = v;
    }

    function marcado(id, v) {
        var el = document.getElementById(id);
        if (el) el.checked = !!v;
    }

    function sincronizarUI() {
        if (!menu()) return;
        aplicarTema(state.theme);
        valor('setTabInicial', state.startTab);
        marcado('setTooltips', state.tooltips);
        marcado('setAyudas', state.helpButtons);
        valor('setTooltipDelay', state.tooltipDelay);
        marcado('setSonidos', state.sounds);
        valor('setVolumenNotif', state.soundVolume);
        var vol = document.getElementById('setVolumenNotifValue');
        if (vol) vol.textContent = state.soundVolume + '%';
        valor('setDuracionNotif', state.notifDuration);
        marcado('setRecordarAutomatizacion', state.rememberAutomation);
        marcado('setAutoplay', state.autoplay);
        valor('setZoomInicial', state.zoomInicial);
    }

    function aplicarTodo() {
        aplicarTema(state.theme);
        if (window.helpSystem) {
            window.helpSystem.setTooltips(state.tooltips);
            window.helpSystem.setHelpButtons(state.helpButtons);
            window.helpSystem.setTooltipDelay(state.tooltipDelay);
        }
        if (window.notifications) window.notifications.defaultDuration = state.notifDuration;
        aplicarCalidad();
        aplicarNarracion();
        aplicarSubtitulos();
        aplicarEstadoAutomatizacion();
        aplicarZoomActual();
        aplicarModoAudio();
    }

    function bindUI() {
        var mapa = {
            setTabInicial: 'startTab',
            setTooltips: 'tooltips',
            setTooltipDelay: 'tooltipDelay',
            setDuracionNotif: 'notifDuration',
            setRecordarAutomatizacion: 'rememberAutomation',
            setAutoplay: 'autoplay',
            setZoomInicial: 'zoomInicial'
        };

        Object.keys(mapa).forEach(function (id) {
            var el = document.getElementById(id);
            if (!el) return;
            el.addEventListener('change', function () {
                var k = mapa[id];
                set(k, el.type === 'checkbox' ? el.checked : el.value);
            });
        });

        var ayudas = document.getElementById('setAyudas');
        if (ayudas) {
            ayudas.addEventListener('change', function () {
                set('helpButtons', ayudas.checked);
            });
        }

        var volumen = document.getElementById('setVolumenNotif');
        if (volumen) {
            volumen.addEventListener('input', function () {
                var display = document.getElementById('setVolumenNotifValue');
                if (display) display.textContent = volumen.value + '%';
            });
            volumen.addEventListener('change', function () {
                set('soundVolume', volumen.value);
            });
        }

        var settingsTabs = Array.prototype.slice.call(document.querySelectorAll('[data-settings-tab]'));
        settingsTabs.forEach(function (tab, indice) {
            tab.addEventListener('click', function () {
                activarTab(tab.getAttribute('data-settings-tab'), false);
            });
            tab.addEventListener('keydown', function (e) {
                var destino = null;
                if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
                    destino = (indice + 1) % settingsTabs.length;
                } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
                    destino = (indice - 1 + settingsTabs.length) % settingsTabs.length;
                } else if (e.key === 'Home') {
                    destino = 0;
                } else if (e.key === 'End') {
                    destino = settingsTabs.length - 1;
                }
                if (destino === null) return;
                e.preventDefault();
                activarTab(settingsTabs[destino].getAttribute('data-settings-tab'), true);
            });
        });

        var limpiar = document.getElementById('btnLimpiarTemporales');
        if (limpiar) limpiar.addEventListener('click', limpiarTemporales);

        AUTOMATION_IDS.forEach(function (id) {
            var el = document.getElementById(id);
            if (el) el.addEventListener('change', actualizarEstadoAutomatizacionDesdeUI);
        });

        var voz = document.getElementById('vozSeleccionada');
        if (voz) {
            voz.addEventListener('change', function () {
                set('defaultVoice', voz.value);
            });
        }
        var calidad = document.getElementById('calidadSeleccionada');
        if (calidad) {
            calidad.addEventListener('change', function () {
                set('defaultQuality', calidad.value);
            });
        }
        var narracion = document.getElementById('modo');
        if (narracion) {
            narracion.addEventListener('change', function () {
                set('defaultNarration', narracion.value);
            });
        }

        var subRango = document.getElementById('palabrasSubtitulo');
        if (subRango) {
            subRango.addEventListener('change', function () {
                set('subtitleWords', subRango.value);
            });
        }
        var subDinamicos = document.getElementById('chkSubtitulosDinamicos');
        if (subDinamicos) {
            subDinamicos.addEventListener('change', function () {
                set('subtitleDynamic', subDinamicos.checked);
            });
        }
        var srtIA = document.getElementById('chkSRT_IA');
        if (srtIA) {
            srtIA.addEventListener('change', function () {
                set('subtitleSRTIA', srtIA.checked);
            });
        }

        document.addEventListener('click', alClicFuera);
        document.addEventListener('keydown', function (e) {
            var m = menu();
            if (e.key === 'Escape' && m && !m.hidden) cerrarMenu(true);
        });
        window.addEventListener('resize', function () {
            var m = menu();
            if (m && !m.hidden) posicionarMenu();
        });
    }

    function setTema(t) {
        return set('theme', t);
    }

    function setAyudas(v) {
        set('tooltips', v);
        set('helpButtons', v);
        return !!v;
    }

    function setTooltips(v) {
        return set('tooltips', v);
    }

    function setBotonesAyuda(v) {
        return set('helpButtons', v);
    }

    function setTooltipDelay(v) {
        return set('tooltipDelay', v);
    }

    function setSonidos(v) {
        var activo = !!v;
        set('sounds', activo);
        if (activo) reproducirSonido('info');
        return activo;
    }

    function init() {
        engancharSonidos();
        aplicarTodo();
        bindUI();
        sincronizarUI();
    }

    // Estado y tema lo antes posible para evitar parpadeo.
    cargarEstado();
    aplicarTema(state.theme);

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.toggleAjustes = toggleAjustes;
    window.setTema = setTema;
    window.setAyudas = setAyudas;
    window.setTooltips = setTooltips;
    window.setBotonesAyuda = setBotonesAyuda;
    window.setTooltipDelay = setTooltipDelay;
    window.setAjuste = set;
    window.setSonidos = setSonidos;
    window.restaurarAjustes = restaurarAjustes;
    window.limpiarTemporalesDesdeAjustes = limpiarTemporales;
    window.settings = {
        get: get,
        set: set,
        setTema: setTema,
        setAyudas: setAyudas,
        setTooltips: setTooltips,
        setBotonesAyuda: setBotonesAyuda,
        setSonidos: setSonidos,
        restaurar: restaurarAjustes,
        aplicarVozPorDefecto: aplicarVozPorDefecto,
        limpiarTemporales: limpiarTemporales,
        getTema: function () { return state.theme; }
    };
})();
