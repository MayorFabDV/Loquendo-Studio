// Ejecutar: node scripts/smoke_projects.cjs --external-audio
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
module.exports=async function({run,action,wait,root}){
    const audioDir=path.join(root,'backend/public/audios'),ffmpeg=path.join(root,'backend/bin/ffmpeg.exe');
    const native=args=>{const p=spawnSync(ffmpeg,['-v','error',...args],{windowsHide:true});assert.equal(p.status,0,p.stderr.toString());};
    native(['-i',path.join(audioDir,'fixture.wav'),path.join(audioDir,'fixture.mp3')]);
    native(['-f','lavfi','-i','anullsrc=r=48000:cl=mono','-t','1',path.join(audioDir,'silent.wav')]);
    const original=fs.readFileSync(path.join(audioDir,'fixture.wav'));
    const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
    await action(`tabs.irA('video');document.getElementById('fondoPNGTuber').value='black';
        window.fixtureBlob=await (await fetch('/audios/fixture.wav')).blob();
        if(!await videoAudioInput.importar(new File([fixtureBlob],'voz externa.wav',{type:'audio/wav'})))throw Error('Importación WAV');
        for(const [type,color] of [['idle','red'],['talking','blue'],['blink','lime']]){
            const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
            const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(8,8,48,48);
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
    assert.equal(await run(`videoAudioInput.importar(new File(['broken'],'invalido.mp3',{type:'audio/mpeg'}))`),false);
    assert.equal(await run(`videoAudioInput.ruta()`),chosen,'Fallos conservan selección anterior');
    for(const [input,fondo] of [['fixture.wav','black'],['fixture.mp3','transparent'],['silent.wav','black'],['silent.wav','transparent']]){
        await action(`const blob=await (await fetch('/audios/${input}')).blob();
            if(!await videoAudioInput.importar(new File([blob],'${input}',{type:'audio/${input.endsWith('mp3')?'mpeg':'wav'}'})))throw Error('Importación');
            document.getElementById('fondoPNGTuber').value='${fondo}';await actualizarPreviewPNGTuber();await generarVideoPNGTuber();`);
        const url=await run(`new URL(document.getElementById('videoPngtuberResultado').src).pathname`);
        assert.ok(url.endsWith(fondo==='transparent'?'.webm':'.mp4'));
        const result=path.join(root,'backend/public',url.replace(/^\//,''));
        const probe=spawnSync(path.join(root,'backend/bin/ffprobe.exe'),['-v','error','-show_streams','-show_format','-of','json',result],{encoding:'utf8',windowsHide:true});
        assert.equal(probe.status,0,probe.stderr);const info=JSON.parse(probe.stdout);
        assert.deepEqual(info.streams.map(s=>s.codec_type).sort(),['audio','video']);
        assert.ok(Number(info.format.duration)>0.9&&Number(info.format.duration)<2.3);
    }
    assert.equal(hash(fs.readFileSync(path.join(audioDir,'fixture.wav'))),hash(original));
    assert.equal(await run(`audioEditor.audioBuffer===null && mixer.estado.clips.length===0`),true);
    await action(`document.getElementById('videoAudioRemove').click();`);
    assert.equal(await run(`document.getElementById('videoAudioPlayer').hidden`),true);
    assert.equal(await run(`(async()=>{try{await videoAudioInput.ruta();return false;}catch{return true;}})()`),true);
    await action(`document.getElementById('videoAudioSource').value='studio';await cargarYReproducir('/audios/fixture.wav');`);
    assert.ok(await run(`videoAudioInput.ruta()`),'Audio Studio sigue disponible');
    console.log('EXTERNAL_AUDIO_ELECTRON_PASS: WAV/MP3, reproducción, inválido sin reemplazo, silencio, MP4/WebM reales y Studio');
};
