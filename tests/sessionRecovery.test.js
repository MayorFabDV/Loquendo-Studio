'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {randomUUID,webcrypto}=require('node:crypto');
const copy=value=>structuredClone(value);
const mezcla={version:2,projectId:'p-old',nombre:'Anterior',zoomPx:100,tracks:[{id:'voz',gainDb:-3,pan:0.2}],
    clips:[{id:'old',trackId:'voz',src:'/media/projects/p-old/assets/missing.wav',in:0.2,out:3,duration:4,start:1,pan:0.3,fadeIn:0.1,effects:{eq:{mid:2}}}],master:{gainDb:-1}};
const voz={source:'/old.wav',blob:new Blob([new Uint8Array([10])]),originalBlob:new Blob([new Uint8Array([20])]),markers:[{id:'m',start:0,end:1,text:'Anterior'}]};

function setup(shared={}){
    const local=shared.local||new Map(),meta=shared.meta||new Map(),sessions=shared.sessions||new Map(),boot=shared.boot||new Map();
    const h={local,meta,sessions,boot,active:shared.active||{source:null},failVoice:false,failMixer:false,failPin:false,restores:0,saves:0,view:'guion',mode:'basico'};
    const timers=new Map();let timer=0;
    class Element {
        constructor(){this.children=[];this.dataset={};this.style={};this.hidden=false;this.textContent='';this.open=false;this.shows=0;}
        appendChild(e){this.children.push(e);}replaceChildren(){this.children=[];}focus(){}
        showModal(){this.open=true;this.shows++;}close(){this.open=false;if(this.onclose)this.onclose();}
        click(){return this.onclick?.();}
    }
    const elements=new Map(['dialogRecuperacion','recuperacionPregunta','recuperacionNota','btnAceptarRecuperacion','btnPermanecerRecuperacion',
        'sesionesRecuperables','listaRecuperaciones','btnReintentarRecuperacion','contenedorReproductor'].map(k=>[k,new Element()]));
    h.el=id=>elements.get(id);
    const ctx=vm.createContext({window:{crypto:{randomUUID,subtle:webcrypto.subtle},notifications:{warning(){}},
        AudioContext:class {async decodeAudioData(b){if(!new Uint8Array(b)[0])throw Error('corrupto');return {duration:1};}async close(){} }},
        document:{getElementById:id=>elements.get(id)||null,createElement:()=>new Element(),addEventListener(){}},
        localStorage:{getItem:k=>local.get(k)||null,setItem:(k,v)=>local.set(k,v)},
        sessionStorage:{getItem:k=>boot.get(k)||null,setItem:(k,v)=>boot.set(k,v)},
        setTimeout:fn=>{timers.set(++timer,fn);return timer;},clearTimeout:id=>timers.delete(id),
        console:{log(){},warn(){},error(){}},URL,Blob,Date,TextEncoder});
    h.ctx=ctx;
    const load=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js',file),'utf8'),ctx);
    load('services/mixer/config.js');load('services/mixer/state.js');
    const app=ctx.window.MixerApp;
    app.project={estaGuardado:()=>false,autoguardar(){},async guardarEnEquipo(){if(h.failMixer)throw Error('falló disco');h.saves++;return app.state.projectId;},
        async abrirSesion(data){app.store.aplicarEstado(app.store.normalizarEstado(data),{guardar:true});return true;}};
    app.timeline={};
    const storage={normalizar:s=>s,obtenerActiva:async()=>copy(sessions.get(h.active.source)||null),
        async guardar(source,data){if(h.failVoice)throw Error('falló IDB');sessions.set(source,{source,...copy(data)});h.active.source=source;},
        leerRecuperacion:async key=>copy(meta.get(key)||null),
        async guardarRecuperacion(key,tipo,datos,absent,huella=null){if(h.failPin)throw Error('quota');if(!absent||!meta.has(key))meta.set(key,{tipo,datos:copy(datos),fecha:Date.now(),huella});return copy(meta.get(key));},
        listarRecuperaciones:async()=>[...meta].map(([key,v])=>({key,tipo:v.tipo,fecha:v.fecha,huella:v.huella,nombre:v.datos?.nombre||v.datos?.source||'datos'})),
        consumirRecuperacion:async key=>meta.delete(key)};
    ctx.window.audioSessionStore=storage;
    let marks=[];
    ctx.window.audioMarkers={getMarkers:()=>copy(marks)};
    const editor=ctx.window.audioEditor={audioBuffer:null,_cargaEdicion:null,_revisionAudio:0,_fuenteOriginal:'',historyIndex:-1,
        _cargandoEdicion:false,_restaurando:false,getEngineState:()=>({fx:{eqHigh:0},bypass:false}),estaSesionGuardada:()=>false,
        async _programarGuardadoSesion(){if(h.failVoice)return false;await storage.guardar(editor._fuenteOriginal,{blob:editor.blob,markers:marks});return true;},
        async recuperarSesion(record,opts){if(opts.comprobarActual&&!opts.comprobarActual())return false;
            await opts.antesDeAplicar();h.restores++;editor.audioBuffer={};editor._fuenteOriginal=record.source;editor.blob=record.blob;marks=copy(record.markers||[]);return true;},
        wavesurfer:{async load(){}}};
    ctx.window.asegurarEditorInicializado=()=>{};
    ctx.window.tabs={irA:tab=>{h.view=tab;}};
    ctx.window.audioEditorUI={setMode:m=>{h.mode=m;},setSubtab:sub=>{h.subtab=sub;}};
    ctx.window.mixer={init:opts=>{h.lastInit=opts;}};
    load('ui/sessionRecovery.js');h.recovery=ctx.window.sessionRecovery;h.app=app;h.editor=editor;
    h.seed=()=>{local.set('loquendo.mezcla.v2',JSON.stringify(mezcla));sessions.set(voz.source,copy(voz));h.active.source=voz.source;};
    return h;
}
async function until(fn){const deadline=Date.now()+3000;while(Date.now()<deadline){if(fn())return;await new Promise(r=>setTimeout(r,5));}throw Error('No ocurrió la condición');}
async function permanecer(h){const p=h.recovery.iniciar();await until(()=>h.el('dialogRecuperacion').open);h.el('btnPermanecerRecuperacion').click();await p;}

