'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const VideoService=require('../backend/services/videoService');
const ffmpeg=path.resolve(__dirname,'../backend/bin/ffmpeg.exe');
const ffprobe=path.resolve(__dirname,'../backend/bin/ffprobe.exe');

function run(args){
    const p=spawnSync(ffmpeg,['-v','error',...args],{windowsHide:true,maxBuffer:4*1024*1024,timeout:30000});
    assert.equal(p.status,0,p.error?.message||p.stderr.toString());return p.stdout;
}
function pixel(file,time,x,y,alpha=false){
    const bytes=run(['-ss',String(time),...(alpha?['-c:v','libvpx-vp9']:[]),'-i',file,
        '-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-']);
    assert.equal(bytes.length,64*64*4);
    return [...bytes.subarray((y*64+x)*4,(y*64+x)*4+4)];
}

test('PNGTuber: sprites transparentes son exclusivos en preview y render, MP4 y WebM',{
    skip:!fs.existsSync(ffmpeg)||!fs.existsSync(ffprobe),timeout:120000
},async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-pngtuber-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const audioDir=path.join(root,'audios'),imageDir=path.join(root,'images');
    fs.mkdirSync(audioDir);fs.mkdirSync(imageDir);
    for(const [name,color,x] of [['idle','red',8],['talking','blue',40],['blink','lime',24]]){
        run(['-f','lavfi','-i',`color=c=black@0.0:s=64x64,format=rgba,drawbox=x=${x}:y=16:w=16:h=32:color=${color}@1:t=fill:replace=1`,
            '-frames:v','1',path.join(imageDir,name+'.png')]);
    }
    const rate=48000,n=rate*3,wav=Buffer.alloc(44+n*2);
    wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
    wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
    wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);
    for(let i=0;i<n;i++){const time=i/rate;wav.writeInt16LE((time>=0.5&&time<1.5)||(time>=2)?Math.round(8000*Math.sin(2*Math.PI*440*time)):0,44+i*2);}
    const audio=path.join(audioDir,'voice.wav');fs.writeFileSync(audio,wav);
    const service=new VideoService(ffmpeg,audioDir,imageDir,ffprobe);
    service._fechasParpadeo=()=>[1.2,1.65]; // Solo hace determinista la fixture; incluye parpadeo durante el habla.
    for(const fondo of ['black','transparent']){
        const alpha=fondo==='transparent';
        const options={idleImagePath:'idle.png',talkingImagePath:'talking.png',blinkImagePath:'blink.png',fondo};
        const preview=await service.generarPreviewPNGTuber(options);
        const final=await service.generarPNGTuber(audio,options);
        for(const [file,blinkTime] of [[path.join(imageDir,path.basename(preview.url)),2.65],[path.join(audioDir,path.basename(final.video)),1.25]]){
            const idle=pixel(file,0.25,14,32,alpha);assert.ok(idle[0]>150,'Reposo visible');
            const talk=pixel(file,1.05,46,32,alpha);assert.ok(talk[2]>150,'Habla visible');
            const previous=pixel(file,1.05,14,32,alpha);
            assert.ok(alpha?previous[3]<10:previous[0]<30,'Habla debe ocultar el PNG de reposo completo: '+previous);
            const blink=pixel(file,blinkTime,32,32,alpha);assert.ok(blink[1]>150,'Parpadeo visible');
            const underBlink=pixel(file,blinkTime,14,32,alpha);
            assert.ok(alpha?underBlink[3]<10:underBlink[0]<30,'Parpadeo debe ocultar el PNG anterior: '+underBlink);
            const talkingUnderBlink=pixel(file,blinkTime,46,32,alpha);
            assert.ok(alpha?talkingUnderBlink[3]<10:talkingUnderBlink[2]<30,'Parpadeo debe ocultar también el PNG de habla');
        }
    }
    for(const name of ['idle','talking','blink'])assert.ok(fs.existsSync(path.join(imageDir,name+'.png')),'Los PNG originales permanecen');
});

test('PNGTuber distingue silencio total de habla y rechaza audio inválido',{
    skip:!fs.existsSync(ffmpeg)||!fs.existsSync(ffprobe),timeout:30000
},async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-png-silence-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const silent=path.join(root,'silence.wav');run(['-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','1',silent]);
    const service=new VideoService(ffmpeg,root,root,ffprobe);
    assert.deepEqual((await service.detectarSegmentosVoz(silent)).segmentosVoz,[]);
    const broken=path.join(root,'broken.wav');fs.writeFileSync(broken,'no es audio');
    await assert.rejects(service.detectarSegmentosVoz(broken),/No se pudo analizar/);
});

test('previews de demostración tienen rutas únicas y cambiar MP4/WebM conserva las anteriores',{
    skip:!fs.existsSync(ffmpeg)||!fs.existsSync(ffprobe),timeout:60000
},async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-preview-identity-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    run(['-f','lavfi','-i','color=red:s=64x64','-frames:v','1',path.join(root,'idle.png')]);
    const service=new VideoService(ffmpeg,root,root,ffprobe);
    const first=await service.generarPreviewPNGTuber({idleImagePath:'idle.png',fondo:'black'});
    const second=await service.generarPreviewPNGTuber({idleImagePath:'idle.png',fondo:'black'});
    assert.notEqual(first.url,second.url,'Una petición posterior no debe reescribir la preview anterior');
    await service.generarPreviewPNGTuber({idleImagePath:'idle.png',fondo:'transparent'});
    for(const preview of [first,second])assert.ok(fs.existsSync(path.join(root,path.basename(preview.url))),'Cambiar formato no debe borrar una salida que otro reproductor puede seguir usando');
});

test('la demostración siempre dura 4 segundos, sin pista de audio, y muestra las tres expresiones',{
    skip:!fs.existsSync(ffmpeg)||!fs.existsSync(ffprobe),timeout:120000
},async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-preview-idle-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    for(const [name,color,x] of [['idle','red',8],['talking','blue',40],['blink','lime',24]]){
        run(['-f','lavfi','-i',`color=c=black@0.0:s=64x64,format=rgba,drawbox=x=${x}:y=16:w=16:h=32:color=${color}@1:t=fill:replace=1`,
            '-frames:v','1',path.join(root,name+'.png')]);
    }
    const service=new VideoService(ffmpeg,root,root,ffprobe);
    for(const fondo of ['black','transparent']){
        service.detectarSegmentosVoz=()=>{throw Error('La demostración no debe analizar audio');};
        const preview=await service.generarPreviewPNGTuber({idleImagePath:'idle.png',talkingImagePath:'talking.png',blinkImagePath:'blink.png',fondo,
            audioPath:'audio-ignorado.wav',soloReposo:true}); // Opciones antiguas no deben crear otra ruta de preview.
        const file=path.join(root,path.basename(preview.url)),alpha=fondo==='transparent';
        const probe=spawnSync(ffprobe,['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true});
        assert.equal(probe.status,0,probe.stderr);const info=JSON.parse(probe.stdout);
        assert.deepEqual(info.streams.map(s=>s.codec_type),['video']);assert.ok(Math.abs(Number(info.format.duration)-4)<0.08);
        for(const [time,expected] of [[0,'idle'],[1.05,'talking'],[2.65,'blink'],[3.96,'talking']]){
            for(const [name,x,color] of [['idle',14,0],['talking',46,2],['blink',32,1]]){
                const p=pixel(file,time,x,32,alpha);
                assert.ok(name===expected?p[color]>150:alpha?p[3]<20:p[color]<30,`${expected} exclusivo a ${time}s; ${name}: ${p}`);
            }
        }
    }
});
