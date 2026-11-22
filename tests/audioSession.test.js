'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function buffer(valor = 0.5) {
    const datos = new Float32Array(8).fill(valor);
    return { numberOfChannels:1, length:8, sampleRate:8, duration:1,
        getChannelData:()=>datos, copyToChannel: a=>datos.set(a) };
}
function preparar() {
    let markers=[];
    const records=new Map(), avisos=[];
    let active=null;
    const storage={normalizar:u=>String(u || '').split('?')[0],obtenerActiva:async()=>records.get(active)||null,
        guardar:async(source,data)=>{records.set(source,{source,...structuredClone(data)});active=source;return records.get(source);} };
    const ctx=vm.createContext({window:{audioSessionStore:storage,CONFIG:{API_BASE:''},notifications:{
        warning:m=>avisos.push(m),error:m=>avisos.push(m),success(){}},audioMarkers:{
        getMarkers:()=>structuredClone(markers),setMarkers:m=>{markers=structuredClone(m);}}},
        console:{log(){},warn(){},error(){}},URL,Blob,FormData,setTimeout,clearTimeout,
        document:{getElementById:()=>null,querySelector:()=>null,addEventListener(){},readyState:'loading'} });
    ctx.window.AudioContext=class {
        async decodeAudioData(bytes) {const n=new Uint8Array(bytes)[0];if(n===0)throw new Error('audio inválido');return buffer(n/255);}
        createBuffer(){return buffer();} close(){return Promise.resolve();}
    };
    const load=f=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js',f),'utf8'),ctx);
    load('services/audioProcessor.js');
    const editor=ctx.window.audioEditor;
    editor.wavesurfer={load:async()=>{},setPlaybackRate(){}};
    ctx.fetch=async()=>({ok:true,blob:async()=>new Blob([new Uint8Array([100,20,30])],{type:'audio/wav'})});
    return {ctx,editor,records,storage,avisos,load};
}

test('snapshot conserva original y marcadores; recuperar/restaurar no necesita el temporal',async()=>{
    const h=preparar(), e=h.editor;
    await e.cargarAudio('/audios/source.wav');
    h.ctx.window.audioMarkers.setMarkers([{id:'m',start:0,end:1,text:'original'}]);
    e.sincronizarMarcadoresActuales();await e._guardadoSesionPendiente;
    const original=await e._originalBlob.arrayBuffer();
    e.audioBuffer=buffer(0.1);
    await e._actualizarWaveSurfer();
    h.ctx.window.audioMarkers.setMarkers([{id:'m',start:0,end:1,text:'editado'}]);
    e.registrarCambioMarcadores();await e._guardadoSesionPendiente;
    const record=h.records.get('/audios/source.wav');
    assert.equal(record.markers[0].text,'editado');
    assert.equal(record.originalMarkers[0].text,'original');
    assert.deepEqual(await record.originalBlob.arrayBuffer(),original);
    e.audioBuffer=null; e._cargaEdicion=null;
    h.ctx.fetch=async()=>{throw new Error('El temporal fue eliminado');};
    assert.equal(await e.recuperarSesion(),true);
    assert.equal(e._dirty,true);
    assert.equal(h.ctx.window.voiceAudioRealPath,'');
    assert.equal(h.ctx.window.audioMarkers.getMarkers()[0].text,'editado');
    assert.ok(await e.restaurarOriginal());
    assert.equal(e.historyStack.length,1);
    assert.equal(e._sesionEditada,false);
    assert.equal(h.ctx.window.audioMarkers.getMarkers()[0].text,'original');
    assert.deepEqual(await e._blobActual.arrayBuffer(),original);
    assert.equal(h.records.get('/audios/source.wav').edited,false);
    URL.revokeObjectURL(e.currentWavBlobUrl);
});

test('la última carga gana aunque una anterior termine tarde',async()=>{
    const h=preparar();let resolver;
    const primerBlob=new Blob([new Uint8Array([10])]);
    h.ctx.fetch=async url=>url==='/first' ? new Promise(r=>{resolver=r;}) : {ok:true,blob:async()=>new Blob([new Uint8Array([200])])};
    const primero=h.editor.cargarAudio('/first');
    await h.editor.cargarAudio('/second');
    resolver({ok:true,blob:async()=>primerBlob});await primero;
    assert.equal(h.editor._fuenteOriginal,'/second');
    assert.equal(h.ctx.window.voiceAudioRealPath,'/second');
    assert.equal(h.records.has('/first'),false);
});

test('fallo de almacenamiento avisa y permite reintentar sin borrar el audio',async()=>{
    const h=preparar();await h.editor.cargarAudio('/source');
    const save=h.storage.guardar;
    h.storage.guardar=async()=>{throw new Error('QuotaExceededError');};
    assert.equal(await h.editor._programarGuardadoSesion(),false);
    assert.equal(await h.editor._programarGuardadoSesion(),false);
    assert.equal(h.avisos.length,1);
    assert.ok(h.editor.audioBuffer);assert.ok(h.records.get('/source'));
    h.storage.guardar=save;
    assert.equal(await h.editor._programarGuardadoSesion(),true);
});

