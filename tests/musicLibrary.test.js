'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {spawnSync}=require('node:child_process');
const {MusicLibrary}=require('../backend/services/musicLibrary');
const ffmpeg=path.resolve(__dirname,'../backend/bin/ffmpeg.exe'),ffprobe=path.resolve(__dirname,'../backend/bin/ffprobe.exe');
async function fixture(t){
    const root=await fs.mkdtemp(path.join(os.tmpdir(),'loquendo-music-test-'));
    t.after(()=>fs.rm(root,{recursive:true,force:true}));
    const song=path.join(root,'Canción á.wav');
    const run=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=400:duration=0.4',song],{windowsHide:true});
    assert.equal(run.status,0,run.stderr.toString());
    const dir=path.join(root,'data');return {root,song,dir,lib:new MusicLibrary(dir,ffprobe,ffmpeg)};
}
test('referencias únicas sobreviven reinicio y concurrencia sin copiar ni modificar originales',async t=>{
    const {song,dir,lib}=await fixture(t),original=await fs.readFile(song);
    const [a,b]=await Promise.all([lib.registrar(song),lib.registrar(song)]);
    assert.equal(a.id,b.id);assert.equal((await lib.listar()).length,1);
    await lib.guardar(a.id,true);
    const restarted=new MusicLibrary(dir,ffprobe,ffmpeg);
    assert.equal((await restarted.listar())[0].saved,true);
    assert.equal(await restarted.resolver(a.id),await fs.realpath(song));
    assert.deepEqual((await fs.readdir(dir)),['music-library.json']);
    assert.deepEqual(await fs.readFile(song),original);
});
test('faltantes se localizan con el mismo ID; inválidos y eliminación nunca dañan originales',async t=>{
    const {root,song,lib}=await fixture(t),a=await lib.registrar(song),original=await fs.readFile(song);
    await lib.guardar(a.id,true);
    const moved=path.join(root,'Movida.wav');await fs.rename(song,moved);
    assert.equal((await lib.listar())[0].missing,true);
    await assert.rejects(lib.resolver(a.id),/Localizar archivo/);
    const bad=path.join(root,'bad.mp3');await fs.writeFile(bad,'no es audio');
    await assert.rejects(lib.registrar(bad,a.id),/audio válido/);
    assert.equal((await lib.listar())[0].path,a.path);
    const linked=await lib.registrar(moved,a.id);assert.equal(linked.id,a.id);assert.equal(linked.saved,true);
    await lib.guardar(a.id,false);assert.equal((await lib.listar())[0].saved,false);
    await lib.eliminar(a.id);assert.deepEqual(await lib.listar(),[]);
    assert.deepEqual(await fs.readFile(moved),original);
});
test('una biblioteca corrupta se conserva byte a byte y rechaza todas las escrituras',async t=>{
    const {song,dir,lib}=await fixture(t);const row=await lib.registrar(song);
    const corrupt=Buffer.from('{biblioteca interrumpida');await fs.writeFile(lib.file,corrupt);
    await assert.rejects(lib.listar(),/sin sobrescribirlo/);
    await assert.rejects(lib.guardar(row.id,true),/sin sobrescribirlo/);
    await assert.rejects(lib.eliminar(row.id),/sin sobrescribirlo/);
    await assert.rejects(lib.registrar(song),/sin sobrescribirlo/);
    assert.deepEqual(await fs.readFile(lib.file),corrupt);
    assert.deepEqual(await fs.readdir(dir),['music-library.json']);
});
