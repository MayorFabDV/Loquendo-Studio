// Contenedor TAR USTAR opcional. El documento interno conserva el JSON de proyecto v2.
'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { Readable } = require('stream');
const { hashArchivo, EXT_AUDIO } = require('./assetStore');

const MAX_BYTES = 2 * 1024 ** 3;
const MAX_JSON = 25 * 1024 ** 2;
const ASSET = /^assets\/[a-f0-9]{64}(?:-[a-f0-9]{12})?\.[a-z0-9]+$/;
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const padding = size => (512 - size % 512) % 512;
function nombreValido(name) {
    return name === 'project.json' || name === 'manifest.json'
        || (ASSET.test(name) && EXT_AUDIO.has(path.posix.extname(name)));
}

function header(name, size) {
    if (!nombreValido(name) || Buffer.byteLength(name) > 100) throw new Error('Nombre no permitido en el paquete');
    const h = Buffer.alloc(512);
    h.write(name, 0, 100); h.write('0000644\0', 100); h.write('0000000\0', 108); h.write('0000000\0', 116);
    h.write(size.toString(8).padStart(11, '0') + '\0', 124);
    h.write('00000000000\0', 136); h.fill(32, 148, 156); h[156] = 48;
    h.write('ustar\0', 257); h.write('00', 263);
    const sum = h.reduce((a,b) => a+b, 0);
    h.write(sum.toString(8).padStart(6, '0') + '\0 ', 148);
    return h;
}
function texto(buffer, start, length) { return buffer.subarray(start,start+length).toString('utf8').split('\0')[0]; }
function octal(text) {
    const clean = text.replace(/\0/g,'').trim();
    if (!/^[0-7]+$/.test(clean)) throw new Error('Cabecera TAR no válida');
    return parseInt(clean,8);
}
async function leer(handle, position, size) {
    const data = Buffer.alloc(size); let offset = 0;
    while (offset < size) {
        const { bytesRead } = await handle.read(data, offset, size-offset, position+offset);
        if (!bytesRead) throw new Error('Paquete incompleto');
        offset += bytesRead;
    }
    return data;
}

class PortableProject {
    constructor(assetStore) { this.store = assetStore; }

    async exportar(id) {
        const project = this.store.leerProyecto(id);
        if (!project || !Array.isArray(project.clips)) throw new Error('Proyecto no encontrado o inválido');
        const integrity = await this.store.comprobarIntegridad(id, project);
        if (!integrity.ok) throw new Error('Faltan medios o hay assets dañados; reasigna sus archivos antes de exportar');
        const files = [];
        const json = Buffer.from(JSON.stringify(project,null,2));
        if (json.length > MAX_JSON) throw new Error('Documento de proyecto demasiado grande');
        files.push({ path: 'project.json', size: json.length, sha256: hash(json), data: json });
        for (const ref of new Set(project.clips.map(c => c.asset))) {
            if (!nombreValido(ref) || !ASSET.test(ref)) throw new Error('El proyecto contiene una referencia no portable');
            const source = this.store.resolverAsset(id, ref);
            files.push({ path: ref, source, size: (await fsp.stat(source)).size, sha256: await hashArchivo(source) });
        }
        const manifest = Buffer.from(JSON.stringify({ format:'loquendo-studio-portable', version:1,
            files:files.map(({path,size,sha256})=>({path,size,sha256})) },null,2));
        const entries = [{ path:'manifest.json',size:manifest.length,data:manifest }, ...files];
        if (entries.reduce((n,f)=>n+512+f.size+padding(f.size),1024) > MAX_BYTES) throw new Error('El paquete supera 2 GiB');
        async function* tar() {
            for (const file of entries) {
                yield header(file.path,file.size);
                if (file.data) yield file.data;
                else {
                    const digest=crypto.createHash('sha256'); let bytes=0;
                    for await (const chunk of fs.createReadStream(file.source)) { digest.update(chunk);bytes+=chunk.length;yield chunk; }
                    if (bytes!==file.size || digest.digest('hex')!==file.sha256) throw new Error('Un medio cambió durante la exportación');
                }
                if (padding(file.size)) yield Buffer.alloc(padding(file.size));
            }
            yield Buffer.alloc(1024);
        }
        return { nombre:`${id}.loquendo.tar`, stream:Readable.from(tar()) };
    }

