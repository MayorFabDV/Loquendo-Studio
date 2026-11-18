// Recuperación explícita y separada de voz/mezclador. Nunca se activa al detectar.
(function (global) {
    'use strict';
    const pendingKey = tipo => `recovery.pending.${tipo}`;
    const pendientes = { voice: null, mixer: null };
    const seguros = { voice: false, mixer: false };
    const erroresLectura = { voice: false, mixer: false };
    let preparacion = null, terminado = false;
    let ocupado = false, dialogoActivo = false, ofrecido = false;
    const store = () => global.audioSessionStore;
    const mixer = () => global.MixerApp;
    const uid = () => global.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const avisar = mensaje => global.notifications?.warning(mensaje);

    function mezclaValida(datos) {
        try {
            const raw = Array.isArray(datos) ? datos : datos?.clips;
            if (!Array.isArray(raw) || !raw.length || ![1, 2].includes(Number(datos.version == null ? 1 : datos.version))) return false;
            const estado = mixer().store.normalizarEstado(datos);
            return !!estado && estado.clips.length === raw.length
                && estado.tracks.every(t => t && typeof t.id === 'string');
        } catch (error) { return false; }
    }

    async function vozValida(datos) {
        if (!datos || typeof datos.source !== 'string' || !datos.source || !datos.blob?.size) return false;
        let ctx;
        try {
            ctx = new (global.AudioContext || global.webkitAudioContext)();
            const decoded = await ctx.decodeAudioData(await datos.blob.arrayBuffer());
            return Number.isFinite(decoded.duration) && decoded.duration > 0;
        } catch (error) { return false; }
        finally { if (ctx) await ctx.close().catch(() => {}); }
    }

    async function validar(tipo, datos) { return tipo === 'mixer' ? mezclaValida(datos) : vozValida(datos); }

    async function huella(tipo, datos) {
        if (!global.crypto?.subtle) return null;
        try {
            const digest = async bytes => Array.from(new Uint8Array(await global.crypto.subtle.digest('SHA-256', bytes)), n => n.toString(16).padStart(2, '0')).join('');
            const blobHash = async blob => typeof blob?.arrayBuffer === 'function' ? digest(await blob.arrayBuffer()) : null;
            const contenido = tipo === 'mixer' ? datos : { source: datos.source,
                blob: await blobHash(datos.blob), originalBlob: await blobHash(datos.originalBlob),
                markers: datos.markers || [], originalMarkers: datos.originalMarkers || [],
                fx: datos.fx?.fx || null, bypass: !!datos.fx?.bypass, edited: datos.edited !== false };
            return await digest(new TextEncoder().encode(JSON.stringify(contenido)));
        } catch (error) { return null; } // Sin huella se conserva otra copia, nunca se descartan datos.
    }

    async function archivar(tipo, datos, deduplicar = false) {
        const fingerprint = await huella(tipo, datos);
        if (deduplicar && fingerprint) {
            const previo = (await store().listarRecuperaciones()).find(r => r.key.startsWith('recovery.saved.') && r.tipo === tipo && r.huella === fingerprint);
            if (previo) return previo.key;
        }
        const key = `recovery.saved.${tipo}.${uid()}`;
        await store().guardarRecuperacion(key, tipo, datos, false, fingerprint);
        return key;
    }

    async function detectar(tipo, candidato) {
        let anterior;
        try {
            anterior = await store().leerRecuperacion(pendingKey(tipo));
            if (anterior?.tipo === tipo && await validar(tipo, anterior.datos)) {
                pendientes[tipo] = anterior.datos;
                // También puede haber trabajo más reciente en la clave activa.
                // Preservarlo antes de permitir que la recuperación antigua la sustituya.
                const actual = await candidato();
                if (await validar(tipo, actual)) {
                    const a = await huella(tipo, actual), b = await huella(tipo, anterior.datos);
                    if (!a || a !== b) await archivar(tipo, actual, true);
                }
                seguros[tipo] = true; return;
            }
            const datos = await candidato();
            if (!await validar(tipo, datos)) return;
            pendientes[tipo] = datos;
            // Si un checkpoint quedó ilegible, conservarlo antes de sustituirlo.
            if (anterior) await archivar(tipo, anterior.datos);
            const pinned = await store().guardarRecuperacion(pendingKey(tipo), tipo, datos, !anterior);
            if (!await validar(tipo, pinned.datos)) throw new Error('Copia de recuperación no válida');
            pendientes[tipo] = pinned.datos; seguros[tipo] = true;
        } catch (error) {
            erroresLectura[tipo] = true;
            console.warn('No se pudo preparar la recuperación de ' + tipo, error);
            avisar('No se pudo conservar una recuperación anterior. No se sobrescribirá; puedes reintentar desde Recuperar sesiones.');
        }
    }

    function preparar() {
        if (preparacion) return preparacion;
        // Capturar el JSON antes de cualquier await/autoguardado de una mezcla nueva.
        const local = mixer()?.store.leerLocal();
        preparacion = (async () => {
            try {
                await detectar('mixer', async () => local?.datos || null);
                await detectar('voice', () => store().obtenerActiva());
            } finally { terminado = true; }
            await refrescar();
        })();
        return preparacion;
    }

    function preguntar(texto, aceptar, cancelar, nota = '') {
        if (dialogoActivo) return Promise.resolve(false);
        const dialog = document.getElementById('dialogRecuperacion');
        if (!dialog) return Promise.resolve(false);
        dialogoActivo = true;
        document.getElementById('recuperacionPregunta').textContent = texto;
        document.getElementById('recuperacionNota').textContent = nota;
        const yes = document.getElementById('btnAceptarRecuperacion');
        const no = document.getElementById('btnPermanecerRecuperacion');
        yes.textContent = aceptar; no.textContent = cancelar;
        return new Promise(resolve => {
            const finish = value => {
                yes.onclick = no.onclick = null;
                dialog.oncancel = dialog.onclose = null;
                if (dialog.open) dialog.close();
                dialogoActivo = false; resolve(value);
            };
            yes.onclick = () => finish(true); no.onclick = () => finish(false);
            dialog.oncancel = event => { event.preventDefault(); finish(false); };
            dialog.onclose = () => finish(false);
            dialog.showModal(); no.focus();
        });
    }

    function firmaVoz() {
        const e = global.audioEditor, state = e.getEngineState();
        return JSON.stringify([e._revisionAudio, e._fuenteOriginal, e.historyIndex,
            global.audioMarkers?.getMarkers() || [], state?.fx || null, state?.bypass || false]);
    }

    async function protegerActual(tipo) {
        if (tipo === 'voice') {
            const e = global.audioEditor;
            if (e._cargandoEdicion || e._restaurando) throw new Error('Espera a que termine la carga o restauración del audio actual');
            if (!e.audioBuffer) return;
            const firma = firmaVoz();
            if (!e.estaSesionGuardada() && !await preguntar('Hay trabajo nuevo en el editor de voz. ¿Quieres guardarlo antes de recuperar la sesión anterior?', 'Guardar y recuperar', 'Cancelar')) return false;
            if (firma !== firmaVoz()) throw new Error('El audio actual cambió. Reintenta la recuperación');
            if (!await e._programarGuardadoSesion()) throw new Error('No se pudo guardar el audio actual; no se recuperó otra sesión');
            const actual = await store().obtenerActiva();
            if (!actual || firma !== firmaVoz()) throw new Error('El audio actual cambió durante el guardado');
            await archivar('voice', actual);
            if (firma !== firmaVoz()) throw new Error('El audio actual cambió durante el guardado');
        } else {
            const app = mixer();
            if (!app.state.clips.length && !app.state.projectId && !app.state.tracks.size) return;
            if (!app.project.estaGuardado() && !await preguntar('Hay trabajo nuevo en el mezclador. ¿Quieres guardarlo antes de recuperar la sesión anterior?', 'Guardar y recuperar', 'Cancelar')) return false;
            await app.project.guardarEnEquipo(false);
            const datos = JSON.parse(JSON.stringify(app.store.aProyecto())), firma = JSON.stringify(datos);
            await archivar('mixer', datos);
            if (firma !== JSON.stringify(app.store.aProyecto())) throw new Error('La mezcla actual cambió durante el guardado');
        }
        return true;
    }

    function mostrarAudio() {
        document.getElementById('contenedorReproductor').style.display = 'block';
        global.tabs.irA('audio');
    }

    async function recuperar(tipo, key = pendingKey(tipo)) {
        if (ocupado || dialogoActivo) return false;
        ocupado = true;
        try {
            await preparar();
            const record = await store().leerRecuperacion(key);
            if (!record || record.tipo !== tipo || !await validar(tipo, record.datos)) throw new Error('La sesión no se puede recuperar. Sus datos se conservaron');
            if (key === pendingKey(tipo) && !seguros[tipo]) throw new Error('Primero reintenta conservar la copia de recuperación');
            if (await protegerActual(tipo) === false) return false;
            if (tipo === 'mixer') {
                if (!await mixer().project.abrirSesion(record.datos)) return false;
                // Marcar la inicialización antes de navegar: no volver a cargar el
                // localStorage anterior mientras se confirma el nuevo estado.
                global.mixer.init({ cargarLocal: false });
                mostrarAudio();
                global.audioEditorUI.setMode('avanzado');
                global.audioEditorUI.setSubtab('mezclador');
                if (!await mixer().store.guardarLocalAhora()) throw new Error('Mezcla recuperada; no se pudo confirmar la copia local. Se conserva el checkpoint');
            } else {
                const firma = firmaVoz();
                const ok = await global.audioEditor.recuperarSesion(record.datos, {
                    reemplazar: true, comprobarActual: () => firma === firmaVoz(),
                    antesDeAplicar: () => store().guardar(record.datos.source, record.datos)
                });
                if (!ok) throw new Error('No se recuperó el audio; se conservan la sesión y el trabajo actual');
                mostrarAudio();
                global.asegurarEditorInicializado();
                // El buffer ya está recuperado; solo cargar su vista, sin reiniciar historial/original.
                await global.audioEditor.wavesurfer.load(global.audioEditor.currentWavBlobUrl);
                global.audioEditorUI.setSubtab('edicion');
            }
            if (key === pendingKey(tipo)) {
                await store().consumirRecuperacion(key);
                pendientes[tipo] = null; seguros[tipo] = false;
            }
            await refrescar();
            return true;
        } catch (error) {
            console.warn('Recuperación cancelada o sin confirmar:', error);
            avisar(error.message || 'No se pudo recuperar la sesión');
            return false;
        } finally { ocupado = false; }
    }

    async function refrescar() {
        const panel = document.getElementById('sesionesRecuperables'), lista = document.getElementById('listaRecuperaciones');
        if (!panel || !lista) return;
        let rows = [];
        try { rows = await store().listarRecuperaciones(); } catch (error) { /* Mostrar reintento, sin borrar nada. */ }
        lista.replaceChildren();
        for (const row of rows.sort((a,b) => b.fecha - a.fecha)) {
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-mixer';
            const tipo = row.tipo === 'mixer' ? 'mezclador' : 'editor de voz';
            btn.textContent = row.key.startsWith('recovery.pending.') ? `Recuperar sesión del ${tipo}`
                : `Recuperar ${tipo} guardado — ${row.nombre} (${new Date(row.fecha).toLocaleString()})`;
            btn.dataset.recoveryKey = row.key; btn.dataset.recoveryType = row.tipo;
            btn.onclick = () => recuperar(row.tipo, row.key);
            lista.appendChild(btn);
        }
        const retry = document.getElementById('btnReintentarRecuperacion');
        retry.hidden = !Object.values(erroresLectura).some(Boolean) && !Object.keys(pendientes).some(k => pendientes[k] && !seguros[k]);
        panel.hidden = !rows.length && retry.hidden;
    }

    async function iniciar() {
        await preparar();
        if (ofrecido) return;
        ofrecido = true;
        try { if (sessionStorage.getItem('loquendo.recovery.offered')) return; sessionStorage.setItem('loquendo.recovery.offered', '1'); } catch (e) { /* Guardia en memoria. */ }
        if (pendientes.mixer) {
            const yes = await preguntar('Encontramos una sesión anterior del mezclador. ¿Quieres recuperarla y abrir el mezclador?',
                'Recuperar y abrir el mezclador', 'Permanecer aquí', pendientes.voice ? 'También hay una sesión del editor de voz. Puedes recuperarla por separado desde Recuperar sesiones anteriores.' : 'La sesión se conserva si decides permanecer aquí.');
            if (yes) await recuperar('mixer');
        }
    }

    global.sessionRecovery = { preparar, iniciar, recuperar, mezclaValida,
        tienePendiente: tipo => !!pendientes[tipo], detectando: () => !terminado,
        bloqueaGuardado: tipo => erroresLectura[tipo] || (!!pendientes[tipo] && !seguros[tipo]) };
    document.addEventListener('DOMContentLoaded', () => {
        document.getElementById('btnReintentarRecuperacion').onclick = async () => {
            preparacion = null; terminado = false; erroresLectura.voice = erroresLectura.mixer = false;
            await preparar();
        };
        setTimeout(() => { iniciar().catch(error => { console.warn(error); avisar('No se pudo detectar la recuperación; los datos no se han descartado'); }); }, 0);
    });
})(window);
