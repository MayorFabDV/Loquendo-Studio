'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function cargar(storage = new Map()) {
    const timers = new Map();
    let id = 0;
    const ctx = vm.createContext({ window: {}, console, URL,
        setTimeout(fn) { timers.set(++id, fn); return id; },
        clearTimeout(i) { timers.delete(i); },
        localStorage: { getItem: k => storage.get(k) || null, setItem: (k,v) => storage.set(k,v) }
    });
    for (const name of ['config', 'state']) {
        vm.runInContext(fs.readFileSync(path.join(__dirname, '../frontend/js/services/mixer', name + '.js'), 'utf8'), ctx);
    }
    return { app: ctx.window.MixerApp, ctx, storage, flush() { for (const fn of timers.values()) fn(); timers.clear(); } };
}
const plain = value => JSON.parse(JSON.stringify(value));
const clip = (id, trackId = 'voz') => ({ id, trackId, src: '/audios/test.wav', start: 2, in: 1, out: 5, duration: 6 });

test('round-trip conserva múltiples clips, parámetros de pista, efectos y master', () => {
    const h = cargar();
    const project = { version: 2, projectId: 'p-test', clips: [clip('a'), clip('b'), clip('c','musica'), clip('d','musica')],
        tracks: [{ id:'voz', gainDb:-9, pan:0.5, mute:true, effects:{eq:{low:2}} }], master:{gainDb:-3,limiter:false} };
    project.clips[0].effects = { filter:{highpass:120} };
    h.app.store.importarProyecto(project);
    h.app.store.agregarClip('sfx','/audios/other.wav');
    h.app.store.guardarLocal(); h.flush();
    const next = cargar(h.storage); next.app.store.cargarLocal();
    const out = plain(next.app.store.aProyecto());
    assert.equal(out.clips.length,5);
    assert.deepEqual(out.tracks.find(t=>t.id==='voz'),project.tracks[0]);
    assert.deepEqual(out.master,project.master);
    assert.deepEqual(out.clips[0].effects,project.clips[0].effects);
});

test('proyecto legacy y proyecto vacío conservan compatibilidad', () => {
    const {app} = cargar();
    assert.equal(app.store.normalizarEstado({ clips: [{id:'old',pista:'voz',src:'/audios/old.wav',volumen:0.5,duration:4}] }).clips.length,1);
    assert.equal(app.store.normalizarEstado({clips:[]}).clips.length,0);
});

test('importar con medios faltantes conserva los clips y bloquea render antes de escribir', async () => {
    const h = cargar();
    let requests = 0;
    h.ctx.document = { getElementById() { return null; } };
    h.ctx.fetch = async () => { requests++; throw new Error('No debe escribir'); };
    h.app.util.head = async () => false;
    h.app.timeline = { rebuild() {} };
    h.app.media = { persistirAssets() { throw new Error('No debe copiar medios ausentes'); } };
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/services/mixer/project.js'),'utf8'),h.ctx);
    await h.app.project.importarProyecto({text:async()=>JSON.stringify({clips:[clip('a'),clip('b')]})});
    assert.equal(h.app.state.clips.length,2);
    await h.app.project.renderizarMezcla('wav');
    assert.equal(requests,0);
});

module.exports = { cargar, plain, clip };
