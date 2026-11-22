'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const {File}=require('node:buffer');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function settle(){for(let i=0;i<12;i++)await new Promise(r=>setImmediate(r));}

function setup(){
    const nodes=new Map(),events=new Map(),warnings=[],requests=[];
    const node=id=>{
        if(!nodes.has(id))nodes.set(id,{value:'',hidden:false,disabled:false,style:{},src:'',href:'',textContent:'',innerText:'',currentTime:0,
            classList:{contains:()=>true},pause(){this.paused=true;},play(){this.paused=false;return Promise.resolve();},
            load(){this.currentTime=0;},removeAttribute(name){this[name]='';},setAttribute(name,value){this[name]=value;},addEventListener(){}});
        return nodes.get(id);
    };
    node('videoAudioSource').value='external';node('fondoPNGTuber').value='black';
    node('resolucionPNGTuber').value='original';node('escalaPNGTuber').value='100';
    node('previewPngtuberVideo').hidden=node('videoPngtuberResultado').hidden=true;
    let uploads=0,previews=0;
    const ctx=vm.createContext({console:{log(){},error(){},warn(){}},URL,Blob,File,FormData,setTimeout,clearTimeout,
        document:{getElementById:node,querySelector:selector=>selector==='.btn-video'?node('render'):null,querySelectorAll:()=>[],
            addEventListener:(name,fn)=>{if(!events.has(name))events.set(name,[]);events.get(name).push(fn);}},
        window:{CONFIG:{API_BASE:'http://localhost:3100'},notifications:{error:m=>warnings.push(m),warning:m=>warnings.push(m),info(){},success(){}},audioEditor:{_loadToken:1,_revisionAudio:1}}});
    const fetch=async(url,opts)=>{
        requests.push({url,body:opts?.body instanceof FormData?null:JSON.parse(opts?.body||'{}')});
        if(url.endsWith('/api/pngtuber/audio'))return {ok:true,json:async()=>({url:`/audios/${++uploads}.wav`,name:'prueba.wav',duration:2})};
        return {ok:true,json:async()=>({url:`/audios/preview-${++previews}.mp4`,video:'/audios/render.mp4'})};
    };
    ctx.fetch=fetch;
    const load=file=>vm.runInContext(fs.readFileSync(path.join(__dirname,'../frontend/js',file),'utf8'),ctx);
    load('main.js');load('ui/videoAudioInput.js');
    // Solo el binding del selector; la inicialización general de la app se prueba con Electron.
    events.get('DOMContentLoaded').at(-1)();
    vm.runInContext(`pngtuberIdlePath='/pngtuber/idle.png';pngtuberTalkingPath='/pngtuber/talking.png';pngtuberBlinkPath='/pngtuber/blink.png';`,ctx);
    const file=()=>new File(['audio'],'prueba.wav',{type:'audio/wav'});
    return {ctx,node,requests,warnings,file,fetch,emit:(name,detail)=>events.get(name)?.forEach(fn=>fn({detail}))};
}

test('cambiar al segundo audio conserva la demostración visible sin volver a subir imágenes',async()=>{
    const h=setup();await h.ctx.window.videoAudioInput.importar(h.file());
    await h.ctx.window.actualizarPreviewPNGTuber();await settle();
    const previous=h.node('previewPngtuberVideo').src;
    await h.ctx.window.videoAudioInput.importar(h.file());await settle();
    assert.equal(h.node('previewPngtuberVideo').hidden,false);
    assert.equal(h.node('previewPngtuberVideo').src,previous);
    assert.ok(h.requests.filter(r=>r.url.endsWith('/preview')).every(r=>!('audioPath' in r.body)));
});

for(const method of ['generarVideoPNGTuber']){
    test(`${method}: una ruta que termina después de cambiar fuente no se etiqueta como la fuente nueva`,async()=>{
        const h=setup(),pending=deferred();let version=1;
        h.ctx.window.videoAudioInput={version:()=>version,ruta:()=>pending.promise};
        const job=h.ctx.window[method]();await settle();
        version++;pending.resolve('/audios/anterior.wav');await job;
        assert.equal(h.requests.length,0,'No debe renderizarse la ruta anterior con una revisión nueva');
        assert.equal(h.node('videoPngtuberResultado').hidden,true);
    });
}

test('un error de preview con imágenes antiguas no se muestra ni impide procesar la configuración nueva',async()=>{
    const h=setup(),old=deferred();let first=true;
    h.ctx.fetch=(url,opts)=>{
        if(url.endsWith('/preview')&&first){first=false;return old.promise;}
        return h.fetch(url,opts);
    };
    await h.ctx.window.videoAudioInput.importar(h.file());await settle();
    vm.runInContext(`pngtuberIdlePath='/pngtuber/idle-nuevo.png';`,h.ctx);
    await h.ctx.window.actualizarPreviewPNGTuber();
    old.reject(new Error('fallo de una fuente que ya no está seleccionada'));await settle();
    assert.deepEqual(h.warnings,[]);
    assert.equal(h.node('previewPngtuberVideo').hidden,false);
    assert.equal(h.requests.filter(r=>r.url.endsWith('/preview')).at(-1).body.idleImagePath,'/pngtuber/idle-nuevo.png');
});

