// node scripts/smoke_projects.cjs --maintenance
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
module.exports = async function ({ win, run, action, wait, root }) {
    const dir = path.join(root, 'backend/public/audios');
    const srt = '1\n00:00:00,100 --> 00:00:01,500\nArchivo existente con acentos: canción.\n';
    fs.writeFileSync(path.join(dir, 'existente.srt'), srt);
    fs.writeFileSync(path.join(dir, 'existente.ass'), '[Script Info]\nTitle: Archivo existente\n');
    const originalASS = fs.readFileSync(path.join(dir, 'existente.ass'));
    await action(`localStorage.setItem('loquendo.start_tab','tab-subtitulos');localStorage.setItem('loquendo.subtitle_srt_ia','1');`);
    await new Promise(resolve => { win.webContents.once('did-finish-load', resolve); win.reload(); });
    assert.equal(await run(`document.querySelector('.tab-panel-activo').id`), 'tab-guion');
    assert.equal(await run(`localStorage.getItem('loquendo.start_tab')`), 'tab-subtitulos', 'No se borra la preferencia para una futura reactivación');
    assert.equal(await run(`localStorage.getItem('loquendo.subtitle_srt_ia')`), '1');
    assert.equal(await run(`document.getElementById('chkSRT_IA').disabled && !document.getElementById('chkSRT_IA').checked`), true);
    assert.equal(await run(`document.querySelector('button[data-tab="tab-subtitulos"]').disabled`), true);
    assert.match(await run(`document.getElementById('subtitlesMaintenanceNotice').textContent`), /mantenimiento/);
    assert.equal(await run(`tabs.irA('subtitulos')`), false);
    await action(`document.querySelector('.flow-step[data-tab="tab-subtitulos"]').click();`);
    assert.equal(await run(`document.querySelector('.tab-panel-activo').id`), 'tab-guion');
    // Las funciones públicas tampoco persisten/suben audio ni llaman a generación.
    await action(`window.maintenanceRequests=[];const original=fetch;window.fetch=(url,opts)=>{maintenanceRequests.push(String(url));return original(url,opts);};
        await generarYDescargarSRT();await generarYDescargarASS();`);
    assert.deepEqual(await run(`maintenanceRequests`), []);
    const post = (endpoint, body) => run(`(async()=>{const r=await fetch('${endpoint}',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(${JSON.stringify(body)})});return {status:r.status,data:await r.json()};})()`);
    for (const endpoint of ['/api/generar-srt', '/api/generar-ass']) {
        const result = await post(endpoint, { audioPath: 'audios/fixture.wav' });
        assert.equal(result.status, 503); assert.equal(result.data.code, 'TRANSCRIPTION_DISABLED');
    }
    const plantilla = await post('/api/generar-srt', { audioPath: 'audios/fixture.wav', textoOriginal: 'Texto de plantilla sin transcripción.', metodo: 'plantilla' });
    assert.equal(plantilla.status, 200); assert.equal(plantilla.data.metodo, 'plantilla');
    const ass = await post('/api/generar-ass', { audioPath: 'audios/fixture.wav', srtPath: '/audios/existente.srt' });
    assert.equal(ass.status, 200, JSON.stringify(ass));
    const assContent = fs.readFileSync(path.join(dir, path.basename(ass.data.assUrl)), 'utf8');
    assert.match(assContent, /Dialogue:/); assert.match(assContent, /Archivo existente/); assert.doesNotMatch(assContent, /Sin subtitulos/);
    const assPlantilla = await post('/api/generar-ass', { audioPath: 'audios/fixture.wav', textoOriginal: 'Otra plantilla sin Whisper.', metodo: 'plantilla' });
    assert.equal(assPlantilla.status, 200);
    assert.equal((await post('/api/generar-ass', { audioPath: 'audios/fixture.wav', srtPath: '/audios/ausente.srt' })).status, 400);
    assert.equal((await post('/api/generar-ass', { audioPath: 'audios/fixture.wav', srtPath: '/audios/fixture.wav' })).status, 400);
    await action(`await cargarYReproducir('/audios/fixture.wav');document.getElementById('subtitleFilesInAudio').open=true;
        const files=new DataTransfer();files.items.add(new File([${JSON.stringify(srt)}],'existente.srt',{type:'text/plain'}));
        const input=document.getElementById('audioMarkerFile');input.files=files.files;input.dispatchEvent(new Event('change'));`);
    await wait(`audioMarkers.getMarkers().length===1`);
    assert.match(await run(`audioMarkers.getMarkers()[0].text`), /canción/);
    assert.equal(await run(`document.querySelector('.audio-waveform-main').parentElement.id`), 'audioWaveformDock');
    assert.equal(await run(`document.getElementById('audioMarkerFile').closest('#tab-audio')!==null`), true);
    assert.equal(await run(`document.getElementById('btnMarkerDescargar').disabled`), false);
    await action(`document.getElementById('btnMarkerDescargar').click();`);
    assert.equal(fs.readFileSync(path.join(dir, 'existente.srt'), 'utf8'), srt);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'existente.ass')), originalASS);
    console.log('SUBTITLE_MAINTENANCE_ELECTRON_PASS: navegación y ajustes bloqueados, SRT editable y ASS real sin transcripción');
};
