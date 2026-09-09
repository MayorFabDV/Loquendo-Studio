const CONFIG = {
    API_BASE_URL: 'http://localhost:3000',
    API_BASE: 'http://localhost:3000',
    
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