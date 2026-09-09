// js/services/audioActions.js
const audioActions = {
    async uploadMusic(file) {
        if (!file) { window.notifications?.warning('Selecciona un archivo de audio.'); return null; }
        try {
            const data = await window.apiClient.uploadMusic(file);
            window.appState.audio.music = data.url;
            window.appState.audio.hasMusic = true;
            if (window.audioProcessor && typeof window.audioProcessor.cargarMusica === 'function') {
                window.audioProcessor.cargarMusica(`${window.CONFIG.API_BASE}${data.url}`);
            }
            window.notifications?.success('✅ Música subida');
            return data.url;
        } catch (e) { window.notifications?.error('Error: ' + e.message); return null; }
    },
    async applyDucking(voicePath, musicPath, options) {
        if (!voicePath || voicePath.startsWith('blob:')) { window.notifications?.warning('⚠️ Genera un audio válido primero.'); return null; }
        if (!musicPath) { window.notifications?.warning('Primero sube una música de fondo.'); return null; }
        
        const cleanVoice = String(voicePath).replace(window.CONFIG.API_BASE, '').replace(/^\/+/, '').split('?')[0];
        const cleanMusic = String(musicPath).replace(window.CONFIG.API_BASE, '').replace(/^\/+/, '').split('?')[0];
        
        try {
            window.notifications?.info('⏳ Aplicando ducking...');
            const data = await window.apiClient.applyDucking(cleanVoice, cleanMusic, options);
            window.appState.audio.current = data.url;
            window.appState.audio.isDucked = true;
            
            const btnDescargar = document.getElementById('btnDescargar');
            if (btnDescargar) {
                btnDescargar.href = `${window.CONFIG.API_BASE}${data.url}`;
                btnDescargar.setAttribute('download', `audio_con_ducking_${Date.now()}.wav`);
            }
            document.getElementById('btnDescargaSRT').style.display = 'inline-flex';
            document.getElementById('btnExportarMP3').style.display = 'inline-block';
            
            if (window.cargarYReproducir) window.cargarYReproducir(data.url);
            window.notifications?.success('✅ Ducking aplicado.');
            return data.url;
        } catch (e) { window.notifications?.error('Error: ' + e.message); return null; }
    },
    async exportMP3(wavPath, originalWavPath) {
        if (!wavPath || wavPath.startsWith('blob:')) { window.notifications?.warning('Primero genera un audio válido.'); return null; }
        try {
            window.notifications?.info('⏳ Convirtiendo a MP3...');
            const cleanWav = String(wavPath).replace(window.CONFIG.API_BASE, '').split('?')[0];
            const cleanOrig = originalWavPath ? String(originalWavPath).replace(window.CONFIG.API_BASE, '').split('?')[0] : null;
            
            const data = await window.apiClient.exportMP3(cleanWav, cleanOrig);
            const urls = data.urls || (data.url ? [data.url] : []);
            urls.forEach(item => {
                const u = typeof item === 'string' ? item : item.url;
                const tipo = typeof item === 'object' && item.type ? item.type : 'mp3';
                const link = document.createElement('a');
                link.href = `${window.CONFIG.API_BASE}${u}`; link.download = `audio_loquendo_${tipo}_${Date.now()}.mp3`;
                document.body.appendChild(link); link.click(); document.body.removeChild(link);
            });
            window.notifications?.success('✅ Exportado a MP3');
            return urls;
        } catch (e) { window.notifications?.error('Error: ' + e.message); return null; }
    }
};

window.audioActions = audioActions;
console.log('✅ audioActions.js cargado');