// node scripts/smoke_projects.cjs
// --desktop: main/preload reales, puerto ocupado, IPC y cierre de Electron.
// --sapi: voces instaladas + Python/binario x86 reales, UI de voz y PNGTuber.
// Express/server.js y Electron reales en un sandbox; ningún dato del usuario se modifica.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..');
if(process.versions.electron) process.env.PROJECT_TEST_DESKTOP==='1' ? desktop() : renderer();
else coordinator().catch(error=>{console.error(error);process.exitCode=1;});

async function coordinator(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-project-smoke-'));
    const nativeVoice=process.argv.includes('--sapi'),extraLinks=[];
    let server;
    try {
        for(const dir of ['backend/bin','backend/db','backend/public/audios','backend/public/pngtuber','frontend'])fs.mkdirSync(path.join(root,dir),{recursive:true});
        fs.symlinkSync(path.join(repo,'node_modules'),path.join(root,'node_modules'),'junction');
        fs.symlinkSync(path.join(repo,'backend/services'),path.join(root,'backend/services'),'junction');
        for(const file of ['server.js','package.json','main-electron.js','preload.js'])fs.copyFileSync(path.join(repo,file),path.join(root,file));
        for(const file of ['ffmpeg.exe','ffprobe.exe'])fs.copyFileSync(path.join(repo,'backend/bin',file),path.join(root,'backend/bin',file));
        if(nativeVoice){
            fs.mkdirSync(path.join(root,'backend/modules'),{recursive:true});
            for(const file of ['generar_voz.py','generar_srt.py','generar_ass.py','listar_voces.py'])fs.copyFileSync(path.join(repo,'backend/modules',file),path.join(root,'backend/modules',file));
            fs.symlinkSync(path.join(repo,'backend/python'),path.join(root,'backend/python'),'junction');extraLinks.push('backend/python');
            for(const e of fs.readdirSync(path.join(repo,'backend/bin'),{withFileTypes:true})){
                if(e.isDirectory()&&!['jre','languagetool'].includes(e.name.toLowerCase())){
                    const rel='backend/bin/'+e.name;fs.symlinkSync(path.join(repo,rel),path.join(root,rel),'junction');extraLinks.push(rel);
                }else if(e.isFile()&&(e.name==='generar_voz.exe'||/\.(dll|pyd)$/i.test(e.name)))fs.copyFileSync(path.join(repo,'backend/bin',e.name),path.join(root,'backend/bin',e.name));
            }
        }
        const instrumentation=`<script>window.projectErrors=[];addEventListener('error',e=>projectErrors.push(e.error?.stack||e.message));addEventListener('unhandledrejection',e=>projectErrors.push(e.reason?.stack||String(e.reason)));
            const nativeFetch=fetch;window.fetch=(url,options)=>${!nativeVoice}&&String(url).includes('/api/voces')?Promise.resolve(new Response('{"voces":[],"total":0}',{headers:{'Content-Type':'application/json'}})):nativeFetch(url,options);</script>`;
        for(const entry of fs.readdirSync(path.join(repo,'frontend'),{withFileTypes:true})){
            const src=path.join(repo,'frontend',entry.name),dest=path.join(root,'frontend',entry.name);
            if(entry.name==='index.html')fs.writeFileSync(dest,fs.readFileSync(src,'utf8').replace('</head>',instrumentation+'</head>'));
            else if(entry.isDirectory())fs.symlinkSync(src,dest,'junction');else fs.copyFileSync(src,dest);
        }
        const samples=48000*2,wav=Buffer.alloc(44+samples*2);
        wav.write('RIFF');wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);
        wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(48000,24);wav.writeUInt32LE(96000,28);
        wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(samples*2,40);
        for(let i=0;i<samples;i++)wav.writeInt16LE(Math.round(5000*Math.sin(2*Math.PI*441*i/48000)),44+i*2);
        fs.writeFileSync(path.join(root,'backend/public/audios/fixture.wav'),wav);
        if(process.argv.includes('--desktop')){await desktopCoordinator(root);return;}
        const net=require('node:net'),probe=net.createServer();
        await new Promise(resolve=>probe.listen(0,'localhost',resolve));const port=probe.address().port;
        await new Promise(resolve=>probe.close(resolve));
        const env={...process.env,PORT:String(port),NODE_ENV:'test',LOQUENDO_NO_AUTOSTART:'0',LOQUENDO_DATA_DIR:path.join(root,'data'),PYTHONDONTWRITEBYTECODE:'1'};
        server=spawn(process.execPath,['server.js'],{cwd:root,env,windowsHide:true});
        let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
        const bound=await new Promise((resolve,reject)=>{
            const start=Date.now();const poll=()=>{const m=output.match(/Servidor escuchando en: http:\/\/localhost:(\d+)/);
                if(m)return resolve(Number(m[1]));if(server.exitCode!==null)return reject(new Error(output));
                if(Date.now()-start>30000)return reject(new Error('Timeout de Express: '+output));setTimeout(poll,50);};poll();
        });
        await new Promise((resolve,reject)=>{
            const childEnv={...process.env,PROJECT_TEST_URL:'http://localhost:'+bound,PROJECT_TEST_ROOT:root,PROJECT_TEST_SAPI:nativeVoice?'1':'0',PROJECT_TEST_EXTERNAL:process.argv.includes('--external-audio')?'1':'0'};delete childEnv.ELECTRON_RUN_AS_NODE;
            const child=spawn(require('electron'),[__filename],{env:childEnv,stdio:'inherit',windowsHide:true});
            const timeout=setTimeout(()=>{child.kill();reject(new Error('Timeout de Electron'));},120000);
            child.on('error',error=>{clearTimeout(timeout);reject(error);});
            child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Electron terminó con '+code+'\n'+output.slice(-5000)));});
        });
        console.log(process.argv.includes('--external-audio') ? 'EXTERNAL_AUDIO_REAL_SERVER_PASS: importación, preview y exportación desde Electron'
            : nativeVoice ? 'SAPI_HTTP_ELECTRON_PASS: generación de voz, calidad, edición, persistencia y mezclador con APIs reales'
            : 'PROJECTS_REAL_SERVER_PASS: guardar, catálogo, portable, relink, copia recuperable y render real');
    } finally {
        if(server&&server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited;}
        // El sandbox contiene junctions de solo lectura lógica: retirarlas antes de limpiar el directorio propio.
        for(const rel of ['node_modules','backend/services',...extraLinks,...fs.readdirSync(path.join(repo,'frontend'),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>'frontend/'+e.name)]){
            const file=path.join(root,rel);if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink()){
                try{fs.unlinkSync(file);}catch(error){if(!['EPERM','EISDIR'].includes(error.code))throw error;fs.rmdirSync(file);}
            }
        }
        fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    }
}

