// services/mixer/media.js - Carga de audio, SFX y drops al mezclador
(function (global) {
    'use strict';

    const app = global.MixerApp;
    const { state } = app.store;
    const { rutaServidorDe, urlCompleta, baseAPI, notificar } = app.util;

    let persistencia = Promise.resolve();

    function persistirAssets() {
        persistencia = persistencia.then(async () => {
            if (!state.clips.length || !app.project) return;
            try {
                const id = app.project.asegurarProjectId();
                await app.project.importarAssets(id);
                app.store.guardarLocal();
            } catch (error) {
                console.error('Mixer: no se pudieron persistir los assets', error);
                notificar('warning', 'La mezcla se guardó, pero no se pudieron copiar los audios al proyecto');
            }
        }).catch(() => {});
        return persistencia;
    }

    async function subirYAgregar(trackId, archivo) {
        if (!archivo) return null;
        const formData = new FormData();
        formData.append('music', archivo, archivo.name);

        try {
            const respuesta = await fetch(`${baseAPI()}/api/upload-music`, { method: 'POST', body: formData });
            const datos = await respuesta.json().catch(() => null);
            if (!respuesta.ok || !datos || !datos.url) {
                throw new Error((datos && datos.error) || 'Error al subir archivo');
            }
            const clip = app.store.agregarClip(trackId, datos.url, {
                nombre: archivo.name.replace(/\.[^.]+$/, '')
            });
            app.timeline.rebuild();
            if (clip && app.inspector) app.inspector.seleccionar(clip.id);
            notificar('success', `"${archivo.name}" añadido al mezclador`);
            void persistirAssets();
            return clip;
        } catch (error) {
            console.error('Mixer: error subiendo archivo', error);
            notificar('error', `No se pudo añadir "${archivo.name}"`);
            return null;
        }
    }

    async function cargarArchivosSfx(archivos) {
        if (!archivos || !archivos.length) return;
        const lista = Array.from(archivos);
        for (const archivo of lista) {
            await subirYAgregar('sfx', archivo);
        }
    }

    function onDropArchivo(evento) {
        const archivos = evento.dataTransfer && evento.dataTransfer.files;
        const texto = evento.dataTransfer ? (evento.dataTransfer.getData('text/plain') || '') : '';
        if (!(archivos && archivos.length) && !texto) return;

        evento.preventDefault();
        evento.stopPropagation();

        if (archivos && archivos.length) {
            cargarArchivosSfx(archivos);
            return;
        }

        const ruta = rutaServidorDe(texto);
        if (!ruta) return;
        const clip = app.store.agregarClip('sfx', ruta, { nombre: '' });
        app.timeline.rebuild();
        if (clip && app.inspector) app.inspector.seleccionar(clip.id);
        void persistirAssets();
    }

    async function agregarVozActual() {
        let ruta = '';
        try {
            const inst = global.audioEditor;
            ruta = inst && typeof inst._rutaAudioServidor === 'function'
                ? inst._rutaAudioServidor()
                : (global.voiceAudioRealPath || '');
        } catch (e) {
            ruta = '';
        }

        const limpia = rutaServidorDe(ruta);
        if (!limpia) {
            notificar('warning', 'Primero genera un audio de voz (que esté guardado en el servidor)');
            return null;
        }

        if (!(await app.util.head(limpia))) {
            notificar('error', 'El audio de voz no está disponible en el servidor');
            return null;
        }

        const clip = app.store.agregarClip('voz', limpia, { nombre: 'Voz', reemplazar: true });
        app.timeline.rebuild();
        if (clip && app.inspector) app.inspector.seleccionar(clip.id);
        notificar('success', 'Pista de voz añadida al mezclador');
        void persistirAssets();
        return clip;
    }

    async function agregarMusicaActual() {
        const limpia = rutaServidorDe(global.musicaFondoPath || '');
        if (!limpia) {
            notificar('warning', 'Primero sube una música de fondo');
            return null;
        }

        if (!(await app.util.head(limpia))) {
            notificar('error', 'La música no está disponible en el servidor');
            return null;
        }

        const clip = app.store.agregarClip('musica', limpia, { nombre: 'Música', reemplazar: true });
        app.timeline.rebuild();
        if (clip && app.inspector) app.inspector.seleccionar(clip.id);
        notificar('success', 'Pista de música añadida al mezclador');
        void persistirAssets();
        return clip;
    }

    function vaciar() {
        if (!state.clips.length) return;
        app.store.limpiar();
        app.timeline.rebuild();
        notificar('info', 'Mezclador vaciado');
    }

    async function cargarBiblioteca() {
        const lista = document.getElementById('mezcladorSfxLista');
        if (!lista) return;

        try {
            const respuesta = await fetch(`${baseAPI()}/api/sfx/list`);
            if (!respuesta.ok) throw new Error('no disponible');
            const data = await respuesta.json();
            if (!data || !Array.isArray(data.items) || !data.items.length) {
                lista.innerHTML = '<li class="mezclador-sfx-vacio">Sin SFX en el servidor</li>';
                return;
            }

            lista.innerHTML = '';
            for (const item of data.items) {
                const li = document.createElement('li');
                li.textContent = item.nombre || item.url;
                li.draggable = true;
                li.title = 'Arrastra a la pista SFX o haz doble clic para añadirlo';
                li.addEventListener('dragstart', (e) => {
                    e.dataTransfer.setData('text/plain', urlCompleta(item.url));
                });
                li.addEventListener('dblclick', () => {
                    const clip = app.store.agregarClip('sfx', item.url, { nombre: item.nombre });
                    app.timeline.rebuild();
                    if (clip && app.inspector) app.inspector.seleccionar(clip.id);
                    void persistirAssets();
                });
                lista.appendChild(li);
            }
        } catch (e) {
            lista.innerHTML = '<li class="mezclador-sfx-vacio">Sin SFX en el servidor</li>';
        }
    }

    app.media = {
        subirYAgregar,
        persistirAssets,
        cargarArchivosSfx,
        onDropArchivo,
        agregarVozActual,
        agregarMusicaActual,
        vaciar,
        cargarBiblioteca
    };
})(window);