    async importar(archivo) {
        const stats=await fsp.stat(archivo);
        if (!stats.isFile() || stats.size>MAX_BYTES || stats.size<1024 || stats.size%512) throw new Error('Tamaño de paquete no válido');
        const stage=path.join(this.store.projectsDir,'.import-'+crypto.randomUUID());
        await fsp.mkdir(path.join(stage,'assets'),{recursive:true});
        let input;
        const entries=new Map(); let cursor=0, terminado=false;
        try {
            input=await fsp.open(archivo,'r');
            while(cursor<stats.size) {
                const h=await leer(input,cursor,512); cursor+=512;
                if(h.every(b=>b===0)) {
                    if(cursor+512>stats.size || !(await leer(input,cursor,512)).every(b=>b===0)) throw new Error('Final TAR incompleto');
                    cursor+=512;
                    while(cursor<stats.size){const tail=await leer(input,cursor,Math.min(65536,stats.size-cursor));if(!tail.every(b=>b===0))throw new Error('Datos inesperados tras el final TAR');cursor+=tail.length;}
                    terminado=true;
                    break;
                }
                const checksum=octal(h.subarray(148,156).toString());
                const sum=h.reduce((n,b,i)=>n+(i>=148&&i<156?32:b),0);
                if(sum!==checksum || texto(h,257,6)!=='ustar' || texto(h,345,155)) throw new Error('Cabecera TAR no compatible');
                const name=texto(h,0,100), size=octal(h.subarray(124,136).toString());
                if(!nombreValido(name) || ![0,48].includes(h[156]) || entries.has(name) || entries.size>=1002) throw new Error('Entrada no permitida o duplicada');
                if(size>MAX_BYTES || cursor+size+padding(size)>stats.size || (name.endsWith('.json')&&size>MAX_JSON)) throw new Error('Entrada demasiado grande o incompleta');
                if(ASSET.test(name) && !size) throw new Error('Medio vacío en el paquete');
                const output=await fsp.open(path.join(stage,...name.split('/')),'wx');
                const digest=crypto.createHash('sha256');
                try {
                    let remaining=size;
                    while(remaining){const chunk=await leer(input,cursor,Math.min(65536,remaining));digest.update(chunk);
                        let offset=0;while(offset<chunk.length){const written=await output.write(chunk,offset,chunk.length-offset);offset+=written.bytesWritten;}
                        cursor+=chunk.length;remaining-=chunk.length;}
                } finally { await output.close(); }
                const sha256=digest.digest('hex');
                if(ASSET.test(name) && path.posix.basename(name).slice(0,64)!==sha256) throw new Error('El nombre del asset no coincide con su contenido');
                cursor+=padding(size);entries.set(name,{size,sha256});
            }
            if(!terminado) throw new Error('Falta el final del paquete TAR');
            if(!entries.has('manifest.json') || !entries.has('project.json')) throw new Error('Falta manifiesto o proyecto');
            const manifest=JSON.parse(await fsp.readFile(path.join(stage,'manifest.json'),'utf8'));
            if(manifest.format!=='loquendo-studio-portable' || manifest.version!==1 || !Array.isArray(manifest.files)) throw new Error('Formato de paquete no compatible');
            const expected=new Set(['manifest.json']);
            for(const file of manifest.files){
                const actual=entries.get(file.path);
                if(expected.has(file.path) || !actual || actual.size!==file.size || actual.sha256!==file.sha256) throw new Error('Integridad del paquete no válida');
                expected.add(file.path);
            }
            if(expected.size!==entries.size) throw new Error('El manifiesto no cubre todos los archivos');
            const project=JSON.parse(await fsp.readFile(path.join(stage,'project.json'),'utf8'));
            if(!project || !Array.isArray(project.clips) || project.clips.length>500 || ![1,2].includes(Number(project.version || 1))) throw new Error('Proyecto no compatible');
            const id='p-import-'+crypto.randomUUID();
            for(const clip of project.clips){
                if(!clip || !ASSET.test(clip.asset || '') || !entries.has(clip.asset)) throw new Error('Clip sin medio incluido');
                clip.src=this.store.urlAsset(id,clip.asset);
            }
            project.id=id;project.projectId=id;
            project.updatedAt=new Date().toISOString();
            await fsp.writeFile(path.join(stage,'project.json'),JSON.stringify(project,null,2),'utf8');
            // El manifiesto verifica el paquete original; no describe el JSON reasignado al ID nuevo.
            await fsp.unlink(path.join(stage,'manifest.json'));
            if(fs.existsSync(this.store.directorioProyecto(id))) throw new Error('El proyecto de destino ya existe');
            await fsp.rename(stage,this.store.directorioProyecto(id));
            return project;
        } finally {
            if(input) await input.close();
            // Solo staging creado por esta llamada, nunca una carpeta de proyecto existente.
            await fsp.rm(stage,{recursive:true,force:true});
        }
    }
}
module.exports={ PortableProject, MAX_BYTES };