async function desktopCoordinator(root){
    const http=require('node:http');
    const blocker=http.createServer((req,res)=>{res.setHeader('Content-Type','application/json');res.end('{"status":"otro-servidor"}');});
    await new Promise(resolve=>blocker.listen(0,'localhost',resolve));
    try {
        const env={...process.env,PROJECT_TEST_DESKTOP:'1',PROJECT_TEST_ROOT:root,NODE_ENV:'test',
            LOQUENDO_NO_AUTOSTART:'0',LOQUENDO_DATA_DIR:path.join(root,'data'),PORT:String(blocker.address().port)};
        delete env.ELECTRON_RUN_AS_NODE;
        for (const phase of process.argv.includes('--music-library') ? ['create','restart'] : ['default']) await new Promise((resolve,reject)=>{
            env.PROJECT_TEST_MUSIC = process.argv.includes('--music-library') ? phase : '';
            const child=spawn(require('electron'),[__filename],{env,stdio:'inherit',windowsHide:true});
            const timeout=setTimeout(()=>{child.kill();reject(new Error('Timeout desktop'));},60000);
            child.on('error',error=>{clearTimeout(timeout);reject(error);});
            child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Desktop terminó con '+code));});
        });
    } finally {blocker.close();blocker.closeAllConnections();}
}

