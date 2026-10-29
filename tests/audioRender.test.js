'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const AudioRenderService=require('../backend/services/audioRenderService');
const AudioService=require('../backend/services/audioService');
const bin=path.resolve(__dirname,'../backend/bin'),ffmpeg=path.join(bin,'ffmpeg.exe'),ffprobe=path.join(bin,'ffprobe.exe');
test('render legacy con fades lineales funciona; selección conserva el audio exterior y salidas concurrentes son únicas',{
    skip:!fs.existsSync(ffmpeg)||!fs.existsSync(ffprobe),timeout:60000
},async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-render-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const source=path.join(root,'source.wav');
    let p=spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:duration=1.2:sample_rate=48000',source],{windowsHide:true});
    assert.equal(p.status,0,p.stderr.toString());
    const service=new AudioRenderService(ffmpeg,ffprobe,root);
    const recipe={bypass:true,limiter:{ceiling:0},gate:{enabled:false},loudness:{enabled:false},fades:{in:0.1,out:0.1,curve:'linear'}};
    const result=await service.renderizar(source,recipe,{format:'wav',bitDepth:24});
    assert.ok(result.size>1000);assert.ok(Math.abs(result.duration-1.2)<0.01);
    const selection=await service.procesarSeleccion(source,0.3,0.9,recipe);
    const decode=file=>{
        const raw=spawnSync(ffmpeg,['-v','error','-i',file,'-f','f32le','-ac','1','-ar','48000','-'],{windowsHide:true,maxBuffer:1024*1024});
        assert.equal(raw.status,0,raw.stderr.toString());return raw.stdout;
    };
    const a=decode(source),b=decode(path.join(root,path.basename(selection.url)));
    assert.equal(a.length,b.length);
    const energy=(bytes,start,end)=>{let sum=0;for(let i=start;i<end;i++)sum+=bytes.readFloatLE(i*4)**2;return Math.sqrt(sum/(end-start));};
    assert.ok(Math.abs(energy(a,1000,9000)-energy(b,1000,9000))<0.00001,'Antes de selección no cambia');
    assert.ok(Math.abs(energy(a,50000,55000)-energy(b,50000,55000))<0.00001,'Después de selección no cambia');
    assert.ok(energy(b,14500,15500)<energy(a,14500,15500)*0.4,'Fade localizado sí cambia el tramo');
    const originalNow=Date.now;Date.now=()=>1793300000000;
    try {
        const outputs=await Promise.all([service.renderizar(source,recipe),service.renderizar(source,recipe)]);
        assert.notEqual(outputs[0].url,outputs[1].url,'No deben sobrescribirse dos renders del mismo milisegundo');
        const audio=new AudioService(null,root,ffmpeg,null);
        const exports=await Promise.all([audio.convertirAMp3(source,root),audio.convertirAMp3(source,root)]);
        assert.notEqual(exports[0].url,exports[1].url,'No deben sobrescribirse dos MP3 del mismo milisegundo');
    } finally {Date.now=originalNow;}
});
