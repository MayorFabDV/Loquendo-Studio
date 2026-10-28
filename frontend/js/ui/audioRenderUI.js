(function () {
    'use strict';

    var EXTENSIONES = { wav: 'wav', mp3: 'mp3', flac: 'flac', opus: 'opus' };

    function editor() {
        return window.audioEditor;
    }

    function notificar(tipo, mensaje) {
        if (window.notifications && typeof window.notifications[tipo] === 'function') {
            window.notifications[tipo](mensaje);
        }
    }

    function formatDb(valor) {
        if (valor === null || valor === undefined || !isFinite(valor)) return '-∞ dB';
        return (valor > 0 ? '+' : '') + Number(valor).toFixed(1) + ' dB';
    }

    function rutaActual() {
        var ruta = window.voiceAudioRealPath || '';
        if (!ruta || /^(blob:|data:)/i.test(ruta)) return '';
        return ruta;
    }

    async function rutaActualPersistida() {
        var inst = editor();
        if (inst && typeof inst.asegurarAudioPersistido === 'function') {
            try {
                var ruta = await inst.asegurarAudioPersistido();
                if (ruta) return ruta;
            } catch (error) {
                console.error('No se pudo preparar el audio para procesar:', error);
            }
        }
        return rutaActual();
    }

    function setStatus(texto, esError) {
        var status = document.getElementById('audioRenderStatus');
        if (!status) return;
        status.textContent = texto;
        status.classList.toggle('audio-engine-status-fallback', !!esError);
    }

    function setInfo(html) {
        var info = document.getElementById('audioRenderInfo');
        if (info) info.innerHTML = html;
    }

    function setBusy(ocupado) {
        var btnRender = document.getElementById('btnRenderizarAudio');
        var btnAnalizar = document.getElementById('btnAnalizarAudio');
        if (btnRender) btnRender.disabled = ocupado;
        if (btnAnalizar) btnAnalizar.disabled = ocupado;
    }

    function gananciaDb(volumen) {
        var valor = Number(volumen);
        if (!isFinite(valor) || valor === 100) return 0;
        if (valor <= 0) return -24;
        return Math.max(-24, Math.min(24, 20 * Math.log10(valor / 100)));
    }

    function leerOpciones() {
        var formato = document.getElementById('audioRenderFormat');
        var profundidad = document.getElementById('audioRenderBitDepth');
        var sonoridad = document.getElementById('audioRenderLoudness');
        var preciso = document.getElementById('chkAudioRenderPrecise');
        var denoise = document.getElementById('chkAudioRenderDenoise');
        var deesser = document.getElementById('chkAudioRenderDeesser');

        var format = formato ? formato.value : 'wav';
        var target = sonoridad ? sonoridad.value : '-16';
        var loudness = target === 'off'
            ? { enabled: false }
            : { target: Number(target), truePeak: -1.5, lra: 11, precise: !preciso || preciso.checked };

        return {
            format: format,
            bitDepth: format === 'wav' && profundidad ? Number(profundidad.value) : 16,
            loudness: loudness,
            denoise: !denoise || denoise.checked,
            deesser: !deesser || deesser.checked
        };
    }

    function construirReceta(opciones) {
        var inst = editor();
        var estado = inst && inst.getEngineState ? inst.getEngineState() : null;
        var fx = estado && estado.fx ? estado.fx : null;

        var receta = {
            bypass: estado ? !!estado.bypass : false,
            segments: [],
            fades: { in: 0, out: 0, curve: 'tri' },
            gainDb: fx ? gananciaDb(fx.volume) : 0,
            pitch: fx ? Number(fx.pitch) || 0 : 0,
            rate: fx ? Number(fx.rate) || 1 : 1,
            denoise: { enabled: !!opciones.denoise, amount: 12 },
            deesser: { enabled: !!opciones.deesser, intensity: 0.5 }
        };

        if (fx) {
            receta.filter = { highpass: fx.highpass, lowpass: fx.lowpass };
            receta.eq = { low: fx.eqLow, mid: fx.eqMid, high: fx.eqHigh };
            receta.comp = { threshold: fx.compThreshold, ratio: fx.compRatio, attack: 10, release: 200, makeup: 0 };
            receta.gate = { threshold: fx.gateThreshold };
            receta.limiter = { ceiling: fx.limiterThreshold };
        }

        return receta;
    }

    function actualizarDescarga(url, formato) {
        var btn = document.getElementById('btnDescargar');
        if (!btn) return;
        var base = window.apiClient && window.apiClient.baseURL ? window.apiClient.baseURL : '';
        var ext = EXTENSIONES[formato] || formato || 'wav';
        btn.href = base + url + '?t=' + Date.now();
        btn.setAttribute('download', 'loquendo_render_' + Date.now() + '.' + ext);
    }

    async function analizar() {
        var ruta = await rutaActualPersistida();
        if (!ruta) {
            notificar('warning', 'Genera o carga un audio antes de analizar la sonoridad.');
            return;
        }

        setBusy(true);
        setStatus('Analizando…');
        setInfo('Midiendo sonoridad integrada, pico real y rango dinámico…');
        try {
            var datos = await window.apiClient.analyzeAudio(ruta);
            setInfo(
                'Integrado: <strong>' + formatDb(datos.lufs) + '</strong> · ' +
                'Pico real: <strong>' + formatDb(datos.truePeak) + '</strong> · ' +
                'Rango: <strong>' + (datos.lra === null ? '0.0' : Number(datos.lra).toFixed(1)) + ' LU</strong>'
            );
            setStatus('Análisis listo');
            notificar('success', 'Análisis de sonoridad completado.');
        } catch (error) {
            console.error('Error al analizar audio:', error);
            setStatus('Error', true);
            setInfo('No se pudo analizar el audio.');
            notificar('error', error.message || 'Error al analizar el audio.');
        } finally {
            setBusy(false);
        }
    }

    async function renderizar() {
        var ruta = await rutaActualPersistida();
        if (!ruta) {
            notificar('warning', 'Genera o carga un audio antes de renderizar.');
            return;
        }

        var opciones = leerOpciones();
        var receta = construirReceta(opciones);

        setBusy(true);
        setStatus('Renderizando…');
        setInfo('Procesando con FFmpeg (afecta todo el archivo, puede tardar)…');

        try {
            var datos = await window.apiClient.renderAudio(ruta, receta, opciones);

            window.voiceAudioRealPath = datos.url;
            window.voiceAudioOriginalPath = window.voiceAudioOriginalPath || ruta;

            actualizarDescarga(datos.url, datos.format);
            if (typeof window.cargarYReproducir === 'function') {
                window.cargarYReproducir(datos.url, null, null, { conservarMarcadores: true });
            }

            var tamano = datos.size ? (datos.size / 1024).toFixed(1) + ' KB' : '';
            var duracion = datos.duration ? Number(datos.duration).toFixed(2) + ' s' : '';
            var sonoridad = datos.lufs === null || datos.lufs === undefined
                ? ''
                : ' · <strong>' + formatDb(datos.lufs) + '</strong>';

            setInfo(
                'Render listo (' + String(datos.format || opciones.format).toUpperCase() +
                (datos.bitDepth ? ' ' + datos.bitDepth + ' bits' : '') + '): ' +
                [duracion, tamano].filter(Boolean).join(' · ') + sonoridad
            );
            setStatus('Render listo');
            notificar('success', 'Render generado y cargado en el editor.');
        } catch (error) {
            console.error('Error al renderizar audio:', error);
            setStatus('Error', true);
            setInfo('No se pudo generar el render.');
            notificar('error', error.message || 'Error al renderizar el audio.');
        } finally {
            setBusy(false);
        }
    }

    function bindSelects() {
        var formato = document.getElementById('audioRenderFormat');
        var profundidad = document.getElementById('audioRenderBitDepth');
        var sonoridad = document.getElementById('audioRenderLoudness');
        var preciso = document.getElementById('chkAudioRenderPrecise');

        var refrescar = function () {
            if (profundidad) {
                var esWav = formato && formato.value === 'wav';
                profundidad.disabled = !esWav;
                if (!esWav) profundidad.value = '16';
            }
            if (preciso) {
                var activo = sonoridad && sonoridad.value !== 'off';
                preciso.disabled = !activo;
            }
        };

        if (formato) formato.addEventListener('change', refrescar);
        if (sonoridad) sonoridad.addEventListener('change', refrescar);
        refrescar();
    }

    function bindBotones() {
        var btnRender = document.getElementById('btnRenderizarAudio');
        var btnAnalizar = document.getElementById('btnAnalizarAudio');
        if (btnRender) btnRender.addEventListener('click', renderizar);
        if (btnAnalizar) btnAnalizar.addEventListener('click', analizar);
    }

    function conectarEditor() {
        var inst = editor();
        if (!inst) return false;
        inst.onAudioUpdated = function (url) {
            if (url && !/^(blob:|data:)/i.test(url)) {
                window.voiceAudioRealPath = url;
            }
        };
        return true;
    }

    function vigilarEditor() {
        if (conectarEditor()) return;
        var intentos = 0;
        var timer = setInterval(function () {
            intentos++;
            if (conectarEditor() || intentos > 60) clearInterval(timer);
        }, 500);
    }

    function init() {
        if (!document.getElementById('btnRenderizarAudio')) return;
        bindSelects();
        bindBotones();
        vigilarEditor();
    }

    window.audioRenderUI = {
        init: init,
        analizar: analizar,
        renderizar: renderizar,
        construirReceta: construirReceta,
        leerOpciones: leerOpciones
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
