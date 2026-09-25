// services/audioService.js - VERSIÓN UNIFICADA Y BLINDADA
const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

class AudioService {
    constructor(pythonScript, audioFolder, ffmpegPath, pythonBinPath) {
        this.vozScript = pythonScript ? path.join(path.dirname(pythonScript), 'generar_voz.py') : null;
        this.vozExe32 = path.join(path.dirname(ffmpegPath || '.'), '..', 'bin', 'generar_voz.exe');
        this.assScript = pythonScript ? path.join(path.dirname(pythonScript), 'generar_ass.py') : null;

        // ✅ RUTAS DE WHISPER.CPP
        this.whisperExe = path.join(path.dirname(ffmpegPath || '.'), 'whisper-cli.exe');
        this.whisperModel = path.join(path.dirname(ffmpegPath || '.'), 'ggml-small.bin');

        this.pythonScript = pythonScript;
        this.audioFolder = audioFolder;
        this.ffmpegPath = ffmpegPath;
        this.pythonBin = pythonBinPath;

        if (!fs.existsSync(this.audioFolder)) {
            fs.mkdirSync(this.audioFolder, { recursive: true });
        }

        console.log('\n[AudioService] Rutas inicializadas:');
        console.log('   vozExe32:', this.vozExe32, '| Existe:', fs.existsSync(this.vozExe32));
        console.log('    ffmpegPath:', this.ffmpegPath, '| Existe:', fs.existsSync(this.ffmpegPath));
        console.log('   whisperExe:', this.whisperExe, '| Existe:', fs.existsSync(this.whisperExe));
        console.log('   whisperModel:', this.whisperModel, '| Existe:', fs.existsSync(this.whisperModel));
        console.log('   audioFolder:', this.audioFolder);
    }

