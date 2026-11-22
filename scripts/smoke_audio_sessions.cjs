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
            if(url.pathname==='/api/features.js') {
                // El smoke base conserva cobertura de los handlers legacy con un backend simulado habilitado.
                // La variante recovery-ux usa la política real de mantenimiento.
                const flags={...require('../backend/services/featurePolicy')};
                if(!process.argv.includes('--recovery-ux')){flags.subtitlesUI=true;flags.transcription=true;}
                res.setHeader('Content-Type','application/javascript');return res.end(`window.appFeatures=Object.freeze(${JSON.stringify(flags)});`);
            }
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
        const phases=process.argv.includes('--recovery-ux') ? ['storage','ux-empty','ux-seed','ux-stay','ux-accept','ux-later','ux-corrupt']
            : ['storage','create','recover','restored','corrupt'];
        for(const phase of phases) {
            if(phase==='recover'||phase==='ux-stay') files.delete('/audios/source.wav'); // Simula limpieza al cerrar, solo en memoria.
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
        if(process.argv.includes('--recovery-ux')) {
            console.log('RECOVERY_UX_ELECTRON_PASS: decisiones, snapshots separados, errores de guardado y reinicios reales');
            return;
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
        const evaluate=async code=>{
            try { return await win.webContents.executeJavaScript(code,true); }
            catch(error) { throw new Error(`${phase}: ${code}\n${error.message}`); }
        };
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
        } else if(phase.startsWith('ux-')) {
            await win.loadURL(url);
            await evaluate(`sessionRecovery.preparar()`);
            const pending=type=>`audioSessionStore.leerRecuperacion('recovery.pending.${type}')`;
            const stay=async()=>{
                await wait(`document.getElementById('dialogRecuperacion').open`);
                await evaluate(`document.getElementById('btnPermanecerRecuperacion').click()`);
            };
            const decide=async(type,yes=true,antesDeDecidir=null)=>{
                const job=evaluate(`sessionRecovery.recuperar('${type}')`);
                try { await wait(`document.getElementById('dialogRecuperacion').open`); }
                catch (error) { throw new Error(`${error.message}; ${await evaluate(`JSON.stringify({voiceSaved:audioEditor.estaSesionGuardada(),mixerSaved:MixerApp.project.estaGuardado(),errors:sessionErrors})`)}; result=${await job}`); }
                assert.equal(await evaluate(`document.getElementById('btnAceptarRecuperacion').textContent`),'Guardar y recuperar');
                if (antesDeDecidir) await antesDeDecidir();
                await evaluate(`document.getElementById('${yes?'btnAceptarRecuperacion':'btnPermanecerRecuperacion'}').click()`);
                return job;
            };
            if(phase==='ux-empty') {
                await evaluate(`sessionRecovery.iniciar()`);
                assert.equal(await evaluate(`document.getElementById('dialogRecuperacion').open`),false);
                assert.equal(await evaluate(`document.querySelector('.tab-panel-activo').id`),'tab-guion');
            } else if(phase==='ux-seed') {
                await evaluate(`(async()=>{
                    await cargarYReproducir('/audios/source.wav','/subtitulos/original.srt');
                    await audioEditor.aplicarFadeIn(0.4);
                    audioMarkers.setMarkers([{id:'v',start:0,end:1,text:'Voz anterior'}],{historial:true});
                    audioEditor.setFX({eqHigh:3});await audioEditor._guardadoSesionPendiente;
                    const datos={version:2,projectId:'p-ux-old',nombre:'Mezcla anterior',zoomPx:100,
                        tracks:[{id:'voz',gainDb:-3,pan:0.2}],master:{gainDb:-1},clips:[
                        {id:'old-voice',trackId:'voz',src:'/audios/source.wav',start:1.3,in:0.2,out:1.4,duration:2,pan:0.3,fadeIn:0.1,effects:{eq:{mid:2}},automation:[{t:0.2,gain:0.7},{t:1.4,gain:0.5}]},
                        {id:'old-music',trackId:'musica',src:'/audios/music.wav',start:0.5,in:0,out:2,duration:2}]};
                    MixerApp.store.aplicarEstado(MixerApp.store.normalizarEstado(datos));await MixerApp.store.guardarLocalAhora();
                })()`);
            } else if(phase==='ux-stay') {
                const raw=await evaluate(`localStorage.getItem('loquendo.mezcla.v2')`);
                assert.equal(await evaluate(`document.querySelector('.tab-panel-activo').id`),'tab-guion');
                await wait(`document.getElementById('dialogRecuperacion').open`);
                assert.equal(await evaluate(`document.getElementById('recuperacionPregunta').textContent`),'Encontramos una sesión anterior del mezclador. ¿Quieres recuperarla y abrir el mezclador?');
                assert.equal(await evaluate(`document.getElementById('btnAceptarRecuperacion').textContent`),'Recuperar y abrir el mezclador');
                const original=await evaluate(`(async()=>JSON.stringify((await ${pending('mixer')}).datos))()`);
                await stay();
                assert.equal(await evaluate(`document.querySelector('.tab-panel-activo').id`),'tab-guion');
                assert.equal(await evaluate(`localStorage.getItem('loquendo.mezcla.v2')`),raw);
                await evaluate(`mixer.init();MixerApp.store.guardarLocalAhora()`);
                assert.equal(await evaluate(`mixer.estado.clips.length`),0);
                assert.equal(await evaluate(`(async()=>JSON.stringify((await ${pending('mixer')}).datos))()`),original);
                assert.equal(await evaluate(`sessionRecovery.tienePendiente('voice')`),true);
                await evaluate(`sessionRecovery.iniciar()`);
                assert.equal(await evaluate(`document.getElementById('dialogRecuperacion').open`),false);
                await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});
                await evaluate(`sessionRecovery.preparar();`);await evaluate(`sessionRecovery.iniciar()`);
                assert.equal(await evaluate(`document.getElementById('dialogRecuperacion').open`),false,'Reload no duplica la pregunta en el mismo arranque');
                assert.equal(await evaluate(`(async()=>JSON.stringify((await ${pending('mixer')}).datos))()`),original);
            } else if(phase==='ux-accept') {
                await wait(`document.getElementById('dialogRecuperacion').open`);
                await evaluate(`document.getElementById('btnAceptarRecuperacion').click()`);
                await wait(`!sessionRecovery.tienePendiente('mixer')`);
                assert.equal(await evaluate(`document.querySelector('.tab-panel-activo').id`),'tab-audio');
                assert.equal(await evaluate(`document.querySelector('[data-audio-subtab="mezclador"]').getAttribute('aria-selected')`),'true');
                assert.equal(await evaluate(`audioEditor.audioBuffer===null`),true,'No se recuperó la voz al aceptar solo la mezcla');
                assert.equal(await evaluate(`sessionRecovery.tienePendiente('voice')`),true);
                const clips=await evaluate(`mixer.app.store.aProyecto().clips`);
                assert.equal(clips.length,2);assert.equal(clips[0].in,0.2);assert.equal(clips[0].out,1.4);assert.equal(clips[0].start,1.3);
                assert.deepEqual(clips[0].effects,{eq:{mid:2}});assert.equal(clips[0].src,'/audios/source.wav');
                await wait(`document.getElementById('mezcladorPistas').textContent.includes('Medios no disponibles')`);
                assert.equal(await evaluate(`document.querySelector('.mezclador-alpha').textContent`),'Alpha');
                assert.ok(await evaluate(`document.querySelector('.mezclador-alpha').getBoundingClientRect().width>0`));
            } else if(phase==='ux-later') {
                await stay();
                const mixerBefore=await evaluate(`(async()=>JSON.stringify((await ${pending('mixer')}).datos))()`);
                await evaluate(`cargarYReproducir('/audios/music.wav')`);
                // Abortar transacciones reales de voz para provocar el fallo de guardado.
                await evaluate(`window.transactionOriginal=IDBDatabase.prototype.transaction;
                    IDBDatabase.prototype.transaction=function(...args){const tx=transactionOriginal.apply(this,args);
                         if(args[1]==='readwrite'&&Array.from(args[0]).includes('sessions'))queueMicrotask(()=>tx.abort());return tx;};void 0;`);
                await evaluate(`(async()=>{await audioEditor.aplicarFadeOut(0.2);await audioEditor._guardadoSesionPendiente;})()`);
                const voiceBefore=await evaluate(`audioEditor._fuenteOriginal`),rev=await evaluate(`audioEditor._revisionAudio`);
                assert.equal(await decide('voice',false),false);
                assert.equal(await decide('voice',true),false);
                assert.equal(await evaluate(`audioEditor._fuenteOriginal`),voiceBefore);assert.equal(await evaluate(`audioEditor._revisionAudio`),rev);
                assert.equal(await evaluate(`sessionRecovery.tienePendiente('voice')`),true);
                assert.equal(await decide('voice',true,()=>evaluate(`IDBDatabase.prototype.transaction=transactionOriginal;void 0;`)),true);
                assert.equal(await evaluate(`audioMarkers.getMarkers()[0].text`),'Voz anterior');
                assert.equal(await evaluate(`(async()=>JSON.stringify((await ${pending('mixer')}).datos))()`),mixerBefore);
                assert.ok(await evaluate(`(async()=>(await audioSessionStore.listarRecuperaciones()).some(r=>r.key.startsWith('recovery.saved.voice.')))()`));
                await evaluate(`audioEditorUI.setMode('avanzado');audioEditorUI.setSubtab('mezclador');
                    mixer.estado.projectId='p-ux-new';MixerApp.store.agregarClip('musica','/audios/music.wav',{id:'new-work',duration:2,out:2});mixer.app.timeline.rebuild();`);
                await evaluate(`mixer.app.media.persistirAssets()`);await wait(`mixer.app.timeline.estaListo()`);
                await evaluate(`MixerApp.project.guardarEnEquipo(false)`); // Terminar guardados previos antes de inyectar el fallo.
                await evaluate(`window.fetchOriginal=fetch;window.fetch=(url,opts)=>opts?.method==='PUT'&&String(url).includes('/api/proyectos/')
                    ?Promise.resolve(new Response('{"error":"fallo de guardado simulado"}',{status:503,headers:{'Content-Type':'application/json'}})):fetchOriginal(url,opts);
                    MixerApp.store.moverClip('new-work',5);`);
                const newWork=await evaluate(`JSON.stringify(mixer.app.store.aProyecto())`);
                assert.equal(await decide('mixer',false),false);
                assert.equal(await decide('mixer',true),false);
                assert.equal(await evaluate(`JSON.stringify(mixer.app.store.aProyecto())`),newWork);
                assert.equal(await evaluate(`(async()=>JSON.stringify((await ${pending('mixer')}).datos))()`),mixerBefore);
                assert.equal(await decide('mixer',true,()=>evaluate(`window.fetch=fetchOriginal;void 0;`)),true);
                assert.equal(await evaluate(`mixer.estado.clips[0].id`),'old-voice');
                assert.equal(await evaluate(`audioMarkers.getMarkers()[0].text`),'Voz anterior');
                assert.ok(await evaluate(`(async()=>(await audioSessionStore.listarRecuperaciones()).some(r=>r.key.startsWith('recovery.saved.mixer.')))()`));
                await evaluate(`audioSessionStore.guardar('/broken',{blob:new Blob(['not audio'])})`);
            } else if(phase==='ux-corrupt') {
                if(await evaluate(`sessionRecovery.tienePendiente('mixer')`))await stay();
                assert.equal(await evaluate(`sessionRecovery.tienePendiente('voice')`),false);
                assert.equal(await evaluate(`audioEditor.audioBuffer===null`),true);
                assert.equal(await evaluate(`(async()=>(await audioSessionStore.obtenerActiva()).source)()`),'/broken');
                assert.ok(await evaluate(`(async()=>(await audioSessionStore.listarRecuperaciones()).filter(r=>r.key.startsWith('recovery.saved.')).length>=2)()`));
            }
            assert.deepEqual(await evaluate(`sessionErrors`),[]);
        } else {
            await win.loadURL(url);
            await wait(`!!window.audioEditorUI && !!window.audioSessionStore`);
            await evaluate(`sessionRecovery.preparar()`);
            if (await evaluate(`sessionRecovery.tienePendiente('mixer')`)) {
                await wait(`document.getElementById('dialogRecuperacion').open`);
                await evaluate(`document.getElementById('btnPermanecerRecuperacion').click()`);
            }
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
                assert.equal(await evaluate(`sessionRecovery.recuperar('voice')`),true);
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
                assert.equal(await evaluate(`sessionRecovery.recuperar('voice')`),true);
                await wait(`audioEditor.audioBuffer && document.getElementById('estadoSesionAudio').textContent==='Sesión recuperada'`);
                assert.equal(await evaluate(`!audioEditor._sesionEditada && audioMarkers.getMarkers()[0].text==='Original'`),true);
                // Solo se corrompe un registro dentro del perfil temporal exclusivo de este smoke.
                await evaluate(`audioSessionStore.guardar('/broken',{blob:new Blob(['not audio']),originalBlob:audioEditor._originalBlob})`);
            } else if(phase==='corrupt') {
                assert.equal(await evaluate(`sessionRecovery.tienePendiente('voice')`),false);
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
