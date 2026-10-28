(function () {
    'use strict';

    var DEFAULTS = {
        highpass: 80,
        lowpass: 12000,
        eqLow: 0,
        eqMid: 0,
        eqHigh: 0,
        compThreshold: -24,
        compRatio: 3,
        gateThreshold: -80,
        reverbWet: 0,
        limiterThreshold: -1,
        volume: 100,
        rate: 1,
        pitch: 0
    };

    var PRESETS = {
        plana: {},
        voz: {
            highpass: 90,
            lowpass: 14000,
            eqLow: -2,
            eqMid: 2,
            eqHigh: 1,
            compThreshold: -22,
            compRatio: 3,
            gateThreshold: -55,
            reverbWet: 8,
            limiterThreshold: -1,
            volume: 100
        },
        podcast: {
            highpass: 80,
            lowpass: 13000,
            eqLow: -1,
            eqMid: 3,
            eqHigh: -1,
            compThreshold: -26,
            compRatio: 4,
            gateThreshold: -50,
            reverbWet: 4,
            limiterThreshold: -1.5,
            volume: 105
        },
        calida: {
            highpass: 70,
            lowpass: 10000,
            eqLow: 3,
            eqMid: 0,
            eqHigh: -2,
            compThreshold: -24,
            compRatio: 2.5,
            gateThreshold: -60,
            reverbWet: 14,
            limiterThreshold: -1,
            volume: 100
        },
        radio: {
            highpass: 120,
            lowpass: 9000,
            eqLow: -3,
            eqMid: 4,
            eqHigh: 2,
            compThreshold: -30,
            compRatio: 6,
            gateThreshold: -45,
            reverbWet: 2,
            limiterThreshold: -1,
            volume: 110
        },
        suave: {
            highpass: 85,
            lowpass: 16000,
            eqLow: 0,
            eqMid: 1,
            eqHigh: 0,
            compThreshold: -18,
            compRatio: 2,
            gateThreshold: -65,
            reverbWet: 18,
            limiterThreshold: -1,
            volume: 95
        }
    };

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function dbToPercent(db) {
        if (!isFinite(db)) return 0;
        return clamp(((db + 60) / 60) * 100, 0, 100);
    }

    class AudioEngine {
        constructor() {
            this.available = false;
            this.initialized = false;
            this.loaded = false;
            this.playing = false;
            this.bypass = false;
            this.loop = false;
            this.loopStart = 0;
            this.loopEnd = 0;
            this.duration = 0;
            this.position = 0;
            this.startedAt = 0;
            this.fx = Object.assign({}, DEFAULTS);
            this.onTime = null;
            this.onEnded = null;
            this.onPlay = null;
            this.onPause = null;
            this.onStateChange = null;
            this.onMeter = null;
            this._nodes = null;
            this._player = null;
            this._raf = null;
            this._loadToken = 0;
            this._disposed = false;
        }

        async init() {
            if (this.initialized) return this.available;
            this.initialized = true;
            if (typeof window.Tone === 'undefined') {
                console.warn('Tone.js no está disponible; se usará WaveSurfer.');
                this.available = false;
                return false;
            }
            try {
                window.Tone.getContext().lookAhead = 0;
                this._build();
                this.available = true;
                this._applyFX();
                return true;
            } catch (error) {
                console.error('No se pudo inicializar Tone.js:', error);
                this.available = false;
                return false;
            }
        }

        _build() {
            var Tone = window.Tone;
            this.dryGain = new Tone.Gain(1);
            this.crossFade = new Tone.CrossFade(1);
            this.highpass = new Tone.Filter({ type: 'highpass', frequency: this.fx.highpass, rolloff: -12, Q: 0.7 });
            this.lowpass = new Tone.Filter({ type: 'lowpass', frequency: this.fx.lowpass, rolloff: -12, Q: 0.7 });
            this.eq = new Tone.EQ3(this.fx.eqLow, this.fx.eqMid, this.fx.eqHigh);
            this.compressor = new Tone.Compressor({
                threshold: this.fx.compThreshold,
                ratio: this.fx.compRatio,
                attack: 0.003,
                release: 0.25,
                knee: 6
            });
            this.gate = new Tone.Gate(this.fx.gateThreshold, 0.05);
            this.pitchShift = new Tone.PitchShift({ pitch: 0, windowSize: 0.03, feedback: 0 });
            this.reverb = new Tone.Reverb({ decay: 1.6, preDelay: 0.01, wet: this.fx.reverbWet / 100 });
            this.limiter = new Tone.Limiter(this.fx.limiterThreshold);
            this.masterGain = new Tone.Gain(this.fx.volume / 100);
            this.meter = new Tone.Meter({ smoothing: 0.8 });
            this.waveform = new Tone.Waveform(256);

            this.dryGain.connect(this.crossFade.a);
            this.highpass.chain(
                this.lowpass,
                this.eq,
                this.compressor,
                this.gate,
                this.pitchShift,
                this.reverb,
                this.crossFade.b
            );
            this.crossFade.connect(this.limiter);
            this.limiter.connect(this.masterGain);
            this.masterGain.connect(this.meter);
            this.masterGain.connect(this.waveform);
            this.meter.toDestination();

            this._nodes = {
                dryGain: this.dryGain,
                crossFade: this.crossFade,
                highpass: this.highpass,
                lowpass: this.lowpass,
                eq: this.eq,
                compressor: this.compressor,
                gate: this.gate,
                pitchShift: this.pitchShift,
                reverb: this.reverb,
                limiter: this.limiter,
                masterGain: this.masterGain,
                meter: this.meter,
                waveform: this.waveform
            };
        }

        _applyPitch() {
            if (!this.pitchShift) return;
            var compensation = this.fx.pitch - (12 * Math.log2(this.fx.rate));
            this.pitchShift.pitch = clamp(compensation, -24, 24);
        }

        _applyFX() {
            if (!this.available) return;
            var now = window.Tone.now();
            this.highpass.frequency.rampTo(this.fx.highpass, 0.06, now);
            this.lowpass.frequency.rampTo(this.fx.lowpass, 0.06, now);
            this.eq.low.rampTo(this.fx.eqLow, 0.06, now);
            this.eq.mid.rampTo(this.fx.eqMid, 0.06, now);
            this.eq.high.rampTo(this.fx.eqHigh, 0.06, now);
            this.compressor.threshold.rampTo(this.fx.compThreshold, 0.06, now);
            this.compressor.ratio.rampTo(this.fx.compRatio, 0.06, now);
            this.gate.threshold = this.fx.gateThreshold;
            this.reverb.wet.rampTo(this.fx.reverbWet / 100, 0.06, now);
            this.limiter.threshold.rampTo(this.fx.limiterThreshold, 0.06, now);
            this.masterGain.gain.rampTo(this.fx.volume / 100, 0.06, now);
            this.crossFade.fade.rampTo(this.bypass ? 0 : 1, 0.06, now);
            if (this._player) this._player.playbackRate = this.fx.rate;
            this._applyPitch();
        }

        setFX(partial) {
            if (!partial) return this.getFX();
            var keys = Object.keys(partial);
            var rateChanged = false;
            var positionBeforeRate = this.playing ? this.getPosition() : 0;
            for (var i = 0; i < keys.length; i++) {
                if (Object.prototype.hasOwnProperty.call(DEFAULTS, keys[i])) {
                    if (keys[i] === 'rate' && Number(partial.rate) !== this.fx.rate) {
                        rateChanged = true;
                    }
                    this.fx[keys[i]] = partial[keys[i]];
                }
            }
            if (this.available) this._applyFX();
            if (rateChanged && this.playing && this._player) {
                this.position = clamp(positionBeforeRate, 0, this.duration || 0);
                try {
                    this._player.stop();
                    this._player.start(undefined, this.position);
                    this.startedAt = window.Tone.now();
                } catch (error) { /* noop */ }
                this._emitTime(this.position);
            }
            return this.getFX();
        }

        setRate(rate) {
            this.setFX({ rate: clamp(Number(rate) || 1, 0.5, 2) });
        }

        setPitch(semitones) {
            this.setFX({ pitch: clamp(Number(semitones) || 0, -12, 12) });
        }

        setBypass(enabled) {
            this.bypass = !!enabled;
            if (this.available) {
                var now = window.Tone.now();
                this.crossFade.fade.rampTo(this.bypass ? 0 : 1, 0.06, now);
            }
            return this.bypass;
        }

        toggleBypass() {
            return this.setBypass(!this.bypass);
        }

        resetFX() {
            var rate = this.fx.rate;
            var pitch = this.fx.pitch;
            this.fx = Object.assign({}, DEFAULTS, { rate: rate, pitch: pitch });
            this.bypass = false;
            if (this.available) this._applyFX();
            return this.getFX();
        }

        applyPreset(name) {
            if (!Object.prototype.hasOwnProperty.call(PRESETS, name)) return this.getFX();
            var rate = this.fx.rate;
            var pitch = this.fx.pitch;
            this.fx = Object.assign({}, DEFAULTS, PRESETS[name], { rate: rate, pitch: pitch });
            this.bypass = false;
            if (this.available) this._applyFX();
            return this.getFX();
        }

        getFX() {
            return Object.assign({}, this.fx);
        }

        async load(url) {
            if (this._disposed) return false;
            if (!this.initialized) await this.init();
            if (!this.available) return false;
            var token = ++this._loadToken;
            this.stop();
            this.loaded = false;
            this.duration = 0;
            if (this._player) {
                try { this._player.dispose(); } catch (error) { /* noop */ }
            }
            var Tone = window.Tone;
            var player = new Tone.Player();
            this._player = player;
            player.connect(this.dryGain);
            player.connect(this.highpass);
            try {
                await player.load(url);
            } catch (error) {
                console.error('No se pudo cargar el audio en Tone.js:', error);
                try { player.dispose(); } catch (disposeError) { /* noop */ }
                if (this._player === player) {
                    this._player = null;
                    if (token === this._loadToken) {
                        this.loaded = false;
                        this.duration = 0;
                    }
                }
                return false;
            }
            if (token !== this._loadToken || this._disposed) {
                try { player.dispose(); } catch (error) { /* noop */ }
                if (this._player === player) this._player = null;
                return false;
            }
            player.playbackRate = this.fx.rate;
            this.duration = player.buffer.duration || 0;
            this.position = 0;
            this.loopStart = 0;
            this.loopEnd = this.duration;
            this.loaded = this.duration > 0;
            this._applyPitch();
            return this.loaded;
        }

        async play() {
            if (this._disposed || this.playing) return this.playing;
            if (!this.initialized) await this.init();
            if (!this.available || !this.loaded || !this._player) return false;
            try {
                await window.Tone.start();
            } catch (error) {
                console.warn('Tone.start() no pudo iniciar el contexto:', error);
            }
            if (this.playing || !this._player) return this.playing;
            var offset = this.position;
            if (offset >= this.duration - 0.01) offset = 0;
            this.position = offset;
            this._player.start(undefined, offset);
            this.startedAt = window.Tone.now();
            this.playing = true;
            this._emitState();
            this._startTicker();
            return true;
        }

        pause() {
            if (!this.playing) return false;
            this.position = this.getPosition();
            this.playing = false;
            if (this._player) {
                try { this._player.stop(); } catch (error) { /* noop */ }
            }
            this._stopTicker();
            this._emitState();
            this._emitTime(this.position);
            return true;
        }

        stop() {
            this.playing = false;
            this.position = 0;
            if (this._player) {
                try { this._player.stop(); } catch (error) { /* noop */ }
            }
            this._stopTicker();
            this._emitState();
            this._emitTime(0);
        }

        seek(seconds) {
            if (!this.loaded) return false;
            var target = clamp(Number(seconds) || 0, 0, this.duration);
            this.position = target;
            if (this.playing && this._player) {
                try {
                    this._player.stop();
                    this._player.start(undefined, target);
                    this.startedAt = window.Tone.now();
                } catch (error) {
                    console.warn('No se pudo mover la posición de Tone.js:', error);
                }
            }
            this._emitTime(target);
            return true;
        }

        setLoop(enabled, start, end) {
            this.loop = !!enabled;
            if (typeof start === 'number') this.loopStart = clamp(start, 0, this.duration || 0);
            if (typeof end === 'number') this.loopEnd = clamp(end, 0, this.duration || 0);
            if (this.loopEnd <= this.loopStart) {
                this.loopStart = 0;
                this.loopEnd = this.duration;
            }
            return this.loop;
        }

        _rawPosition() {
            if (!this.playing) return this.position;
            return this.position + Math.max(0, window.Tone.now() - this.startedAt) * this.fx.rate;
        }

        getPosition() {
            var raw = this._rawPosition();
            if (this.loop && this.loopEnd > this.loopStart) {
                if (raw >= this.loopEnd) {
                    return this.loopStart + ((raw - this.loopStart) % (this.loopEnd - this.loopStart));
                }
            }
            return clamp(raw, 0, this.duration || 0);
        }

        getDuration() {
            return this.duration || 0;
        }

        isPlaying() {
            return this.playing;
        }

        getState() {
            return {
                available: this.available,
                loaded: this.loaded,
                playing: this.playing,
                bypass: this.bypass,
                loop: this.loop,
                position: this.getPosition(),
                duration: this.duration,
                fx: this.getFX()
            };
        }

        _startTicker() {
            var self = this;
            this._stopTicker();
            var tick = function () {
                if (!self.playing) return;
                var raw = self._rawPosition();
                var pos = clamp(raw, 0, self.duration || 0);
                if (self.loop && self.loopEnd > self.loopStart) {
                    if (raw >= self.loopEnd - 0.02) {
                        self.position = self.loopStart;
                        if (self._player) {
                            try {
                                self._player.stop();
                                self._player.start(undefined, self.loopStart);
                                self.startedAt = window.Tone.now();
                            } catch (error) { /* noop */ }
                        }
                        pos = self.loopStart;
                    }
                } else if (raw >= self.duration - 0.02) {
                    self.playing = false;
                    self.position = 0;
                    if (self._player) {
                        try { self._player.stop(); } catch (error) { /* noop */ }
                    }
                    self._stopTicker();
                    self._emitTime(0);
                    self._emitState();
                    if (self.onEnded) self.onEnded();
                    return;
                }
                self._emitTime(pos);
                self._emitMeter();
                self._raf = window.requestAnimationFrame(tick);
            };
            this._raf = window.requestAnimationFrame(tick);
        }

        _stopTicker() {
            if (this._raf !== null) {
                window.cancelAnimationFrame(this._raf);
                this._raf = null;
            }
        }

        _emitTime(time) {
            if (this.onTime) this.onTime(time);
        }

        _emitState() {
            if (this.onStateChange) this.onStateChange(this.getState());
            if (this.playing && this.onPlay) this.onPlay();
            if (!this.playing && this.onPause) this.onPause();
        }

        _emitMeter() {
            if (!this.onMeter || !this.available) return;
            var rms = this.meter.getValue();
            if (Array.isArray(rms)) rms = Math.max.apply(null, rms);
            var peakValue = 0;
            try {
                var wave = this.waveform.getValue();
                for (var i = 0; i < wave.length; i++) {
                    var abs = Math.abs(wave[i]);
                    if (abs > peakValue) peakValue = abs;
                }
            } catch (error) { /* noop */ }
            var peakDb = peakValue > 0 ? 20 * Math.log10(peakValue) : -Infinity;
            var reduction = Math.min(0, this.compressor.reduction || 0, this.limiter.reduction || 0);
            this.onMeter({
                rms: rms,
                peak: peakDb,
                reduction: reduction,
                rmsPercent: dbToPercent(rms),
                peakPercent: dbToPercent(peakDb)
            });
        }

        dispose() {
            this._disposed = true;
            this.stop();
            if (this._player) {
                try { this._player.dispose(); } catch (error) { /* noop */ }
                this._player = null;
            }
            if (this._nodes) {
                var nodes = this._nodes;
                Object.keys(nodes).forEach(function (key) {
                    try { nodes[key].dispose(); } catch (error) { /* noop */ }
                });
                this._nodes = null;
            }
            this.available = false;
            this.loaded = false;
        }
    }

    window.AudioEngine = AudioEngine;
    window.audioEngine = new AudioEngine();
    window.audioEnginePresets = PRESETS;
})();
