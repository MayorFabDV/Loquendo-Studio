// Fuente exclusiva de Generar video; no carga ni modifica voz/sesiones/mezclador.
(function (global) {
    'use strict';
    let externo = null, revision = 0, cargando = false;
    const el = id => document.getElementById(id);
    const modo = () => el('videoAudioSource')?.value || 'studio';
    function invalidarPreview() {
        const player = el('previewPngtuberVideo');
        player.pause(); player.removeAttribute('src'); player.load(); player.hidden = true;
        el('previewPngtuberPlaceholder').hidden = false;
    }
    function actualizar() {
        const external = modo() === 'external';
        el('videoAudioExternal').hidden = !external;
        el('videoAudioStatus').textContent = cargando ? 'Validando audio…' : externo ? `${externo.name} — ${externo.duration.toFixed(2)} s` : 'Sin archivo seleccionado';
        el('videoAudioRemove').disabled = !externo && !cargando;
        const player = el('videoAudioPlayer');
        if (!external || !externo) { player.pause(); player.removeAttribute('src'); player.hidden = true; }
        else { player.src = `${global.CONFIG.API_BASE}${externo.url}`; player.hidden = false; }
    }
    async function importar(file) {
        if (!file) return false;
        const token = ++revision;
        invalidarPreview();
        cargando = true; actualizar();
        try {
            if (!/\.(wav|mp3)$/i.test(file.name)) throw new Error('Selecciona un archivo WAV o MP3');
            const body = new FormData(); body.append('audio', file);
            const response = await fetch(`${global.CONFIG.API_BASE}/api/pngtuber/audio`, { method: 'POST', body });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'No se pudo importar el audio');
            if (token !== revision) return false;
            externo = data;
            el('videoAudioSource').value = 'external';
            return true;
        } catch (error) {
            if (token === revision) global.notifications?.error(error.message);
            return false;
        } finally {
            if (token === revision) { cargando = false; actualizar(); }
        }
    }
    async function ruta({ preview = false } = {}) {
        if (cargando) throw new Error('Espera a que termine la validación del audio');
        if (modo() === 'external') {
            if (!externo && !preview) throw new Error('Importa un archivo WAV o MP3 para el video');
            return externo?.url || null;
        }
        return global.rutaVozPersistida ? global.rutaVozPersistida() : null;
    }
    global.videoAudioInput = { importar, ruta, version: () => `${revision}:${modo()}:${modo() === 'studio' ? `${global.audioEditor?._loadToken}:${global.audioEditor?._revisionAudio}` : ''}` };
    document.addEventListener('DOMContentLoaded', () => {
        el('videoAudioSource').onchange = () => { revision++; cargando = false; invalidarPreview(); actualizar(); };
        el('videoAudioFile').onchange = async event => { await importar(event.target.files[0]); event.target.value = ''; };
        el('videoAudioRemove').onclick = () => { revision++; cargando = false; externo = null; invalidarPreview(); actualizar(); };
        actualizar();
    });
})(window);
