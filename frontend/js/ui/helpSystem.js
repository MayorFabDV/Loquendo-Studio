(function () {
    'use strict';

    var DEFAULT_ANCHOR = 'h4, .controles-principales-title, .salida-header';
    var HELP_MODAL_ID = 'modalAyuda';
    var seccionesInicializadas = new WeakSet();
    var habilitado = true;

    function setEnabled(v) {
        habilitado = !!v;
        if (document.body) {
            document.body.classList.toggle('ls-help-off', !habilitado);
        }
        if (!habilitado) hideTip();
    }

    function isEnabled() {
        return habilitado;
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
        if (tipEl) tipEl.classList.remove('ls-tooltip--visible');
    }

    function showTip(el) {
        var key = el.getAttribute('data-help');
        if (!key) return;
        var txt = texts().controles[key];
        if (!txt) return;
        if (el.hasAttribute('title')) {
            el.setAttribute('data-ls-saved-title', el.getAttribute('title'));
            el.removeAttribute('title');
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
        if (!habilitado) { hideTip(); return; }
        var node = e.target;
        var el = (node && node.closest) ? node.closest('[data-help]') : null;
        if (el === currentTipEl) return;
        currentTipEl = el;
        if (el) showTip(el);
        else hideTip();
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
        btn.setAttribute('data-help-seccion-btn', clave);
        btn.setAttribute('aria-label', 'Ayuda de esta sección');
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
        isEnabled: isEnabled
    };
    window.abrirAyudaSeccion = abrirSeccion;
})();
