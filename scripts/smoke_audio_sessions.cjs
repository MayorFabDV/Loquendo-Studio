// node scripts/smoke_audio_sessions.cjs
// Procesos Electron separados, mismo perfil/origen de prueba, HTML real y APIs simuladas.
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const frontend = path.resolve(__dirname, '../frontend');

if (process.versions.electron) ejecutarElectron();
else ejecutarCoordinador().catch(error => { console.error(error); process.exitCode = 1; });

async function ejecutarCoordinador() {
    const http = require('node:http');
    const os = require('node:os');
    const { spawn } = require('node:child_process');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'loquendo-sessions-'));
    const samples = 48000 * 2, wav = Buffer.alloc(44 + samples * 2);
    wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
    wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(1,22);
    wav.writeUInt32LE(48000,24); wav.writeUInt32LE(96000,28); wav.writeUInt16LE(2,32); wav.writeUInt16LE(16,34);
    wav.write('data',36); wav.writeUInt32LE(samples*2,40);
    for(let i=0;i<samples;i++) wav.writeInt16LE(Math.round(6000*Math.sin(2*Math.PI*443*i/48000)),44+i*2);
    const files = new Map([['/audios/source.wav',wav],['/audios/music.wav',wav]]);
    const requests = [];
    let uploadCount=0;
    const server = http.createServer(async (req,res) => {
        try {
            const url=new URL(req.url,'http://localhost');
            if(req.method==='POST' || req.method==='PUT') {
                const chunks=[];for await(const chunk of req)chunks.push(chunk);
                const body=Buffer.concat(chunks);
                res.setHeader('Content-Type','application/json');
                if(url.pathname==='/api/upload-audio-editado') {
                    const boundary=/boundary=(.+)$/.exec(req.headers['content-type'])[1];
                    const start=body.indexOf('\r\n\r\n')+4, end=body.lastIndexOf('\r\n--'+boundary);
                    assert.ok(start>=4 && end>start,'multipart válido');
                    const route='/audios/upload-'+(++uploadCount)+'.wav';
                    files.set(route,body.subarray(start,end));requests.push({type:'upload',route});
                    return res.end(JSON.stringify({url:route}));
                }
                const data=body.length?JSON.parse(body.toString()):{};
                requests.push({type:url.pathname,data});
                if(/\/assets$/.test(url.pathname)) {
                    const id=url.pathname.split('/')[3], src=data.src;
                    const route='/media/projects/'+id+'/assets/test.wav';
                    assert.ok(files.has(src),'asset parte del audio recuperado');files.set(route,files.get(src));
                    return res.end(JSON.stringify({asset:'assets/test.wav',url:route}));
                }
                if(url.pathname==='/api/generar-srt') return res.end('{"srtUrl":"/subtitulos/edited.srt"}');
                if(url.pathname==='/api/generar-ass') return res.end('{"assUrl":"/subtitulos/test.ass"}');
                if(url.pathname==='/api/audio/convertir-mp3') return res.end('{"urls":[]}');
                if(url.pathname==='/api/generar-video-pngtuber') return res.end('{"video":"/audios/result.mp4"}');
                if(url.pathname==='/api/audio/apply-ducking') {
                    const source=files.get('/'+data.voiceAudioPath.replace(/^\//,''));
                    assert.ok(source,'Ducking recibe audio recuperado disponible');
                    files.set('/audios/mixed.wav',source);
                    return res.end('{"url":"/audios/mixed.wav"}');
                }
                return res.end('{}');
            }
            if(url.pathname==='/storage') {res.setHeader('Content-Type','text/html');return res.end('<!doctype html><title>Storage test</title>');}
            if(url.pathname==='/') {
                res.setHeader('Content-Type','text/html');
                const instrumentation=`<script>window.sessionErrors=[];addEventListener('error',e=>sessionErrors.push(e.error?.stack||e.message));addEventListener('unhandledrejection',e=>sessionErrors.push(e.reason?.stack||String(e.reason)));</script>`;
                return res.end(fs.readFileSync(path.join(frontend,'index.html'),'utf8').replace('</head>',instrumentation+'</head>'));
            }
            if(files.has(url.pathname)) {
                const bytes=files.get(url.pathname), range=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
                const start=range?Number(range[1]):0, end=range&&range[2]?Math.min(Number(range[2]),bytes.length-1):bytes.length-1;
                res.setHeader('Content-Type','audio/wav');res.setHeader('Accept-Ranges','bytes');res.setHeader('Content-Length',end-start+1);
                if(range){res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${bytes.length}`);}
                return res.end(bytes.subarray(start,end+1));
            }
            if(url.pathname==='/api/audio/peaks'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({duration:2,peaks:Array.from({length:300},(_,i)=>Math.sin(i)*0.2)}));}
            if(url.pathname.startsWith('/api/')) {
                res.setHeader('Content-Type','application/json');
                return res.end(url.pathname==='/api/voces'?'{"voces":[],"total":0}':url.pathname==='/api/sfx/list'?'{"items":[]}':'{}');
            }
            if(url.pathname.endsWith('.srt')) {
                res.setHeader('Content-Type','text/plain');
                return res.end('1\n00:00:00,000 --> 00:00:01,000\n'+(url.pathname.includes('original')?'Original':'Editado')+'\n');
            }
            const file=path.resolve(frontend,'.'+url.pathname);
            if(!file.startsWith(frontend+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}
            const types={'.js':'text/javascript','.css':'text/css','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
            res.setHeader('Content-Type',types[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));
        } catch(error) {res.statusCode=500;res.end(JSON.stringify({error:error.message}));}
    });
    try {
        await new Promise(resolve=>server.listen(0,'localhost',resolve));
        for(const phase of ['storage','create','recover','restored','corrupt']) {
            if(phase==='recover') files.delete('/audios/source.wav'); // Simula limpieza al cerrar, solo en memoria.
            await new Promise((resolve,reject)=>{
                const env={...process.env,SESSION_TEST_URL:'http://localhost:'+server.address().port,
                    SESSION_TEST_PROFILE:path.join(root,'profile'),SESSION_TEST_PHASE:phase};
                delete env.ELECTRON_RUN_AS_NODE;
                const child=spawn(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true});
                const timeout=setTimeout(()=>{child.kill();reject(new Error('Timeout en fase '+phase));},60000);
                child.on('error',error=>{clearTimeout(timeout);reject(error);});
                child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Electron '+phase+' terminó con '+code));});
            });
        }
        const upload=requests.find(r=>r.type==='upload').route;
        for(const route of ['/api/generar-srt','/api/generar-ass','/api/generar-video-pngtuber']) {
            assert.equal(requests.find(r=>r.type===route)?.data.audioPath.replace(/^\//,''),upload.replace(/^\//,''),route+' recibe la edición recuperada');
        }
        const mp3=requests.find(r=>r.type==='/api/audio/convertir-mp3').data;
        assert.equal(mp3.wavPath,upload.replace(/^\//,''));
        assert.notEqual(mp3.originalWavPath,mp3.wavPath,'MP3 recibe original separado');
        assert.equal(requests.find(r=>r.type==='/api/audio/apply-ducking')?.data.voiceAudioPath,upload.replace(/^\//,''));
        console.log('AUDIO_SESSIONS_ELECTRON_PASS: migración v1, atomicidad IDB, reinicios de proceso, original offline, FX, marcadores y salidas');
    } finally {
        server.close();server.closeAllConnections();
        fs.rmSync(root,{recursive:true,force:true});
    }
}

async function ejecutarElectron() {
    const { app, BrowserWindow }=require('electron');
    app.setPath('userData',process.env.SESSION_TEST_PROFILE);
    let win;
    try {
        await app.whenReady();
        const phase=process.env.SESSION_TEST_PHASE;
        win=new BrowserWindow({show:false,width:1200,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
        win.webContents.session.on('will-download',(event,item)=>{event.preventDefault();item.cancel();});
        const evaluate=code=>win.webContents.executeJavaScript(code,true);
        const wait=async expression=>{
            for(let i=0;i<200;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}
            throw new Error('Timeout '+phase+': '+expression);
        };
        const url=process.env.SESSION_TEST_URL;
        if(phase==='storage') {
            await win.loadURL(url+'/storage');
            await evaluate(`(async()=>{
                const blob=await (await fetch('/audios/source.wav')).blob();
                await new Promise((resolve,reject)=>{const r=indexedDB.open('loquendo-audio-sessions',1);
                    r.onupgradeneeded=()=>r.result.createObjectStore('sessions',{keyPath:'source'});
                    r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,t=db.transaction('sessions','readwrite');
                        t.objectStore('sessions').put({source:'/legacy',blob,updatedAt:1});t.oncomplete=()=>{db.close();resolve();};};});
            })()`);
            await evaluate(fs.readFileSync(path.join(frontend,'js/services/audioSessionStore.js'),'utf8'));
            assert.equal(await evaluate(`(async()=> (await audioSessionStore.obtenerActiva()).source)()`),'/legacy');
            await evaluate(`(async()=>{
                const blob=await (await fetch('/audios/source.wav')).blob();
                await audioSessionStore.guardar('/new',{blob,originalBlob:blob,edited:false});
                const original=IDBDatabase.prototype.transaction;
                IDBDatabase.prototype.transaction=function(...args){const tx=original.apply(this,args);if(args[1]==='readwrite')queueMicrotask(()=>tx.abort());return tx;};
                let rechazado=false;try{await audioSessionStore.guardar('/incomplete',{blob});}catch{rechazado=true;}
                IDBDatabase.prototype.transaction=original;
                if(!rechazado)throw Error('Debe rechazar la transacción abortada');
                if((await audioSessionStore.obtenerActiva()).source!=='/new')throw Error('Se perdió el índice activo tras abortar');
                if(!(await audioSessionStore.obtener('/legacy')))throw Error('La migración perdió datos v1');
                await audioSessionStore.eliminar('/new');
                if(await audioSessionStore.obtenerActiva())throw Error('Debe respetar índice vacío');
            })()`);
        } else {
            await win.loadURL(url);
            await wait(`!!window.audioEditorUI && !!window.audioSessionStore`);
            if(phase==='create') {
                assert.equal(await evaluate(`cargarYReproducir('/audios/source.wav','/subtitulos/original.srt')`),true);
                await evaluate(`(async()=>{
                    await audioEditor.aplicarFadeIn(0.4);
                    audioMarkers.setMarkers([{id:'edited',start:0,end:1,text:'Editado'}],{historial:true});
                    audioEditor.setRate(1.2);audioEditor.setFX({eqHigh:3});await audioEditor._guardadoSesionPendiente;
                    const s=await audioSessionStore.obtenerActiva();
                    if(!s.originalBlob || s.originalMarkers[0]?.text!=='Original')throw Error('Falta original/marcadores originales');
                    if(s.markers[0]?.text!=='Editado' || !s.edited)throw Error('Falta edición');
                })()`);
            } else if(phase==='recover') {
                await wait(`audioEditor.audioBuffer && document.getElementById('estadoSesionAudio').textContent==='Sesión recuperada'`);
                assert.equal(await evaluate(`audioEditor._dirty && !voiceAudioRealPath && audioMarkers.getMarkers()[0].text==='Editado'`),true);
                assert.equal(await evaluate(`audioEditor.getEngineState().fx.rate`),1.2);
                assert.equal(await evaluate(`audioEditor.getEngineState().fx.eqHigh`),3);
                await evaluate(`audioMarkers.init();audioMarkers.init();document.getElementById('btnMarkerDividir').click();`);
                assert.equal(await evaluate(`audioMarkers.getMarkers().length`),2,'Un click divide una sola vez aunque init se repita');
                const routes=await evaluate(`Promise.all([audioEditor.asegurarAudioPersistido(),audioEditor.asegurarAudioPersistido()])`);
                assert.ok(routes[0]);assert.equal(routes[0],routes[1]);
                await evaluate(`mixer.init();mixer.agregarVozActual()`);
                await wait(`mixer.estado.clips[0]?.asset`);
                assert.equal(await evaluate(`mixer.estado.clips.length`),1);
                await evaluate(`generarYDescargarSRT()`);await evaluate(`generarYDescargarASS()`);
                await evaluate(`generarVideoPNGTuber()`);await evaluate(`exportarAMp3()`);
                await evaluate(`window.musicaFondoPath='/audios/music.wav';aplicarDucking();`);
                await wait(`audioEditor._baseServidor==='/audios/mixed.wav' && !audioEditor._cargandoEdicion`);
                await evaluate(`audioEditor.restaurarOriginal()`);
                assert.equal(await evaluate(`!audioEditor._sesionEditada && audioEditor.historyStack.length===1 && audioMarkers.getMarkers()[0].text==='Original'`),true);
                await evaluate(`audioEditor._guardadoSesionPendiente`);
            } else if(phase==='restored') {
                await wait(`audioEditor.audioBuffer && document.getElementById('estadoSesionAudio').textContent==='Sesión recuperada'`);
                assert.equal(await evaluate(`!audioEditor._sesionEditada && audioMarkers.getMarkers()[0].text==='Original'`),true);
                // Solo se corrompe un registro dentro del perfil temporal exclusivo de este smoke.
                await evaluate(`audioSessionStore.guardar('/broken',{blob:new Blob(['not audio']),originalBlob:audioEditor._originalBlob})`);
            } else if(phase==='corrupt') {
                await wait(`document.getElementById('estadoSesionAudio').textContent==='No se pudo recuperar la sesión guardada'`);
                assert.equal(await evaluate(`audioEditor.audioBuffer===null`),true);
                assert.equal(await evaluate(`(async()=> (await audioSessionStore.obtenerActiva()).source)()`),'/broken');
            }
            assert.deepEqual(await evaluate(`sessionErrors`),[]);
        }
        console.log('SESSION_PHASE_PASS',phase);
        win.destroy();app.exit(0);
    } catch(error) {
        console.error(error);if(win&&!win.isDestroyed())win.destroy();app.exit(1);
    }
}
