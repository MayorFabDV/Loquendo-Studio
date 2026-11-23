'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const vm=require('node:vm');
const {spawnSync}=require('node:child_process');
const {EventEmitter}=require('node:events');
const root=path.resolve(__dirname,'..');

test('robustez SAPI con Python x86: identidad, limpieza, errores y stdout',()=>{
    const result=spawnSync(path.join(root,'backend/python/python.exe'),['-B',path.join(__dirname,'sapi_robustness_test.py')],{encoding:'utf8',windowsHide:true,timeout:30000});
    assert.equal(result.status,0,result.error?.message||result.stdout+result.stderr);
});

test('el exe legado solo recibe la sonda de protocolo; la síntesis usa el Python embebido',async t=>{
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'sapi-protocol-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const bin=path.join(dir,'bin');fs.mkdirSync(bin);
    for(const file of ['generar_voz.exe','python.exe','generar_voz.py'])fs.writeFileSync(path.join(bin,file),'fixture');
    const calls=[],probes=[];
    const cp={spawnSync(file,args){probes.push({file,args});return args[0]==='--sapi-protocol'?{status:2,stdout:''}:{status:0,stdout:''};},
        spawn(file,args){calls.push({file,args});const child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();
            queueMicrotask(()=>{fs.writeFileSync(args[4],Buffer.alloc(3000));child.stdout.emit('data',Buffer.from('EXITO'));child.emit('close',0);});return child;}};
    const module={exports:{}};
    vm.runInNewContext(fs.readFileSync(path.join(root,'backend/services/audioService.js'),'utf8'),{module,require:name=>name==='child_process'?cp:name==='./featurePolicy'?require('../backend/services/featurePolicy'):require(name),console,Buffer,queueMicrotask});
    const service=new module.exports(path.join(bin,'generar_srt.py'),dir,path.join(bin,'ffmpeg.exe'),path.join(bin,'python.exe'));
    await service.procesar('Prueba','opaque-id',false,{aplicarConOpciones:s=>s});
    assert.equal(calls.length,1);assert.equal(path.basename(calls[0].file),'python.exe');assert.equal(calls[0].args[0],'-B');
    assert.equal(service._exeConTokensEstables(),false);
    assert.equal(probes.filter(p=>p.args[0]==='--sapi-protocol').length,1,'La sonda se almacena en caché');
});

function preferences(value,options){
    const stored=new Map([['loquendo.default_voice',value]]),warnings=[];
    const select={options,disabled:false,selectedIndex:0,get value(){return this.options[this.selectedIndex]?.value||'';},set value(value){this.selectedIndex=this.options.findIndex(o=>o.value===value);}};
    const context=vm.createContext({window:{notifications:{warning:m=>warnings.push(m)}},localStorage:{getItem:k=>stored.get(k)??null,setItem:(k,v)=>stored.set(k,v)},
        document:{readyState:'loading',documentElement:{setAttribute(){}},getElementById:id=>id==='vozSeleccionada'?select:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}},console,setTimeout,clearTimeout});
    vm.runInContext(fs.readFileSync(path.join(root,'frontend/js/ui/settings.js'),'utf8'),context);
    context.window.settings.aplicarVozPorDefecto();return {select,stored,warnings,context};
}
const option=(value,name)=>({value,textContent:name,dataset:{voiceName:name}});

test('preferencia legacy por descripción se resuelve al token sin reescribir el valor guardado',()=>{
    const h=preferences('Leonor',[option('opaque-j','Jorge'),option('opaque-l','Leonor')]);
    assert.equal(h.select.value,'opaque-l');assert.equal(h.stored.get('loquendo.default_voice'),'Leonor');
    assert.equal(preferences('Loquendo Jorge',[option('opaque-j','Jorge')]).select.value,'opaque-j');
    assert.equal(preferences('Leonor',[option('opaque-l','Loquendo Leonor')]).select.value,'opaque-l');
});

test('preferencia por token exacto desambigua nombres iguales y la legacy ambigua queda sin seleccionar',()=>{
    const options=[option('opaque-a','Leonor'),option('opaque-b','Leonor')];
    assert.equal(preferences('opaque-b',options).select.value,'opaque-b');
    const h=preferences('Leonor',options);assert.equal(h.select.value,'');assert.equal(h.warnings.length,1);
    assert.equal(preferences('Leonor',[option('opaque-a','Loquendo Leonor A'),option('opaque-b','Loquendo Leonor B')]).select.value,'');
});

test('una preferencia ambigua no termina generando Jorge como fallback silencioso',async()=>{
    const h=preferences('Leonor',[option('opaque-a','Leonor'),option('opaque-b','Leonor')]);let requests=0;
    h.context.fetch=async()=>{requests++;throw Error('No debe generar con otra voz');};
    vm.runInContext(fs.readFileSync(path.join(root,'frontend/js/main.js'),'utf8'),h.context);
    await h.context.window.generarAudio();assert.equal(requests,0);assert.equal(h.select.value,'');
});
