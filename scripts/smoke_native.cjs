// node scripts/smoke_native.cjs — regresión offline con binarios reales y Python embebido x86.
'use strict';
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const AudioService=require('../backend/services/audioService');
const AudioRenderService=require('../backend/services/audioRenderService');
const repo=path.resolve(__dirname,'..');
const bin=path.join(repo,'backend/bin');
const python=path.join(repo,'backend/python/python.exe');
function execute(exe,args,timeout=60000,cwd){
    return new Promise((resolve,reject)=>{
        const child=spawn(exe,args,{windowsHide:true,shell:false,cwd,env:{...process.env,PYTHONDONTWRITEBYTECODE:'1'}});let stdout='',stderr='';
        const timer=setTimeout(()=>{child.kill();reject(new Error('Timeout: '+path.basename(exe)));},timeout);
        child.stdout.on('data',d=>{if(stdout.length<2*1024*1024)stdout+=d.toString();});
        child.stderr.on('data',d=>{if(stderr.length<2*1024*1024)stderr+=d.toString();});
        child.on('error',e=>{clearTimeout(timer);reject(e);});
        child.on('close',code=>{clearTimeout(timer);code===0?resolve({stdout,stderr}):reject(new Error(path.basename(exe)+' ('+code+'): '+stderr+' '+stdout));});
    });
}
async function probe(file){
    return JSON.parse((await execute(path.join(bin,'ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json',file])).stdout);
}

