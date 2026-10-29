// node scripts/smoke_projects.cjs
// Express/server.js y Electron reales en un sandbox; ningún dato del usuario se modifica.
'use strict';
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const repo=path.resolve(__dirname,'..');
if(process.versions.electron) renderer();
else coordinator().catch(error=>{console.error(error);process.exitCode=1;});

async function coordinator(){
    const root=fs.mkdtempSync(path.join(os.tmpdir(),'loquendo-project-smoke-'));
    let server;
    try {
        for(const dir of ['backend/bin','backend/db','backend/public/audios','backend/public/pngtuber','frontend'])fs.mkdirSync(path.join(root,dir),{recursive:true});
        fs.symlinkSync(path.join(repo,'node_modules'),path.join(root,'node_modules'),'junction');
        fs.symlinkSync(path.join(repo,'backend/services'),path.join(root,'backend/services'),'junction');
        for(const file of ['server.js','package.json'])fs.copyFileSync(path.join(repo,file),path.join(root,file));
        for(const file of ['ffmpeg.exe','ffprobe.exe'])fs.copyFileSync(path.join(repo,'backend/bin',file),path.join(root,'backend/bin',file));
        const instrumentation=`<script>window.projectErrors=[];addEventListener('error',e=>projectErrors.push(e.error?.stack||e.message));addEventListener('unhandledrejection',e=>projectErrors.push(e.reason?.stack||String(e.reason)));
            const nativeFetch=fetch;window.fetch=(url,options)=>String(url).includes('/api/voces')?Promise.resolve(new Response('{"voces":[],"total":0}',{headers:{'Content-Type':'application/json'}})):nativeFetch(url,options);</script>`;
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
        const net=require('node:net'),probe=net.createServer();
        await new Promise(resolve=>probe.listen(0,'localhost',resolve));const port=probe.address().port;
        await new Promise(resolve=>probe.close(resolve));
        const env={...process.env,PORT:String(port),NODE_ENV:'test',LOQUENDO_NO_AUTOSTART:'0',LOQUENDO_DATA_DIR:path.join(root,'data')};
        server=spawn(process.execPath,['server.js'],{cwd:root,env,windowsHide:true});
        let output='';server.stdout.on('data',d=>output+=d);server.stderr.on('data',d=>output+=d);
        const bound=await new Promise((resolve,reject)=>{
            const start=Date.now();const poll=()=>{const m=output.match(/Servidor escuchando en: http:\/\/localhost:(\d+)/);
                if(m)return resolve(Number(m[1]));if(server.exitCode!==null)return reject(new Error(output));
                if(Date.now()-start>30000)return reject(new Error('Timeout de Express: '+output));setTimeout(poll,50);};poll();
        });
        await new Promise((resolve,reject)=>{
            const childEnv={...process.env,PROJECT_TEST_URL:'http://localhost:'+bound,PROJECT_TEST_ROOT:root};delete childEnv.ELECTRON_RUN_AS_NODE;
            const child=spawn(require('electron'),[__filename],{env:childEnv,stdio:'inherit',windowsHide:true});
            const timeout=setTimeout(()=>{child.kill();reject(new Error('Timeout de Electron'));},120000);
            child.on('error',error=>{clearTimeout(timeout);reject(error);});
            child.on('exit',code=>{clearTimeout(timeout);code===0?resolve():reject(new Error('Electron terminó con '+code));});
        });
        console.log('PROJECTS_REAL_SERVER_PASS: guardar, catálogo, portable, relink, copia recuperable y render real');
    } finally {
        if(server&&server.exitCode===null){const exited=new Promise(resolve=>server.once('exit',resolve));server.kill();await exited;}
        // El sandbox contiene junctions de solo lectura lógica: retirarlas antes de limpiar el directorio propio.
        for(const rel of ['node_modules','backend/services',...fs.readdirSync(path.join(repo,'frontend'),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>'frontend/'+e.name)]){
            const file=path.join(root,rel);if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink()){
                try{fs.unlinkSync(file);}catch(error){if(!['EPERM','EISDIR'].includes(error.code))throw error;fs.rmdirSync(file);}
            }
        }
        fs.rmSync(root,{recursive:true,force:true,maxRetries:10,retryDelay:100});
    }
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
        await action(`document.getElementById('contenedorReproductor').style.display='block';tabs.irA('audio');audioEditorUI.setMode('avanzado');audioEditorUI.setSubtab('mezclador');
            window.testFixture=await (await fetch('/audios/fixture.wav')).blob();
            await mixer.app.media.subirYAgregar('voz',new File([testFixture],'voz.wav',{type:'audio/wav'}));await mixer.app.media.persistirAssets();`);
        await wait(`mixer.app.timeline.estaListo() && !!mixer.estado.clips[0]?.asset`);
        await run(`mixer.editar('dividir',1);mixer.app.timeline.aplicarPan(mixer.estado.clips[0].id,0.5);`);
        const original=await run('mixer.guardarEnEquipo()');
        const doc=await run(`(async()=>(await (await fetch('/api/proyectos/'+mixer.estado.projectId)).json()).proyecto)()`);
        assert.equal(doc.clips.length,2);assert.equal(doc.clips[0].pan,0.5);
        assert.ok((await run('mixer.app.project.listarGuardados()')).some(p=>p.id===original));
        await action(`const route=await mixer.exportarPortable();const blob=await (await fetch(route)).blob();await mixer.importarPortable(new File([blob],'test.loquendo.tar',{type:'application/x-tar'}));`);
        await wait(`mixer.app.timeline.estaListo()`);
        const imported=await run('mixer.estado.projectId');assert.notEqual(imported,original);
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