test('un render tardío no vuelve a publicar el resultado ni la descarga del audio anterior',async()=>{
    const h=setup(),old=deferred();await h.ctx.window.videoAudioInput.importar(h.file());await settle();
    h.ctx.fetch=(url,opts)=>url.endsWith('/generar-video-pngtuber')?old.promise:h.fetch(url,opts);
    const job=h.ctx.window.generarVideoPNGTuber();await settle();
    await h.ctx.window.videoAudioInput.importar(h.file());
    old.resolve({ok:true,json:async()=>({video:'/audios/obsoleto.mp4'})});await job;await settle();
    assert.equal(h.node('videoPngtuberResultado').hidden,true);
    assert.equal(h.node('descargarVideoPngtuber').hidden,true);
    assert.equal(h.node('descargarVideoPngtuber').href,'');
    assert.equal(h.node('render').disabled,false);
});

test('volver a Video tras cambiar voz Studio invalida el resultado final y conserva la demo independiente',async()=>{
    const h=setup();let route='/audios/voz-1.wav';
    h.ctx.window.rutaVozPersistida=async()=>route;
    h.node('videoAudioSource').value='studio';h.node('videoAudioSource').onchange();await settle();
    const preview=h.node('previewPngtuberVideo').src;
    h.node('videoPngtuberResultado').hidden=false;
    route='/audios/voz-2.wav';h.ctx.window.audioEditor._loadToken++;
    h.emit('loquendo:tab-activada',{tabId:'tab-video'});await settle();
    assert.equal(h.node('videoPngtuberResultado').hidden,true);
    assert.equal(h.node('previewPngtuberVideo').src,preview);
    assert.ok(h.requests.filter(r=>r.url.endsWith('/preview')).every(r=>!('audioPath' in r.body)));
});

test('quitar archivo durante una importación no permite que la respuesta tardía lo reactive',async()=>{
    const h=setup(),upload=deferred();await h.ctx.window.videoAudioInput.importar(h.file());await settle();
    h.ctx.fetch=(url,opts)=>url.endsWith('/pngtuber/audio')?upload.promise:h.fetch(url,opts);
    const job=h.ctx.window.videoAudioInput.importar(h.file());
    h.node('videoAudioRemove').onclick();
    upload.resolve({ok:true,json:async()=>({url:'/audios/tardio.wav',name:'tardio.wav',duration:2})});
    assert.equal(await job,false);await settle();
    await assert.rejects(h.ctx.window.videoAudioInput.ruta(),/Importa un archivo/);
    assert.equal(h.node('videoAudioPlayer').hidden,true);
});

test('ambas fuentes solicitan demo sin consultar ni persistir audio y activan bucle mudo',async()=>{
    const h=setup();
    h.ctx.window.videoAudioInput.ruta=()=>{throw Error('La demo no debe consultar audio');};
    for(const mode of ['studio','external']){
        h.node('videoAudioSource').value=mode;
        await h.ctx.window.actualizarPreviewPNGTuber();await settle();
        const request=h.requests.filter(r=>r.url.endsWith('/preview')).at(-1);
        assert.equal('audioPath' in request.body,false);
        assert.equal('soloReposo' in request.body,false);
        assert.equal(request.body.idleImagePath,'/pngtuber/idle.png');
        assert.equal(request.body.talkingImagePath,'/pngtuber/talking.png');
        assert.equal(request.body.blinkImagePath,'/pngtuber/blink.png');
        assert.equal(h.node('previewPngtuberVideo').loop,true);
        assert.equal(h.node('previewPngtuberVideo').muted,true);
        assert.equal(h.node('previewPngtuberVideo').autoplay,true);
    }
});

test('cargar y quitar audio externo mantiene las tres imágenes y no transforma la demo en render con audio',async()=>{
    const h=setup();h.node('videoAudioSource').onchange();await settle();
    await h.ctx.window.videoAudioInput.importar(h.file());await settle();
    let request=h.requests.filter(r=>r.url.endsWith('/preview')).at(-1);
    assert.equal('audioPath' in request.body,false);
    h.node('videoAudioRemove').onclick();await settle();
    request=h.requests.filter(r=>r.url.endsWith('/preview')).at(-1);
    assert.equal('audioPath' in request.body,false);assert.equal('soloReposo' in request.body,false);
    assert.equal(request.body.idleImagePath,'/pngtuber/idle.png');
    assert.equal(request.body.talkingImagePath,'/pngtuber/talking.png');
    assert.equal(request.body.blinkImagePath,'/pngtuber/blink.png');
});

test('una validación de audio pendiente o fallida no bloquea ni vacía la demostración',async()=>{
    const h=setup(),upload=deferred();
    h.ctx.fetch=(url,opts)=>url.endsWith('/pngtuber/audio')?upload.promise:h.fetch(url,opts);
    const job=h.ctx.window.videoAudioInput.importar(h.file());await settle();
    assert.equal(h.node('previewPngtuberVideo').hidden,false);
    const preview=h.node('previewPngtuberVideo').src;
    upload.reject(new Error('Archivo de prueba inválido'));assert.equal(await job,false);await settle();
    assert.equal(h.node('previewPngtuberVideo').src,preview);
    assert.equal(h.node('previewPngtuberVideo').hidden,false);
    assert.ok(h.requests.filter(r=>r.url.endsWith('/preview')).every(r=>!('audioPath' in r.body)));
});
