// services/mixer/project.js - Export/import JSON, assets persistentes y render final
(function (global) {
    'use strict';

    const app = global.MixerApp;
    const { VERSION } = app.config;
    const { clamp, notificar, baseAPI, urlCompleta, uid } = app.util;
    const { state } = app.store;

    let renderizando = false;
    let colaGuardado = Promise.resolve();
    const firmas = new Map();
    let carga = 0;

    function estadoGuardado(texto) {
        const el = document.getElementById('estadoProyectoMezcla');
        if (el) el.textContent = texto;
    }

    function autoguardar() {
        const id = state.projectId;
        if (!id) return;
        return guardarEnServidor(id, app.store.aProyecto()).catch(error => {
            console.warn('No se pudo autoguardar el proyecto:', error);
            if (id === state.projectId) estadoGuardado('Sin confirmar en disco: usa Guardar en equipo o exporta JSON');
        });
    }

    async function guardarEnEquipo(avisar = true) {
        const id = asegurarProjectId();
        await importarAssets(id, { tolerarFaltantes: true });
        if (state.projectId !== id) throw new Error('El proyecto cambió durante el guardado');
        const proyecto = app.store.aProyecto();
        await guardarEnServidor(id, proyecto, true);
        if (JSON.stringify(proyecto) !== JSON.stringify(app.store.aProyecto())) throw new Error('Hay cambios nuevos; vuelve a guardar antes de abrir otro proyecto');
        if (avisar) {
            const reporte = await pedirJSON(`${baseAPI()}/api/proyectos/${encodeURIComponent(id)}/integridad`);
            notificar(reporte.ok ? 'success' : 'warning', reporte.ok ? 'Proyecto y medios guardados en este equipo'
                : 'Documento guardado; hay medios ausentes o dañados. Usa Recuperar fuente.');
        }
        return id;
    }

    async function protegerActual() {
        if (state.projectId || state.clips.length || state.tracks.size) await guardarEnEquipo(false);
    }

    async function abrirDatos(datos, token = ++carga) {
        if (token !== carga) return false;
        if (![1, VERSION].includes(Number(datos.version == null ? 1 : datos.version))) throw new Error('Versión de proyecto no compatible; no se modificó la mezcla actual');
        const estado = app.store.normalizarEstado(Array.isArray(datos) ? { clips: datos } : datos);
        if (!estado) throw new Error('El archivo no contiene un proyecto compatible');
        const originales = Array.isArray(datos) ? datos : datos.clips;
        if (estado.clips.length !== originales.length) throw new Error('El proyecto contiene clips no compatibles; no se descartó ninguno');
        await protegerActual();
        const protegido = JSON.stringify(app.store.aProyecto());
        const vivos = await comprobarFuentes(estado.clips);
        if (token !== carga) return false;
        if (protegido !== JSON.stringify(app.store.aProyecto())) throw new Error('El proyecto actual cambió mientras se comprobaban los medios; reintenta abrir el archivo');
        app.store.aplicarEstado(estado, { guardar: true });
        state.selectedId = estado.clips[0]?.id || '';
        app.timeline.rebuild();
        const faltan = estado.clips.length - vivos.length;
        if (!faltan) void app.media.persistirAssets();
        notificar(faltan ? 'warning' : 'success', faltan
            ? `Proyecto conservado completo: faltan medios de ${faltan} clip(s). Usa Recuperar fuente.`
            : 'Proyecto de mezcla cargado');
        return true;
    }

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
            let enDisco = true;
            try {
                const disponibles = await comprobarFuentes(state.clips);
                if (disponibles.length === state.clips.length) await importarAssets(id);
                if (state.projectId !== id) throw new Error('El proyecto cambió durante la exportación');
                await guardarEnServidor(id, app.store.aProyecto(), true);
            } catch (error) {
                enDisco = false;
                console.warn('Se exportará el JSON aunque no se pudo confirmar la copia en disco:', error);
            }
            if (state.projectId !== id) throw new Error('El proyecto cambió durante la exportación');
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
            notificar(enDisco ? 'success' : 'warning', enDisco ? 'Proyecto de mezcla guardado'
                : 'JSON descargado. No se confirmó la copia en disco; conserva también los archivos de audio.');
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
        const token = ++carga;
        try {
            if (/\.tar$/i.test(archivo.name || '')) return await importarPortable(archivo, token);
            await abrirDatos(JSON.parse(await archivo.text()), token);
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

    function guardarEnServidor(id, proyecto, forzar = false) {
        const cuerpo = JSON.stringify(proyecto);
        colaGuardado = colaGuardado.catch(() => {}).then(async () => {
            if (!forzar && firmas.get(id) === cuerpo) return;
            if (id === state.projectId) estadoGuardado('Guardando proyecto…');
            await pedirJSON(`${baseAPI()}/api/proyectos/${encodeURIComponent(id)}`, {
                method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: cuerpo
            });
            firmas.set(id, cuerpo);
            if (id === state.projectId && cuerpo === JSON.stringify(app.store.aProyecto())) estadoGuardado('Documento guardado en este equipo');
        });
        return colaGuardado;
    }

    async function importarAssets(id, opciones = {}) {
        let importados = 0;
        const fuentes = new Map();
        for (const clip of state.clips.slice()) {
            const src = String(clip.src || '');
            const yaEsAsset = src.startsWith(`/media/projects/${id}/`);
            if (clip.asset && yaEsAsset) continue;
            if (opciones.tolerarFaltantes && !await app.util.head(src)) continue;

            const datos = fuentes.get(src) || await pedirJSON(`${baseAPI()}/api/proyectos/${encodeURIComponent(id)}/assets`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ src, nombre: clip.nombre || '' })
            });

            if (!datos.asset) throw new Error(`No se pudo importar el audio de "${clip.nombre || clip.id}"`);
            if (state.projectId !== id) throw new Error('El proyecto cambió durante la copia de medios');
            fuentes.set(src, datos);
            const actual = app.store.buscarClip(clip.id);
            if (!actual || actual.src !== src) continue;
            actual.asset = datos.asset;
            actual.src = datos.url;
            importados++;
        }
        if (importados) app.store.guardarLocal();
        return importados;
    }

    async function listarGuardados() {
        const datos = await pedirJSON(`${baseAPI()}/api/proyectos`);
        return datos.items || [];
    }

    async function abrirGuardado(id) {
        const token = ++carga;
        const datos = await pedirJSON(`${baseAPI()}/api/proyectos/${encodeURIComponent(id)}`);
        const ok = await abrirDatos(datos.proyecto, token);
        if (datos.recuperado) notificar('warning', 'Se abrió la copia anterior recuperable; el documento dañado se conserva');
        return ok;
    }

    async function recuperarFuente(archivo, clipId = state.selectedId) {
        const clip = app.store.buscarClip(clipId);
        if (!archivo || !clip) throw new Error('Selecciona un clip y su archivo de audio');
        const id = asegurarProjectId(), src = clip.src, asset = clip.asset;
        const form = new FormData(); form.append('audio', archivo, archivo.name);
        const datos = await pedirJSON(`${baseAPI()}/api/proyectos/${encodeURIComponent(id)}/assets/upload`, { method: 'POST', body: form });
        if (!datos.asset || !datos.url) throw new Error('El servidor no devolvió un medio válido');
        const picos = await pedirJSON(`${baseAPI()}/api/audio/peaks?src=${encodeURIComponent(datos.url)}&points=${app.config.PEAKS_POINTS}`);
        if (state.projectId !== id) throw new Error('El proyecto cambió; no se reasignó ningún clip');
        const afectados = state.clips.filter(c => c.src === src && (!asset || c.asset === asset));
        const limite = Math.max(0, ...afectados.map(c => c.out || c.duration));
        if (!afectados.length || !Number.isFinite(picos.duration) || picos.duration + 0.001 < limite) throw new Error('El archivo es demasiado corto o el clip cambió; no se modificaron sus recortes');
        for (const c of afectados) {
            c.src = datos.url; c.asset = datos.asset; c.duration = picos.duration;
            c.peaks = picos.peaks || null;
            if (!c.out) c.out = picos.duration;
        }
        app.store.guardarLocal(); app.timeline.rebuild();
        await guardarEnServidor(id, app.store.aProyecto(), true);
        notificar('success', `Fuente recuperada para ${afectados.length} clip(s); tiempos y efectos conservados`);
        return afectados.length;
    }

    async function exportarPortable() {
        const id = await guardarEnEquipo(false);
        const reporte = await pedirJSON(`${baseAPI()}/api/proyectos/${encodeURIComponent(id)}/integridad`);
        if (!reporte.ok) throw new Error('Recupera los medios faltantes o dañados antes de exportar el paquete');
        const url = `${baseAPI()}/api/proyectos/${encodeURIComponent(id)}/portable`;
        const enlace = document.createElement('a'); enlace.href = url; enlace.download = `${id}.loquendo.tar`;
        document.body.appendChild(enlace); enlace.click(); enlace.remove();
        return url;
    }

    async function importarPortable(archivo, token = ++carga) {
        const form = new FormData(); form.append('project', archivo, archivo.name);
        // El backend importa a un ID nuevo; no sobrescribe un proyecto existente.
        const datos = await pedirJSON(`${baseAPI()}/api/proyectos/importar-portable`, { method:'POST',body:form });
        return abrirDatos(datos.proyecto, token);
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
            const id = asegurarProjectId();
            const disponibles = await comprobarFuentes(state.clips);
            if (id !== state.projectId) throw new Error('El proyecto cambió durante la preparación del render');
            if (disponibles.length !== state.clips.length) {
                throw new Error('Faltan medios del proyecto. Recupera los archivos o retira sus clips explícitamente antes de renderizar.');
            }
            const importados = await importarAssets(id);
            if (id !== state.projectId) throw new Error('El proyecto cambió durante la preparación del render');
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
        autoguardar, guardarEnEquipo, listarGuardados, abrirGuardado, recuperarFuente, exportarPortable, importarPortable,
        exportarProyecto,
        importarProyecto,
        renderizarMezcla,
        asegurarProjectId,
        importarAssets,
        guardarEnServidor,
        descargarBlob
    };
})(window);
