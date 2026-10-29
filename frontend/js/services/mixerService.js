// services/mixerService.js - Fachada pública del mezclador (la lógica vive en services/mixer/*)
(function (global) {
    'use strict';

    const app = global.MixerApp;
    let controles = false;

    function editar(accion, valor) {
        const store = app.store;
        const id = store.state.selectedId;
        const tiempo = valor == null ? app.transport.tiempoActual() : Number(valor);
        let resultado;
        switch (accion) {
            case 'dividir': resultado = store.dividirClip(id, tiempo); break;
            case 'copiar': return store.copiarClip(id);
            case 'cortar': resultado = store.cortarClip(id); break;
            case 'pegar': resultado = store.pegarClip(tiempo); break;
            case 'duplicar': resultado = store.duplicarClip(id); break;
            case 'eliminar': resultado = store.quitarClip(id, { silencioso: true }); break;
            case 'mover': resultado = store.moverClip(id, tiempo); break;
            case 'recortar': {
                const entrada = document.getElementById('mixerEntrada');
                const salida = document.getElementById('mixerSalida');
                resultado = store.recortarClip(id, entrada.value, salida.value);
                break;
            }
            case 'deshacer': resultado = store.deshacer(); break;
            case 'rehacer': resultado = store.rehacer(); break;
        }
        if (resultado) app.timeline.rebuild();
        else app.util.notificar('warning', 'No se pudo aplicar la operación. Revisa el clip seleccionado y los tiempos.');
        return resultado;
    }

    function montarControles(raiz) {
        if (controles) return;
        controles = true;
        const barra = document.createElement('div');
        barra.className = 'mezclador-toolbar';
        const selector = document.createElement('select');
        selector.id = 'mixerSeleccionClip'; selector.setAttribute('aria-label','Clip seleccionado');
        selector.addEventListener('change', () => app.inspector.seleccionar(selector.value));
        barra.appendChild(selector);
        for (const [accion, texto] of [['dividir','Dividir en cursor'],['copiar','Copiar'],['cortar','Cortar'],
            ['pegar','Pegar en cursor'],['duplicar','Duplicar'],['eliminar','Eliminar'],['deshacer','Deshacer'],['rehacer','Rehacer']]) {
            const btn = document.createElement('button');
            btn.type = 'button'; btn.className = 'btn-mixer'; btn.textContent = texto;
            btn.addEventListener('click', () => editar(accion)); barra.appendChild(btn);
        }
        for (const [id, titulo] of [['mixerPosicion','Posición (s)'],['mixerEntrada','Entrada fuente (s)'],['mixerSalida','Salida fuente (s)']]) {
            const label = document.createElement('label'); label.textContent = titulo + ' ';
            const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = '0.01'; input.id = id;
            input.style.width = '90px'; label.appendChild(input); barra.appendChild(label);
        }
        for (const [accion, texto] of [['mover','Mover'],['recortar','Recortar']]) {
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-mixer'; btn.textContent = texto;
            btn.addEventListener('click', () => editar(accion, document.getElementById('mixerPosicion').value));
            barra.appendChild(btn);
        }
        const estado = document.createElement('small'); estado.id = 'estadoProyectoMezcla';
        const ejecutar = fn => async () => {
            try { await fn(); }
            catch (error) { app.util.notificar('error', error.message || 'No se pudo completar la operación de proyecto'); }
        };
        const boton = (texto, accion) => {
            const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-mixer'; btn.textContent = texto;
            btn.addEventListener('click', ejecutar(accion)); barra.appendChild(btn); return btn;
        };
        const proyectos = document.createElement('select'); proyectos.id = 'mixerProyectosGuardados';
        proyectos.setAttribute('aria-label', 'Proyectos guardados en este equipo');
        const refrescar = async () => {
            const items = await app.project.listarGuardados(); proyectos.replaceChildren();
            const vacio = document.createElement('option'); vacio.value = ''; vacio.textContent = 'Proyectos guardados…'; proyectos.appendChild(vacio);
            for (const item of items) {
                const option = document.createElement('option'); option.value = item.id;
                option.textContent = `${item.nombre} (${item.id})${item.recuperado ? ' — copia recuperable' : ''}`;
                option.disabled = !!item.corrupto; proyectos.appendChild(option);
            }
        };
        boton('Guardar en equipo', async () => { await app.project.guardarEnEquipo(); await refrescar(); });
        barra.appendChild(proyectos);
        boton('Actualizar lista', refrescar);
        boton('Abrir guardado', () => proyectos.value ? app.project.abrirGuardado(proyectos.value) : Promise.reject(new Error('Selecciona un proyecto guardado')));
        boton('Exportar portable', () => app.project.exportarPortable());
        const paquete = document.createElement('input'); paquete.type = 'file'; paquete.accept = '.tar'; paquete.hidden = true;
        paquete.addEventListener('change', ejecutar(async () => {
            const file = paquete.files[0]; paquete.value = ''; if (file) await app.project.importarPortable(file);
        }));
        barra.appendChild(paquete); boton('Abrir portable', () => paquete.click());
        const fuente = document.createElement('input'); fuente.type = 'file'; fuente.accept = 'audio/*'; fuente.hidden = true;
        let recuperarId = '';
        fuente.addEventListener('change', ejecutar(async () => {
            const file = fuente.files[0]; fuente.value = ''; if (file) await app.project.recuperarFuente(file, recuperarId);
        }));
        barra.appendChild(fuente);
        const recuperar = boton('Recuperar fuente', () => {
            recuperarId = app.store.state.selectedId;
            if (!recuperarId) throw new Error('Selecciona el clip cuya fuente quieres recuperar');
            fuente.click();
        });
        recuperar.title = 'Reasigna el archivo de audio de todos los clips que comparten esta fuente. Conserva recortes y efectos.';
        barra.appendChild(estado);
        refrescar().catch(error => console.warn('No se pudo listar los proyectos guardados:', error));
        // La barra no es una columna de la fila flex de ondas + biblioteca.
        // Si se inserta junto a ellas, puede consumir todo el ancho de la onda.
        (raiz.closest('.mezclador-cuerpo') || raiz).before(barra);
        document.addEventListener('keydown', (event) => {
            if (raiz.closest('.audio-group-hidden') || raiz.getClientRects().length === 0) return;
            if (event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
            const key = event.key.toLowerCase();
            const acciones = { c:'copiar', x:'cortar', v:'pegar', z:event.shiftKey?'rehacer':'deshacer', y:'rehacer' };
            const accion = event.ctrlKey || event.metaKey ? acciones[key] : (key==='delete'?'eliminar':key==='s'?'dividir':null);
            if (accion) { event.preventDefault(); event.stopImmediatePropagation(); editar(accion); }
        }, true);
    }

    function init() {
        const raiz = document.getElementById('mezcladorPistas');
        if (!raiz) return;
        montarControles(raiz);
        app.inspector.init();
        app.timeline.inicializar(raiz);
    }

    function renderizarMezcla(formato) {
        const selector = document.getElementById('mixerRenderFormato');
        const elegido = formato || (selector && selector.value) || 'wav';
        return app.project.renderizarMezcla(elegido);
    }

    global.mixer = {
        editar,
        init,
        agregarVozActual: app.media.agregarVozActual,
        agregarMusicaActual: app.media.agregarMusicaActual,
        cargarArchivosSfx: app.media.cargarArchivosSfx,
        vaciar: app.media.vaciar,
        play: app.transport.play,
        pausa: app.transport.pausa,
        detener: app.transport.detener,
        irA: app.transport.irA,
        zoomIn: app.transport.zoomIn,
        zoomOut: app.transport.zoomOut,
        zoomReset: app.transport.zoomReset,
        guardarProyecto: app.project.exportarProyecto,
        importarProyecto: app.project.importarProyecto,
        renderizarMezcla,
        guardarEnEquipo: app.project.guardarEnEquipo,
        abrirGuardado: app.project.abrirGuardado,
        exportarPortable: app.project.exportarPortable,
        importarPortable: app.project.importarPortable,
        recuperarFuente: app.project.recuperarFuente,
        estado: app.store.state,
        app
    };
})(window);
