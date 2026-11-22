// node scripts/smoke_projects.cjs --desktop --music-library
// Main/preload/IPC/Express/FFmpeg reales; solo se simula la elección del diálogo nativo.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
module.exports=async function({win,run,root,electron,phase}){
    const dir=path.join(root,'originales música');fs.mkdirSync(dir,{recursive:true});
    const song=path.join(dir,'Canción café.wav'),relocated=path.join(dir,'Canción localizada.wav');
    const hash=file=>createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const action=code=>run(`(async()=>{${code}})()`);
    const wait=async expr=>{for(let i=0;i<400;i++){if(await run(expr))return;await new Promise(r=>setTimeout(r,25));}throw Error('Timeout: '+expr);};
    let pick=song;
    electron.dialog.showOpenDialog=async()=>pick?{canceled:false,filePaths:[pick]}:{canceled:true,filePaths:[]};
    const rows=()=>run(`(async()=>(await (await fetch('/api/music-library')).json()).items)()`);
    if(phase==='create'){
        fs.copyFileSync(path.join(root,'backend/public/audios/fixture.wav'),song);
        const before=hash(song),filesBefore=fs.readdirSync(path.join(root,'backend/public/audios'));
        assert.equal(await run('subirMusicaFondo()'),true);
        assert.equal(await run(`document.getElementById('backgroundMusicInput').hidden`),true);
        const chosen=(await rows())[0];assert.equal(chosen.saved,false);assert.equal(chosen.path,song);
        assert.deepEqual(fs.readdirSync(path.join(root,'backend/public/audios')),filesBefore,'Seleccionar no copia música');
        assert.equal(await run('subirMusicaFondo()'),true);assert.equal((await rows()).length,1,'No duplica referencias');
        pick=null;assert.equal(await run('subirMusicaFondo()'),false);assert.equal(await run('musicLibrary.referencia()'),chosen.id);
        pick=path.join(dir,'invalido.mp3');fs.writeFileSync(pick,'no es audio');
        assert.equal(await run('subirMusicaFondo()'),false);assert.equal(await run('musicLibrary.referencia()'),chosen.id);
        await run(`cargarYReproducir('/audios/fixture.wav')`);
        for(const yes of [false,true]){
            const job=run('aplicarDucking()');await wait(`document.getElementById('musicSaveDialog').open`);
            assert.equal(await run(`document.getElementById('musicSaveQuestion').textContent`),'¿Quieres guardar esta canción en tu biblioteca para usarla más adelante?');
            await action(`document.getElementById('${yes?'musicSaveYes':'musicSaveNo'}').click();`);
            await job;
            assert.equal((await rows())[0].saved,yes);
            assert.match(await run('voiceAudioRealPath'),/ducked/);
        }
        await run('aplicarDucking()');assert.equal(await run(`document.getElementById('musicSaveDialog').open`),false,'Guardadas no vuelven a preguntar');
        assert.equal(hash(song),before);
        assert.equal(await run('mixer.estado.clips.length'),0);
        fs.writeFileSync(path.join(root,'music-expected.json'),JSON.stringify({id:chosen.id,hash:before}));
    }else{
        const expected=JSON.parse(fs.readFileSync(path.join(root,'music-expected.json'),'utf8'));
        assert.equal((await rows())[0].saved,true);assert.equal((await rows())[0].id,expected.id);
        assert.equal(await run(`musicLibrary.elegir('${expected.id}')`),true);
        await action(`const blob=await (await fetch('/media/music/${expected.id}')).blob();
            const form=new FormData();form.append('audio',new File([blob],'voz.wav',{type:'audio/wav'}));
            const data=await (await fetch('/api/upload-audio-editado',{method:'POST',body:form})).json();
            if(!await cargarYReproducir(data.url))throw Error('No se cargó la voz de prueba');`);
        await run('aplicarDucking()');assert.equal(await run(`document.getElementById('musicSaveDialog').open`),false);
        assert.match(await run('voiceAudioRealPath'),/ducked/);
        fs.renameSync(song,relocated);
        await run('musicLibrary.refrescar()');assert.equal((await rows())[0].missing,true);
        assert.match(await run(`document.getElementById('musicSaved').textContent`),/Localizar archivo/);
        assert.equal(await run(`musicLibrary.elegir('${expected.id}')`),false);
        assert.equal(await run('musicLibrary.prepararDucking()'),false,'Faltante bloquea mezcla');
        pick=relocated;assert.equal(await run(`musicLibrary.elegir('${expected.id}',true)`),true);
        assert.equal((await rows())[0].id,expected.id);assert.equal((await rows())[0].saved,true);
        const anterior=await run('voiceAudioRealPath');await run('aplicarDucking()');
        assert.notEqual(await run('voiceAudioRealPath'),anterior,'La fuente localizada se usa en una mezcla real');
        await action(`document.querySelector('#musicSaved button:last-child').click();`);
        await wait(`!document.querySelector('#musicSaved button')`);
        assert.equal((await rows())[0].saved,false);assert.ok(fs.existsSync(relocated));
        await action(`document.querySelector('#musicRecent button:last-child').click();`);
        await wait(`!document.querySelector('#musicRecent button')`);
        assert.deepEqual(await rows(),[]);assert.equal(hash(relocated),expected.hash);
    }
    console.log(`MUSIC_LIBRARY_DESKTOP_PASS ${phase}: referencias sin copias, decisiones ducking, reinicio, faltantes y originales intactos`);
};
