'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pipeline}=require('node:stream/promises');
const {spawnSync}=require('node:child_process');
const {AssetStore}=require('../backend/services/projects/assetStore');
const {PortableProject}=require('../backend/services/projects/portableProject');

async function fixture(t){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-portable-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const store=new AssetStore(path.join(root,'original'),{raicesPermitidas:[root]});
    const audio=path.join(root,'audio.wav');fs.writeFileSync(audio,'datos de audio de prueba');
    const asset=await store.importarAsset('p-test',audio);
    const doc={version:2,id:'p-test',projectId:'p-test',nombre:'Mezcla',tracks:[{id:'voz',gainDb:-3,pan:0.5}],master:{limiter:false},
        clips:[{id:'a',asset:asset.asset,src:asset.url,trackId:'voz',start:1,in:0.2,out:1.5,pan:-0.2,effects:{eq:{low:2}},automation:[{t:1,gain:0.3}]},
            {id:'b',asset:asset.asset,src:asset.url,trackId:'voz',start:4,in:0,out:2}],assets:[{asset:asset.asset}]};
    await store.guardarProyecto('p-test',doc);
    const portable=new PortableProject(store), tar=path.join(root,'bundle.tar');
    await pipeline((await portable.exportar('p-test')).stream,fs.createWriteStream(tar));
    return {root,store,portable,tar,doc,audio};
}
test('portable incluye medios y JSON compatible; importar en almacenamiento vacío asigna IDs nuevos',async t=>{
    const f=await fixture(t);
    const other=new AssetStore(path.join(f.root,'other'),{raicesPermitidas:[f.root]});
    const importer=new PortableProject(other);
    const imported=await importer.importar(f.tar), again=await importer.importar(f.tar);
    assert.notEqual(imported.id,'p-test');assert.notEqual(imported.id,again.id);
    assert.equal(imported.version,2);
    assert.deepEqual(imported.tracks,f.doc.tracks);assert.deepEqual(imported.master,f.doc.master);
    assert.deepEqual(imported.clips[0].effects,f.doc.clips[0].effects);
    assert.deepEqual(imported.clips[0].automation,f.doc.clips[0].automation);
    assert.equal(imported.clips[0].start,1);assert.equal(imported.clips[1].start,4);
    assert.ok(imported.clips.every(c=>c.src.startsWith('/media/projects/'+imported.id+'/')));
    assert.deepEqual(fs.readFileSync(other.resolverAsset(imported.id,imported.clips[0].asset)),fs.readFileSync(f.audio));
    assert.equal((await other.comprobarIntegridad(imported.id)).ok,true);
    assert.equal(f.store.leerProyecto('p-test').nombre,'Mezcla');
    const listado=spawnSync('tar',['-tf',f.tar],{encoding:'utf8',windowsHide:true});
    if(!listado.error){assert.equal(listado.status,0,listado.stderr);assert.ok(listado.stdout.includes('project.json'));assert.ok(listado.stdout.includes('assets/'));}
});

function headers(bytes){
    const found=[];let i=0;
    while(i<bytes.length && bytes[i]){found.push(i);const n=parseInt(bytes.subarray(i+124,i+136).toString().replace(/\0/g,'').trim(),8);i+=512+n+(512-n%512)%512;}
    return found;
}
function checksum(bytes,start){bytes.fill(32,start+148,start+156);let n=0;for(let i=start;i<start+512;i++)n+=bytes[i];bytes.write(n.toString(8).padStart(6,'0')+'\0 ',start+148);}

test('portable rechaza corrupción, truncación, rutas externas, enlaces y duplicados sin activar proyectos',async t=>{
    const f=await fixture(t), original=fs.readFileSync(f.tar), positions=headers(original);
    const assetHeader=positions.find(i=>original.subarray(i,i+100).toString().startsWith('assets/'));
    const cases=[];
    let b=Buffer.from(original);b[assetHeader+512]^=1;cases.push(b);
    cases.push(original.subarray(0,original.length-1024));
    b=Buffer.from(original);b.fill(0,assetHeader,assetHeader+100);b.write('../../escape.wav',assetHeader);checksum(b,assetHeader);cases.push(b);
    b=Buffer.from(original);b[assetHeader+156]=50;checksum(b,assetHeader);cases.push(b);
    b=Buffer.from(original);b.fill(0,assetHeader,assetHeader+100);b.write('project.json',assetHeader);checksum(b,assetHeader);cases.push(b);
    const other=new AssetStore(path.join(f.root,'other'),{raicesPermitidas:[f.root]});
    const importer=new PortableProject(other);
    for(let i=0;i<cases.length;i++){
        const file=path.join(f.root,'bad-'+i+'.tar');fs.writeFileSync(file,cases[i]);
        await assert.rejects(importer.importar(file));
        assert.deepEqual(fs.readdirSync(other.projectsDir),[],'No quedan proyectos parciales ni staging');
    }
    assert.equal(fs.existsSync(path.join(f.root,'escape.wav')),false);
});

test('no se exportan paquetes con medios persistentes ausentes o dañados',async t=>{
    const f=await fixture(t);
    fs.writeFileSync(f.store.resolverAsset('p-test',f.doc.clips[0].asset),'dañado');
    await assert.rejects(f.portable.exportar('p-test'),/dañados/);
});
