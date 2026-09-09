// js/services/videoProcessor.js
const videoProcessor = {
    async uploadImage(type, file) {
        if (!file) { 
            window.notifications?.warning(`Selecciona una imagen ${type}.`); 
            return null; 
        }
        try {
            const data = await window.apiClient.uploadPngTuber(type, file);
            window.appState.pngtuber[type] = data.url;
            window.notifications?.success(`✅ Imagen ${type} cargada.`);
            return data.url;
        } catch (e) { 
            window.notifications?.error('❌ Error al subir: ' + e.message); 
            return null; 
        }
    },
    async generateVideo(audioPath) {
        if (!audioPath || audioPath.startsWith('blob:')) {
            window.notifications?.warning('⚠️ Primero genera un audio válido.'); 
            return null;
        }
        const rutaLimpia = String(audioPath).replace(window.CONFIG.API_BASE, '').replace(/^\/+/, '').split('?')[0];
        try {
            window.notifications?.info('⏳ Procesando video...');
            const data = await window.apiClient.generatePngTuberVideo(rutaLimpia, window.appState.pngtuber.idle, window.appState.pngtuber.talking);
            window.notifications?.success('✅ ¡Video generado!');
            
            const link = document.createElement('a');
            link.href = `${window.CONFIG.API_BASE}${data.video}`; 
            link.download = 'video_pngtuber.mp4';
            document.body.appendChild(link); 
            link.click(); 
            document.body.removeChild(link);
            
            window.appState.pngtuber.videoGenerated = data.video;
            return data.video;
        } catch (e) { 
            window.notifications?.error('❌ Error: ' + e.message); 
            return null; 
        }
    }
};

window.videoProcessor = videoProcessor;
console.log('🎥 videoProcessor.js cargado');