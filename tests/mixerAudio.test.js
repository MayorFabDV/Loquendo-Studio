'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { AssetStore } = require('../backend/services/projects/assetStore');
const { ProjectRenderService } = require('../backend/services/audio/projectRenderService');
const ffmpeg = path.resolve(__dirname,'../backend/bin/ffmpeg.exe');
const ffprobe = path.resolve(__dirname,'../backend/bin/ffprobe.exe');

test('FFmpeg: split/offset/ganancia/pan mantienen el audio y renders tienen nombres únicos', {
    skip: !fs.existsSync(ffmpeg) || !fs.existsSync(ffprobe), timeout: 60000
}, async (t) => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-mixer-audio-'));
    t.after(() => fs.rmSync(root,{recursive:true,force:true}));
    const source = path.join(root,'source.wav');
    let result = spawnSync(ffmpeg,['-v','error','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=2',
        '-ac','2','-c:a','pcm_s24le',source],{windowsHide:true});
    assert.equal(result.status,0,result.stderr.toString());
    const assets = new AssetStore(path.join(root,'data'),{raicesPermitidas:[root]});
    const imported = await assets.importarAsset('p-test',source);
    const render = new ProjectRenderService(ffmpeg,ffprobe,assets);
    const clip = {id:'a',trackId:'voz',asset:imported.asset,start:0.25,in:0.2,out:1.8,gainDb:-6,
        automation:[{t:0,gain:0.2},{t:2,gain:0.8}],pan:0.5};
    const base = {id:'p-test',master:{limiter:false},tracks:[{id:'voz',gainDb:-3}],clips:[clip]};
    const original = await render.render(base);
    const split = await render.render({...base,clips:[{...clip,out:1},{...clip,id:'b',in:1,start:1.05}]});
    assert.notEqual(original.archivo,split.archivo);
    const decode = url => {
        const file = assets.resolverAsset('p-test','renders/'+url.archivo);
        const p = spawnSync(ffmpeg,['-v','error','-i',file,'-f','f32le','-acodec','pcm_f32le','-'],{windowsHide:true,maxBuffer:4*1024*1024});
        assert.equal(p.status,0,p.stderr.toString());
        return p.stdout;
    };
    const a = decode(original), b = decode(split);
    assert.equal(a.length,b.length);
    let error=0, left=0, right=0, silence=0;
    const frames=a.length/8;
    for(let i=0;i<frames;i++) {
        const l=a.readFloatLE(i*8), r=a.readFloatLE(i*8+4);
        error=Math.max(error,Math.abs(l-b.readFloatLE(i*8)),Math.abs(r-b.readFloatLE(i*8+4)));
        if(i<11000) silence=Math.max(silence,Math.abs(l),Math.abs(r));
        if(i>15000 && i<frames-2000) {left+=l*l;right+=r*r;}
    }
    assert.ok(error<0.0003,'split debe conservar la rampa de automatización: '+error);
    assert.ok(silence<0.00001,'retardo inicial debe ser silencio');
    assert.ok(Math.abs(Math.sqrt(left/right)-0.5)<0.01,'pan derecho debe atenuar izquierda por 0.5');
    assert.ok(Math.abs(frames/48000-1.85)<0.002,'duración respeta start e in/out');

    const unity = await render.render({...base,clips:[{...clip,automation:[],pan:0,gainDb:0}]});
    const half = await render.render({...base,clips:[{...clip,automation:[],pan:0,gainDb:-6}]});
    const x=decode(unity), y=decode(half);
    let energyX=0,energyY=0;
    for(let i=0;i<x.length;i+=4){energyX+=x.readFloatLE(i)**2;energyY+=y.readFloatLE(i)**2;}
    assert.ok(Math.abs(Math.sqrt(energyY/energyX)-Math.pow(10,-6/20))<0.001);

    const faded = await render.render({...base,clips:[{...clip,automation:[],pan:0,fadeIn:0.4,fadeOut:0.4,fadeCurve:'linear'}]});
    const f=decode(faded);
    const rms=(buffer,start,end)=>{
        let sum=0;for(let i=start;i<end;i++)sum+=buffer.readFloatLE(i*8)**2;
        return Math.sqrt(sum/(end-start));
    };
    assert.ok(rms(f,13000,15000)<rms(f,40000,45000)*0.35,'fade de entrada reduce energía');
    assert.ok(rms(f,85000,87000)<rms(f,40000,45000)*0.35,'fade de salida reduce energía');
});
