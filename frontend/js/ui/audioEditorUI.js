(function () {
    'use strict';

    var MODE_KEY = 'loquendo.audio_mode';

    function leerModoGuardado() {
        try {
            var guardado = localStorage.getItem(MODE_KEY);
            return guardado === 'avanzado' ? 'avanzado' : 'basico';
        } catch (e) {
            return 'basico';
        }
    }

    var state = {
        mode: leerModoGuardado(),
        subtab: 'edicion',
        lastAdvancedSubtab: 'edicion',
        loop: false,
        bypass: false
    };

    var FX_FORMAT = {
        highpass: function (v) { return Math.round(v) + ' Hz'; },
        lowpass: function (v) { return Math.round(v) + ' Hz'; },
        eqLow: function (v) { return formatSigned(v, 1) + ' dB'; },
        eqMid: function (v) { return formatSigned(v, 1) + ' dB'; },
        eqHigh: function (v) { return formatSigned(v, 1) + ' dB'; },
        compThreshold: function (v) { return Math.round(v) + ' dB'; },
        compRatio: function (v) { return Number(v).toFixed(1).replace('.0', '') + ':1'; },
        gateThreshold: function (v) { return Math.round(v) + ' dB'; },
        reverbWet: function (v) { return Math.round(v) + '%'; },
        limiterThreshold: function (v) { return Number(v).toFixed(1).replace('.0', '') + ' dB'; },
        volume: function (v) { return Math.round(v) + '%'; },
        rate: function (v) { return Number(v).toFixed(2) + '×'; },
        pitch: function (v) { return formatSigned(v, 0) + ' st'; }
    };

    function formatSigned(value, decimals) {
        var number = Number(value);
        var text = decimals > 0 ? number.toFixed(decimals) : String(Math.round(number));
        return number > 0 ? '+' + text : text;
    }

    function formatDb(value) {
        if (!isFinite(value)) return '-∞ dB';
        return (value > 0 ? '+' : '') + Number(value).toFixed(1) + ' dB';
    }

    function editor() {
        return window.audioEditor;
    }

    function engine() {
        return window.audioEngine;
    }

    function setMode(mode) {
        state.mode = mode === 'avanzado' ? 'avanzado' : 'basico';
        try {
            localStorage.setItem(MODE_KEY, state.mode);
        } catch (e) { /* ignore */ }

        var contenedor = document.getElementById('contenedorReproductor');
        if (contenedor) {
            contenedor.classList.toggle('audio-mode-basico', state.mode === 'basico');
            contenedor.classList.toggle('audio-mode-avanzado', state.mode === 'avanzado');
        }

        var botones = document.querySelectorAll('[data-audio-mode]');
        for (var i = 0; i < botones.length; i++) {
            var activo = botones[i].getAttribute('data-audio-mode') === state.mode;
            botones[i].classList.toggle('activo', activo);
            botones[i].setAttribute('aria-checked', activo ? 'true' : 'false');
        }

        setSubtab(state.mode === 'basico' ? 'edicion' : state.lastAdvancedSubtab);

        syncBasicControls();
    }

    function setSubtab(name) {
        state.subtab = name;
        if (state.mode === 'avanzado') state.lastAdvancedSubtab = name;
        var botones = document.querySelectorAll('[data-audio-subtab]');
        for (var i = 0; i < botones.length; i++) {
            var activo = botones[i].getAttribute('data-audio-subtab') === name;
            botones[i].classList.toggle('audio-subtab-activo', activo);
            botones[i].setAttribute('aria-selected', activo ? 'true' : 'false');
        }
        var grupos = document.querySelectorAll('[data-audio-group]');
        for (var j = 0; j < grupos.length; j++) {
            var visible = grupos[j].getAttribute('data-audio-group') === name;
            grupos[j].classList.toggle('audio-group-hidden', !visible);
        }

        // Inicializar el mezclador la primera vez que se muestra su sub-tab
        // (evita renderizar en un contenedor oculto)
        if (name === 'mezclador' && window.mixer && typeof window.mixer.init === 'function') {
            window.mixer.init();
        }
    }

    function updateValueLabel(key, value) {
        var labels = document.querySelectorAll('[data-fx-value="' + key + '"]');
        var formatter = FX_FORMAT[key];
        var text = formatter ? formatter(value) : String(value);
        for (var i = 0; i < labels.length; i++) labels[i].textContent = text;
    }

    function updateControls(fx) {
        if (!fx) return;
        var keys = Object.keys(fx);
        for (var i = 0; i < keys.length; i++) {
            var key = keys[i];
            var inputs = document.querySelectorAll('[data-fx="' + key + '"]');
            for (var j = 0; j < inputs.length; j++) inputs[j].value = fx[key];
            updateValueLabel(key, fx[key]);
        }
        state.bypass = !!fx.bypass;
        var bypassBtn = document.getElementById('btnBypassFX');
        if (bypassBtn) bypassBtn.classList.toggle('activo', state.bypass);
        syncBasicControls();
    }

    function syncBasicControls() {
        var inst = editor();
        if (!inst) return;
        var stateEngine = inst.getEngineState ? inst.getEngineState() : null;
        var fx = stateEngine ? stateEngine.fx : (inst.getFXState ? inst.getFXState() : null);

        var volSlider = document.getElementById('basicVolumeSlider');
        var volVal = document.getElementById('basicVolumeVal');
        var claritySlider = document.getElementById('basicClaritySlider');
        var clarityVal = document.getElementById('basicClarityVal');
        var rateSlider = document.getElementById('basicRateSlider');
        var rateVal = document.getElementById('basicRateVal');

        if (fx) {
            if (volSlider && fx.volume !== undefined) {
                volSlider.value = fx.volume;
                if (volVal) volVal.textContent = Math.round(fx.volume) + '%';
            }
            if (claritySlider && fx.eqHigh !== undefined) {
                claritySlider.value = fx.eqHigh;
                if (clarityVal) clarityVal.textContent = formatSigned(fx.eqHigh, 1) + ' dB';
            }
            if (rateSlider && fx.rate !== undefined) {
                rateSlider.value = fx.rate;
                if (rateVal) rateVal.textContent = Number(fx.rate).toFixed(2) + '×';
            }
        }

        var presetSelect = document.getElementById('audioFxPreset');
        var presetActual = presetSelect ? presetSelect.value : 'custom';
        var chips = document.querySelectorAll('.basic-preset-chip');
        for (var k = 0; k < chips.length; k++) {
            var p = chips[k].getAttribute('data-preset');
            chips[k].classList.toggle('activo', p === presetActual);
        }
    }

    function syncFromEngine() {
        var inst = editor();
        if (!inst) return;
        var stateEngine = inst.getEngineState ? inst.getEngineState() : null;
        if (stateEngine) {
            var fx = Object.assign({}, stateEngine.fx, { bypass: stateEngine.bypass });
            updateControls(fx);
            return;
        }
        var fxLegacy = inst.getFXState ? inst.getFXState() : null;
        if (fxLegacy) updateControls(fxLegacy);
    }

    function refrescarOnda() {
        requestAnimationFrame(function () {
            var inst = editor();
            if (inst && inst.wavesurfer && typeof inst.wavesurfer.drawBuffer === 'function') {
                try { inst.wavesurfer.drawBuffer(); } catch (e) { /* noop */ }
            }
            try { window.dispatchEvent(new Event('resize')); } catch (e2) { /* noop */ }
            if (window.audioMarkers && typeof window.audioMarkers.render === 'function') {
                window.audioMarkers.render();
            }
        });
    }

    function montarOndaEn(tabId) {
        var onda = document.querySelector('.audio-waveform-main');
        if (!onda) return;

        var destino = tabId === 'tab-subtitulos'
            ? document.getElementById('subtitlesWaveformDock')
            : document.getElementById('audioWaveformDock');
        if (!destino) return;

        if (onda.parentElement !== destino) {
            destino.appendChild(onda);
            onda.classList.toggle('audio-waveform-en-subtitulos', tabId === 'tab-subtitulos');
        }
        refrescarOnda();
    }

    function applyControl(key, value) {
        var inst = editor();
        if (!inst) return;
        if (key === 'rate') inst.setRate(value);
        else if (key === 'pitch') inst.setPitch(value);
        else inst.setFX({ [key]: value });
        updateValueLabel(key, value);
        var preset = document.getElementById('audioFxPreset');
        if (preset) preset.value = 'custom';
        syncBasicControls();
    }

    function updateStatus() {
        var status = document.getElementById('audioEngineStatus');
        if (!status) return;
        var motor = engine();
        if (motor && motor.available) {
            status.textContent = 'Motor: Tone.js';
            status.classList.remove('audio-engine-status-fallback');
        } else {
            status.textContent = 'Motor: WaveSurfer';
            status.classList.add('audio-engine-status-fallback');
        }
    }

    function updateMeters(meter) {
        if (!meter) return;
        var peakBar = document.getElementById('fxMeterPeak');
        var rmsBar = document.getElementById('fxMeterRms');
        var reductionBar = document.getElementById('fxMeterReduction');
        var peakValue = document.getElementById('fxMeterPeakValue');
        var rmsValue = document.getElementById('fxMeterRmsValue');
        var reductionValue = document.getElementById('fxMeterReductionValue');

        if (peakBar) peakBar.style.width = (meter.peakPercent || 0) + '%';
        if (rmsBar) rmsBar.style.width = (meter.rmsPercent || 0) + '%';
        if (peakValue) peakValue.textContent = formatDb(meter.peak);
        if (rmsValue) rmsValue.textContent = formatDb(meter.rms);
        if (reductionValue) reductionValue.textContent = formatDb(meter.reduction || 0);
        if (reductionBar) {
            var reductionWidth = Math.min(100, Math.abs(meter.reduction || 0) * 10);
            reductionBar.style.width = reductionWidth + '%';
        }
    }

    function bindModeSwitcher() {
        var botones = document.querySelectorAll('[data-audio-mode]');
        for (var i = 0; i < botones.length; i++) {
            botones[i].addEventListener('click', function () {
                setMode(this.getAttribute('data-audio-mode'));
            });
        }
    }

    function bindBasicControls() {
        var chips = document.querySelectorAll('.basic-preset-chip');
        for (var i = 0; i < chips.length; i++) {
            chips[i].addEventListener('click', function () {
                var inst = editor();
                if (!inst) return;
                var preset = this.getAttribute('data-preset');
                inst.applyPreset(preset);
                var presetSelect = document.getElementById('audioFxPreset');
                if (presetSelect) presetSelect.value = preset;
                syncFromEngine();
            });
        }

        var volSlider = document.getElementById('basicVolumeSlider');
        if (volSlider) {
            volSlider.addEventListener('input', function () {
                applyControl('volume', parseFloat(this.value));
            });
        }

        var claritySlider = document.getElementById('basicClaritySlider');
        if (claritySlider) {
            claritySlider.addEventListener('input', function () {
                applyControl('eqHigh', parseFloat(this.value));
            });
        }

        var rateSlider = document.getElementById('basicRateSlider');
        if (rateSlider) {
            rateSlider.addEventListener('input', function () {
                applyControl('rate', parseFloat(this.value));
            });
        }
    }

    function bindSubtabs() {
        var botones = document.querySelectorAll('[data-audio-subtab]');
        for (var i = 0; i < botones.length; i++) {
            botones[i].addEventListener('click', function () {
                setSubtab(this.getAttribute('data-audio-subtab'));
            });
        }
    }

    function bindFxControls() {
        var inputs = document.querySelectorAll('[data-fx]');
        for (var i = 0; i < inputs.length; i++) {
            inputs[i].addEventListener('input', function () {
                var key = this.getAttribute('data-fx');
                applyControl(key, parseFloat(this.value));
            });
        }

        var preset = document.getElementById('audioFxPreset');
        if (preset) {
            preset.addEventListener('change', function () {
                var inst = editor();
                if (!inst || this.value === 'custom') return;
                inst.applyPreset(this.value);
                syncFromEngine();
            });
        }

        var reset = document.getElementById('btnResetFX');
        if (reset) {
            reset.addEventListener('click', function () {
                var inst = editor();
                if (!inst) return;
                inst.resetFX();
                var preset = document.getElementById('audioFxPreset');
                if (preset) preset.value = 'custom';
                syncFromEngine();
            });
        }

        var bypass = document.getElementById('btnBypassFX');
        if (bypass) {
            bypass.addEventListener('click', function () {
                var inst = editor();
                if (!inst) return;
                state.bypass = inst.toggleBypass();
                bypass.classList.toggle('activo', state.bypass);
            });
        }

        var loop = document.getElementById('btnLoopAudio');
        if (loop) {
            loop.addEventListener('click', function () {
                var inst = editor();
                if (!inst) return;
                state.loop = !state.loop;
                loop.classList.toggle('activo', state.loop);
                inst.setLoopEnabled(state.loop, 0, inst.getDuration());
            });
        }
    }

    function init() {
        var inst = editor();
        if (!inst) return;
        bindModeSwitcher();
        bindBasicControls();
        bindSubtabs();
        bindFxControls();
        setMode(state.mode);

        inst.onMeter = updateMeters;
        syncFromEngine();

        document.addEventListener('loquendo:tab-activada', function (event) {
            montarOndaEn(event && event.detail ? event.detail.tabId : null);
        });
        var panelActivo = document.querySelector('.tab-panel-activo');
        montarOndaEn(panelActivo ? panelActivo.id : 'tab-audio');

        if (engine()) {
            engine().init().then(updateStatus);
            var statusTimer = setInterval(function () {
                updateStatus();
                var motor = engine();
                if (motor && motor.available) clearInterval(statusTimer);
            }, 500);
            setTimeout(function () { clearInterval(statusTimer); }, 5000);
        }
    }

    window.audioEditorUI = {
        init: init,
        setMode: setMode,
        setSubtab: setSubtab,
        updateMeters: updateMeters,
        syncFromEngine: syncFromEngine,
        montarOndaEn: montarOndaEn,
        refrescarOnda: refrescarOnda
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
