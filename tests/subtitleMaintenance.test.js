'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { EventEmitter } = require('node:events');
const policy = require('../backend/services/featurePolicy');

test('mantenimiento bloquea transcripción directa y solicitud IA en AudioService incluso con binarios presentes', async t => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loquendo-maintenance-'));
    t.after(() => fs.rmSync(root, { recursive: true, force: true }));
    const bin = path.join(root, 'bin'); fs.mkdirSync(bin);
    for (const file of ['generar_voz.exe', 'whisper-cli.exe', 'ggml-small.bin', 'generar_srt.py', 'generar_ass.py']) fs.writeFileSync(path.join(bin, file), 'fixture');
    const procesos = [];
    const childProcess = {
        spawn(file, args) {
            procesos.push({ file, args });
            assert.equal(path.basename(file), 'generar_voz.exe', 'Solo se permite el proceso de síntesis en esta solicitud');
            const child = new EventEmitter(); child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
            queueMicrotask(() => {
                fs.writeFileSync(args[2], Buffer.alloc(3000));
                child.stdout.emit('data', Buffer.from('EXITO')); child.emit('close', 0);
            });
            return child;
        },
        spawnSync() { throw new Error('No se debe iniciar otro proceso'); }
    };
    const module = { exports: {} };
    const script = fs.readFileSync(path.join(__dirname, '../backend/services/audioService.js'), 'utf8');
    vm.runInNewContext(script, { module, require: name => name === 'child_process' ? childProcess : name === './featurePolicy' ? policy : require(name), console, Buffer, queueMicrotask });
    const service = new module.exports(path.join(bin, 'generar_srt.py'), root, path.join(bin, 'ffmpeg.exe'), '');
    assert.equal(policy.transcription, false);
    await assert.rejects(service.generarSRTWhisperCpp('/audio.wav', '/salida.srt'), /mantenimiento/);
    assert.equal(procesos.length, 0);
    const result = await service.procesar('Texto de prueba', 'Jorge', true, { aplicarConOpciones: s => s });
    assert.equal(procesos.length, 1);
    assert.equal(result.srt, null); assert.equal(result.ass, null);
    assert.ok(fs.existsSync(path.join(root, path.basename(result.url))));
});
