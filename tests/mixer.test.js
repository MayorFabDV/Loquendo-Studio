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

test('split con offset conserva fuente, tiempos, automatización y undo/redo', () => {
    const {app} = cargar(); const s = app.store;
    const original = s.agregarClip('voz','/audios/a.wav',{start:2,in:1,out:5,duration:6,automation:[{id:'pt',t:3,gain:0.4}],effects:{eq:{mid:2}}});
    const right = s.dividirClip(original.id,4);
    assert.equal(original.out,3); assert.equal(right.in,3); assert.equal(right.start,4);
    assert.equal(s.duracionProyecto(),6);
    assert.deepEqual(plain(right.effects),{eq:{mid:2}});
    assert.equal(right.automation[0].t,3);
    assert.equal(s.deshacer(),true); assert.equal(s.state.clips.length,1);
    assert.equal(s.state.clips[0].out,5);
    assert.equal(s.rehacer(),true); assert.equal(s.state.clips.length,2);
    assert.equal(s.dividirClip(right.id,4),null);
});

test('copiar/cortar/pegar/duplicar crean IDs únicos y descartan redo al editar', () => {
    const h = cargar(), s = h.app.store;
    const a = s.agregarClip('musica','/audios/a.wav',{duration:4,out:4,automation:[{t:1,gain:0.5}]});
    assert.equal(s.copiarClip(a.id),true);
    const b = s.pegarClip(8); assert.notEqual(b.id,a.id);
    b.automation[0].gain = 0.1;
    const c = s.pegarClip(12); assert.equal(c.automation[0].gain,0.5);
    assert.equal(s.cortarClip(b.id),true);
    assert.equal(s.buscarClip(b.id),null);
    s.deshacer(); assert.ok(s.buscarClip(b.id));
    s.moverClip(a.id,0.125); assert.equal(s.puedeRehacer(),false);
    const d = s.duplicarClip(a.id); assert.equal(d.start,4.125);
    assert.equal(s.recortarClip(d.id,1,3),true);
    assert.equal(s.moverClip(d.id,NaN),false);
    assert.equal(s.recortarClip(d.id,3,1),false);
    h.flush(); const next = cargar(h.storage); next.app.store.cargarLocal();
    assert.equal(next.app.store.buscarClip(d.id).in,1);
});

test('voz editada se persiste antes de añadirla; fallo no añade la versión antigua', async () => {
    const h = cargar();
    h.app.timeline = { rebuild() {} };
    h.app.inspector = { seleccionar() {} };
    h.app.util.head = async () => true;
    h.ctx.window.voiceAudioRealPath = '/audios/old.wav';
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/services/audioProcessor.js'),'utf8'),h.ctx);
    const editor = h.ctx.window.audioEditor;
    editor.audioBuffer = {}; editor._dirty = true; editor._baseServidor = '/audios/old.wav';
    editor.currentWavBlobUrl = 'blob:test'; editor.persistirAudioEditado = async () => null;
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/services/mixer/media.js'),'utf8'),h.ctx);
    assert.equal(await h.app.media.agregarVozActual(),null);
    assert.equal(h.app.state.clips.length,0);
    editor.persistirAudioEditado = async () => '/audios/edited.wav';
    await h.app.media.agregarVozActual(); await h.app.media.agregarVozActual();
    assert.equal(h.app.state.clips.length,2);
    assert.equal(h.app.state.clips[0].src,'/audios/edited.wav');
});

test('split no altera silenciosamente un fade atravesado por el corte', () => {
    const s = cargar().app.store;
    const c = s.agregarClip('voz','/audios/a.wav',{out:4,duration:4,fadeIn:2});
    assert.equal(s.dividirClip(c.id,1),null);
    assert.equal(s.state.clips.length,1);
    assert.ok(s.dividirClip(c.id,2.5));
});

test('pistas vacías conservan sus ajustes y el fallo de almacenamiento no borra el estado', () => {
    const h = cargar();
    const avisos = [];
    h.ctx.window.notifications = {error: mensaje => avisos.push(mensaje)};
    h.app.store.importarProyecto({clips:[],tracks:[{id:'musica',gainDb:-12,mute:true}]});
    assert.equal(h.app.store.aProyecto().tracks[0].gainDb,-12);
    h.app.store.agregarClip('voz','/audios/a.wav');
    h.ctx.localStorage.setItem = () => { throw new Error('QuotaExceededError'); };
    h.flush();
    assert.equal(h.app.state.clips.length,1);
    assert.equal(h.app.state.tracks.get('musica').gainDb,-12);
    assert.equal(avisos.length,1);
});

test('una subida que termina tras editar otro audio no publica la ruta anterior', async () => {
    const h = cargar();
    h.ctx.FormData = FormData;
    h.ctx.window.CONFIG = {API_BASE:''};
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/services/audioProcessor.js'),'utf8'),h.ctx);
    const editor = h.ctx.window.audioEditor;
    editor.currentWavBlobUrl='blob:first'; editor._dirty=true; editor._baseServidor='/audios/original.wav';
    h.ctx.fetch = async (url, opciones) => opciones ? {
        ok:true, json:async()=>{editor.currentWavBlobUrl='blob:second';return {url:'/audios/stale.wav'};}
    } : {blob:async()=>new Blob(['wav'],{type:'audio/wav'})};
    assert.equal(await editor.persistirAudioEditado(),null);
    assert.equal(editor._dirty,true);
    assert.equal(editor._baseServidor,'/audios/original.wav');
});

test('pausar cancela una petición de play que todavía está preparando el audio', async () => {
    const h = cargar(); let plays=0;
    h.app.store.agregarClip('voz','/audios/a.wav',{duration:3,out:3});
    const mt={audios:[],getCurrentTime:()=>0,play(){plays++;},pause(){}};
    h.app.timeline={getMultitrack:()=>mt,estaListo:()=>true,resumePreview:async()=>{}};
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/services/mixer/transport.js'),'utf8'),h.ctx);
    const pending=h.app.transport.play();
    h.app.transport.pausa();
    await pending;
    assert.equal(plays,0);
});