test('snapshot corrupto no se elimina ni reemplaza; una carga nueva cancela recuperación tardía',async()=>{
    const h=preparar();
    h.storage.obtenerActiva=async()=>({source:'/broken',blob:new Blob([new Uint8Array([0])])});
    assert.equal(await h.editor.recuperarSesion(),false);
    assert.equal(h.editor.audioBuffer,null);
    let resolver;
    h.storage.obtenerActiva=()=>new Promise(r=>{resolver=r;});
    const recuperacion=h.editor.recuperarSesion();
    await h.editor.cargarAudio('/new');
    resolver({source:'/old',blob:new Blob([new Uint8Array([10])])});
    assert.equal(await recuperacion,false);
    assert.equal(h.editor._fuenteOriginal,'/new');
});

test('salidas de subtítulos, video, ducking, MP3 y render no usan una ruta antigua tras fallo de subida',async()=>{
    const h=preparar();let solicitudes=0;
    h.ctx.window.appFeatures={subtitlesUI:true,transcription:true}; // Verificar también los handlers conservados para reactivación.
    h.ctx.window.voiceAudioRealPath='/audios/stale.wav';
    h.editor.asegurarAudioPersistido=async()=>null;
    h.ctx.fetch=async()=>{solicitudes++;throw new Error('No debe llamar al backend');};
    h.load('main.js');h.load('ui/audioRenderUI.js');
    for(const name of ['generarYDescargarSRT','generarYDescargarASS','generarVideoPNGTuber','aplicarDucking','exportarAMp3']) {
        await h.ctx.window[name]();
    }
    await h.ctx.window.audioRenderUI.renderizar();
    assert.equal(solicitudes,0);
});

test('IndexedDB no disponible rechaza de forma recuperable, sin promesa fallida retenida',async()=>{
    const ctx=vm.createContext({window:{},URL});
    vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js/services/audioSessionStore.js'),'utf8'),ctx);
    await assert.rejects(ctx.window.audioSessionStore.obtenerActiva(),/IndexedDB no disponible/);
    await assert.rejects(ctx.window.audioSessionStore.obtenerActiva(),/IndexedDB no disponible/);
});

test('el estado no anuncia guardado mientras queda un snapshot más reciente pendiente',async()=>{
    const h=preparar();await h.editor.cargarAudio('/source');
    const estados=[], pendientes=[];
    h.editor._estadoSesion=texto=>estados.push(texto);
    h.storage.guardar=()=>new Promise(resolve=>pendientes.push(resolve));
    const primero=h.editor._programarGuardadoSesion();
    await new Promise(resolve=>setImmediate(resolve));
    const ultimo=h.editor._programarGuardadoSesion();
    pendientes[0]();await primero;
    await new Promise(resolve=>setImmediate(resolve));
    assert.equal(estados.at(-1),'Guardando sesión…');
    pendientes[1]();await ultimo;
    assert.equal(estados.at(-1),'Sesión guardada');
});

test('durante una carga no se edita el buffer anterior y un derivado conserva el original',async()=>{
    const h=preparar();await h.editor.cargarAudio('/source');
    const original=h.editor._originalBlob, previo=h.editor.audioBuffer;
    let resolver;
    h.ctx.fetch=()=>new Promise(resolve=>{resolver=resolve;});
    const carga=h.editor.cargarAudio('/derived',{conservarOriginal:true});
    assert.equal(await h.editor.aplicarFadeIn(0.3),null);
    assert.equal(h.editor.audioBuffer,previo);
    resolver({ok:true,blob:async()=>new Blob([new Uint8Array([40])])});await carga;
    assert.equal(h.editor._originalBlob,original);
    assert.equal(h.editor._fuenteOriginal,'/source');
    assert.equal(h.editor._baseServidor,'/derived');
});

test('un render tardío no sustituye un audio que se editó mientras esperaba',async()=>{
    const h=preparar();let resolver, cargas=0;
    h.editor.asegurarAudioPersistido=async()=>'/audios/current.wav';
    h.ctx.window.voiceAudioRealPath='/audios/current.wav';
    h.ctx.window.cargarYReproducir=async()=>{cargas++;};
    h.ctx.window.apiClient={renderAudio:()=>new Promise(resolve=>{resolver=resolve;})};
    h.load('ui/audioRenderUI.js');
    const trabajo=h.ctx.window.audioRenderUI.renderizar();
    await new Promise(resolve=>setImmediate(resolve));
    h.editor._revisionAudio++;
    resolver({url:'/audios/obsolete.wav'});await trabajo;
    assert.equal(cargas,0);
    assert.equal(h.ctx.window.voiceAudioRealPath,'/audios/current.wav');
});

test('una respuesta SRT antigua no reemplaza los marcadores de la nueva fuente',async()=>{
    const h=preparar();await h.editor.cargarAudio('/source');
    h.ctx.requestAnimationFrame=()=>0;
    h.load('services/audioMarkers.js');
    let resolver;
    h.ctx.fetch=()=>new Promise(resolve=>{resolver=resolve;});
    const carga=h.ctx.window.audioMarkers.cargarDesdeUrl('/old.srt');
    h.editor._loadToken++;
    h.ctx.window.audioMarkers.setMarkers([{id:'new',start:0,end:1,text:'Nueva fuente'}],{sincronizar:false});
    resolver({ok:true,text:async()=>'1\n00:00:00,000 --> 00:00:01,000\nFuente anterior\n'});
    await carga;
    assert.equal(h.ctx.window.audioMarkers.getMarkers()[0].text,'Nueva fuente');
});
