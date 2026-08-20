const fs = require('fs');
const path = require('path');

// Aplicar diccionarios (reutilizable)
function aplicarDiccionarios(textoOriginal) {
  let texto = textoOriginal;
  const dbFolder = path.join(__dirname, '..', 'db');
  const JSON_PERFIL = path.join(dbFolder, 'perfil_usuario.json');
  const JSON_JERGAS = path.join(dbFolder, 'diccionario_jergas.json');
  const JSON_SINONIMOS = path.join(dbFolder, 'diccionario_sinonimos.json');

  const elegirSinonimo = (valor) => {
    if (Array.isArray(valor)) {
      return valor[Math.floor(Math.random() * valor.length)];
    }
    return valor;
  };

  try {
    if (fs.existsSync(JSON_PERFIL)) {
      const perfil = JSON.parse(fs.readFileSync(JSON_PERFIL, 'utf8') || '{}');
      for (const [original, reemplazo] of Object.entries(perfil)) {
        const regex = new RegExp(`\\b${original}\\b`, 'gi');
        texto = texto.replace(regex, elegirSinonimo(reemplazo));
      }
    }

    if (fs.existsSync(JSON_JERGAS)) {
      const jergas = JSON.parse(fs.readFileSync(JSON_JERGAS, 'utf8') || '{}');
      for (const [original, reemplazo] of Object.entries(jergas)) {
        const regex = new RegExp(`\\b${original}\\b`, 'gi');
        texto = texto.replace(regex, elegirSinonimo(reemplazo));
      }
    }

    if (fs.existsSync(JSON_SINONIMOS)) {
      const sinonimos = JSON.parse(fs.readFileSync(JSON_SINONIMOS, 'utf8') || '{}');
      for (const [original, reemplazo] of Object.entries(sinonimos)) {
        const regex = new RegExp(`\\b${original}\\b`, 'gi');
        texto = texto.replace(regex, elegirSinonimo(reemplazo));
      }
    }
  } catch (err) {
    console.error("Error al aplicar diccionarios:", err);
  }
  return texto;
}

/**
 * Lee la duración REAL del audio desde el header WAV.
 * No necesita ffprobe ni procesos externos. Es instantáneo.
 */
function obtenerDuracionAudio(rutaAudio) {
  try {
    const buffer = fs.readFileSync(rutaAudio);
    
    // Verificar que sea WAV válido (RIFF header)
    const riff = buffer.toString('ascii', 0, 4);
    const wave = buffer.toString('ascii', 8, 12);
    
    if (riff !== 'RIFF' || wave !== 'WAVE') {
      console.warn("[DURACIÓN] No es un WAV estándar, usando estimación por tamaño");
      return Math.max(0, (buffer.length - 44) / 32000);
    }
    
    // Leer sample rate (bytes 24-27, little-endian)
    const sampleRate = buffer.readUInt32LE(24);
    // Leer número de canales (bytes 22-23)
    const numChannels = buffer.readUInt16LE(22);
    // Leer bits per sample (bytes 34-35)
    const bitsPerSample = buffer.readUInt16LE(34);
    // Leer tamaño de datos de audio (bytes 40-43)
    const dataSize = buffer.readUInt32LE(40);
    
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    
    if (byteRate === 0) {
      console.warn("[DURACIÓN] byteRate es 0, usando estimación");
      return Math.max(0, (buffer.length - 44) / 32000);
    }
    
    const duracion = dataSize / byteRate;
    console.log(`[WAV] ${sampleRate}Hz, ${bitsPerSample}-bit, ${numChannels}ch → ${duracion.toFixed(2)}s`);
    return duracion;
    
  } catch (e) {
    console.error("[DURACIÓN] Error leyendo audio:", e);
    return 60; // Default 1 minuto
  }
}

/**
 * Formatea segundos a SRT (HH:MM:SS,mmm)
 */
function formatoTiempo(segundos) {
  const h = Math.floor(segundos / 3600);
  const m = Math.floor((segundos % 3600) / 60);
  const s = Math.floor(segundos % 60);
  const ms = Math.floor((segundos % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Divide una oración larga en fragmentos de máximo maxChars caracteres,
 * respetando palabras completas.
 */
function partirOracion(oracion, maxChars = 42) {
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

/**
 * Genera SRT matemático MEJORADO:
 * - Lee duración exacta del header WAV (sin ffprobe)
 * - Ningún subtítulo dura más de maxDuracionSeg (default 7s)
 * - Máximo 42 caracteres por línea
 * - Gap de 0.15s entre subtítulos
 */
function generarSRTMatematico(texto, rutaAudio, rutaSRT, nombreSRT, opciones = {}) {
  try {
    const maxDuracionSeg = opciones.maxDuracionSeg || 7.0;
    const maxChars = opciones.maxChars || 42;
    const gapSeg = opciones.gapSeg || 0.15;
    
    const duracionTotal = obtenerDuracionAudio(rutaAudio);
    if (duracionTotal <= 0) {
      console.error("[SRT Matemático] No se pudo determinar la duración del audio");
      return null;
    }

    // 1. Dividir por oraciones
    let oraciones = texto.split(/(?<=[.!?¡¿])\s+/).filter(o => o.trim().length > 0);
    if (oraciones.length === 0) return null;
    
    // 2. Partir oraciones muy largas en fragmentos manejables
    let fragmentos = [];
    for (const oracion of oraciones) {
      const partes = partirOracion(oracion, maxChars);
      fragmentos.push(...partes);
    }
    
    const totalPalabras = fragmentos.reduce((sum, f) => sum + f.split(/\s+/).length, 0);
    if (totalPalabras === 0) return null;

    // 3. Calcular tiempo por palabra base
    const tiempoPorPalabra = (duracionTotal - (fragmentos.length * gapSeg)) / totalPalabras;
    
    let srtContent = '';
    let tiempoActual = 0;
    let numeroSubtitulo = 1;
    
    for (const fragmento of fragmentos) {
      const palabrasFragmento = fragmento.split(/\s+/).length;
      
      // Duración proporcional, pero CAPADA al máximo
      let duracionFragmento = palabrasFragmento * tiempoPorPalabra;
      duracionFragmento = Math.min(duracionFragmento, maxDuracionSeg);
      
      // Asegurar que no nos pasemos del audio total
      if (tiempoActual + duracionFragmento > duracionTotal) {
        duracionFragmento = duracionTotal - tiempoActual;
      }
      if (duracionFragmento <= 0) break;
      
      const tiempoInicio = formatoTiempo(tiempoActual);
      tiempoActual += duracionFragmento;
      const tiempoFin = formatoTiempo(tiempoActual);
      
      srtContent += `${numeroSubtitulo}\n${tiempoInicio} --> ${tiempoFin}\n${fragmento.trim()}\n\n`;
      numeroSubtitulo++;
      
      // Gap entre subtítulos
      tiempoActual += gapSeg;
    }
    
    fs.writeFileSync(rutaSRT, srtContent, 'utf8');
    console.log(`[SRT Matemático] Generado: ${rutaSRT} (${numeroSubtitulo - 1} líneas, ${duracionTotal.toFixed(1)}s)`);
    return `/audios/${nombreSRT}`;
  } catch (e) {
    console.error("Error en SRT matemático:", e);
    return null;
  }
}

module.exports = {
  aplicarDiccionarios,
  generarSRTMatematico,
  obtenerDuracionAudio
};