// services/audioService.js
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

class AudioService {
    constructor(pythonScript, audioFolder, ffmpegPath, pythonBinPath) {
        this.vozScript = pythonScript ? path.join(path.dirname(pythonScript), 'generar_voz.py') : null;
        this.vozExe32 = path.join(path.dirname(ffmpegPath || '.'), '..', 'bin', 'generar_voz.exe');
        this.assScript = pythonScript ? path.join(path.dirname(pythonScript), 'generar_ass.py') : null;

        this.pythonScript = pythonScript;
        this.audioFolder = audioFolder;
        this.ffmpegPath = ffmpegPath;
        this.pythonBin = pythonBinPath;

        if (!fs.existsSync(this.audioFolder)) {
            fs.mkdirSync(this.audioFolder, { recursive: true });
        }

        console.log('[AudioService] Rutas inicializadas:');
        console.log('  - vozExe32:', this.vozExe32, '| Existe:', fs.existsSync(this.vozExe32));
        console.log('  - ffmpegPath:', this.ffmpegPath, '| Existe:', fs.existsSync(this.ffmpegPath));
        console.log('  - audioFolder:', this.audioFolder);
    }

    limpiarTagsParaSubtitulos(texto) {
        if (!texto) return texto;
        texto = texto.replace(/<[^>]+>/g, '');
        texto = texto.replace(/\[pause(?::\d+)?\]/g, ' ');
        texto = texto.replace(/\[\/(?:slow|fast|soft|loud|emphasis|spell)\]/g, '');
        texto = texto.replace(/\[(?:slow|fast|soft|loud|emphasis|spell)\]/g, '');
        texto = texto.replace(/\[voz:[^\]]+\]/g, '');
        texto = texto.replace(/\[\/voz\]/g, '');
        texto = texto.replace(/\s+/g, ' ').trim();
        return texto;
    }

    obtenerDuracionAudio(rutaAudio) {
        try {
            const buffer = fs.readFileSync(rutaAudio);
            const riff = buffer.toString('ascii', 0, 4);
            const wave = buffer.toString('ascii', 8, 12);
            if (riff !== 'RIFF' || wave !== 'WAVE') {
                return Math.max(0, (buffer.length - 44) / 32000);
            }
            const sampleRate = buffer.readUInt32LE(24);
            const numChannels = buffer.readUInt16LE(22);
            const bitsPerSample = buffer.readUInt16LE(34);
            const dataSize = buffer.readUInt32LE(40);
            const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
            if (byteRate === 0) return Math.max(0, (buffer.length - 44) / 32000);
            return dataSize / byteRate;
        } catch (e) {
            console.error('[DURACION] Error:', e);
            return 60;
        }
    }

    formatoTiempo(segundos) {
        const h = Math.floor(segundos / 3600);
        const m = Math.floor((segundos % 3600) / 60);
        const s = Math.floor(segundos % 60);
        const ms = Math.floor((segundos % 1) * 1000);
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
    }

    partirOracion(oracion, maxChars = 42) {
        if (oracion.length <= maxChars) return [oracion];
        const palabras = oracion.split(/\s+/);
        const fragmentos = [];
        let actual = '';
        for (const palabra of palabras) {
            if ((actual + ' ' + palabra).trim().length > maxChars && actual.length > 0) {
                fragmentos.push(actual.trim());
                actual = palabra;
            } else {
                actual = actual ? `${actual} ${palabra}` : palabra;
            }
        }
        if (actual) fragmentos.push(actual.trim());
        return fragmentos;
    }

    generarSRTMatematico(texto, rutaAudio, rutaSRT) {
        try {
            const duracionTotal = this.obtenerDuracionAudio(rutaAudio);
            if (duracionTotal <= 0) return null;

            let oraciones = texto.split(/(?<=[.!?\u00A1\u00BF])\s+/).filter(o => o.trim().length > 0);
            if (oraciones.length === 0) return null;

            let fragmentos = [];
            for (const oracion of oraciones) {
                const partes = this.partirOracion(oracion, 42);
                fragmentos.push(...partes);
            }

            const totalPalabras = fragmentos.reduce((sum, f) => sum + f.split(/\s+/).length, 0);
            if (totalPalabras === 0) return null;

            const tiempoPorPalabra = (duracionTotal - (fragmentos.length * 0.15)) / totalPalabras;
            let srtContent = '';
            let tiempoActual = 0;

            for (let i = 0; i < fragmentos.length; i++) {
                const fragmento = fragmentos[i];
                const palabrasFragmento = fragmento.split(/\s+/).length;
                let duracionFragmento = Math.min(palabrasFragmento * tiempoPorPalabra, 7.0);

                if (tiempoActual + duracionFragmento > duracionTotal) {
                    duracionFragmento = duracionTotal - tiempoActual;
                }
                if (duracionFragmento <= 0) break;

                const tiempoInicio = this.formatoTiempo(tiempoActual);
                tiempoActual += duracionFragmento;
                const tiempoFin = this.formatoTiempo(tiempoActual);

                srtContent += `${i + 1}\n${tiempoInicio} --> ${tiempoFin}\n${fragmento.trim()}\n\n`;
                tiempoActual += 0.15;
            }

            fs.writeFileSync(rutaSRT, srtContent, 'utf8');
            console.log(`[SRT Matematico] ${fragmentos.length} lineas, ${duracionTotal.toFixed(1)}s`);
            return true;
        } catch (e) {
            console.error('Error SRT matematico:', e);
            return null;
        }
    }

    procesar(texto, voz, usarIA, dictionaryService, modo = 'normal') {
        return new Promise((resolve, reject) => {
            const nombreArchivo = `audio-${Date.now()}.wav`;
            const rutaArchivo = path.join(this.audioFolder, nombreArchivo);
            const vozFinal = voz || 'Loquendo Jorge';
            const textoConDiccionarios = dictionaryService.aplicar(texto);
            const textoParaVoz = textoConDiccionarios.replace(/[\r\n]+/g, ' ').replace(/"/g, "'");
            const textoParaSubtitulos = this.limpiarTagsParaSubtitulos(textoConDiccionarios);

            const tieneTags = /\[voz:|\/voz\]|\[pause|\[slow|\[fast|\[soft|\[loud|\[emphasis|\[spell/i.test(textoParaVoz);

            let exeExiste = false;
            try {
                exeExiste = fs.existsSync(this.vozExe32) && 
                           !String(this.vozExe32).toLowerCase().includes('.asar');
            } catch (e) {
                exeExiste = false;
            }
            const usarPython = !exeExiste;

            if (usarPython && tieneTags) {
                console.log('[INFO] Tags detectados, usando Python 64-bit');
            } else if (!usarPython) {
                console.log('[INFO] Sin tags, usando .exe 32-bit');
            }

            console.log('Generando voz: ' + vozFinal);
            let proceso;

            if (usarPython) {
                const pythonCmd = this.pythonBin || 'python';

                try {
                    const check = spawnSync(pythonCmd, ['--version'], { encoding: 'utf8' });
                    if (check.error || check.status !== 0) {
                        return reject(new Error('Python no encontrado. Instale Python 3 o incluya python/ en el paquete.'));
                    }
                } catch (e) {
                    return reject(new Error('Python no disponible: ' + e.message));
                }

                if (!fs.existsSync(this.vozScript)) {
                    return reject(new Error(`Script de voz no encontrado: ${this.vozScript}`));
                }

                console.log('[DEBUG] vozScript:', this.vozScript);
                console.log('[DEBUG] pythonCmd:', pythonCmd);

                const argsVoz = [this.vozScript, textoParaVoz, vozFinal, rutaArchivo];
                proceso = spawn(pythonCmd, argsVoz, { windowsHide: true, shell: false });
            } else {
                if (!fs.existsSync(this.vozExe32)) {
                    return reject(new Error('generar_voz.exe no encontrado: ' + this.vozExe32));
                }
                const argsVoz = [textoParaVoz, vozFinal, rutaArchivo];
                proceso = spawn(this.vozExe32, argsVoz, { windowsHide: true, shell: false });
            }

            let stdout = '';
            let stderr = '';
            proceso.stdout.on('data', (data) => { stdout += data.toString(); });
            proceso.stderr.on('data', (data) => { stderr += data.toString(); });

            proceso.on('close', (code) => {
                if (!fs.existsSync(rutaArchivo) || (!stdout.includes('EXITO') && code !== 0)) {
                    return reject(new Error('Error al generar voz: ' + (stderr || stdout)));
                }

                const stats = fs.statSync(rutaArchivo);
                if (stats.size < 2000) {
                    try { fs.unlinkSync(rutaArchivo); } catch (e) {}
                    return reject(new Error('Audio vacio (' + stats.size + ' bytes)'));
                }

                const nombreSRT = `subtitulos-${Date.now()}.srt`;
                const rutaSRT = path.join(this.audioFolder, nombreSRT);
                let srtUrl = null;

                const usarPythonSRT = usarIA !== false && this.pythonScript && fs.existsSync(this.pythonScript);

                const generarASS = () => {
                    return new Promise((resolveASS) => {
                        const nombreASS = `subtitulos-${Date.now()}.ass`;
                        const rutaASS = path.join(this.audioFolder, nombreASS);

                        if (!fs.existsSync(this.assScript)) {
                            console.warn('ASS script no encontrado:', this.assScript);
                            return resolveASS(null);
                        }

                        const assArgs = [this.assScript, rutaArchivo, rutaASS, modo || 'normal'];
                        if (rutaSRT && fs.existsSync(rutaSRT)) {
                            assArgs.push(rutaSRT);
                        }
                        assArgs.push(textoParaSubtitulos);

                        const pythonCmd = this.pythonBin || 'python';
                        console.log('[DEBUG] assScript:', this.assScript);

                        const assProcess = spawn(pythonCmd, assArgs, { windowsHide: true, shell: false });
                        let assOut = '', assErr = '';
                        assProcess.stdout.on('data', (d) => { assOut += d.toString(); });
                        assProcess.stderr.on('data', (d) => { assErr += d.toString(); });

                        assProcess.on('close', (c) => {
                            if (c === 0 && fs.existsSync(rutaASS)) {
                                console.log('ASS generado: ' + nombreASS);
                                resolveASS('/audios/' + nombreASS);
                            } else {
                                console.warn('ASS fallo:', assErr || assOut);
                                resolveASS(null);
                            }
                        });

                        assProcess.on('error', (err) => {
                            console.warn('Error ASS:', err.message);
                            resolveASS(null);
                        });
                    });
                };

                const finalizar = async () => {
                    const assUrl = await generarASS();
                    console.log('Audio: ' + nombreArchivo + ' (' + (stats.size / 1024).toFixed(2) + ' KB)');
                    resolve({
                        url: '/audios/' + nombreArchivo,
                        srt: srtUrl,
                        ass: assUrl,
                        textoLimpio: textoParaSubtitulos,
                        stats
                    });
                };

                if (usarPythonSRT) {
                    console.log('Generando SRT con Whisper...');
                    const pythonCmd = this.pythonBin || 'python';
                    console.log('[DEBUG] pythonSRT:', this.pythonScript);

                    const pythonProcess = spawn(pythonCmd, [
                        this.pythonScript, rutaArchivo, rutaSRT, textoParaSubtitulos
                    ]);

                    let pyStdout = '', pyStderr = '';
                    pythonProcess.stdout.on('data', (data) => {
                        pyStdout += data.toString();
                        console.log('[Whisper] ' + data.toString().trim());
                    });
                    pythonProcess.stderr.on('data', (data) => {
                        pyStderr += data.toString();
                        console.error('[Whisper ERR] ' + data.toString().trim());
                    });

                    pythonProcess.on('close', (pythonCode) => {
                        console.log('[Whisper] Codigo: ' + pythonCode);
                        if (pythonCode === 0 && fs.existsSync(rutaSRT)) {
                            srtUrl = '/audios/' + nombreSRT;
                            console.log('SRT generado con IA');
                        } else {
                            console.warn('Whisper fallo, usando fallback...');
                            if (this.generarSRTMatematico(textoParaSubtitulos, rutaArchivo, rutaSRT)) {
                                srtUrl = '/audios/' + nombreSRT;
                            }
                        }
                        finalizar();
                    });
                } else {
                    console.log('Generando SRT matematico...');
                    if (this.generarSRTMatematico(textoParaSubtitulos, rutaArchivo, rutaSRT)) {
                        srtUrl = '/audios/' + nombreSRT;
                    }
                    finalizar();
                }
            });

            proceso.on('error', (err) => {
                reject(new Error('Error generador voz: ' + err.message));
            });
        });
    }

    async aplicarDucking(voiceAudioPathAbsoluta, musicPathAbsoluta, options = {}) {
        return new Promise((resolve, reject) => {
            const {
                musicVolume = 0.5,
                loopMusic = false,
                fadeInMusic = 2,
                fadeOutMusic = 3,
                threshold = 0.02,
                ratio = 4,
                attack = 50,
                release = 300
            } = options;

            const nombreSalida = `ducked-${Date.now()}.wav`;
            const rutaSalida = path.join(this.audioFolder, nombreSalida);

            const voiceAudioCompleto = voiceAudioPathAbsoluta;
            const musicCompleto = musicPathAbsoluta;

            console.log('Aplicando Ducking Real (Sidechain)...');
            console.log('  - Voz:', voiceAudioCompleto, '| Existe:', fs.existsSync(voiceAudioCompleto));
            console.log('  - Musica:', musicCompleto, '| Existe:', fs.existsSync(musicCompleto));

            if (!fs.existsSync(voiceAudioCompleto)) {
                return reject(new Error('Audio de voz no encontrado: ' + voiceAudioCompleto));
            }
            if (!fs.existsSync(musicCompleto)) {
                return reject(new Error('Musica no encontrada: ' + musicCompleto));
            }

            const ffmpegInfo = spawn(this.ffmpegPath, ['-i', voiceAudioCompleto], {
                windowsHide: true, shell: false
            });

            let stderrInfo = '';
            ffmpegInfo.stderr.on('data', (data) => { stderrInfo += data.toString(); });

            ffmpegInfo.on('close', () => {
                const durationMatch = stderrInfo.match(/Duration: (\d{2}):(\d{2}):(\d{2}\.\d{2})/);
                let duracionVoz = 0;
                if (durationMatch) {
                    duracionVoz = parseInt(durationMatch[1]) * 3600
                                + parseInt(durationMatch[2]) * 60
                                + parseFloat(durationMatch[3]);
                }

                if (isNaN(duracionVoz) || duracionVoz <= 0) {
                    duracionVoz = this.obtenerDuracionAudio(voiceAudioCompleto);
                    if (duracionVoz <= 0) {
                        return reject(new Error('No se pudo obtener la duracion del audio'));
                    }
                }

                const fadeOutStart = Math.max(0, duracionVoz - fadeOutMusic);
                console.log(`Voz: ${duracionVoz.toFixed(1)}s | Fade out: ${fadeOutStart.toFixed(1)}s | Vol musica: ${musicVolume}`);

                const ffmpegArgs = ['-i', voiceAudioCompleto];
                if (loopMusic) {
                    ffmpegArgs.push('-stream_loop', '-1', '-i', musicCompleto);
                } else {
                    ffmpegArgs.push('-i', musicCompleto);
                }

                const filterComplex =
                    `[1:a]volume=${musicVolume},` +
                    `afade=t=in:st=0:d=${fadeInMusic},` +
                    `afade=t=out:st=${fadeOutStart}:d=${fadeOutMusic}[music_faded];` +
                    `[music_faded][0:a]sidechaincompress=threshold=${threshold}:ratio=${ratio}:attack=${attack}:release=${release}[music_ducked];` +
                    `[0:a][music_ducked]amix=inputs=2:duration=longest:dropout_transition=0:normalize=0[mixed]`;

                ffmpegArgs.push(
                    '-filter_complex', filterComplex,
                    '-map', '[mixed]',
                    '-c:a', 'pcm_s16le',
                    '-ar', '44100',
                    '-y',
                    rutaSalida
                );

                const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
                    windowsHide: true, shell: false
                });

                let stderr = '';
                ffmpegProcess.stderr.on('data', (data) => { stderr += data.toString(); });

                ffmpegProcess.on('close', (code) => {
                    if (code === 0 && fs.existsSync(rutaSalida)) {
                        const outStats = fs.statSync(rutaSalida);
                        if (outStats.size < 2000) {
                            return reject(new Error('Ducking genero archivo vacio'));
                        }
                        console.log('Ducking aplicado: ' + nombreSalida);
                        resolve({
                            url: '/audios/' + nombreSalida,
                            mensaje: 'Ducking aplicado correctamente'
                        });
                    } else {
                        console.error('FFmpeg Ducking Error:', stderr);
                        reject(new Error('Ducking fallo: ' + stderr.substring(0, 500)));
                    }
                });

                ffmpegProcess.on('error', (err) => {
                    reject(new Error('FFmpeg error: ' + err.message));
                });
            });

            ffmpegInfo.on('error', (err) => {
                reject(new Error('Error obteniendo duracion: ' + err.message));
            });
        });
    }

    async convertirAMp3(wavPathAbsoluta, outputFolder) {
        return new Promise((resolve, reject) => {
            const wavCompleto = wavPathAbsoluta;

            if (!fs.existsSync(wavCompleto)) {
                return reject(new Error('WAV no existe: ' + wavCompleto));
            }

            const nombreMp3 = `export-${Date.now()}.mp3`;
            const rutaMp3 = path.join(outputFolder || this.audioFolder, nombreMp3);

            console.log('MP3: ' + wavCompleto);

            const ffmpegArgs = [
                '-i', wavCompleto,
                '-codec:a', 'libmp3lame',
                '-qscale:a', '2',
                '-y',
                rutaMp3
            ];

            const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
                windowsHide: true, shell: false
            });

            let stderr = '';
            ffmpegProcess.stderr.on('data', (data) => { stderr += data.toString(); });

            ffmpegProcess.on('close', (code) => {
                if (code === 0 && fs.existsSync(rutaMp3)) {
                    console.log('MP3: ' + nombreMp3);
                    resolve({
                        url: '/audios/' + nombreMp3,
                        mensaje: 'MP3 listo'
                    });
                } else {
                    console.error('MP3:', stderr);
                    reject(new Error('MP3 fallo: ' + stderr));
                }
            });

            ffmpegProcess.on('error', (err) => {
                reject(new Error('FFmpeg: ' + err.message));
            });
        });
    }
}

module.exports = AudioService;