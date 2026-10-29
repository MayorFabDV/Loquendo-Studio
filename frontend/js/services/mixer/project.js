// services/mixer/project.js - Export/import JSON, assets persistentes y render final
(function (global) {
    'use strict';

    const app = global.MixerApp;
    const { VERSION } = app.config;
    const { clamp, notificar, baseAPI, urlCompleta, uid } = app.util;
    const { state } = app.store;

    let renderizando = false;

    function asegurarProjectId() {
        if (!state.projectId) {
            const marca = new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14);
            state.projectId = `p-${marca}-${uid('x').split('-').pop()}`;
            app.store.guardarLocal();
        }
        return state.projectId;
    }

    function descargarBlob(contenido, nombre, tipo) {
        const blob = new Blob([contenido], { type: tipo || 'application/json' });
        const url = URL.createObjectURL(blob);
        const enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = nombre;
        document.body.appendChild(enlace);
        enlace.click();
        enlace.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2500);
    }

    async function exportarProyecto() {
        if (!state.clips.length) {
            notificar('warning', 'No hay pistas para guardar');
            return;
        }
        try {
            const id = asegurarProjectId();
            const estadoUI = document.getElementById('mezcladorEstado');
            if (estadoUI) estadoUI.textContent = 'Guardando assets del proyecto...';
            const disponibles = await comprobarFuentes(state.clips);
            if (disponibles.length === state.clips.length) await importarAssets(id);
            const datos = {
                ...app.store.aProyecto(),
                id,
                projectId: id,
                guardado: new Date().toISOString()
            };
            const marca = new Date();
            const dos = (n) => String(n).padStart(2, '0');
            const nombre = `mezcla-loquendo-${marca.getFullYear()}-${dos(marca.getMonth() + 1)}-${dos(marca.getDate())}-${dos(marca.getHours())}${dos(marca.getMinutes())}.json`;
            descargarBlob(JSON.stringify(datos, null, 2), nombre, 'application/json');
            notificar('success', 'Proyecto de mezcla guardado');
        } catch (error) {
            console.error('Mixer: error exportando proyecto', error);
            notificar('error', `No se pudo guardar el proyecto de mezcla: ${error.message}`);
        } finally {
            const estadoUI = document.getElementById('mezcladorEstado');
            if (estadoUI && /Guardando assets/.test(estadoUI.textContent)) {
                app.timeline.actualizarEstado();
            }
        }
    }

    async function comprobarFuentes(clips, limite = 4) {
        const vivos = [];
        const cola = clips.slice();
        const trabajadores = Array.from({ length: Math.min(limite, cola.length) }, async () => {
            while (cola.length) {
                const clip = cola.shift();
                if (await app.util.head(clip.src)) {
                    vivos.push(clip);
                }
            }
        });
        await Promise.all(trabajadores);
        return vivos;
    }

    async function importarProyecto(archivo) {
        if (!archivo) return;
        try {
            const texto = await archivo.text();
            const datos = JSON.parse(texto);
            const estado = app.store.normalizarEstado(Array.isArray(datos) ? { clips: datos } : datos);
            if (!estado) {
                notificar('error', 'El archivo no contiene una mezcla vÃ¡lida');
                return;
            }

            const vivos = await comprobarFuentes(estado.clips);
            const descartados = estado.clips.length - vivos.length;
            app.store.aplicarEstado(estado, { guardar: true });
            state.selectedId = estado.clips.length ? estado.clips[0].id : '';
            app.timeline.rebuild();
            if (!descartados) void app.media.persistirAssets();
            notificar(descartados ? 'warning' : 'success', descartados > 0
                ? `Proyecto conservado completo: faltan medios de ${descartados} clip(s). Recupera sus archivos antes de renderizar.`
                : 'Proyecto de mezcla cargado');
        } catch (error) {
            console.error('Mixer: error importando proyecto', error);
            notificar('error', 'No se pudo leer el archivo de mezcla');
        }
    }

    async function pedirJSON(url, opciones) {
        const respuesta = await fetch(url, opciones);
        let datos = null;
        try { datos = await respuesta.json(); } catch (e) { datos = null; }
        if (!respuesta.ok) {
            throw new Error((datos && (datos.error || datos.mensaje)) || `HTTP ${respuesta.status}`);
        }
        return datos || {};
    }

    async function guardarEnServidor(id, proyecto) {
        await pedirJSON(`${baseAPI()}/api/proyectos/${encodeURIComponent(id)}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(proyecto)
        });
    }

    async function importarAssets(id) {
        let importados = 0;
        for (const clip of state.clips) {
            const src = String(clip.src || '');
            const yaEsAsset = src.startsWith(`/media/projects/${id}/`);
            if (clip.asset && yaEsAsset) continue;

            const datos = await pedirJSON(`${baseAPI()}/api/proyectos/${encodeURIComponent(id)}/assets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ src, nombre: clip.nombre || '' })
            });

            if (!datos.asset) throw new Error(`No se pudo importar el audio de "${clip.nombre || clip.id}"`);
            clip.asset = datos.asset;
            clip.src = datos.url;
            importados++;
        }
        if (importados) app.store.guardarLocal();
        return importados;
    }

    async function renderizarMezcla(formato) {
        if (renderizando) return;
        if (!state.clips.length) {
            notificar('warning', 'AÃ±ade alguna pista antes de renderizar');
            return;
        }

        renderizando = true;
        const estadoUI = document.getElementById('mezcladorEstado');
        const textoPrevio = estadoUI ? estadoUI.textContent : '';
        if (estadoUI) estadoUI.textContent = 'Preparando assets del proyecto...';

        try {
            const disponibles = await comprobarFuentes(state.clips);
            if (disponibles.length !== state.clips.length) {
                throw new Error('Faltan medios del proyecto. Recupera los archivos o retira sus clips explícitamente antes de renderizar.');
            }
            const id = asegurarProjectId();
            const importados = await importarAssets(id);
            if (importados && estadoUI) estadoUI.textContent = `Assets importados (${importados}) Â· renderizando...`;

            const proyecto = { ...app.store.aProyecto(), id, projectId: id };
            await guardarEnServidor(id, proyecto);

            if (estadoUI) estadoUI.textContent = 'Renderizando mezcla con FFmpeg...';
            const resultado = await pedirJSON(`${baseAPI()}/api/proyectos/${encodeURIComponent(id)}/render`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ project: proyecto, formato: formato || 'wav' })
            });

            const enlace = document.createElement('a');
            enlace.href = urlCompleta(resultado.url);
            enlace.download = resultado.archivo || '';
            document.body.appendChild(enlace);
            enlace.click();
            enlace.remove();

            notificar('success', `Mezcla renderizada (${(Number(resultado.size || 0) / 1024 / 1024).toFixed(1)} MB)`);
            if (estadoUI) estadoUI.textContent = `Render listo Â· ${resultado.archivo || ''}`;
        } catch (error) {
            console.error('Mixer: error renderizando mezcla', error);
            notificar('error', `No se pudo renderizar la mezcla: ${error.message}`);
            if (estadoUI) estadoUI.textContent = textoPrevio;
        } finally {
            renderizando = false;
            setTimeout(() => {
                if (estadoUI && /Renderizando|Preparando|Assets importados/.test(estadoUI.textContent)) {
                    app.timeline.actualizarEstado();
                }
            }, 1200);
        }
    }

    app.project = {
        exportarProyecto,
        importarProyecto,
        renderizarMezcla,
        asegurarProjectId,
        importarAssets,
        guardarEnServidor,
        descargarBlob
    };
})(window);
