'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const AudioService=require('../backend/services/audioService');

test('sin exe ni Python embebido no se intenta sintetizar con el Python del sistema',async t=>{
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-runtime-'));
    t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
    const service=new AudioService(path.join(root,'generar_srt.py'),root,path.join(root,'ffmpeg.exe'),'');
    service.vozExe32=path.join(root,'missing.exe');
    await assert.rejects(service.procesar('Prueba','Jorge',false,{aplicarConOpciones:s=>s}),/Python embebido de 32 bits no disponible/);
    assert.deepEqual(fs.readdirSync(root),[],'No se creó una salida parcial');
});
