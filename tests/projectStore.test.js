'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {AssetStore}=require('../backend/services/projects/assetStore');

function entorno(t){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-projects-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    return {root,store:new AssetStore(path.join(root,'data'),{raicesPermitidas:[root]})};
}
test('guardados concurrentes son ordenados y conservan una revisión anterior',async t=>{
    const {store}=entorno(t);
    const first={nombre:'primero',clips:[]};
    const p=store.guardarProyecto('p-test',first);first.nombre='mutación externa';await p;
    await Promise.all(Array.from({length:12},(_,i)=>store.guardarProyecto('p-test',{nombre:String(i),clips:[]})));
    assert.equal(store.leerProyecto('p-test').nombre,'11');
    const dir=store.directorioProyecto('p-test');
    assert.equal(JSON.parse(fs.readFileSync(path.join(dir,'project.previous.json'))).nombre,'10');
    assert.ok(!fs.readdirSync(dir).some(n=>n.includes('.tmp-')));
    await assert.rejects(store.guardarProyecto('p-test',{clips:{}}),/inválido/);
    assert.equal(store.leerProyecto('p-test').nombre,'11');
});
test('proyecto corrupto recupera revisión previa y conserva el archivo ilegible al guardar',async t=>{
    const {store}=entorno(t);
    await store.guardarProyecto('p-test',{nombre:'anterior',clips:[]});
    await store.guardarProyecto('p-test',{nombre:'actual',clips:[]});
    fs.writeFileSync(store.rutaProyecto('p-test'),'JSON interrumpido');
    assert.equal(store.leerConRespaldo('p-test').recuperado,true);
    assert.equal(store.leerProyecto('p-test').nombre,'anterior');
    await store.guardarProyecto('p-test',{nombre:'recuperado',clips:[]});
    const corrupt=fs.readdirSync(store.directorioProyecto('p-test')).find(n=>n.startsWith('project.corrupt-'));
    assert.equal(fs.readFileSync(path.join(store.directorioProyecto('p-test'),corrupt),'utf8'),'JSON interrumpido');
    assert.equal(store.leerProyecto('p-test').nombre,'recuperado');
});
test('integridad detecta asset dañado; reimportar crea otro sin borrar el dañado',async t=>{
    const {root,store}=entorno(t);
    const source=path.join(root,'source.wav');fs.writeFileSync(source,'audio de prueba');
    const a=await store.importarAsset('p-test',source);
    await store.guardarProyecto('p-test',{clips:[{id:'a',asset:a.asset},{id:'b',asset:'assets/missing.wav'}]});
    const dest=store.resolverAsset('p-test',a.asset);fs.writeFileSync(dest,'dañado');
    const report=await store.comprobarIntegridad('p-test');
    assert.equal(report.danados[0].id,'a');assert.equal(report.faltantes[0].id,'b');
    const b=await store.importarAsset('p-test',source);
    assert.notEqual(a.asset,b.asset);
    assert.equal(fs.readFileSync(dest,'utf8'),'dañado');
    assert.equal(fs.readFileSync(store.resolverAsset('p-test',b.asset),'utf8'),'audio de prueba');
});
