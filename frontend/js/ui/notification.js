// js/ui/notification.js
// ==========================================
// Sistema de Notificaciones (Toasts)
// Reemplaza los alert() molestos por notificaciones elegantes
// ==========================================

class NotificationSystem {
    constructor() {
        this.container = null;
        this.defaultDuration = 4000;
        this.maxNotifications = 5;
        this.initialize();
    }

    initialize() {
        if (!document.getElementById('notification-container')) {
            const container = document.createElement('div');
            container.id = 'notification-container';
            container.style.cssText = `
                position: fixed;
                top: 20px;
                right: 20px;
                z-index: 9999;
                display: flex;
                flex-direction: column;
                gap: 10px;
                max-width: 400px;
                width: 100%;
                pointer-events: none;
            `;
            document.body.appendChild(container);
            this.container = container;
        } else {
            this.container = document.getElementById('notification-container');
        }

        if (!document.getElementById('notification-styles')) {
            const style = document.createElement('style');
            style.id = 'notification-styles';
            style.textContent = `
                @keyframes slideIn {
                    from { opacity: 0; transform: translateX(100px) scale(0.9); }
                    to { opacity: 1; transform: translateX(0) scale(1); }
                }
                @keyframes slideOut {
                    from { opacity: 1; transform: translateX(0) scale(1); }
                    to { opacity: 0; transform: translateX(100px) scale(0.9); }
                }
                .notification-toast {
                    pointer-events: auto;
                    animation: slideIn 0.3s ease-out;
                    transform-origin: top right;
                    min-width: 200px;
                    max-width: 100%;
                }
                .notification-toast.removing {
                    animation: slideOut 0.3s ease-in;
                }
            `;
            document.head.appendChild(style);
        }
    }

    show(mensaje, tipo = 'info', duracion = this.defaultDuration) {
        const children = this.container.children;
        if (children.length >= this.maxNotifications) {
            children[0].remove();
        }

        const toast = document.createElement('div');
        toast.className = 'notification-toast';

        const colores = {
            success: { bg: '#10b981', border: '#059669', icon: '✅' },
            error: { bg: '#ef4444', border: '#dc2626', icon: '❌' },
            warning: { bg: '#f59e0b', border: '#d97706', icon: '⚠️' },
            info: { bg: '#3b82f6', border: '#2563eb', icon: 'ℹ️' },
        };

        const color = colores[tipo] || colores.info;

        toast.style.cssText = `
            background: ${color.bg};
            color: white;
            padding: 14px 18px;
            border-radius: 8px;
            border-left: 6px solid ${color.border};
            box-shadow: 0 8px 30px rgba(0, 0, 0, 0.3);
            font-family: 'Inter', system-ui, sans-serif;
            font-size: 14px;
            font-weight: 500;
            display: flex;
            align-items: center;
            gap: 12px;
            pointer-events: auto;
            min-width: 200px;
            max-width: 100%;
        `;

        toast.innerHTML = `
            <span style="font-size: 20px; flex-shrink: 0;">${color.icon}</span>
            <span style="flex: 1; word-break: break-word;">${mensaje}</span>
            <button style="background: transparent; border: none; color: white; font-size: 18px; cursor: pointer; opacity: 0.7; padding: 0 4px; pointer-events: auto; flex-shrink: 0;" class="notification-close">✕</button>
        `;

        toast.querySelector('.notification-close').addEventListener('click', () => {
            this._removeToast(toast);
        });

        toast.addEventListener('click', (e) => {
            if (e.target === toast || e.target === toast.querySelector('span')) {
                this._removeToast(toast);
            }
        });

        this.container.appendChild(toast);

        setTimeout(() => {
            this._removeToast(toast);
        }, duracion);

        return toast;
    }

    _removeToast(toast) {
        if (!toast || toast.classList.contains('removing')) return;
        toast.classList.add('removing');
        setTimeout(() => { if (toast.parentNode) toast.remove(); }, 300);
    }

    success(mensaje, duracion = 4000) { return this.show(mensaje, 'success', duracion); }
    error(mensaje, duracion = 5000) { return this.show(mensaje, 'error', duracion); }
    warning(mensaje, duracion = 4000) { return this.show(mensaje, 'warning', duracion); }
    info(mensaje, duracion = 3000) { return this.show(mensaje, 'info', duracion); }
    clearAll() { Array.from(this.container.children).forEach(t => this._removeToast(t)); }
}

const notifications = new NotificationSystem();
window.notifications = notifications;

console.log('📝 notification.js cargado correctamente');
