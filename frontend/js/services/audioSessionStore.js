// services/audioSessionStore.js - Sesiones de edicion no destructivas (IndexedDB)
(function (global) {
    'use strict';

    const DB_NAME = 'loquendo-audio-sessions';
    const STORE = 'sessions';
    const META = 'metadata';
    const VERSION = 2;
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
                if (!db.objectStoreNames.contains(META)) db.createObjectStore(META);
            };
            let bloqueada = false;
            solicitud.onblocked = () => {
                bloqueada = true;
                reject(new Error('La base de sesiones está abierta en otra ventana. Cierra esa ventana y reintenta.'));
            };
            solicitud.onsuccess = () => {
                const db = solicitud.result;
                if (bloqueada) { db.close(); return; }
                db.onversionchange = () => { db.close(); dbPromise = null; };
                resolve(db);
            };
            solicitud.onerror = () => reject(solicitud.error || new Error('No se pudo abrir IndexedDB'));
        }).catch((error) => {
            dbPromise = null;
            throw error;
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
            let registro = null;
            solicitud.onsuccess = () => { registro = solicitud.result || null; };
            tx.oncomplete = () => resolve(registro);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo leer la sesión'));
        });
    }

    async function obtenerActiva() {
        const db = await abrir();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE, META], 'readonly');
            let registro = null;
            const indice = tx.objectStore(META).get('active');
            indice.onsuccess = () => {
                if (indice.result !== undefined) {
                    if (!indice.result) return;
                    const solicitud = tx.objectStore(STORE).get(indice.result);
                    solicitud.onsuccess = () => { registro = solicitud.result || null; };
                } else {
                    // Compatibilidad: la versión 1 no tenía índice de sesión activa.
                    const solicitud = tx.objectStore(STORE).getAll();
                    solicitud.onsuccess = () => {
                        registro = solicitud.result.sort((a,b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || null;
                    };
                }
            };
            tx.oncomplete = () => resolve(registro);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo leer la sesión activa'));
        });
    }

    async function guardar(url, datos) {
        if (global.sessionRecovery) {
            await global.sessionRecovery.preparar();
            if (global.sessionRecovery.bloqueaGuardado('voice')) throw new Error('La recuperación anterior aún no tiene una copia segura');
        }
        const source = normalizar(url);
        if (!source) return null;
        if (!datos || !datos.blob || !datos.blob.size) throw new Error('La sesión no contiene audio válido');
        const db = await abrir();
        const registro = {
            source,
            blob: datos && datos.blob ? datos.blob : null,
            serverUrl: datos && datos.serverUrl ? normalizar(datos.serverUrl) : '',
            dirty: !!(datos && datos.dirty),
            originalBlob: datos.originalBlob || null,
            originalMarkers: Array.isArray(datos.originalMarkers) ? datos.originalMarkers : [],
            edited: datos.edited !== false,
            fx: datos.fx || null,
            markers: datos && Array.isArray(datos.markers) ? datos.markers : [],
            updatedAt: Date.now()
        };
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE, META], 'readwrite');
            tx.objectStore(STORE).put(registro);
            tx.objectStore(META).put(source, 'active');
            tx.oncomplete = () => resolve(registro);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo guardar la sesión'));
        });
    }

    async function eliminar(url) {
        const source = normalizar(url);
        if (!source) return false;
        const db = await abrir();
        return new Promise((resolve, reject) => {
            const tx = db.transaction([STORE, META], 'readwrite');
            tx.objectStore(STORE).delete(source);
            const indice = tx.objectStore(META).get('active');
            indice.onsuccess = () => {
                if (indice.result === source) tx.objectStore(META).put(null, 'active');
            };
            tx.oncomplete = () => resolve(true);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo eliminar la sesión'));
        });
    }

    // Metadatos independientes: no cambian el documento de voz, el índice
    // activo ni el JSON de los proyectos del mezclador.
    async function leerRecuperacion(key) {
        const db = await abrir();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(META, 'readonly'); let dato = null;
            const r = tx.objectStore(META).get(key); r.onsuccess = () => { dato = r.result || null; };
            tx.oncomplete = () => resolve(dato);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo leer la recuperación'));
        });
    }

    async function guardarRecuperacion(key, tipo, datos, soloSiAusente = false, huella = null) {
        if (!key.startsWith('recovery.') || !['voice', 'mixer'].includes(tipo)) throw new Error('Identificador de recuperación inválido');
        const db = await abrir();
        const nuevo = { tipo, datos, fecha: Date.now(), huella };
        return new Promise((resolve, reject) => {
            const tx = db.transaction(META, 'readwrite'); let resultado = nuevo;
            const store = tx.objectStore(META);
            if (soloSiAusente) {
                const r = store.get(key); r.onsuccess = () => {
                    if (r.result) resultado = r.result;
                    else store.put(nuevo, key);
                };
            } else store.put(nuevo, key);
            tx.oncomplete = () => resolve(resultado);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo conservar la recuperación'));
        });
    }

    async function listarRecuperaciones() {
        const db = await abrir();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(META, 'readonly'), lista = [];
            const r = tx.objectStore(META).openCursor(); r.onsuccess = () => {
                const c = r.result; if (!c) return;
                if (String(c.key).startsWith('recovery.')) {
                    const v = c.value;
                    lista.push({ key: String(c.key), tipo: v.tipo, fecha: v.fecha, huella: v.huella || null,
                        nombre: v.tipo === 'mixer' ? v.datos?.nombre || 'Mezcla' : v.datos?.source || 'Audio' });
                }
                c.continue();
            };
            tx.oncomplete = () => resolve(lista);
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudieron listar las recuperaciones'));
        });
    }

    async function consumirRecuperacion(key) {
        if (!key.startsWith('recovery.pending.')) return;
        const db = await abrir();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(META, 'readwrite');
            tx.objectStore(META).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = tx.onabort = () => reject(tx.error || new Error('No se pudo confirmar la recuperación'));
        });
    }

    global.audioSessionStore = {
        normalizar,
        obtener,
        obtenerActiva,
        guardar,
        eliminar,
        leerRecuperacion, guardarRecuperacion, listarRecuperaciones, consumirRecuperacion
    };
})(window);
