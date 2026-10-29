// Smoke aislado: Electron real, servidor/onda sintéticos, sin server.js ni datos del usuario.
// Ejecutar: node node_modules/electron/cli.js scripts/smoke_mixer.cjs
const { app, BrowserWindow } = require('electron');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../frontend');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'loquendo-mixer-smoke-'));
app.setPath('userData', profile);
const samples = 48000 * 3, wav = Buffer.alloc(44 + samples * 4);
wav.write('RIFF'); wav.writeUInt32LE(wav.length-8,4); wav.write('WAVEfmt ',8);
wav.writeUInt32LE(16,16); wav.writeUInt16LE(1,20); wav.writeUInt16LE(2,22);
wav.writeUInt32LE(48000,24); wav.writeUInt32LE(192000,28); wav.writeUInt16LE(4,32); wav.writeUInt16LE(16,34);
wav.write('data',36); wav.writeUInt32LE(samples*4,40);
for(let i=0;i<samples;i++){const n=Math.round(4000*Math.sin(2*Math.PI*440*i/48000));wav.writeInt16LE(n,44+i*4);wav.writeInt16LE(n,46+i*4);}
const scripts = ['libs/wavesurfer-multitrack.min.js','services/mixer/config.js','services/mixer/state.js',
    'services/mixer/inspector.js','services/mixer/timeline.js','services/mixer/media.js','services/mixer/project.js',
    'services/mixer/transport.js','services/mixerService.js'];