test('sin sesión o con datos vacíos/corruptos no hay diálogo ni navegación',async()=>{
    const h=setup();h.local.set('loquendo.mezcla.v2','{"clips":[]}');
    h.sessions.set('/broken',{source:'/broken',blob:new Blob([new Uint8Array([0])])});h.active.source='/broken';
    await h.recovery.iniciar();
    assert.equal(h.el('dialogRecuperacion').shows,0);assert.equal(h.view,'guion');
    assert.ok(h.sessions.has('/broken'));assert.equal(h.meta.size,0);
});

test('permanecer conserva ambas sesiones ante inicialización y autoguardado vacío, incluso tras reinicio',async()=>{
    const h=setup();h.seed();const original=h.local.get('loquendo.mezcla.v2');
    await permanecer(h);
    assert.equal(h.view,'guion');assert.equal(h.app.state.clips.length,0);
    assert.equal(h.local.get('loquendo.mezcla.v2'),original);
    assert.equal(h.app.store.cargarLocal(),null);
    await h.app.store.guardarLocalAhora(); // Una mezcla nueva/vacía no toca los checkpoints.
    assert.equal(h.meta.get('recovery.pending.mixer').datos.clips[0].out,3);
    assert.equal((await h.meta.get('recovery.pending.voice').datos.blob.arrayBuffer()).byteLength,1);
    await h.recovery.iniciar();assert.equal(h.el('dialogRecuperacion').shows,1);
    const reload=setup(h);await reload.recovery.iniciar();assert.equal(reload.el('dialogRecuperacion').shows,0,'Mismo arranque sin segundo diálogo');
    const restart=setup({...h,boot:new Map()});await permanecer(restart);
    assert.equal(restart.el('dialogRecuperacion').shows,1);
    assert.equal(restart.meta.get('recovery.pending.mixer').datos.clips[0].src,mezcla.clips[0].src);
});

test('recuperar voz y mezclador por separado no elimina ni sobrescribe la otra sesión',async()=>{
    const h=setup();h.seed();await permanecer(h);
    assert.equal(await h.recovery.recuperar('voice'),true);
    assert.equal(h.subtab,'edicion');assert.equal(h.app.state.clips.length,0);
    assert.ok(h.meta.has('recovery.pending.mixer'));assert.ok(!h.meta.has('recovery.pending.voice'));
    const active=h.active.source;
    assert.equal(await h.recovery.recuperar('mixer'),true);
    assert.equal(h.subtab,'mezclador');assert.equal(h.mode,'avanzado');
    assert.equal(h.active.source,active);assert.ok(h.editor.audioBuffer);
    assert.equal(h.app.state.clips[0].in,0.2);assert.equal(h.app.state.clips[0].out,3);
    assert.deepEqual(JSON.parse(JSON.stringify(h.app.state.clips[0].effects)),{eq:{mid:2}});
});

