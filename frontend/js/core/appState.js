class AppState {
    constructor() {
        this.audio = {
            current: null,
            original: null,
            isDucked: false,
            hasMusic: false,
            duration: 0
        };
        this.music = {
            path: null,
            volume: 0.5,
            muted: false,
        };
        this.pngtuber = {
            idleImage: null,
            talkingImage: null,
            videoGenerated: null
        };
        this.subtitles = {
            srtUrl: null,
            assUrl: null,
            mode: 'normal'
        };
        this.text = {
            original: '',
            optimized: '',
            modo: 'normal',
        };
        this.dictionaries = {
            jergas: {},
            sinonimos: {},
            fonetica: {},
        };
        this.ui = {
            isProcessing: false,
            theme: 'dark',
            layout: 'vertical',
            notifications: []
        };
    }

    reset() {
        this.audio = { current: null, original: null, isDucked: false, hasMusic: false, duration: 0 };
        this.music = { path: null, volume: 0.5, muted: false };
        this.pngtuber = { idleImage: null, talkingImage: null, videoGenerated: null };
        this.subtitles = { srtUrl: null, assUrl: null, mode: 'normal' };
        this.text = { original: '', optimized: '', modo: 'normal' };
        this.dictionaries = { jergas: {}, sinonimos: {}, fonetica: {} };
        this.ui = { isProcessing: false, theme: 'dark', layout: 'vertical', notifications: [] };
        console.log('🔄 AppState reiniciado');
    }
}

window.appState = new AppState();
console.log('✅ appState.js inicializado');