const html = `<!doctype html><style>.audio-group-hidden{display:none}#mezcladorPistas{width:1000px}</style>
<div id="mezcladorEstado"></div><div id="mezcladorInspector"></div><div id="mezcladorPistas"></div>
<script>window.CONFIG={API_BASE:location.origin};window.errors=[];window.addEventListener('error',e=>errors.push(e.error?.stack||e.message));
window.addEventListener('unhandledrejection',e=>errors.push(e.reason?.stack||String(e.reason)));
window.stereoMeters=[];
window.nativeAudios=[];
window.Audio=new Proxy(window.Audio,{construct(Target,args){const audio=new Target(...args);nativeAudios.push(audio);return audio;}});
const crearMerger=AudioContext.prototype.createChannelMerger;
AudioContext.prototype.createChannelMerger=function(...args){
    const node=crearMerger.apply(this,args), ctx=this, conectar=node.connect;
    node.connect=function(dest,...otros){
        const result=conectar.call(node,dest,...otros);
        if(dest===ctx.destination){
            const split=ctx.createChannelSplitter(2), left=ctx.createAnalyser(), right=ctx.createAnalyser(), silent=ctx.createGain();
            silent.gain.value=0; conectar.call(node,split);
            split.connect(left,0);split.connect(right,1);left.connect(silent);right.connect(silent);silent.connect(ctx.destination);
            stereoMeters.push({left,right});
        }
        return result;
    };
    return node;
};</script>
${scripts.map(s=>`<script src="/js/${s}"></script>`).join('')}`;
const server = http.createServer((req,res)=>{
    const url = new URL(req.url,'http://localhost');
    if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html);}
    if(url.pathname==='/test.wav'){
        res.setHeader('Content-Type','audio/wav');res.setHeader('Accept-Ranges','bytes');
        const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range || '');
        const start = range ? Number(range[1]) : 0;
        const end = range && range[2] ? Math.min(Number(range[2]),wav.length-1) : wav.length-1;
        if(range){res.statusCode=206;res.setHeader('Content-Range',`bytes ${start}-${end}/${wav.length}`);}
        res.setHeader('Content-Length',end-start+1);
        return res.end(wav.subarray(start,end+1));
    }
    if(url.pathname==='/api/audio/peaks'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({duration:3,peaks:Array.from({length:300},(_,i)=>Math.sin(i)*0.1)}));}
    if(url.pathname==='/api/sfx/list'){res.setHeader('Content-Type','application/json');return res.end('{"items":[]}');}
    const file = path.resolve(root,'.'+url.pathname);
    if(!file.startsWith(root+path.sep) || !fs.existsSync(file)){res.statusCode=404;return res.end();}
    res.setHeader('Content-Type','text/javascript');res.end(fs.readFileSync(file));
});
let win;
async function run(){
    await app.whenReady();
    await new Promise(resolve=>server.listen(0,'localhost',resolve));
    win = new BrowserWindow({show:false,width:1200,height:800,webPreferences:{nodeIntegration:false,contextIsolation:true,backgroundThrottling:false}});
    win.webContents.on('console-message', event => { if(event.level === 'error') console.log('RENDERER:',event.message); });
    await win.loadURL('http://localhost:'+server.address().port);
    const evaluate = code => win.webContents.executeJavaScript(code,true);
    const wait = async expression => {
        for(let i=0;i<180;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,100));}
        throw new Error('Timeout: '+expression+' '+await evaluate(`JSON.stringify({errors,audios:nativeAudios.map(a=>({src:a.src,ready:a.readyState,error:a.error?.message})),clips:mixer.estado.clips.map(c=>({in:c.in,out:c.out})),tracks:mixer.app.timeline.getMultitrack()?.tracks.map(t=>({id:t.id,start:t.startPosition}))})`));
    };
    await evaluate(`mixer.init(); MixerApp.store.agregarClip('voz','/test.wav',{duration:3,in:0.5,out:2.5,start:0,pan:0.5});
        mixer.app.timeline.rebuild();`);
    await wait(`mixer.app.timeline.getMultitrack()?.audios?.[0]?.readyState >= 2`);
    await new Promise(r=>setTimeout(r,500));
    assert.equal(await evaluate(`Math.abs(mixer.app.timeline.getMultitrack().tracks[0].startPosition + 0.5)<0.001`),true);
    await evaluate(`mixer.editar('dividir',1);`);
    await wait(`mixer.app.timeline.getMultitrack()?.tracks.length === 4`);
    await wait(`mixer.app.timeline.estaListo()`);
    assert.equal(await evaluate(`mixer.estado.clips.length`),2);
    await evaluate(`mixer.editar('deshacer');`);
    await wait(`mixer.app.timeline.getMultitrack()?.tracks.length === 3`);
    await wait(`mixer.app.timeline.estaListo()`);
    assert.equal(await evaluate(`mixer.estado.clips.length`),1);
    await evaluate(`mixer.editar('rehacer');`);
    await wait(`mixer.app.timeline.getMultitrack()?.tracks.length === 4`);
    await wait(`mixer.app.timeline.estaListo()`);
    await evaluate(`mixer.irA(0); mixer.play();`);
    await wait(`mixer.app.transport.tiempoActual()>0.5`);
    const ratio = await evaluate(`(() => {
        const m=stereoMeters[stereoMeters.length-2], l=new Float32Array(2048), r=new Float32Array(2048);
        m.left.getFloatTimeDomainData(l);m.right.getFloatTimeDomainData(r);
        return Math.sqrt(l.reduce((sum,v)=>sum+v*v,0)/r.reduce((sum,v)=>sum+v*v,0));
    })()`);
    assert.ok(Math.abs(ratio-0.5)<0.02,'El preview debe aplicar el mismo balance estéreo que FFmpeg: '+ratio);
    const drift = await evaluate(`(() => {const mt=mixer.app.timeline.getMultitrack();return Math.abs(mt.audios[0].currentTime-0.5-mt.getCurrentTime());})()`);
    assert.ok(drift<0.35,'El offset de la fuente debe seguir el cursor: '+drift);
    await evaluate(`mixer.pausa();`);
    await evaluate(`mixer.editar('duplicar'); mixer.editar('deshacer'); mixer.editar('rehacer');`);
    await wait(`mixer.app.timeline.estaListo() && mixer.app.timeline.getMultitrack().tracks.length === mixer.estado.clips.length+2`);
    await evaluate(`mixer.irA(mixer.app.store.duracionProyecto()-0.2);mixer.play();`);
    await wait(`!mixer.app.timeline.getMultitrack().isPlaying() && mixer.app.transport.tiempoActual() >= mixer.app.store.duracionProyecto()-0.01`);
    const errors = await evaluate(`errors`);
    assert.deepEqual(errors,[]);
    console.log('MIXER_ELECTRON_PASS: offset, split, undo/redo, rebuild y reproducción; balance medido='+ratio.toFixed(3)+'; desfase='+drift.toFixed(3)+'s');
}
run().then(()=>finish(0),error=>{console.error(error);finish(1);});
function finish(code){
    if(win && !win.isDestroyed()) win.destroy();
    server.close(()=>{fs.rmSync(profile,{recursive:true,force:true});app.exit(code);});
    server.closeAllConnections();
}