    _aplicarCalidad(rutaArchivo, calidad) {
        return new Promise((resolve) => {
            const mapaCalidades = {
                '16k': { ar: '16000', ac: '1' },
                '22k': { ar: '22050', ac: '1' },
                '44k': { ar: '44100', ac: '1' }
            };
            const target = mapaCalidades[calidad];
            if (!target || !rutaArchivo || !fs.existsSync(rutaArchivo)) {
                return resolve(false);
            }
            const rutaTemp = rutaArchivo.replace(/\.wav$/i, '.resample.wav');
            const args = ['-y', '-i', rutaArchivo, '-ar', target.ar, '-ac', target.ac, '-c:a', 'pcm_s16le', rutaTemp];
            const proc = spawn(this.ffmpegPath, args, { windowsHide: true, shell: false });
            proc.stderr.on('data', () => {});
            proc.on('error', () => resolve(false));
            proc.on('close', (code) => {
                if (code === 0 && fs.existsSync(rutaTemp)) {
                    fs.renameSync(rutaTemp, rutaArchivo);
                    console.log(`   Calidad aplicada: ${calidad} (${target.ar} Hz, ${target.ac} ch)`);
                    resolve(true);
                } else {
                    try { fs.unlinkSync(rutaTemp); } catch (e) {}
                    resolve(false);
                }
            });
        });
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
            console.error('❌ [DURACION] Error:', e);
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

    partirOracion(oracion, maxChars = 80) {
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

    // ==========================================
    // ✅ SRT MATEMÁTICO (FALLBACK)
    // ==========================================
    generarSRTMatematico(texto, rutaAudio, rutaSRT) {
        try {
            console.log('\n [SRT Matemático] Iniciando generación...');
            
            texto = texto.replace(/\[pause(?::\d+)?\]/g, ' ');
            texto = texto.replace(/\[(?:slow|fast|soft|loud|emphasis|spell)\]/g, '');
            texto = texto.replace(/\[\/(?:slow|fast|soft|loud|emphasis|spell)\]/g, '');
            texto = texto.replace(/\[voz:[^\]]+\]/g, '');
            texto = texto.replace(/\[\/voz\]/g, '');
            texto = texto.replace(/\s+/g, ' ').trim();

            const duracionTotal = this.obtenerDuracionAudio(rutaAudio);
            if (duracionTotal <= 0) {
                console.error('❌ [SRT Matemático] Duración inválida');
                return null;
            }
            
            console.log(`    Duración del audio: ${duracionTotal.toFixed(2)}s`);
            
            let oraciones = texto.split(/(?<=[.!?\u00A1\u00BF])\s+/).filter(o => o.trim().length > 0);
            if (oraciones.length === 0) {
                console.error('❌ [SRT Matemático] No hay oraciones');
                return null;
            }
            
            let fragmentos = [];
            for (const oracion of oraciones) {
                const partes = this.partirOracion(oracion, 80);
                fragmentos.push(...partes);
            }
            
            const totalPalabras = fragmentos.reduce((sum, f) => sum + f.split(/\s+/).length, 0);
            if (totalPalabras === 0) {
                console.error('❌ [SRT Matemático] No hay palabras');
                return null;
            }
            
            console.log(`    Fragmentos: ${fragmentos.length} | Palabras: ${totalPalabras}`);
            
            const tiempoTotalGaps = fragmentos.length * 0.15;
            const tiempoDisponible = Math.max(0, duracionTotal - tiempoTotalGaps);
            const tiempoPorPalabra = Math.max(0.05, tiempoDisponible / totalPalabras);
            
            let srtContent = '';
            let tiempoActual = 0;
            
            for (let i = 0; i < fragmentos.length; i++) {
                const fragmento = fragmentos[i];
                const palabrasFragmento = fragmento.split(/\s+/).length;
                
                let duracionFragmento = Math.min(palabrasFragmento * tiempoPorPalabra, 7.0);
                
                if (tiempoActual + duracionFragmento > duracionTotal) {
                    duracionFragmento = duracionTotal - tiempoActual;
                }
                
                if (duracionFragmento <= 0) {
                    duracionFragmento = 0.5;
                }
                
                const tiempoInicio = this.formatoTiempo(tiempoActual);
                tiempoActual += duracionFragmento;
                const tiempoFin = this.formatoTiempo(tiempoActual);
                
                srtContent += `${i + 1}\n${tiempoInicio} --> ${tiempoFin}\n${fragmento.trim()}\n\n`;
                tiempoActual += 0.15;
            }
            
            fs.writeFileSync(rutaSRT, srtContent, 'utf8');
            console.log(`    [SRT Matemático] Generado: ${fragmentos.length} líneas, ${duracionTotal.toFixed(1)}s\n`);
            return true;
        } catch (e) {
            console.error('❌ [SRT Matemático] Error:', e);
            return null;
        }
    }

    // ==========================================
    // ✅ WHISPER.CPP (PRIORIDAD)
    // ==========================================
    async generarSRTWhisperCpp(audioAbsoluto, rutaSRT, maxPalabras = 7) {
        return new Promise((resolve, reject) => {
            console.log('\n  [Whisper.cpp] Iniciando transcripción...');
            
            if (!fs.existsSync(this.whisperExe)) {
                console.error('❌ [Whisper.cpp] No encontrado:', this.whisperExe);
                return reject(new Error('whisper-cli.exe no encontrado: ' + this.whisperExe));
            }
            
            if (!fs.existsSync(this.whisperModel)) {
                console.error('❌ [Whisper.cpp] Modelo no encontrado:', this.whisperModel);
                return reject(new Error('ggml-small.bin no encontrado: ' + this.whisperModel));
            }
            
            const maxLenChars = Math.max(12, maxPalabras * 6);
            const rutaSinExt = rutaSRT.replace(/\.srt$/i, '');
            
            console.log(`   Audio: ${path.basename(audioAbsoluto)}`);
            console.log(`    Modelo: ${path.basename(this.whisperModel)}`);
            console.log(`    Max palabras: ${maxPalabras} | Max chars: ${maxLenChars}`);
            
            const args = [
                '-m', this.whisperModel,
                '-f', audioAbsoluto,
                '-osrt',
                '-of', rutaSinExt,
                '-l', 'es',
                '-ml', String(maxLenChars),
                '-pp'
            ];
            
            const proceso = spawn(this.whisperExe, args, { 
                windowsHide: true,
                cwd: path.dirname(this.whisperExe)
            });
            
            let stdout = '';
            let stderr = '';
            
            proceso.stdout.on('data', (data) => {
                const msg = data.toString();
                stdout += msg;
                if (msg.includes('whisper_full')) {
                    console.log('   ⏳ [Whisper.cpp] Procesando...');
                }
            });
            
            proceso.stderr.on('data', (data) => {
                const msg = data.toString();
                stderr += msg;
            });
            
            proceso.on('close', (code) => {
                const rutaGenerada = rutaSinExt + '.srt';
                
                if (code === 0 && fs.existsSync(rutaGenerada)) {
                    console.log(`   ✅ [Whisper.cpp] SRT generado correctamente\n`);
                    resolve(rutaGenerada);
                } else {
                    console.error(`   ❌ [Whisper.cpp] Falló (código ${code})\n`);
                    reject(new Error('Whisper.cpp falló (código ' + code + '): ' + stderr));
                }
            });
            
            proceso.on('error', (err) => {
                console.error('❌ [Whisper.cpp] Error:', err.message);
                reject(new Error('Error ejecutando Whisper.cpp: ' + err.message));
            });
        });
    }

    // ==========================================
    // ✅ PROCESAR AUDIO
    // ==========================================
    procesar(texto, voz, usarIA, dictionaryService, modo = 'normal', opciones = {}) {
        return new Promise((resolve, reject) => {
            console.log('\n════════════════════════════════════════');
            console.log('🎬 [AudioService] INICIANDO PROCESAMIENTO');
            console.log('════════════════════════════════════════');
            
            const nombreArchivo = `audio-${Date.now()}.wav`;
            const rutaArchivo = path.join(this.audioFolder, nombreArchivo);
            const vozFinal = voz || 'Loquendo Jorge';
            
            console.log(`  Voz seleccionada: ${vozFinal}`);
            console.log(` Texto recibido: ${texto.substring(0, 80)}...`);
            
            const textoConDiccionarios = dictionaryService.aplicarConOpciones(texto, opciones || {});
            
            const textoParaVoz = textoConDiccionarios.replace(/[\r\n]+/g, ' ').replace(/"/g, "'");
            const textoParaSubtitulos = this.limpiarTagsParaSubtitulos(textoConDiccionarios);
            
            const textoParaSubtitulosLimpio = textoParaSubtitulos
                .replace(/\[pause(?::\d+)?\]/g, ' ')
                .replace(/\[(?:slow|fast|soft|loud|emphasis|spell)\]/g, '')
                .replace(/\[\/(?:slow|fast|soft|loud|emphasis|spell)\]/g, '')
                .replace(/\[voz:[^\]]+\]/g, '')
                .replace(/\[\/voz\]/g, '')
                .replace(/\s+/g, ' ')
                .trim();

            const tieneTags = /\[voz:|\/voz\]|\[pause|\[slow|\[fast|\[soft|\[loud|\[emphasis|\[spell/i.test(textoParaVoz);

            let exeExiste = false;
            try {
                exeExiste = fs.existsSync(this.vozExe32) && !String(this.vozExe32).toLowerCase().includes('.asar');
            } catch (e) {
                exeExiste = false;
            }
            const usarPython = !exeExiste;

            if (usarPython && tieneTags) {
                console.log(' [INFO] Tags detectados, usando Python 64-bit');
            } else if (!usarPython) {
                console.log(' [INFO] Sin tags, usando .exe 32-bit');
            }

            console.log(` Generando voz: ${vozFinal}`);
            let proceso;

            if (usarPython) {
                const pythonCmd = this.pythonBin || 'python';
                try {
                    const check = spawnSync(pythonCmd, ['--version'], { encoding: 'utf8' });
                    if (check.error || check.status !== 0) {
                        console.error('❌ Python no encontrado');
                        return reject(new Error('Python no encontrado. Instale Python 3 o incluya python/ en el paquete.'));
                    }
                } catch (e) {
                    console.error('❌ Python no disponible:', e.message);
                    return reject(new Error('Python no disponible: ' + e.message));
                }

                if (!fs.existsSync(this.vozScript)) {
                    console.error('❌ Script de voz no encontrado:', this.vozScript);
                    return reject(new Error(`Script de voz no encontrado: ${this.vozScript}`));
                }

                const argsVoz = [this.vozScript, textoParaVoz, vozFinal, rutaArchivo];
                proceso = spawn(pythonCmd, argsVoz, { windowsHide: true, shell: false });
            } else {
                if (!fs.existsSync(this.vozExe32)) {
                    console.error('❌ generar_voz.exe no encontrado:', this.vozExe32);
                    return reject(new Error('generar_voz.exe no encontrado: ' + this.vozExe32));
                }
                const argsVoz = [textoParaVoz, vozFinal, rutaArchivo];
                proceso = spawn(this.vozExe32, argsVoz, { windowsHide: true, shell: false });
            }

            let stdout = '';
            let stderr = '';
            proceso.stdout.on('data', (data) => { stdout += data.toString(); });
            proceso.stderr.on('data', (data) => { stderr += data.toString(); });

            proceso.on('close', async (code) => {
                if (!fs.existsSync(rutaArchivo) || (!stdout.includes('EXITO') && code !== 0)) {
                    console.error('❌ Error al generar voz:', stderr || stdout);
                    return reject(new Error('Error al generar voz: ' + (stderr || stdout)));
                }

                const stats = fs.statSync(rutaArchivo);
                if (stats.size < 2000) {
                    try { fs.unlinkSync(rutaArchivo); } catch (e) {}
                    console.error(`❌ Audio vacío (${stats.size} bytes)`);
                    return reject(new Error('Audio vacio (' + stats.size + ' bytes)'));
                }

                await this._aplicarCalidad(rutaArchivo, (opciones || {}).calidad);

                const statsFinal = fs.statSync(rutaArchivo);
                console.log(`Voz generada: ${nombreArchivo} (${(statsFinal.size / 1024).toFixed(2)} KB)`);

                if (usarIA === false || usarIA === 'solo_audio') {
                    console.log('[AudioService] Generando SOLO audio (sin subtítulos)\n');
                    return resolve({
                        url: '/audios/' + nombreArchivo,
                        srt: null,
                        ass: null,
                        textoLimpio: textoParaSubtitulosLimpio,
                        stats: statsFinal
                    });
                }
                
                const nombreSRT = `subtitulos-${Date.now()}.srt`;
                const rutaSRT = path.join(this.audioFolder, nombreSRT);
                let srtUrl = null;

                const usarWhisperCpp = fs.existsSync(this.whisperExe) && fs.existsSync(this.whisperModel);
                const usarPythonSRT = !usarWhisperCpp && this.pythonScript && fs.existsSync(this.pythonScript);

                const generarASS = () => {
                    return new Promise((resolveASS) => {
                        console.log('\n[ASS] Generando subtítulos ASS...');
                        
                        const nombreASS = `subtitulos-${Date.now()}.ass`;
                        const rutaASS = path.join(this.audioFolder, nombreASS);

                        if (!fs.existsSync(this.assScript)) {
                            console.warn('[ASS] Script no encontrado:', this.assScript);
                            return resolveASS(null);
                        }

                        const assArgs = [this.assScript, rutaArchivo, rutaASS, modo || 'normal'];
                        if (rutaSRT && fs.existsSync(rutaSRT)) {
                            assArgs.push(rutaSRT);
                        }
                        assArgs.push(textoParaSubtitulosLimpio);

                        const pythonCmd = this.pythonBin || 'python';

                        const assProcess = spawn(pythonCmd, assArgs, { windowsHide: true, shell: false });
                        let assOut = '', assErr = '';
                        assProcess.stdout.on('data', (d) => { assOut += d.toString(); });
                        assProcess.stderr.on('data', (d) => { assErr += d.toString(); });

                        assProcess.on('close', (c) => {
                            if (c === 0 && fs.existsSync(rutaASS)) {
                                console.log(`[ASS] Generado: ${nombreASS}\n`);
                                resolveASS('/audios/' + nombreASS);
                            } else {
                                console.warn(' [ASS] Falló:', assErr || assOut);
                                resolveASS(null);
                            }
                        });

                        assProcess.on('error', (err) => {
                            console.warn('⚠️  [ASS] Error:', err.message);
                            resolveASS(null);
                        });
                    });
                };

                const finalizar = async () => {
                    const assUrl = await generarASS();
                    console.log('════════════════════════════════════════');
                    console.log(` [AudioService] COMPLETADO: ${nombreArchivo}`);
                    console.log(`    Audio: ${(stats.size / 1024).toFixed(2)} KB`);
                    console.log(`   SRT: ${srtUrl ? '✅' : '❌'}`);
                    console.log(`    ASS: ${assUrl ? '✅' : '❌'}`);
                    console.log('════════════════════════════════════════\n');
                    
                    resolve({
                        url: '/audios/' + nombreArchivo,
                        srt: srtUrl,
                        ass: assUrl,
                        textoLimpio: textoParaSubtitulosLimpio,
                        stats
                    });
                };

                // ✅ WHISPER.CPP TIENE PRIORIDAD
                if (usarWhisperCpp) {
                    console.log('\n [SRT] Estrategia: Whisper.cpp (prioridad)');
                    
                    const maxPalabras = opciones.maxPalabras || 7;
                    
                    this.generarSRTWhisperCpp(rutaArchivo, rutaSRT, maxPalabras)
                        .then(() => {
                            if (fs.existsSync(rutaSRT)) {
                                srtUrl = '/audios/' + nombreSRT;
                                console.log(' [SRT] Whisper.cpp exitoso\n');
                            }
                            finalizar();
                        })
                        .catch((err) => {
                            console.warn(' [SRT] Whisper.cpp falló:', err.message);
                            console.log(' [SRT] Usando fallback matemático...');
                            if (this.generarSRTMatematico(textoParaSubtitulosLimpio, rutaArchivo, rutaSRT)) {
                                srtUrl = '/audios/' + nombreSRT;
                            }
                            finalizar();
                        });
                } else if (usarPythonSRT) {
                    console.log('\n [SRT] Estrategia: Whisper (Python)');
                    const pythonCmd = this.pythonBin || 'python';

                    const pythonProcess = spawn(pythonCmd, [
                        this.pythonScript, rutaArchivo, rutaSRT, textoParaSubtitulosLimpio
                    ], { windowsHide: true, shell: false });

                    let pyStdout = '', pyStderr = '';
                    pythonProcess.stdout.on('data', (data) => {
                        pyStdout += data.toString();
                        console.log('   [Whisper]', data.toString().trim());
                    });
                    pythonProcess.stderr.on('data', (data) => {
                        pyStderr += data.toString();
                        console.error('   [Whisper ERR]', data.toString().trim());
                    });

                    const usarFallbackMatematico = () => {
                        console.warn(' [SRT] Whisper Python falló');
                        console.log(' [SRT] Usando fallback matemático...');
                        if (this.generarSRTMatematico(textoParaSubtitulosLimpio, rutaArchivo, rutaSRT)) {
                            srtUrl = '/audios/' + nombreSRT;
                        }
                        finalizar();
                    };

                    pythonProcess.on('close', (pythonCode) => {
                        if (pythonCode === 0 && fs.existsSync(rutaSRT)) {
                            srtUrl = '/audios/' + nombreSRT;
                            console.log('[SRT] Whisper Python exitoso\n');
                            finalizar();
                        } else {
                            usarFallbackMatematico();
                        }
                    });

                    pythonProcess.on('error', (err) => {
                        console.error('❌ Error spawn Whisper Python:', err.message);
                        if (this.generarSRTMatematico(textoParaSubtitulosLimpio, rutaArchivo, rutaSRT)) {
                            srtUrl = '/audios/' + nombreSRT;
                        }
                        finalizar();
                    });
                } else {
                    console.log('\n [SRT] Estrategia: Matemático');
                    if (this.generarSRTMatematico(textoParaSubtitulosLimpio, rutaArchivo, rutaSRT)) {
                        srtUrl = '/audios/' + nombreSRT;
                    }
                    finalizar();
                }
            });

            proceso.on('error', (err) => {
                console.error('❌ Error generador voz:', err.message);
                reject(new Error('Error generador voz: ' + err.message));
            });
        });
    }

    // ==========================================
    // ✅ DUCKING
    // ==========================================
    async aplicarDucking(voiceAudioPathAbsoluta, musicPathAbsoluta, options = {}) {
        return new Promise((resolve, reject) => {
            console.log('\n════════════════════════════════════════');
            console.log(' [Ducking] INICIANDO MEZCLA');
            console.log('════════════════════════════════════════');
            
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

            console.log(`   Voz: ${path.basename(voiceAudioCompleto)} | Existe: ${fs.existsSync(voiceAudioCompleto)}`);
            console.log(`    Música: ${path.basename(musicCompleto)} | Existe: ${fs.existsSync(musicCompleto)}`);
            console.log(`   Volumen música: ${musicVolume}`);
            console.log(`   Loop: ${loopMusic}`);
            console.log(`   Fade In: ${fadeInMusic}s | Fade Out: ${fadeOutMusic}s`);

            if (!fs.existsSync(voiceAudioCompleto)) {
                console.error('❌ Audio de voz no encontrado');
                return reject(new Error('Audio de voz no encontrado: ' + voiceAudioCompleto));
            }
            if (!fs.existsSync(musicCompleto)) {
                console.error('❌ Música no encontrada');
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
                        console.error('❌ No se pudo obtener la duración');
                        return reject(new Error('No se pudo obtener la duracion del audio'));
                    }
                }

                const fadeOutStart = Math.max(0, duracionVoz - fadeOutMusic);
                console.log(`  Voz: ${duracionVoz.toFixed(1)}s | Fade out: ${fadeOutStart.toFixed(1)}s`);

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
                    '-ar', '44100'
                );

                if (loopMusic) {
                    ffmpegArgs.push('-t', String(duracionVoz));
                }

                ffmpegArgs.push('-y', rutaSalida);

                const ffmpegProcess = spawn(this.ffmpegPath, ffmpegArgs, {
                    windowsHide: true, shell: false
                });

                let stderr = '';
                ffmpegProcess.stderr.on('data', (data) => { stderr += data.toString(); });

                ffmpegProcess.on('close', (code) => {
                    if (code === 0 && fs.existsSync(rutaSalida)) {
                        const outStats = fs.statSync(rutaSalida);
                        if (outStats.size < 2000) {
                            console.error('❌ Ducking generó archivo vacío');
                            return reject(new Error('Ducking genero archivo vacio'));
                        }
                        console.log(`[Ducking] Aplicado: ${nombreSalida} (${(outStats.size / 1024).toFixed(2)} KB)\n`);
                        resolve({
                            url: '/audios/' + nombreSalida,
                            mensaje: 'Ducking aplicado correctamente'
                        });
                    } else {
                        console.error('❌ [Ducking] FFmpeg Error:', stderr);
                        reject(new Error('Ducking fallo: ' + stderr.substring(0, 500)));
                    }
                });

                ffmpegProcess.on('error', (err) => {
                    console.error('❌ [Ducking] FFmpeg error:', err.message);
                    reject(new Error('FFmpeg error: ' + err.message));
                });
            });

            ffmpegInfo.on('error', (err) => {
                console.error('❌ [Ducking] Error obteniendo duración:', err.message);
                reject(new Error('Error obteniendo duracion: ' + err.message));
            });
        });
    }

    // ==========================================
    // ✅ CONVERTIR A MP3
    // ==========================================
    async convertirAMp3(wavPathAbsoluta, outputFolder) {
        return new Promise((resolve, reject) => {
            console.log('\n🎵 [MP3] Iniciando conversión...');
            
            const wavCompleto = wavPathAbsoluta;

            if (!fs.existsSync(wavCompleto)) {
                console.error('❌ WAV no existe:', wavCompleto);
                return reject(new Error('WAV no existe: ' + wavCompleto));
            }

            const nombreMp3 = `export-${Date.now()}.mp3`;
            const rutaMp3 = path.join(outputFolder || this.audioFolder, nombreMp3);

            console.log(`  WAV: ${path.basename(wavCompleto)}`);

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
                    const stats = fs.statSync(rutaMp3);
                    console.log(`✅ [MP3] Convertido: ${nombreMp3} (${(stats.size / 1024).toFixed(2)} KB)\n`);
                    resolve({
                        url: '/audios/' + nombreMp3,
                        mensaje: 'MP3 listo'
                    });
                } else {
                    console.error('❌ [MP3] Error:', stderr);
                    reject(new Error('MP3 fallo: ' + stderr));
                }
            });

            ffmpegProcess.on('error', (err) => {
                console.error('❌ [MP3] FFmpeg error:', err.message);
                reject(new Error('FFmpeg: ' + err.message));
            });
        });
    }
}

module.exports = AudioService;