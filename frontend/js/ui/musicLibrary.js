(function (global) {
    'use strict';
    let elegida = null, revision = 0, ocupada = false;
    const el = id => document.getElementById(id);
    const base = () => `${global.CONFIG.API_BASE}/api/music-library`;
    async function pedir(ruta = '', opciones = {}) {
        const response = await fetch(base() + ruta, opciones);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo leer la biblioteca');
        return data;
    }
    const avisar = error => global.notifications?.error(error.message || String(error));
    async function activar(row, token) {
        if (token !== revision) return false;
        elegida = row;
        global.musicaFondoPath = `/media/music/${row.id}`;
        el('musicSelected').textContent = `${row.name} — ${row.duration.toFixed(2)} s`;
        // Preview del panel de música existente; no añade pistas al mezclador.
        await global.audioEditor?.cargarMusica(`${global.CONFIG.API_BASE}${global.musicaFondoPath}`);
        await refrescar();
        return true;
    }
    async function elegir(id = null, localizar = false) {
        if (ocupada) return false;
        ocupada = true; const token = ++revision;
        try {
            let row;
            if (id && !localizar) row = await pedir(`/${encodeURIComponent(id)}/select`, { method: 'POST' });
            else {
                if (!global.electronAPI?.selectMusic) throw new Error('Seleccionar y localizar referencias requiere la aplicación de escritorio');
                row = await global.electronAPI.selectMusic(id);
                if (!row) return false;
                if (row.error) throw new Error(row.error);
            }
            return await activar(row, token);
        } catch (error) { avisar(error); await refrescar(); return false; }
        finally { ocupada = false; }
    }
    async function guardar(id, saved) {
        const row = await pedir(`/${encodeURIComponent(id)}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ saved }) });
        if (elegida?.id === id) elegida = row;
        await refrescar();
    }
    function preguntar() {
        const dialog = el('musicSaveDialog');
        if (dialog.open) return Promise.resolve(false);
        return new Promise(resolve => {
            const terminar = yes => {
                el('musicSaveYes').onclick = el('musicSaveNo').onclick = null;
                dialog.oncancel = dialog.onclose = null;
                dialog.close(); resolve(yes);
            };
            el('musicSaveYes').onclick = () => terminar(true);
            el('musicSaveNo').onclick = () => terminar(false);
            dialog.oncancel = event => { event.preventDefault(); terminar(false); };
            dialog.onclose = () => terminar(false);
            dialog.showModal(); el('musicSaveNo').focus();
        });
    }
    async function prepararDucking() {
        if (!elegida) return true; // Compatibilidad con la carga temporal desde navegador.
        if (ocupada) { avisar(new Error('Espera a que termine la selección de música')); return false; }
        ocupada = true; const token = revision;
        try {
            elegida = await pedir(`/${elegida.id}/select`, { method: 'POST' });
            if (!elegida.saved && await preguntar()) {
                try { await guardar(elegida.id, true); }
                catch (error) { avisar(new Error(`No se pudo guardar en Mi biblioteca: ${error.message}. Se continuará con ducking.`)); }
            }
            if (token !== revision) return false;
            await refrescar();
            return true;
        } catch (error) { avisar(error); await refrescar(); return false; }
        finally { ocupada = false; }
    }
    function boton(texto, accion) {
        const b = document.createElement('button'); b.type = 'button'; b.textContent = texto;
        b.onclick = () => Promise.resolve().then(accion).catch(avisar); return b;
    }
    async function refrescar() {
        try {
            const { items = [] } = await pedir();
            el('musicLibraryStatus').textContent = '';
            for (const [id, rows] of [['musicRecent', items.slice(0,30)], ['musicSaved', items.filter(r => r.saved)]]) {
                const lista = el(id); lista.replaceChildren();
                if (!rows.length) { lista.textContent = 'Sin canciones todavía'; continue; }
                for (const row of rows) {
                    const item = document.createElement('div'); item.className = 'music-library-entry';
                    const label = document.createElement('span'); label.textContent = `${row.name} — ${row.duration.toFixed(2)} s${row.missing ? ' · Archivo no disponible' : ''}`; label.title = row.path;
                    item.appendChild(label);
                    item.appendChild(boton(row.missing ? 'Localizar archivo' : 'Seleccionar', () => elegir(row.id, row.missing)));
                    if (id === 'musicSaved') item.appendChild(boton('Quitar de biblioteca', () => guardar(row.id, false)));
                    else if (!row.saved) item.appendChild(boton('Olvidar', async () => {
                        await pedir(`/${row.id}`, { method: 'DELETE' });
                        if (elegida?.id === row.id) {
                            revision++; elegida = null; global.musicaFondoPath = '';
                            el('musicSelected').textContent = 'Sin música seleccionada';
                        }
                        await refrescar();
                    }));
                    lista.appendChild(item);
                }
            }
        } catch (error) { el('musicLibraryStatus').textContent = error.message; }
    }
    global.musicLibrary = { elegir, refrescar, prepararDucking, referencia: () => elegida?.id || null };
    document.addEventListener('DOMContentLoaded', () => {
        el('musicLibraryRefresh').onclick = refrescar;
        if (global.electronAPI?.selectMusic) el('backgroundMusicInput').hidden = true;
        refrescar();
    });
})(window);