async function desktop(){
    const electron=require('electron'),{app,BrowserWindow}=electron;
    const root=process.env.PROJECT_TEST_ROOT;app.setPath('userData',path.join(root,'desktop-profile'));
    const external=[],startupErrors=[];let verified=false;
    electron.shell.openExternal=async url=>{external.push(url);};
    electron.dialog.showErrorBox=(title,message)=>startupErrors.push(title+': '+message);
    app.on('browser-window-created',(event,win)=>win.hide());
    const persistent=path.join(root,'data/projects/p-keep/assets/keep.wav');
    fs.mkdirSync(path.dirname(persistent),{recursive:true});fs.writeFileSync(persistent,'fixture persistente');
    app.on('will-quit',()=>{
        try {
            assert.equal(verified,true,'Debe verificarse el inicio antes del cierre');
            assert.equal(fs.existsSync(path.join(root,'backend/public/audios/fixture.wav')),false,'Se esperó la limpieza temporal');
            assert.equal(fs.readFileSync(persistent,'utf8'),'fixture persistente','Los proyectos no se limpian al salir');
            console.log('DESKTOP_REAL_PASS: puerto ocupado, preload, IPC, navegación, diccionarios y cierre con limpieza');
            // Dejar terminar el quit real: el coordinador exige también exit code 0,
            // no basta con que estas aserciones se hayan completado.
        } catch(error){console.error(error);app.exit(1);}
    });
    try {
        require(path.join(root,'main-electron.js'));
        await app.whenReady();
        let win;
        for(let i=0;i<200;i++){
            win=BrowserWindow.getAllWindows()[0];
            if(win&&!win.webContents.isLoading()&&win.webContents.getURL().startsWith('http://localhost:'))break;
            await new Promise(resolve=>setTimeout(resolve,50));
        }
        assert.ok(win,'Debe crearse la ventana principal');
        assert.deepEqual(startupErrors,[]);
        const port=Number(new URL(win.webContents.getURL()).port);
        assert.ok(port>Number(process.env.PORT),'Se usa el puerto siguiente, no el servicio ajeno');
        const run=code=>win.webContents.executeJavaScript(code,true);
        assert.equal(await run(`typeof electronAPI.openExternal`),'function');
        assert.equal(await run(`typeof require`),'undefined');
        assert.equal(await run(`(async()=> (await fetch('/api/jergas')).status)()`),200);
        await run(`(async()=>{
            const key='café+prueba';
            const posted=await fetch('/api/jergas',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({original:key,reemplazo:'corrección'})});
            if(!posted.ok)throw Error('No se guardó la entrada de prueba');
            const entries=await (await fetch('/api/jergas')).json();if(entries[key]!=='corrección')throw Error('Se perdió el texto Unicode');
            const removed=await fetch('/api/jergas/'+encodeURIComponent(key),{method:'DELETE'});if(!removed.ok)throw Error('No se eliminó la entrada de prueba');
            const after=await (await fetch('/api/jergas')).json();if(key in after)throw Error('La entrada sigue presente');
        })()`);
        assert.equal(await run(`(async()=> (await (await fetch('/api/health')).json()).puerto)()`),port);
        await run(`electronAPI.openExternal('https://example.invalid/ipc');electronAPI.openExternal('javascript:alert(1)');window.open('https://example.invalid/window','_blank');`);
        for(let i=0;i<40&&external.length<2;i++)await new Promise(resolve=>setTimeout(resolve,25));
        assert.deepEqual(external.sort(),['https://example.invalid/ipc','https://example.invalid/window'].sort());
        assert.equal(BrowserWindow.getAllWindows().length,1,'Los enlaces no crean ventanas Electron');
        await run(`location.href='https://example.invalid/navigation'`);
        for(let i=0;i<40&&!external.includes('https://example.invalid/navigation');i++)await new Promise(resolve=>setTimeout(resolve,25));
        assert.ok(external.includes('https://example.invalid/navigation'));
        assert.equal(new URL(win.webContents.getURL()).port,String(port));
        if (process.env.PROJECT_TEST_MUSIC) await require('./smoke_music_library.cjs')({win,run,root,electron,phase:process.env.PROJECT_TEST_MUSIC});
        assert.deepEqual(await run('projectErrors'),[]);
        verified=true;win.close();
    } catch(error){console.error(error);app.exit(1);}
}

