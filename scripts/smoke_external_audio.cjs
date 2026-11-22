// Ejecutar: node scripts/smoke_projects.cjs --external-audio
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
module.exports=async function({run,action,wait,root}){
    const audioDir=path.join(root,'backend/public/audios'),ffmpeg=path.join(root,'backend/bin/ffmpeg.exe');
    const native=args=>{const p=spawnSync(ffmpeg,['-v','error',...args],{windowsHide:true,timeout:30000,maxBuffer:4*1024*1024});assert.equal(p.status,0,p.error?.message||p.stderr.toString());return p.stdout;};
    native(['-i',path.join(audioDir,'fixture.wav'),path.join(audioDir,'fixture.mp3')]);
    native(['-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','1',path.join(audioDir,'silent.wav')]);
    native(['-i',path.join(audioDir,'silent.wav'),path.join(audioDir,'silent.mp3')]);
    const rate=48000,n=rate*3,wav=Buffer.alloc(44+n*2);
    wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
    wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(rate,24);wav.writeUInt32LE(rate*2,28);
    wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(n*2,40);
    for(let i=0;i<n;i++){const t=i/rate;wav.writeInt16LE((t>=0.5&&t<1.5)||(t>=2&&t<2.5)?Math.round(8000*Math.sin(2*Math.PI*440*t)):0,44+i*2);}
    fs.writeFileSync(path.join(audioDir,'segmented.wav'),wav);
    native(['-i',path.join(audioDir,'segmented.wav'),path.join(audioDir,'segmented.mp3')]);
    native(['-stream_loop','1','-i',path.join(audioDir,'segmented.wav'),'-t','6',path.join(audioDir,'long.wav')]);
    const original=fs.readFileSync(path.join(audioDir,'fixture.wav'));
    const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
    await action(`tabs.irA('video');document.getElementById('fondoPNGTuber').value='black';
        window.fixtureBlob=await (await fetch('/audios/fixture.wav')).blob();
        if(!await videoAudioInput.importar(new File([fixtureBlob],'voz externa.wav',{type:'audio/wav'})))throw Error('Importación WAV');
        for(const [type,color,x] of [['idle','red',8],['talking','blue',40],['blink','lime',24]]){
            const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
            const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(x,16,16,32);
            const blob=await new Promise(r=>canvas.toBlob(r));const files=new DataTransfer();files.items.add(new File([blob],type+'.png',{type:'image/png'}));
            document.getElementById({idle:'pngtuberIdleInput',talking:'pngtuberTalkingInput',blink:'pngtuberBlinkInput'}[type]).files=files.files;
            await subirImagenPNGTuber(type);
        }`);
    await wait(`!previewEnCurso&&!pendingPreview&&!document.getElementById('previewPngtuberVideo').hidden`);
    assert.match(await run(`document.getElementById('videoAudioStatus').textContent`),/voz externa.wav.*2.00 s/);
    await wait(`document.getElementById('videoAudioPlayer').readyState>=2`);
    await run(`document.getElementById('videoAudioPlayer').play()`);
    assert.equal(await run(`document.getElementById('videoAudioPlayer').paused`),false);
    await action(`document.getElementById('videoAudioPlayer').pause();`);
    assert.equal(await run(`audioEditor.audioBuffer===null && mixer.estado.clips.length===0`),true);
    const chosen=await run(`videoAudioInput.ruta()`);
    const firstPreview=await run(`document.getElementById('previewPngtuberVideo').src`);
    await action(`const blob=await (await fetch('/audios/fixture.mp3')).blob();
        if(!await videoAudioInput.importar(new File([blob],'segundo.mp3',{type:'audio/mpeg'})))throw Error('Segundo audio');`);
    await wait(`!previewEnCurso&&!pendingPreview&&!document.getElementById('previewPngtuberVideo').hidden`);
    assert.equal(await run(`document.getElementById('previewPngtuberVideo').src`),firstPreview,'Cambiar audio no reinicia una demo ya visible');
    const secondChosen=await run(`videoAudioInput.ruta()`);
    assert.notEqual(secondChosen,chosen);
    assert.equal(await run(`videoAudioInput.importar(new File(['broken'],'invalido.mp3',{type:'audio/mpeg'}))`),false);
    assert.equal(await run(`videoAudioInput.ruta()`),secondChosen,'Fallos conservan selección anterior');
    const frames=new Map();
    const pixel=(file,time,x,alpha)=>{
        const key=JSON.stringify([file,time,alpha]);
        if(!frames.has(key))frames.set(key,native(['-ss',String(time),...(alpha?['-c:v','libvpx-vp9']:[]),'-i',file,'-frames:v','1','-f','rawvideo','-pix_fmt','rgba','-']));
        const bytes=frames.get(key);
        assert.equal(bytes.length,64*64*4);return [...bytes.subarray((32*64+x)*4,(32*64+x)*4+4)];
    };
    const verifyFrames=(url,silent,alpha,demo=false)=>{
        const file=path.join(root,'backend/public',new URL(url).pathname.replace(/^\//,''));
        const timeline=demo?[[0,'idle'],[1.05,'talking'],[2.65,'blink'],[3.96,'talking']]
            :silent?[[0,'idle'],[0.75,'idle'],[0.95,'idle']]
            :[[0,'idle'],[1.05,'talking'],[1.25,'blink'],[1.75,'idle'],[2.25,'blink'],[2.96,'idle']];
        for(const [time,expected] of timeline){
            for(const [expression,x,color] of [['idle',14,0],['talking',46,2],['blink',32,1]]){
                const p=pixel(file,time,x,alpha);
                assert.ok(expression===expected?p[color]>150:alpha?p[3]<20:p[color]<30,
                    `${expected} exclusivo en ${time}s; ${expression}: ${p}`);
            }
        }
    };
    const verifyDemo=async(url,alpha)=>{
        verifyFrames(url,false,alpha,true);
        const file=path.join(root,'backend/public',new URL(url).pathname.replace(/^\//,''));
        const probe=spawnSync(path.join(root,'backend/bin/ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',windowsHide:true});
        assert.equal(probe.status,0,probe.stderr);const info=JSON.parse(probe.stdout);
        assert.deepEqual(info.streams.map(s=>s.codec_type),['video'],'La demo no debe contener pista de audio');
        assert.ok(Math.abs(Number(info.format.duration)-4)<0.08);
        assert.equal(await run(`(()=>{const v=document.getElementById('previewPngtuberVideo');return v.loop&&v.muted&&v.autoplay;})()`),true);
    };
    const sources=['segmented.wav','segmented.mp3','silent.wav','silent.mp3','long.wav'];
    const sourceHashes=new Map(sources.map(name=>[name,hash(fs.readFileSync(path.join(audioDir,name)))]));
    for(const [input,fondo] of [['segmented.wav','black'],['segmented.mp3','transparent'],['silent.wav','black'],['silent.mp3','transparent'],['segmented.wav','transparent'],['segmented.mp3','black'],['long.wav','transparent']]){
        const oldPreview=await run(`document.getElementById('previewPngtuberVideo').src`);
        await action(`const blob=await (await fetch('/audios/${input}')).blob();
            if(!await videoAudioInput.importar(new File([blob],'${input}',{type:'audio/${input.endsWith('mp3')?'mpeg':'wav'}'})))throw Error('Importación');
            document.getElementById('fondoPNGTuber').value='${fondo}';await actualizarPreviewPNGTuber();await generarVideoPNGTuber();`);
        await wait(`!previewEnCurso&&!pendingPreview&&!document.getElementById('previewPngtuberVideo').hidden&&document.getElementById('previewPngtuberVideo').src!==${JSON.stringify(oldPreview)}`);
        await verifyDemo(await run(`document.getElementById('previewPngtuberVideo').src`),fondo==='transparent');
        const url=await run(`new URL(document.getElementById('videoPngtuberResultado').src).pathname`);
        assert.ok(url.endsWith(fondo==='transparent'?'.webm':'.mp4'));
        const result=path.join(root,'backend/public',url.replace(/^\//,''));
        const probe=spawnSync(path.join(root,'backend/bin/ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json',result],{encoding:'utf8',windowsHide:true});
        assert.equal(probe.status,0,probe.stderr);const info=JSON.parse(probe.stdout);
        assert.deepEqual(info.streams.map(s=>s.codec_type).sort(),['audio','video']);
        assert.ok(Math.abs(Number(info.format.duration)-(input==='long.wav'?6:input.startsWith('silent')?1:3))<0.15);
        verifyFrames(await run(`document.getElementById('videoPngtuberResultado').src`),input.startsWith('silent'),fondo==='transparent');
        if(input==='long.wav'){
            assert.ok(pixel(result,5.25,46,true)[2]>150,'El video final conserva habla después de los 4 segundos');
            assert.ok(pixel(result,5.96,14,true)[0]>150,'El video final llega al silencio del final del audio completo');
        }
    }
    // Pausar solo la entrega al renderer de respuestas reales ya generadas.
    await action(`document.getElementById('fondoPNGTuber').value='black';await actualizarPreviewPNGTuber();`);
    await action(`window.holdOnePNGTuber=suffix=>{
        const original=window.fetch;let first=true;window.releaseHeldRequest=null;
        window.fetch=async(...args)=>{const response=await original(...args);
            if(first&&String(args[0]).endsWith(suffix)){first=false;await new Promise(resolve=>window.releaseHeldRequest=resolve);}return response;};
        window.restoreHeldFetch=()=>{window.fetch=original;};
    };holdOnePNGTuber('/api/pngtuber/preview');window.oldPreviewJob=actualizarPreviewPNGTuber();`);
    await wait(`typeof releaseHeldRequest==='function'`);
    await action(`const blob=await (await fetch('/audios/silent.wav')).blob();await videoAudioInput.importar(new File([blob],'silencio.wav',{type:'audio/wav'}));
        document.getElementById('fondoPNGTuber').value='transparent';actualizarPreviewPNGTuber();
        releaseHeldRequest();await oldPreviewJob;restoreHeldFetch();`);
    await wait(`!previewEnCurso&&!pendingPreview&&!document.getElementById('previewPngtuberVideo').hidden`);
    await verifyDemo(await run(`document.getElementById('previewPngtuberVideo').src`),true);
    await action(`document.getElementById('fondoPNGTuber').value='black';await actualizarPreviewPNGTuber();`);
    await action(`holdOnePNGTuber('/api/generar-video-pngtuber');window.oldRenderJob=generarVideoPNGTuber();`);
    await wait(`typeof releaseHeldRequest==='function'`);
    await action(`const blob=await (await fetch('/audios/segmented.mp3')).blob();await videoAudioInput.importar(new File([blob],'nueva.mp3',{type:'audio/mpeg'}));
        releaseHeldRequest();await oldRenderJob;restoreHeldFetch();`);
    assert.equal(await run(`document.getElementById('videoPngtuberResultado').hidden&&document.getElementById('descargarVideoPngtuber').hidden`),true,'La exportación anterior no reaparece tras cambiar de audio');
    await run('generarVideoPNGTuber()');
    verifyFrames(await run(`document.getElementById('videoPngtuberResultado').src`),false,false);
    for(const [name,digest] of sourceHashes)assert.equal(hash(fs.readFileSync(path.join(audioDir,name))),digest);
    assert.equal(hash(fs.readFileSync(path.join(audioDir,'fixture.wav'))),hash(original));
    assert.equal(await run(`audioEditor.audioBuffer===null && mixer.estado.clips.length===0`),true);
    await action(`document.getElementById('videoAudioRemove').click();`);
    assert.equal(await run(`document.getElementById('videoAudioPlayer').hidden`),true);
    assert.equal(await run(`(async()=>{try{await videoAudioInput.ruta();return false;}catch{return true;}})()`),true);
    await action(`document.getElementById('videoAudioSource').value='studio';document.getElementById('videoAudioSource').dispatchEvent(new Event('change'));await cargarYReproducir('/audios/segmented.wav');tabs.irA('video');`);
    assert.ok(await run(`videoAudioInput.ruta()`),'Audio Studio sigue disponible');
    await wait(`!previewEnCurso&&!pendingPreview&&!document.getElementById('previewPngtuberVideo').hidden`);
    await verifyDemo(await run(`document.getElementById('previewPngtuberVideo').src`),false);
    await action(`await cargarYReproducir('/audios/silent.mp3');tabs.irA('video');`);
    await wait(`!previewEnCurso&&!pendingPreview&&!document.getElementById('previewPngtuberVideo').hidden`);
    await verifyDemo(await run(`document.getElementById('previewPngtuberVideo').src`),false);
    // La demo sigue mostrando las tres expresiones incluso sin archivo externo.
    const character=await run(`JSON.stringify([pngtuberIdlePath,pngtuberTalkingPath,pngtuberBlinkPath])`);
    await action(`document.getElementById('videoAudioSource').value='external';document.getElementById('videoAudioSource').dispatchEvent(new Event('change'));`);
    await wait(`!previewEnCurso&&!pendingPreview&&!document.getElementById('previewPngtuberVideo').hidden`);
    await verifyDemo(await run(`document.getElementById('previewPngtuberVideo').src`),false);
    await wait(`document.getElementById('previewPngtuberVideo').readyState>=2`);
    for(const [time,x,color] of [[0.25,14,0],[1.05,46,2],[2.65,32,1]]){
        const frame=await run(`(async()=>{const v=document.getElementById('previewPngtuberVideo');v.pause();
            await new Promise(resolve=>{v.addEventListener('seeked',resolve,{once:true});v.currentTime=${time};});
            const c=document.createElement('canvas');c.width=64;c.height=64;const ctx=c.getContext('2d');ctx.drawImage(v,0,0,64,64);
            return Array.from(ctx.getImageData(${x},32,1,1).data);})()`);
        assert.ok(frame[color]>150,'El reproductor Electron muestra cada expresión de la demostración');
    }
    await action(`const v=document.getElementById('previewPngtuberVideo');v.currentTime=v.duration-0.12;await v.play();`);
    await wait(`document.getElementById('previewPngtuberVideo').currentTime<1&&!document.getElementById('previewPngtuberVideo').paused`);
    assert.match(await run(`document.getElementById('previewPngtuberNota').textContent`),/sin audio y en bucle/);
    assert.equal(await run(`JSON.stringify([pngtuberIdlePath,pngtuberTalkingPath,pngtuberBlinkPath])`),character,'Cambiar fuente no pierde imágenes');
    // Completar otra transición externo -> Studio -> externo, conservando el personaje.
    for(const input of ['segmented.wav','segmented.mp3']){
        const previous=await run(`document.getElementById('previewPngtuberVideo').src`);
        await action(`const blob=await (await fetch('/audios/${input}')).blob();await videoAudioInput.importar(new File([blob],'${input}',{type:'audio/${input.endsWith('mp3')?'mpeg':'wav'}'}));`);
        await wait(`!previewEnCurso&&!pendingPreview&&!document.getElementById('previewPngtuberVideo').hidden`);
        assert.equal(await run(`document.getElementById('previewPngtuberVideo').src`),previous);
        await verifyDemo(await run(`document.getElementById('previewPngtuberVideo').src`),false);
        assert.equal(await run(`JSON.stringify([pngtuberIdlePath,pngtuberTalkingPath,pngtuberBlinkPath])`),character);
        await action(`document.getElementById('videoAudioSource').value='studio';document.getElementById('videoAudioSource').dispatchEvent(new Event('change'));`);
        await wait(`!previewEnCurso&&!pendingPreview&&!document.getElementById('previewPngtuberVideo').hidden`);
        await verifyDemo(await run(`document.getElementById('previewPngtuberVideo').src`),false);
    }
    for(const audioPath of ['/audios/segmented.wav','/audios/no-existe.mp3']){
        const demo=await run(`(async()=>{const r=await fetch('/api/pngtuber/preview',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({audioPath:${JSON.stringify(audioPath)},soloReposo:true,idleImagePath:pngtuberIdlePath,talkingImagePath:pngtuberTalkingPath,blinkImagePath:pngtuberBlinkPath,fondo:'black'})});if(!r.ok)throw Error(await r.text());return r.json();})()`);
        await verifyDemo(await run('window.CONFIG.API_BASE')+demo.url,false);
    }
    console.log('EXTERNAL_AUDIO_ELECTRON_PASS: demo 4s muda y en bucle en ambas fuentes, tres expresiones; exportaciones WAV/MP3 sincronizadas MP4/WebM');
};