test('cancelar o fallar al guardar mezcla nueva no la reemplaza; guardar crea un checkpoint accesible',async()=>{
    const h=setup();h.seed();await permanecer(h);
    h.app.state.projectId='p-new';h.app.store.agregarClip('musica','/new.wav',{id:'new',duration:5,out:5});
    let p=h.recovery.recuperar('mixer');await until(()=>h.el('dialogRecuperacion').open);
    h.el('btnPermanecerRecuperacion').click();assert.equal(await p,false);assert.equal(h.saves,0);
    h.failMixer=true;p=h.recovery.recuperar('mixer');await until(()=>h.el('dialogRecuperacion').open);
    h.el('btnAceptarRecuperacion').click();assert.equal(await p,false);assert.equal(h.app.state.clips[0].id,'new');
    h.failMixer=false;p=h.recovery.recuperar('mixer');await until(()=>h.el('dialogRecuperacion').open);
    h.el('btnAceptarRecuperacion').click();assert.equal(await p,true);
    const saved=[...h.meta].find(([k])=>k.startsWith('recovery.saved.mixer.'));
    assert.equal(saved[1].datos.clips[0].id,'new');assert.equal(h.app.state.clips[0].id,'old');
});

test('guardar audio nuevo falla sin reemplazarlo; misma fuente queda archivada al recuperar',async()=>{
    const h=setup();h.seed();await permanecer(h);
    h.editor.audioBuffer={};h.editor._fuenteOriginal=voz.source;h.editor.blob=new Blob(['trabajo nuevo']);h.editor.historyIndex=1;
    h.failVoice=true;let p=h.recovery.recuperar('voice');await until(()=>h.el('dialogRecuperacion').open);h.el('btnAceptarRecuperacion').click();
    assert.equal(await p,false);assert.equal(h.restores,0);assert.equal(await h.editor.blob.text(),'trabajo nuevo');
    assert.ok(h.meta.has('recovery.pending.voice'));assert.ok(h.meta.has('recovery.pending.mixer'));
    h.failVoice=false;p=h.recovery.recuperar('voice');await until(()=>h.el('dialogRecuperacion').open);h.el('btnAceptarRecuperacion').click();
    assert.equal(await p,true);
    const saved=[...h.meta].find(([k])=>k.startsWith('recovery.saved.voice.'));
    assert.equal(await saved[1].datos.blob.text(),'trabajo nuevo');assert.equal(h.restores,1);
});

test('si no se pudo conservar el checkpoint no se sobrescribe la mezcla activa en localStorage',async()=>{
    const h=setup();h.seed();h.failPin=true;
    const original=h.local.get('loquendo.mezcla.v2');await h.recovery.preparar();
    assert.equal(h.recovery.bloqueaGuardado('mixer'),true);
    assert.equal(await h.app.store.guardarLocalAhora(),false);
    assert.equal(h.local.get('loquendo.mezcla.v2'),original);
});

test('reiniciar con un checkpoint antiguo archiva el trabajo activo reciente sin duplicarlo',async()=>{
    const h=setup();h.seed();await permanecer(h);
    const reciente=copy(mezcla);reciente.clips[0].id='recent';reciente.nombre='Más reciente';
    h.local.set('loquendo.mezcla.v2',JSON.stringify(reciente));
    const nuevaVoz={...copy(voz),blob:new Blob(['voz reciente'])};
    h.sessions.set(voz.source,nuevaVoz);
    const restart=setup({...h,boot:new Map()});await permanecer(restart);
    const saved=()=>[...h.meta].filter(([key])=>key.startsWith('recovery.saved.'));
    assert.equal(saved().length,2);
    const mix=saved().find(([,record])=>record.tipo==='mixer');
    const voice=saved().find(([,record])=>record.tipo==='voice');
    assert.equal(mix[1].datos.clips[0].id,'recent');
    assert.equal(await voice[1].datos.blob.text(),'voz reciente');
    assert.equal(h.meta.get('recovery.pending.mixer').datos.clips[0].id,'old');
    const again=setup({...h,boot:new Map()});await permanecer(again);
    assert.equal(saved().length,2,'No duplica los mismos datos en cada arranque');
    assert.equal(await again.recovery.recuperar('mixer',mix[0]),true);
    assert.equal(again.app.state.clips[0].id,'recent');
    assert.ok(h.meta.has('recovery.pending.mixer'));
});

test('un fallo al leer metadatos bloquea el autoguardado de mezcla aunque aún no se detectó el checkpoint',async()=>{
    const h=setup();h.seed();const original=h.local.get('loquendo.mezcla.v2');
    h.ctx.window.audioSessionStore.leerRecuperacion=async()=>{throw Error('IndexedDB no disponible');};
    await h.recovery.preparar();
    assert.equal(h.recovery.bloqueaGuardado('mixer'),true);
    assert.equal(await h.app.store.guardarLocalAhora(),false);
    assert.equal(h.local.get('loquendo.mezcla.v2'),original);
    assert.equal(h.el('btnReintentarRecuperacion').hidden,false);
});