async function renderer(){
    const {app,BrowserWindow}=require('electron');
    const root=process.env.PROJECT_TEST_ROOT;app.setPath('userData',path.join(root,'profile'));
    let win;
    try {
        await app.whenReady();win=new BrowserWindow({show:false,width:1200,height:900,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
        win.webContents.session.on('will-download',(event,item)=>{event.preventDefault();item.cancel();});
        await win.loadURL(process.env.PROJECT_TEST_URL);
        const run=code=>win.webContents.executeJavaScript(code,true);
        const action=code=>run(`(async()=>{${code}})()`);
        const wait=async expr=>{for(let i=0;i<400;i++){if(await run(expr))return;await new Promise(r=>setTimeout(r,50));}throw new Error('Timeout '+expr+' '+await run('JSON.stringify(projectErrors)'));};
        if(process.env.PROJECT_TEST_EXTERNAL==='1'){
            await require('./smoke_external_audio.cjs')({run,action,wait,root});
            assert.deepEqual(await run('projectErrors'),[]);
            win.destroy();app.exit(0);return;
        }
        if(process.env.PROJECT_TEST_SAPI==='1'){
            await wait(`Array.from(document.getElementById('vozSeleccionada').options).some(o=>o.value==='Jorge')`);
            await action(`document.getElementById('vozSeleccionada').value='Jorge';document.getElementById('resultado').value='Prueba de voz generada desde Electron.';
                document.getElementById('calidadSeleccionada').value='16k';document.getElementById('chkSRT_IA').checked=false;await generarAudio();`);
            await wait(`audioEditor.audioBuffer && !audioEditor._cargandoEdicion`);
            const url=await run('voiceAudioRealPath');
            const file=path.join(root,'backend/public',url.replace(/^\//,''));
            const info=spawnSync(path.join(root,'backend/bin/ffprobe.exe'),['-v','error','-show_entries','stream=sample_rate,channels','-of','json',file],{encoding:'utf8',windowsHide:true});
            assert.equal(info.status,0,info.stderr);assert.equal(Number(JSON.parse(info.stdout).streams[0].sample_rate),16000);
            await action(`await audioEditor.aplicarFadeIn(0.2);await audioEditor._guardadoSesionPendiente;
                audioEditorUI.setMode('avanzado');audioEditorUI.setSubtab('mezclador');await mixer.agregarVozActual();await mixer.app.media.persistirAssets();`);
            await wait('mixer.app.timeline.estaListo()');
            await run('mixer.guardarEnEquipo()');
            assert.equal(await run('mixer.estado.clips.length'),1);
            assert.ok(await run(`mixer.estado.clips[0].asset`));
            await action(`tabs.irA('video');document.getElementById('fondoPNGTuber').value='black';
                for(const [type,color,x] of [['idle','red',8],['talking','blue',40],['blink','lime',24]]){
                    const canvas=document.createElement('canvas');canvas.width=64;canvas.height=64;
                    const ctx=canvas.getContext('2d');ctx.fillStyle=color;ctx.fillRect(x,16,16,32);
                    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
                    const files=new DataTransfer();files.items.add(new File([blob],type+'.png',{type:'image/png'}));
                    const id={idle:'pngtuberIdleInput',talking:'pngtuberTalkingInput',blink:'pngtuberBlinkInput'}[type];
                    document.getElementById(id).files=files.files;await subirImagenPNGTuber(type);
                }`);
            await wait(`!previewEnCurso && !pendingPreview && !document.getElementById('previewPngtuberVideo').hidden && document.getElementById('previewPngtuberVideo').readyState>=2`);
            await run('generarVideoPNGTuber()');
            await wait(`!document.getElementById('videoPngtuberResultado').hidden && document.getElementById('videoPngtuberResultado').readyState>=2`);
            const video=await run(`new URL(document.getElementById('videoPngtuberResultado').src).pathname`);
            const videoInfo=spawnSync(path.join(root,'backend/bin/ffprobe.exe'),['-v','error','-show_entries','stream=codec_type','-of','json',path.join(root,'backend/public',video.replace(/^\//,''))],{encoding:'utf8',windowsHide:true});
            assert.equal(videoInfo.status,0,videoInfo.stderr);
            assert.deepEqual(JSON.parse(videoInfo.stdout).streams.map(s=>s.codec_type).sort(),['audio','video']);
            assert.deepEqual(await run('projectErrors'),[]);
            console.log('SAPI_RENDERER_PASS: Jorge desde UI, WAV 16k, fade, mezclador y PNGTuber con preview/video reales');
            win.destroy();app.exit(0);return;
        }
        await action(`document.getElementById('contenedorReproductor').style.display='block';tabs.irA('audio');audioEditorUI.setMode('avanzado');audioEditorUI.setSubtab('mezclador');
            window.testFixture=await (await fetch('/audios/fixture.wav')).blob();
            await mixer.app.media.subirYAgregar('voz',new File([testFixture],'voz.wav',{type:'audio/wav'}));await mixer.app.media.persistirAssets();`);
        await wait(`mixer.app.timeline.estaListo() && !!mixer.estado.clips[0]?.asset`);
        await run(`mixer.editar('dividir',1);mixer.app.timeline.aplicarPan(mixer.estado.clips[0].id,0.5);mixer.app.timeline.zoom(120);`);
        const original=await run('mixer.guardarEnEquipo()');
        const doc=await run(`(async()=>(await (await fetch('/api/proyectos/'+mixer.estado.projectId)).json()).proyecto)()`);
        assert.equal(doc.clips.length,2);assert.equal(doc.clips[0].pan,0.5);
        assert.equal(doc.zoomPx,120);
        assert.ok((await run('mixer.app.project.listarGuardados()')).some(p=>p.id===original));
        await action(`const route=await mixer.exportarPortable();const blob=await (await fetch(route)).blob();await mixer.importarPortable(new File([blob],'test.loquendo.tar',{type:'application/x-tar'}));`);
        await wait(`mixer.app.timeline.estaListo()`);
        const imported=await run('mixer.estado.projectId');assert.notEqual(imported,original);
        assert.equal(await run('mixer.estado.zoomPx'),120);
        await action(`await mixer.abrirGuardado(${JSON.stringify(original)});await mixer.abrirGuardado(${JSON.stringify(imported)});`);
        await wait(`mixer.app.timeline.estaListo()`);
        const before=await run('mixer.app.store.aProyecto()');
        await run('mixer.pausa()');
        const asset=before.clips[0].asset;
        assert.match(imported,/^p-import-[a-f0-9-]+$/);assert.match(asset,/^assets\/[a-f0-9]+\.wav$/);
        const source=path.join(root,'data/projects',imported,...asset.split('/'));
        fs.renameSync(source,source+'.held-by-test');
        assert.equal(await run(`(async()=>(await (await fetch('/api/proyectos/'+mixer.estado.projectId+'/integridad')).json()).ok)()`),false);
        await run('mixer.init()');await wait(`document.getElementById('mezcladorPistas').textContent.includes('Medios no disponibles')`);
        await run(`mixer.renderizarMezcla('wav')`);
        const renderDir=path.join(root,'data/projects',imported,'renders');
        assert.deepEqual(fs.existsSync(renderDir)?fs.readdirSync(renderDir):[],[]);
        await run(`mixer.recuperarFuente(new File([testFixture],'recuperado.wav',{type:'audio/wav'}))`);
        await wait('mixer.app.timeline.estaListo()');
        const after=await run('mixer.app.store.aProyecto()');
        assert.deepEqual(after.clips,before.clips,'Recuperar no cambia recortes, posiciones, pan ni automatización');
        await run(`mixer.renderizarMezcla('wav')`);
        const renders=fs.readdirSync(path.join(root,'data/projects',imported,'renders'));
        assert.equal(renders.length,1);
        const renderFile=path.join(root,'data/projects',imported,'renders',renders[0]);assert.ok(fs.statSync(renderFile).size>1000);
        const probe=spawnSync(path.join(root,'backend/bin/ffprobe.exe'),['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',renderFile],{encoding:'utf8',windowsHide:true});
        assert.equal(probe.status,0,probe.stderr);assert.ok(Math.abs(Number(probe.stdout)-2)<0.05);
        const primary=path.join(root,'data/projects',imported,'project.json');fs.copyFileSync(primary,primary+'.held-by-test');fs.writeFileSync(primary,'interrumpido');
        assert.equal(await run(`(async()=>(await (await fetch('/api/proyectos/'+mixer.estado.projectId)).json()).recuperado)()`),true);
        await run(`mixer.abrirGuardado(${JSON.stringify(imported)})`);
        assert.ok(fs.readdirSync(path.dirname(primary)).some(n=>n.startsWith('project.corrupt-')));
        const count=await run('(async()=>(await mixer.app.project.listarGuardados()).length)()');
        assert.equal(await run(`(async()=>{const form=new FormData();form.append('project',new File(['bad'],'bad.tar',{type:'application/x-tar'}));return (await fetch('/api/proyectos/importar-portable',{method:'POST',body:form})).status;})()`),400);
        assert.equal(await run('(async()=>(await mixer.app.project.listarGuardados()).length)()'),count);
        assert.deepEqual(fs.readdirSync(path.join(root,'data/cache/imports')),[]);
        assert.deepEqual(await run('projectErrors'),[]);
        console.log('PROJECTS_ELECTRON_PASS: archivos y APIs reales, medios faltantes recuperados y portable compatible');
        win.destroy();app.exit(0);
    } catch(error){console.error(error);if(win&&!win.isDestroyed())win.destroy();app.exit(1);}
}
