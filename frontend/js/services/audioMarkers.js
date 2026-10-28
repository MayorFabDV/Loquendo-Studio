(function () {
    'use strict';

    var state = {
        markers: [],
        activeId: null,
        loadedUrl: null,
        editor: null,
        attached: false,
        boundWaveSurfer: null,
        renderPending: false
    };

    var nextId = 1;

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function editor() {
        return state.editor || window.audioEditor || null;
    }

    function duracion() {
        var inst = editor();
        if (!inst) return 0;
        var total = inst.audioBuffer && inst.audioBuffer.duration
            ? inst.audioBuffer.duration
            : (inst.getDuration ? inst.getDuration() : 0);
        return isFinite(total) && total > 0 ? total : 0;
    }

    function parseTiempo(texto) {
        var valor = String(texto || '').trim().replace(',', '.');
        var match = valor.match(/^(?:(\d+):)?(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?$/);
        if (!match) return null;
        var horas = match[1] ? parseInt(match[1], 10) : 0;
        var minutos = parseInt(match[2], 10);
        var segundos = parseInt(match[3], 10);
        var milesimas = match[4] ? parseInt((match[4] + '00').slice(0, 3), 10) : 0;
        return horas * 3600 + minutos * 60 + segundos + milesimas / 1000;
    }

    function parseSRT(texto) {
        var limpio = String(texto || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
        if (/^WEBVTT/i.test(limpio)) {
            limpio = limpio.replace(/^WEBVTT[^\n]*\n+/, '');
        }

        var bloques = limpio.split(/\n{2,}/);
        var marcadores = [];

        for (var i = 0; i < bloques.length; i++) {
            var lineas = bloques[i].split('\n').filter(function (linea) { return String(linea).trim() !== ''; });
            if (!lineas.length) continue;

            var indiceTiempo = -1;
            for (var j = 0; j < lineas.length; j++) {
                if (lineas[j].indexOf('-->') !== -1) {
                    indiceTiempo = j;
                    break;
                }
            }
            if (indiceTiempo === -1) continue;

            var tiempos = lineas[indiceTiempo].split('-->');
            if (tiempos.length < 2) continue;

            var inicio = parseTiempo(tiempos[0]);
            var finTexto = tiempos[1].trim().split(/\s+/)[0];
            var fin = parseTiempo(finTexto);
            if (inicio === null || fin === null || fin <= inicio) continue;

            var textoMarcador = lineas.slice(indiceTiempo + 1).join('\n').trim();
            if (!textoMarcador) textoMarcador = 'Subtítulo ' + (marcadores.length + 1);

            marcadores.push({
                start: inicio,
                end: fin,
                text: textoMarcador
            });
        }

        marcadores.sort(function (a, b) { return a.start - b.start; });
        return marcadores;
    }

    function normalizarMarcadores(marcadores) {
        if (!Array.isArray(marcadores)) return [];
        var total = duracion();
        var salida = [];

        for (var i = 0; i < marcadores.length; i++) {
            var item = marcadores[i] || {};
            var inicio = Number(item.start);
            var fin = Number(item.end);
            if (!isFinite(inicio) || !isFinite(fin)) continue;
            if (total > 0) {
                inicio = clamp(inicio, 0, total);
                fin = clamp(fin, 0, total);
            } else {
                inicio = Math.max(0, inicio);
                fin = Math.max(inicio, fin);
            }
            if (fin - inicio < 0.01) continue;
            salida.push({
                id: item.id || ('marker-' + (nextId++)),
                start: inicio,
                end: fin,
                text: String(item.text || 'Marcador').trim() || 'Marcador'
            });
        }

        salida.sort(function (a, b) {
            if (a.start === b.start) return a.end - b.end;
            return a.start - b.start;
        });
        return salida;
    }

    function formatearTiempo(segundos, conMilesimas) {
        var total = Math.max(0, Number(segundos) || 0);
        var horas = Math.floor(total / 3600);
        var minutos = Math.floor((total % 3600) / 60);
        var resto = total % 60;
        var segundosEnteros = Math.floor(resto);
        var milesimas = Math.round((resto - segundosEnteros) * 1000);
        if (milesimas === 1000) {
            milesimas = 0;
            segundosEnteros++;
            if (segundosEnteros === 60) {
                segundosEnteros = 0;
                minutos++;
                if (minutos === 60) {
                    minutos = 0;
                    horas++;
                }
            }
        }
        var hh = String(horas).padStart(2, '0');
        var mm = String(minutos).padStart(2, '0');
        var ss = String(segundosEnteros).padStart(2, '0');
        var ms = String(milesimas).padStart(3, '0');

        if (conMilesimas) {
            // Estándar SRT: HH:MM:SS,mmm obligatorio siempre
            return hh + ':' + mm + ':' + ss + ',' + ms;
        }

        // Formato para UI compacto
        var base = (horas > 0 ? hh + ':' : '') + mm + ':' + ss;
        return base + '.' + String(Math.floor(milesimas / 10)).padStart(2, '0');
    }

    function serializarSRT(marcadores) {
        var lista = (marcadores || state.markers).slice().sort(function (a, b) { return a.start - b.start; });
        var lineas = [];
        for (var i = 0; i < lista.length; i++) {
            var item = lista[i];
            lineas.push(String(i + 1));
            lineas.push(formatearTiempo(item.start, true) + ' --> ' + formatearTiempo(item.end, true));
            lineas.push(String(item.text || '').trim() || 'Subtítulo');
            lineas.push('');
        }
        return lineas.join('\n');
    }

    function activo() {
        for (var i = 0; i < state.markers.length; i++) {
            if (state.markers[i].id === state.activeId) return state.markers[i];
        }
        return null;
    }

    function indiceSiguiente() {
        var actual = activo();
        if (!actual) return -1;
        for (var i = 0; i < state.markers.length; i++) {
            if (state.markers[i].id === actual.id) return i + 1 < state.markers.length ? i + 1 : -1;
        }
        return -1;
    }

    function setContenido(id, texto) {
        var el = document.getElementById(id);
        if (el) el.textContent = texto;
    }

    function habilitar(id, activo) {
        var el = document.getElementById(id);
        if (el) el.disabled = !activo;
    }

    function actualizarUI() {
        var cantidad = state.markers.length;
        setContenido('audioMarkerStatus', cantidad === 0 ? 'Sin marcadores' : cantidad + (cantidad === 1 ? ' marcador' : ' marcadores'));
        habilitar('btnMarkerDescargar', cantidad > 0);
        habilitar('btnMarkerLimpiar', cantidad > 0);

        var actual = activo();
        var inicio = document.getElementById('audioMarkerStart');
        var fin = document.getElementById('audioMarkerEnd');
        var texto = document.getElementById('audioMarkerText');

        if (inicio) {
            inicio.disabled = !actual;
            inicio.value = actual ? actual.start.toFixed(2) : '';
        }
        if (fin) {
            fin.disabled = !actual;
            fin.value = actual ? actual.end.toFixed(2) : '';
        }
        if (texto) {
            texto.disabled = !actual;
            texto.value = actual ? actual.text : '';
        }

        var tieneSiguiente = indiceSiguiente() !== -1;
        habilitar('btnMarkerGuardar', !!actual);
        habilitar('btnMarkerIr', !!actual);
        habilitar('btnMarkerDividir', !!actual);
        habilitar('btnMarkerUnir', tieneSiguiente);
        habilitar('btnMarkerEliminar', !!actual);

        actualizarBotonDescargaPrincipal();
        renderLista();
    }

    var srtBlobUrl = null;
    function actualizarBotonDescargaPrincipal() {
        var enlace = document.getElementById('btnDescargaSRT');
        if (!enlace || !state.markers.length) return;
        try {
            var contenido = serializarSRT();
            var blob = new Blob([contenido], { type: 'text/plain;charset=utf-8' });
            if (srtBlobUrl) URL.revokeObjectURL(srtBlobUrl);
            srtBlobUrl = URL.createObjectURL(blob);
            enlace.href = srtBlobUrl;
            enlace.setAttribute('download', 'subtitulos_' + Date.now() + '.srt');
            enlace.style.display = 'inline-flex';
        } catch (e) { /* ignore */ }
    }

    function renderLista() {
        var contenedor = document.getElementById('audioMarkerList');
        if (!contenedor) return;
        contenedor.innerHTML = '';

        for (var i = 0; i < state.markers.length; i++) {
            var item = state.markers[i];
            var fila = document.createElement('button');
            fila.type = 'button';
            fila.className = 'audio-marker-row' + (item.id === state.activeId ? ' activo' : '');
            fila.setAttribute('data-marker-id', item.id);

            var tiempo = document.createElement('span');
            tiempo.className = 'audio-marker-row-time';
            tiempo.textContent = formatearTiempo(item.start, false);

            var etiqueta = document.createElement('span');
            etiqueta.className = 'audio-marker-row-text';
            etiqueta.textContent = item.text;

            fila.appendChild(tiempo);
            fila.appendChild(etiqueta);
            fila.addEventListener('click', function () {
                var id = this.getAttribute('data-marker-id');
                seleccionar(id, true);
            });
            contenedor.appendChild(fila);
        }
    }

    function asegurarCapa() {
        var inst = editor();
        if (!inst || !inst.wavesurfer) return null;
        var wrapper = inst.wavesurfer.getWrapper ? inst.wavesurfer.getWrapper() : null;
        if (!wrapper) return null;

        var capa = document.getElementById('audioMarkerOverlay');
        if (!capa) {
            capa = document.createElement('div');
            capa.id = 'audioMarkerOverlay';
            capa.className = 'audio-marker-overlay';
            capa.setAttribute('aria-hidden', 'true');
        }
        if (capa.parentElement !== wrapper) wrapper.appendChild(capa);
        return capa;
    }

    function render() {
        if (state.renderPending) return;
        state.renderPending = true;
        requestAnimationFrame(function () {
            state.renderPending = false;
            var capa = asegurarCapa();
            if (!capa) return;
            capa.innerHTML = '';

            var total = duracion();
            if (!total || !state.markers.length) return;

            for (var i = 0; i < state.markers.length; i++) {
                var item = state.markers[i];
                var izquierda = clamp(item.start / total, 0, 1) * 100;
                var ancho = clamp((item.end - item.start) / total, 0, 1) * 100;

                var guia = document.createElement('div');
                guia.className = 'audio-marker-guide' + (item.id === state.activeId ? ' activo' : '');
                guia.style.left = izquierda + '%';
                capa.appendChild(guia);

                var bandera = document.createElement('button');
                bandera.type = 'button';
                bandera.className = 'audio-marker-flag' + (item.id === state.activeId ? ' activo' : '');
                bandera.style.left = izquierda + '%';
                bandera.style.width = 'max(' + ancho + '%, 10px)';
                bandera.textContent = formatearTiempo(item.start, false);
                bandera.title = formatearTiempo(item.start, false) + ' - ' + formatearTiempo(item.end, false) + '\n' + item.text;
                bandera.setAttribute('data-marker-id', item.id);
                bandera.addEventListener('click', function (event) {
                    event.stopPropagation();
                    seleccionar(this.getAttribute('data-marker-id'), true);
                });
                capa.appendChild(bandera);
            }
        });
    }

    function seleccionar(id, buscar) {
        state.activeId = id || null;
        var actual = activo();
        if (actual && buscar) {
            var inst = editor();
            if (inst && inst.seekTo) inst.seekTo(actual.start);
        }
        actualizarUI();
        render();
    }

    function setMarkers(marcadores, opciones) {
        var opts = opciones || {};
        state.markers = normalizarMarcadores(marcadores);
        if (state.activeId && !activo()) state.activeId = null;
        if (!state.activeId && state.markers.length && opts.activarPrimero !== false) {
            state.activeId = state.markers[0].id;
        }
        actualizarUI();
        render();

        var inst = editor();
        if (opts.historial && inst && typeof inst.registrarCambioMarcadores === 'function') {
            inst.registrarCambioMarcadores();
        } else if (opts.sincronizar !== false && inst && typeof inst.sincronizarMarcadoresActuales === 'function') {
            inst.sincronizarMarcadoresActuales();
        }
    }

    function getMarkers() {
        return state.markers.map(function (item) {
            return { id: item.id, start: item.start, end: item.end, text: item.text };
        });
    }

    function cargarTexto(texto, opciones) {
        var opts = opciones || {};
        var marcadores = parseSRT(texto);
        if (!marcadores.length) {
            if (window.notifications) window.notifications.warning('No se encontraron marcadores válidos en el SRT.');
            return [];
        }
        setMarkers(marcadores, { historial: !!opts.historial, activarPrimero: true });
        if (!opts.silencioso && window.notifications) {
            window.notifications.success('Se cargaron ' + marcadores.length + ' marcadores SRT.');
        }
        return marcadores;
    }

    function rutaAbsoluta(ruta) {
        if (!ruta) return '';
        if (/^(https?:|blob:|data:)/i.test(ruta)) return ruta;
        var base = window.CONFIG && window.CONFIG.API_BASE ? window.CONFIG.API_BASE : '';
        return base + (ruta.charAt(0) === '/' ? ruta : '/' + ruta);
    }

    function cargarDesdeUrl(ruta, opciones) {
        var opts = opciones || {};
        var url = rutaAbsoluta(ruta);
        if (!url) return Promise.resolve([]);
        if (!opts.forzar && state.loadedUrl === url) return Promise.resolve(getMarkers());

        return fetch(url + (url.indexOf('?') === -1 ? '?' : '&') + 't=' + Date.now())
            .then(function (respuesta) {
                if (!respuesta.ok) throw new Error('HTTP ' + respuesta.status);
                return respuesta.text();
            })
            .then(function (texto) {
                state.loadedUrl = url;
                var marcadores = parseSRT(texto);
                setMarkers(marcadores, { historial: false, activarPrimero: true });
                if (!marcadores.length && !opts.silencioso && window.notifications) {
                    window.notifications.warning('El SRT no contiene marcadores válidos.');
                }
                return marcadores;
            })
            .catch(function (error) {
                if (!opts.silencioso) {
                    console.warn('No se pudo cargar el SRT en el editor:', error);
                }
                return [];
            });
    }

    function cargarDesdeApp(opciones) {
        var opts = opciones || {};
        var ruta = window.appState && window.appState.subtitles ? window.appState.subtitles.srtUrl : null;
        if (!ruta) {
            var enlace = document.getElementById('btnDescargaSRT');
            if (enlace && enlace.href && enlace.style.display !== 'none' && !/^blob:/i.test(enlace.href)) {
                ruta = enlace.href;
            }
        }
        if (!ruta) return Promise.resolve([]);
        return cargarDesdeUrl(ruta, opts);
    }

    function guardarActivo() {
        var actual = activo();
        if (!actual) return;
        var total = duracion();
        var inicio = parseFloat(document.getElementById('audioMarkerStart') ? document.getElementById('audioMarkerStart').value : actual.start);
        var fin = parseFloat(document.getElementById('audioMarkerEnd') ? document.getElementById('audioMarkerEnd').value : actual.end);
        var texto = document.getElementById('audioMarkerText') ? document.getElementById('audioMarkerText').value : actual.text;

        if (!isFinite(inicio) || !isFinite(fin) || fin - inicio < 0.01) {
            if (window.notifications) window.notifications.warning('El marcador necesita un inicio y un fin válidos.');
            return;
        }
        if (total > 0) {
            inicio = clamp(inicio, 0, total);
            fin = clamp(fin, 0, total);
        }
        actual.start = inicio;
        actual.end = fin;
        actual.text = String(texto || '').trim() || 'Marcador';
        setMarkers(state.markers, { historial: true, activarPrimero: false });
        if (window.notifications) window.notifications.success('Marcador actualizado.');
    }

    function dividirActivo() {
        var actual = activo();
        if (!actual) return;
        var inst = editor();
        var corte = inst && inst.getCurrentTime ? inst.getCurrentTime() : (actual.start + actual.end) / 2;
        if (!(corte > actual.start + 0.01 && corte < actual.end - 0.01)) {
            corte = (actual.start + actual.end) / 2;
        }
        if (corte - actual.start < 0.05 || actual.end - corte < 0.05) {
            if (window.notifications) window.notifications.warning('El marcador es demasiado corto para dividirlo.');
            return;
        }

        var nuevo = {
            start: corte,
            end: actual.end,
            text: actual.text + ' (2)'
        };
        actual.end = corte;
        state.markers.push(nuevo);
        setMarkers(state.markers, { historial: true, activarPrimero: false });
        if (window.notifications) window.notifications.success('Marcador dividido.');
    }

    function unirActivo() {
        var actual = activo();
        var indice = -1;
        for (var i = 0; i < state.markers.length; i++) {
            if (state.markers[i].id === (actual && actual.id)) {
                indice = i;
                break;
            }
        }
        if (!actual || indice === -1 || indice + 1 >= state.markers.length) {
            if (window.notifications) window.notifications.warning('No hay un marcador siguiente para unir.');
            return;
        }

        var siguiente = state.markers[indice + 1];
        actual.end = Math.max(actual.end, siguiente.end);
        actual.text = (actual.text + ' ' + siguiente.text).trim();
        state.markers.splice(indice + 1, 1);
        setMarkers(state.markers, { historial: true, activarPrimero: false });
        if (window.notifications) window.notifications.success('Marcadores unidos.');
    }

    function eliminarActivo() {
        var actual = activo();
        if (!actual) return;
        state.markers = state.markers.filter(function (item) { return item.id !== actual.id; });
        state.activeId = state.markers.length ? state.markers[0].id : null;
        setMarkers(state.markers, { historial: true, activarPrimero: false });
    }

    function limpiar() {
        if (!state.markers.length) return;
        state.loadedUrl = null;
        state.activeId = null;
        setMarkers([], { historial: true, activarPrimero: false });
        if (window.notifications) window.notifications.info('Marcadores eliminados del editor.');
    }

    function descargar() {
        if (!state.markers.length) return;
        var blob = new Blob([serializarSRT()], { type: 'text/plain;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var enlace = document.createElement('a');
        enlace.href = url;
        enlace.download = 'subtitulos_editados_' + Date.now() + '.srt';
        document.body.appendChild(enlace);
        enlace.click();
        document.body.removeChild(enlace);
        setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
    }

    function aplicarEdicionAudio(edicion, opciones) {
        if (!state.markers.length || !edicion) return;
        var opts = opciones || {};
        var tipo = edicion.tipo;
        var marcadores = state.markers.slice();

        if (tipo === 'delete') {
            var desde = Number(edicion.start) || 0;
            var hasta = Number(edicion.end) || 0;
            var delta = hasta - desde;
            if (delta <= 0) return;
            marcadores = marcadores.map(function (item) {
                var inicio = item.start;
                var fin = item.end;
                if (inicio >= hasta) {
                    inicio -= delta;
                    fin -= delta;
                } else if (fin > desde) {
                    inicio = inicio < desde ? inicio : desde;
                    fin = fin > hasta ? fin - delta : desde;
                }
                return { id: item.id, start: inicio, end: fin, text: item.text };
            }).filter(function (item) { return item.end - item.start >= 0.01; });
        } else if (tipo === 'insert') {
            var punto = Number(edicion.at) || 0;
            var duracionInsertada = Number(edicion.duration) || 0;
            if (duracionInsertada <= 0) return;
            marcadores = marcadores.map(function (item) {
                var inicio = item.start;
                var fin = item.end;
                if (inicio >= punto) {
                    inicio += duracionInsertada;
                    fin += duracionInsertada;
                } else if (fin > punto) {
                    fin += duracionInsertada;
                }
                return { id: item.id, start: inicio, end: fin, text: item.text };
            });
        } else {
            return;
        }

        state.markers = marcadores;
        setMarkers(marcadores, {
            historial: false,
            activarPrimero: false,
            sincronizar: opts.sincronizar !== false
        });
    }

    function sincronizarConDuracion() {
        if (!state.markers.length) {
            actualizarUI();
            return;
        }
        setMarkers(state.markers, { historial: false, activarPrimero: false });
    }

    function bindUI() {
        var archivo = document.getElementById('audioMarkerFile');
        if (archivo) {
            archivo.addEventListener('change', function () {
                var file = this.files && this.files[0];
                if (!file) return;
                var lector = new FileReader();
                lector.onload = function () {
                    state.loadedUrl = null;
                    cargarTexto(lector.result, { historial: true });
                };
                lector.readAsText(file);
                this.value = '';
            });
        }

        var descargarBtn = document.getElementById('btnMarkerDescargar');
        if (descargarBtn) descargarBtn.addEventListener('click', descargar);
        var limpiarBtn = document.getElementById('btnMarkerLimpiar');
        if (limpiarBtn) limpiarBtn.addEventListener('click', limpiar);
        var guardarBtn = document.getElementById('btnMarkerGuardar');
        if (guardarBtn) guardarBtn.addEventListener('click', guardarActivo);
        var irBtn = document.getElementById('btnMarkerIr');
        if (irBtn) irBtn.addEventListener('click', function () {
            var actual = activo();
            var inst = editor();
            if (actual && inst && inst.seekTo) inst.seekTo(actual.start);
        });
        var dividirBtn = document.getElementById('btnMarkerDividir');
        if (dividirBtn) dividirBtn.addEventListener('click', dividirActivo);
        var unirBtn = document.getElementById('btnMarkerUnir');
        if (unirBtn) unirBtn.addEventListener('click', unirActivo);
        var eliminarBtn = document.getElementById('btnMarkerEliminar');
        if (eliminarBtn) eliminarBtn.addEventListener('click', eliminarActivo);

        var finInput = document.getElementById('audioMarkerEnd');
        if (finInput) {
            finInput.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') guardarActivo();
            });
        }
        var textoInput = document.getElementById('audioMarkerText');
        if (textoInput) {
            textoInput.addEventListener('keydown', function (event) {
                if (event.key === 'Enter') guardarActivo();
            });
        }
    }

    function attach(inst) {
        if (!inst) return;
        state.editor = inst;

        if (!inst.wavesurfer) {
            setTimeout(function () { attach(inst); }, 300);
            return;
        }

        if (!state.attached) {
            state.attached = true;
            window.addEventListener('resize', render);
            bindUI();
        }

        if (state.boundWaveSurfer === inst.wavesurfer) {
            actualizarUI();
            render();
            return;
        }

        state.boundWaveSurfer = inst.wavesurfer;
        var ws = inst.wavesurfer;
        ws.on('ready', function () {
            render();
            if (!state.markers.length) cargarDesdeApp({ silencioso: true });
        });
        ws.on('redraw', render);
        ws.on('zoom', render);

        actualizarUI();
        render();
        cargarDesdeApp({ silencioso: true });
    }

    function init() {
        bindUI();
        actualizarUI();
        if (window.audioEditor) attach(window.audioEditor);
    }

    window.audioMarkers = {
        init: init,
        attach: attach,
        parseSRT: parseSRT,
        serializarSRT: serializarSRT,
        getMarkers: getMarkers,
        setMarkers: setMarkers,
        cargarTexto: cargarTexto,
        cargarDesdeUrl: cargarDesdeUrl,
        cargarDesdeApp: cargarDesdeApp,
        seleccionar: seleccionar,
        guardarActivo: guardarActivo,
        dividirActivo: dividirActivo,
        unirActivo: unirActivo,
        eliminarActivo: eliminarActivo,
        limpiar: limpiar,
        descargar: descargar,
        aplicarEdicionAudio: aplicarEdicionAudio,
        sincronizarConDuracion: sincronizarConDuracion,
        render: render
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
