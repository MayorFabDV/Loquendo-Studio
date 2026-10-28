(function () {
    'use strict';

    var DEFAULT_ANCHOR = 'h4, .controles-principales-title, .salida-header';
    var HELP_MODAL_ID = 'modalAyuda';
    var seccionesInicializadas = new WeakSet();
    var tooltipsHabilitado = true;
    var botonesHabilitado = true;
    var tooltipDelay = 0;
    var showTimer = null;

    function actualizarClases() {
        if (!document.body) return;
        document.body.classList.toggle('ls-help-tooltips-off', !tooltipsHabilitado);
        document.body.classList.toggle('ls-help-buttons-off', !botonesHabilitado);
        document.body.classList.toggle('ls-help-off', !tooltipsHabilitado && !botonesHabilitado);
    }

    function guardarYQuitarTitle(el) {
        if (el.hasAttribute('data-ls-saved-title')) return;
        var title = el.getAttribute('title');
        if (title === null) return;
        el.setAttribute('data-ls-saved-title', title);
        el.removeAttribute('title');
    }

    function restaurarTitle(el) {
        if (!el.hasAttribute('data-ls-saved-title')) return;
        if (!el.hasAttribute('title')) {
            el.setAttribute('title', el.getAttribute('data-ls-saved-title'));
        }
        el.removeAttribute('data-ls-saved-title');
    }

    function suprimirTitlesNativos() {
        document.querySelectorAll('[data-help][title], .help-section-btn[title]').forEach(guardarYQuitarTitle);
    }

    function restaurarTitlesNativos() {
        document.querySelectorAll('[data-ls-saved-title]').forEach(restaurarTitle);
    }

    function setEnabled(v) {
        var activo = !!v;
        tooltipsHabilitado = activo;
        botonesHabilitado = activo;
        actualizarClases();
        if (activo) restaurarTitlesNativos(); else suprimirTitlesNativos();
        if (!activo) hideTip();
    }

    function setTooltips(v) {
        tooltipsHabilitado = !!v;
        actualizarClases();
        if (tooltipsHabilitado) restaurarTitlesNativos(); else suprimirTitlesNativos();
        if (!tooltipsHabilitado) hideTip();
    }

    function setHelpButtons(v) {
        botonesHabilitado = !!v;
        actualizarClases();
    }

    function setTooltipDelay(ms) {
        var valor = parseInt(ms, 10);
        tooltipDelay = isNaN(valor) || valor < 0 ? 0 : valor;
    }

    function isEnabled() {
        return tooltipsHabilitado && botonesHabilitado;
    }

    function texts() {
        return window.HELP_TEXTS || { controles: {}, secciones: {} };
    }

    // ---------- Tooltip ----------
    var tipEl = null;
    var currentTipEl = null;

    function ensureTip() {
        if (tipEl) return tipEl;
        tipEl = document.createElement('div');
        tipEl.className = 'ls-tooltip';
        tipEl.setAttribute('role', 'tooltip');
        document.body.appendChild(tipEl);
        return tipEl;
    }

    function hideTip() {
        currentTipEl = null;
        if (showTimer) {
            clearTimeout(showTimer);
            showTimer = null;
        }
        if (tipEl) tipEl.classList.remove('ls-tooltip--visible');
    }

    function showTip(el) {
        if (!tooltipsHabilitado) return;
        var key = el.getAttribute('data-help');
        if (!key) return;
        var txt = texts().controles[key];
        if (!txt) return;
        if (el.hasAttribute('title') || el.hasAttribute('data-ls-saved-title')) {
            guardarYQuitarTitle(el);
        }
        var tip = ensureTip();
        tip.textContent = txt;
        tip.style.left = '0px';
        tip.style.top = '0px';
        tip.classList.add('ls-tooltip--visible');
        var r = el.getBoundingClientRect();
        var tw = tip.offsetWidth;
        var th = tip.offsetHeight;
        var left = r.left + (r.width / 2) - (tw / 2);
        var maxLeft = window.innerWidth - tw - 6;
        if (left < 6) left = 6;
        if (left > maxLeft) left = maxLeft;
        var top = r.top - th - 8;
        if (top < 6) top = r.bottom + 8;
        tip.style.left = Math.round(left) + 'px';
        tip.style.top = Math.round(top) + 'px';
    }

    document.addEventListener('mouseover', function (e) {
        if (!tooltipsHabilitado) { hideTip(); return; }
        var node = e.target;
        var el = (node && node.closest) ? node.closest('[data-help]') : null;
        if (el === currentTipEl) return;
        currentTipEl = el;
        if (showTimer) {
            clearTimeout(showTimer);
            showTimer = null;
        }
        if (!el) {
            hideTip();
            return;
        }
        if (tooltipDelay > 0) {
            showTimer = setTimeout(function () {
                showTimer = null;
                if (currentTipEl === el) showTip(el);
            }, tooltipDelay);
        } else {
            showTip(el);
        }
    });

    document.addEventListener('scroll', hideTip, true);
    window.addEventListener('blur', hideTip);

    // ---------- Modal de sección (reutiliza #modalAyuda) ----------
    function modalAyuda() {
        return document.getElementById(HELP_MODAL_ID);
    }

    function tituloHeaderOriginal() {
        var modal = modalAyuda();
        var h3 = modal ? modal.querySelector('.modal-header h3') : null;
        if (!h3) return null;
        if (!h3.hasAttribute('data-original-title')) {
            h3.setAttribute('data-original-title', h3.textContent || 'Ayuda Rápida');
        }
        return h3;
    }

    function abrirSeccion(clave) {
        var sec = texts().secciones[clave];
        var modal = modalAyuda();
        if (!modal || !sec) return;
        var body = modal.querySelector('.modal-body');
        if (!body) return;

        var wrap = document.createElement('div');
        wrap.className = 'help-seccion';
        var titulo = document.createElement('div');
        titulo.className = 'help-seccion-titulo';
        titulo.textContent = sec.titulo || 'Ayuda';
        var contenido = document.createElement('p');
        contenido.className = 'help-seccion-contenido';
        contenido.textContent = sec.contenido || 'TODO: pendiente de redactar.';
        wrap.appendChild(titulo);
        wrap.appendChild(contenido);

        body.innerHTML = '';
        body.appendChild(wrap);

        var h3 = tituloHeaderOriginal();
        if (h3) h3.textContent = sec.titulo || 'Ayuda Rápida';

        modal.style.display = 'flex';
    }

    function envolverAbrirAyuda() {
        if (window.__lsHelpEnvuelto) return;
        var original = window.abrirAyuda;
        if (typeof original !== 'function') return;
        window.abrirAyuda = function () {
            var h3 = tituloHeaderOriginal();
            if (h3) h3.textContent = h3.getAttribute('data-original-title') || 'Ayuda Rápida';
            return original.apply(this, arguments);
        };
        window.__lsHelpEnvuelto = true;
    }

    // ---------- Botones "?" por sección ----------
    function crearBoton(clave) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'help-section-btn';
        btn.textContent = '?';
        var sec = texts().secciones[clave];
        var nombre = (sec && sec.titulo) ? sec.titulo : clave;
        btn.setAttribute('data-help-seccion-btn', clave);
        btn.setAttribute('aria-label', 'Ayuda sobre ' + nombre);
        btn.title = 'Ayuda: ' + nombre;
        if (!tooltipsHabilitado) guardarYQuitarTitle(btn);
        btn.addEventListener('click', function (ev) {
            ev.preventDefault();
            ev.stopPropagation();
            abrirSeccion(clave);
        });
        return btn;
    }

    function initSecciones() {
        var contenedores = document.querySelectorAll('[data-help-section]');
        Array.prototype.forEach.call(contenedores, function (cont) {
            var clave = cont.getAttribute('data-help-section');
            if (!clave) return;
            if (seccionesInicializadas.has(cont)) return;
            seccionesInicializadas.add(cont);

            var btn = crearBoton(clave);
            var anchorSel = cont.getAttribute('data-help-anchor');
            var anchor = null;
            if (anchorSel) {
                try { anchor = cont.querySelector(anchorSel); } catch (err) { anchor = null; }
            } else {
                anchor = cont.querySelector(DEFAULT_ANCHOR);
            }

            if (anchor) {
                anchor.appendChild(btn);
                btn.classList.add('help-section-btn--inline');
            } else {
                if (window.getComputedStyle(cont).position === 'static') {
                    cont.style.position = 'relative';
                }
                btn.classList.add('help-section-btn--float');
                cont.appendChild(btn);
            }
        });
    }

    function init() {
        envolverAbrirAyuda();
        initSecciones();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.helpSystem = {
        init: init,
        abrirSeccion: abrirSeccion,
        ocultarTooltip: hideTip,
        setEnabled: setEnabled,
        setTooltips: setTooltips,
        setHelpButtons: setHelpButtons,
        setTooltipDelay: setTooltipDelay,
        isEnabled: isEnabled
    };
    window.abrirAyudaSeccion = abrirSeccion;
})();