async function languageTool(){
    const net=require('node:net'),socket=net.createServer();
    await new Promise(resolve=>socket.listen(0,'localhost',resolve));const port=socket.address().port;
    await new Promise(resolve=>socket.close(resolve));
    const dir=path.join(bin,'languagetool'),jar=path.join(dir,'languagetool-server.jar');
    const child=spawn(path.join(bin,'jre/bin/java.exe'),['-Xmx512m','-cp',jar,'org.languagetool.server.HTTPServer','--port',String(port)],{windowsHide:true,cwd:dir});
    let logs='';child.stdout.on('data',d=>{if(logs.length<65536)logs+=d;});child.stderr.on('data',d=>{if(logs.length<65536)logs+=d;});
    let spawnError=null;child.on('error',error=>{spawnError=error;});
    try {
        let data=null;const started=Date.now();
        while(Date.now()-started<45000){
            if(spawnError)throw spawnError;
            if(child.exitCode!==null)throw new Error('LanguageTool terminó: '+logs);
            try {
                const response=await fetch(`http://localhost:${port}/v2/check`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
                    body:new URLSearchParams({text:'Esto es una prubea de correcion.',language:'es'}),signal:AbortSignal.timeout(3000)});
                if(response.ok){data=await response.json();break;}
            } catch(error){ /* Puede estar iniciando Java y cargando diccionarios. */ }
            await new Promise(resolve=>setTimeout(resolve,250));
        }
        assert.ok(data?.matches?.some(m=>m.replacements?.some(r=>r.value==='prueba')),'LanguageTool debe corregir prubea');
        console.log('LANGUAGETOOL_REAL_PASS: instancia local propia y corrección en español');
    } finally {
        if(child.exitCode===null&&!spawnError){const exit=new Promise(resolve=>child.once('exit',resolve));child.kill();await exit;}
    }
}
async function run(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'Loquendo prueba-á-'));
    try {
        const bits=await execute(python,['-c',"import struct; print(struct.calcsize('P')*8)"]);
        assert.equal(bits.stdout.trim(),'32');
        const voices=JSON.parse((await execute(python,[path.join(repo,'backend/modules/listar_voces.py')])).stdout.trim());
        assert.ok(Array.isArray(voices)&&voices.length>0,'Se necesita una voz SAPI registrada');
        const voz=voices.find(v=>/^Jorge$/i.test(v.nombre))?.nombre || voices[0].nombre;
        const segunda=voices.find(v=>/^Carlos$/i.test(v.nombre))?.nombre || voz;
        const direct=path.join(root,'voz-script.wav');
        const texto=`Hola. Esta es una prueba de Loquendo Studio. [pause:250] [voz:${segunda}]La voz cambia y conserva los acentos de edición.[/voz]`;
        const script=await execute(python,[path.join(repo,'backend/modules/generar_voz.py'),texto,voz,direct]);
        assert.match(script.stdout,/EXITO/);assert.doesNotMatch(script.stdout+script.stderr,/Win32 exception occurred releasing IUnknown/i);
        assert.ok(Number((await probe(direct)).format.duration)>1);
        const handle=fs.openSync(path.join(bin,'generar_voz.exe'),'r'),dos=Buffer.alloc(64),pe=Buffer.alloc(6);
        try {fs.readSync(handle,dos,0,64,0);fs.readSync(handle,pe,0,6,dos.readUInt32LE(60));assert.equal(pe.readUInt16LE(4),0x14c,'El exe SAPI debe ser x86');}
        finally {fs.closeSync(handle);}
        const standalone=await execute(path.join(bin,'generar_voz.exe'),['Prueba del cierre de voz.',voz,path.join(root,'exe-direct.wav')],60000,root);
        assert.match(standalone.stdout,/EXITO/);assert.doesNotMatch(standalone.stdout+standalone.stderr,/Win32 exception occurred releasing IUnknown/i);
        const audio=new AudioService(path.join(repo,'backend/modules/generar_srt.py'),root,path.join(bin,'ffmpeg.exe'),python);
        const out=await audio.procesar(texto,voz,false,{aplicarConOpciones:t=>t},'normal',{calidad:'16k'});
        const wav=path.join(root,path.basename(out.url));
        const info=await probe(wav), stream=info.streams.find(s=>s.codec_type==='audio');
        assert.equal(Number(stream.sample_rate),16000);assert.equal(stream.channels,1);
        const vozExe=audio.vozExe32;audio.vozExe32=path.join(root,'exe-no-disponible.exe');
        const fallback=await audio.procesar('Prueba del respaldo de voz con Python embebido.',voz,false,{aplicarConOpciones:t=>t},'normal',{calidad:'22k'});
        audio.vozExe32=vozExe;
        assert.equal(Number((await probe(path.join(root,path.basename(fallback.url)))).streams[0].sample_rate),22050);
        console.log('SAPI_REAL_PASS: Python 32-bit, script multivoz, ejecutable x86 y fallback embebido; calidades 16k/22k mono');

        const render=new AudioRenderService(path.join(bin,'ffmpeg.exe'),path.join(bin,'ffprobe.exe'),root);
        const recipe={filter:{highpass:80,lowpass:6000},eq:{high:1},comp:{enabled:false},gate:{enabled:false},
            limiter:{ceiling:-1},gainDb:-3,pitch:2,rate:1.1,fades:{in:0.1,out:0.1,curve:'linear'},loudness:{target:-16,precise:true}};
        for(const format of ['wav','mp3','flac','opus']){
            const result=await render.renderizar(wav,recipe,{format,bitDepth:24});
            assert.ok(result.size>1000&&result.duration>1&&Number.isFinite(result.lufs));
            assert.ok(Math.abs(result.lufs+16)<1,'La sonoridad del render debe quedar cerca del objetivo de -16 LUFS: '+result.lufs);
            if(format==='wav')assert.equal((await probe(path.join(root,path.basename(result.url)))).streams[0].bits_per_sample,24);
        }
        const music=path.join(root,'music.wav');
        await execute(path.join(bin,'ffmpeg.exe'),['-v','error','-f','lavfi','-i','sine=frequency=220:duration=1:sample_rate=44100','-ac','2',music]);
        const mixed=await audio.aplicarDucking(wav,music,{loopMusic:true,fadeInMusic:0.1,fadeOutMusic:0.2});
        assert.ok(Math.abs(Number((await probe(path.join(root,path.basename(mixed.url)))).format.duration)-Number(info.format.duration))<0.1);
        const mp3=await audio.convertirAMp3(wav,root);assert.ok(fs.statSync(path.join(root,path.basename(mp3.url))).size>1000);
        console.log('AUDIO_REAL_PASS: WAV24/MP3/FLAC/Opus, pitch/rate/fades/LUFS y ducking con loop');

        const srt=path.join(root,'whisper.srt');
        await audio.generarSRTWhisperCpp(wav,srt,7);
        const content=fs.readFileSync(srt,'utf8');assert.match(content,/\d{2}:\d{2}:\d{2},\d{3} -->/);
        assert.ok(content.replace(/\d|[:>,\-\s]/g,'').length>10,'Whisper produjo texto, no solo tiempos');
        const ass=path.join(root,'subtitulos.ass');
        await execute(python,[path.join(repo,'backend/modules/generar_ass.py'),wav,ass,'normal',srt,'Hola. Esta es una prueba de Loquendo Studio. La voz cambia y conserva los acentos de edición.']);
        const assText=fs.readFileSync(ass,'utf8');assert.match(assText,/\[Events\]/);assert.match(assText,/Dialogue:/);assert.doesNotMatch(assText,/\[Sin subtitulos\]/);
        console.log('SUBTITLES_REAL_PASS: Whisper.cpp con modelo local y ASS con Python embebido');
        await languageTool();
        console.log('NATIVE_SMOKE_PASS: solo se usaron salidas temporales aisladas');
    } finally {fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
