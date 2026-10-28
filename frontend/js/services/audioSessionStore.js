// services/audioSessionStore.js - Sesiones de edicion no destructivas (IndexedDB)
(function (global) {
    'use strict';

    const DB_NAME = 'loquendo-audio-sessions';
    const STORE = 'sessions';
    const VERSION = 1;
    let dbPromise = null;

    function normalizar(url) {
        if (!url) return '';
        try {
            if (/^https?:/i.test(url)) return new URL(url).pathname;
            return String(url).split('?')[0].split('#')[0];
        } catch (error) {
            return String(url).split('?')[0];
        }
    }

    function abrir() {
        if (dbPromise) return dbPromise;
        dbPromise = new Promise((resolve, reject) => {
            if (!global.indexedDB) {
                reject(new Error('IndexedDB no disponible'));
                return;
            }
            const solicitud = global.indexedDB.open(DB_NAME, VERSION);
            solicitud.onupgradeneeded = () => {
                const db = solicitud.result;
                if (!db.objectStoreNames.contains(STORE)) {
                    db.createObjectStore(STORE, { keyPath: 'source' });
                }
            };
            solicitud.onsuccess = () => resolve(solicitud.result);
            solicitud.onerror = () => reject(solicitud.error || new Error('No se pudo abrir IndexedDB'));
        });
        return dbPromise;
    }

    async function obtener(url) {
        const source = normalizar(url);
        if (!source) return null;
        const db = await abrir();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readonly');
            const solicitud = tx.objectStore(STORE).get(source);
            solicitud.onsuccess = () => resolve(solicitud.result || null);
            solicitud.onerror = () => reject(solicitud.error);
        });
    }

    async function guardar(url, datos) {
        const source = normalizar(url);
        if (!source) return null;
        const db = await abrir();
        const registro = {
            source,
            blob: datos && datos.blob ? datos.blob : null,
            serverUrl: datos && datos.serverUrl ? normalizar(datos.serverUrl) : '',
            dirty: !!(datos && datos.dirty),
            markers: datos && Array.isArray(datos.markers) ? datos.markers : [],
            updatedAt: Date.now()
        };
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).put(registro);
            tx.oncomplete = () => resolve(registro);
            tx.onerror = () => reject(tx.error);
        });
    }

    async function eliminar(url) {
        const source = normalizar(url);
        if (!source) return false;
        const db = await abrir();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(STORE, 'readwrite');
            tx.objectStore(STORE).delete(source);
            tx.oncomplete = () => resolve(true);
            tx.onerror = () => reject(tx.error);
        });
    }

    global.audioSessionStore = {
        normalizar,
        obtener,
        guardar,
        eliminar
    };
})(window);
