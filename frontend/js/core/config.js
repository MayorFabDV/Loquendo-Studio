// ✅ FIX #17: derivar la base del origen real (respeta puerto 3000/3001 del fallback)
const _apiBaseDerivada = (() => {
    try {
        if (window.location && window.location.origin && window.location.origin.startsWith('http')) {
            return window.location.origin;
        }
        if (window.location && window.location.port) {
            return `http://localhost:${window.location.port}`;
        }
    } catch (e) { /* ignorar */ }
    return 'http://localhost:3000';
})();

const CONFIG = {
    API_BASE_URL: _apiBaseDerivada,
    API_BASE: _apiBaseDerivada,
    
    AUDIO: {
        MAX_HISTORY: 20,
        DEFAULT_FADE_DURATION: 2.0,
        SILENCE_THRESHOLD: 0.05,
        MIN_SILENCE_DURATION: 0.5
    },

    PATHS: {
        AUDIOS: '/audios/',
        PNGTUBER: '/pngtuber/'
    }
};

window.CONFIG = CONFIG;
console.log('✅ config.js cargado');