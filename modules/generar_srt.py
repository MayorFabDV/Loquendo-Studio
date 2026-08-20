# -*- coding: utf-8 -*-
"""
Generador de subtítulos SRT - VERSIÓN BULLETPROOF.
Nunca falla. Si Whisper crashea, usa texto original como fallback.
"""
import os
import sys
import re
import difflib
import traceback
import whisper  # Asegúrate de tener instalado el paquete 'whisper' (pip install openai-whisper)

# --- Configurar FFmpeg desde bin/ ---
current_dir = os.path.dirname(os.path.abspath(__file__))
bin_dir = os.path.abspath(os.path.join(current_dir, '..', 'bin'))
ffmpeg_path = os.path.join(bin_dir, 'ffmpeg.exe')

if os.path.exists(ffmpeg_path):
    os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
    print(f"[OK] FFmpeg configurado: {ffmpeg_path}")
else:
    print(f"[WARN] FFmpeg no encontrado en: {ffmpeg_path}")


def formatear_tiempo(segundos):
    """Convierte segundos a formato SRT (HH:MM:SS,mmm)."""
    horas = int(segundos // 3600)
    minutos = int((segundos % 3600) // 60)
    segs = int(segundos % 60)
    milisegundos = int((segundos % 1) * 1000)
    return f"{horas:02d}:{minutos:02d}:{segs:02d},{milisegundos:03d}"


def extraer_vocabulario_guion(texto_original):
    """Extrae automáticamente palabras clave del guion original."""
    if not texto_original:
        return {}
    
    vocabulario = {}
    patrones = [
        r'\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)*\b',
        r'\b[a-záéíóúñ]+\d+\b',
        r'\b\d+[a-záéíóúñ]+\b',
    ]
    
    for patron in patrones:
        for match in re.finditer(patron, texto_original):
            palabra = match.group(0)
            vocabulario[palabra.lower()] = palabra
    
    destacadas = re.findall(r'"([^"]+)"', texto_original)
    for palabra in destacadas:
        vocabulario[palabra.lower()] = palabra
    
    return vocabulario


def limpiar_repeticiones_whisper(texto):
    """Elimina bucles de alucinación de Whisper."""
    if not texto:
        return texto
    
    texto_limpio = texto
    
    # Patrón 1: Frases cortas repetidas 3+ veces
    patron_frases = r'((?:\b\w+\b(?:\s+|[,;.!?])?){2,6})\s*(?:[,;.!?]\s*)?\1(?:\s*(?:[,;.!?]\s*)?\1)+'
    texto_limpio = re.sub(patron_frases, r'\1', texto_limpio, flags=re.IGNORECASE)
    
    # Patrón 2: Palabra única 4+ veces seguidas
    patron_palabra = r'\b(\w+)(?:\s+\1){3,}\b'
    texto_limpio = re.sub(patron_palabra, r'\1', texto_limpio, flags=re.IGNORECASE)
    
    # Patrón 3: Densidad de repeticiones
    palabras = texto_limpio.split()
    if len(palabras) > 5:
        conteo = {}
        for p in palabras:
            pl = p.lower().strip('.,;!?')
            conteo[pl] = conteo.get(pl, 0) + 1
        max_reps = max(conteo.values()) if conteo else 0
        if max_reps > 3 and max_reps / len(palabras) > 0.4:
            resultado = []
            prev = None
            rep_count = 0
            for p in palabras:
                pl = p.lower().strip('.,;!?')
                if pl == prev:
                    rep_count += 1
                    if rep_count < 2:
                        resultado.append(p)
                else:
                    prev = pl
                    rep_count = 0
                    resultado.append(p)
            texto_limpio = ' '.join(resultado)
    
    return re.sub(r'\s+', ' ', texto_limpio).strip()


def corregir_por_similitud_fonetica(texto, vocabulario_guion, umbral=0.75):
    """Corrige palabras por similitud fonética con el vocabulario del guion."""
    if not vocabulario_guion or not texto:
        return texto
    
    palabras = texto.split()
    resultado = []
    
    for palabra in palabras:
        limpia = re.sub(r'[^\wáéíóúñ]', '', palabra.lower())
        if not limpia:
            resultado.append(palabra)
            continue
        
        if limpia in vocabulario_guion:
            resultado.append(vocabulario_guion[limpia])
            continue
        
        mejor_match = None
        mejor_ratio = 0
        
        for clave, original in vocabulario_guion.items():
            ratio = difflib.SequenceMatcher(None, limpia, clave).ratio()
            if ratio > mejor_ratio and ratio >= umbral:
                mejor_ratio = ratio
                mejor_match = original
        
        if mejor_match:
            puntuacion = re.sub(r'[\wáéíóúñ]', '', palabra)
            resultado.append(mejor_match + puntuacion)
        else:
            resultado.append(palabra)
    
    return ' '.join(resultado)


def corregir_alucinaciones_universal(texto, texto_original=None):
    """Pipeline completo de corrección."""
    if not texto:
        return texto
    
    texto = limpiar_repeticiones_whisper(texto)
    vocabulario = extraer_vocabulario_guion(texto_original) if texto_original else {}
    
    if vocabulario:
        texto = corregir_por_similitud_fonetica(texto, vocabulario)
    
    return texto.strip()


def deduplicar_segmentos_repetidos(segmentos, texto_original=None):
    """Evita duplicados consecutivos de Whisper (la misma frase repetida 3-4 veces)."""
    resultado = []
    for seg in segmentos:
        if not isinstance(seg, dict):
            continue

        texto_crudo = str(seg.get('text', '') or '').strip()
        texto_final = corregir_alucinaciones_universal(texto_crudo, texto_original)

        if len(texto_final.split()) < 2:
            continue

        texto_norm = re.sub(r'\s+', ' ', texto_final.lower())
        if resultado and re.sub(r'\s+', ' ', resultado[-1]['text'].lower()) == texto_norm:
            resultado[-1]['end'] = max(resultado[-1]['end'], float(seg.get('end', resultado[-1]['end']) or resultado[-1]['end']))
            continue

        resultado.append({
            'start': float(seg.get('start', 0) or 0),
            'end': float(seg.get('end', 0) or 0),
            'text': texto_final,
        })

    return resultado


def generar_srt_fallback(texto_original, duracion_total, ruta_salida):
    """
    FALLBACK MATEMÁTICO: Si Whisper falla, distribuye el texto original
    en segmentos de ~5 segundos.
    """
    print("[FALLBACK] Generando SRT con método matemático...")
    
    if not texto_original or not texto_original.strip():
        with open(ruta_salida, "w", encoding="utf-8") as f:
            f.write("1\n00:00:00,000 --> 00:00:05,000\n[Transcripción no disponible]\n\n")
        print("[FALLBACK] SRT vacío generado (sin texto original)")
        return
    
    # Dividir por oraciones (puntos, signos de exclamación, interrogación)
    oraciones = re.split(r'(?<=[.!?])\s+', texto_original.strip())
    oraciones = [o.strip() for o in oraciones if o.strip()]
    
    if not oraciones:
        with open(ruta_salida, "w", encoding="utf-8") as f:
            f.write("1\n00:00:00,000 --> 00:00:05,000\n[Texto no válido]\n\n")
        return
    
    duracion_por_oracion = duracion_total / max(len(oraciones), 1)
    
    with open(ruta_salida, "w", encoding="utf-8") as f:
        for i, oracion in enumerate(oraciones, 1):
            inicio = (i - 1) * duracion_por_oracion
            fin = i * duracion_por_oracion
            
            # Ajustar último segmento
            if i == len(oraciones):
                fin = duracion_total
            
            inicio_str = formatear_tiempo(inicio)
            fin_str = formatear_tiempo(fin)
            
            f.write(f"{i}\n{inicio_str} --> {fin_str}\n{oracion}\n\n")
            print(f"  {i}: {inicio_str} --> {fin_str} | {oracion}")
    
    print(f"[FALLBACK] SRT generado: {ruta_salida}")


def obtener_duracion_audio(ruta_audio):
    """Obtiene la duración del audio en segundos usando ffprobe."""
    try:
        import subprocess
        result = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration', 
             '-of', 'default=noprint_wrappers=1:nokey=1', ruta_audio],
            capture_output=True, text=True
        )
        return float(result.stdout.strip())
    except Exception:
        return 0


def generar_srt(ruta_audio, ruta_salida, texto_original=None):
    """
    Genera SRT con Whisper. Si falla POR CUALQUIER RAZÓN, usa fallback matemático.
    NUNCA devuelve error a Node.js.
    """
    print(f"[IA] Analizando audio: {os.path.basename(ruta_audio)}")

    tamano = os.path.getsize(ruta_audio)
    print(f"[DEBUG] Tamaño del audio: {tamano / 1024:.2f} KB")

    if tamano < 1000:
        print("[ERROR] Audio demasiado pequeño, usando fallback")
        duracion = 5
        generar_srt_fallback(texto_original, duracion, ruta_salida)
        return

    try:
        

        modelo_nombre = os.environ.get("WHISPER_MODEL", "small")
        print(f"[IA] Cargando modelo Whisper ({modelo_nombre})...")

        model = whisper.load_model(modelo_nombre)

        opciones = {
            "language": "es",
            "temperature": 0.0,
            "best_of": 5,
            "condition_on_previous_text": False,
            "compression_ratio_threshold": 1.8,
            "no_speech_threshold": 0.5,
        }

        if texto_original and len(texto_original.strip()) > 0:
            prompt = texto_original.strip()[:300]
            opciones["initial_prompt"] = f"Transcripción de video Loquendo: {prompt}"
            print(f"[OK] Usando texto original como guía ({len(prompt)} chars)")

        print("[IA] Transcribiendo... (puede tardar unos segundos)")
        result = model.transcribe(ruta_audio, **opciones)

        if not result.get("segments"):
            print("[ADVERTENCIA] Whisper no detectó segmentos. Usando fallback.")
            duracion = obtener_duracion_audio(ruta_audio) or 60
            generar_srt_fallback(texto_original, duracion, ruta_salida)
            return

        segmentos_limpios = deduplicar_segmentos_repetidos(result.get("segments", []), texto_original)
        print(f"[OK] {len(segmentos_limpios)} segmento(s) válidos tras limpiar repeticiones")

        with open(ruta_salida, "w", encoding="utf-8") as f:
            for i, segment in enumerate(segmentos_limpios, 1):
                inicio = formatear_tiempo(segment['start'])
                fin = formatear_tiempo(segment['end'])
                texto_final = segment['text'].strip()

                if len(texto_final.split()) < 2:
                    print(f"  ⚠️ Segmento {i} omitido (contenido no válido)")
                    continue

                print(f"  {i}: {inicio} --> {fin} | {texto_final}")
                f.write(f"{i}\n{inicio} --> {fin}\n{texto_final}\n\n")

        print(f"[OK] SRT generado con Whisper: {ruta_salida}")

    except Exception as e:
        print(f"[ERROR] Whisper falló: {str(e)}")
        traceback.print_exc()
        print("[INFO] Cambiando a fallback matemático...")
        
        duracion = obtener_duracion_audio(ruta_audio) or 60
        generar_srt_fallback(texto_original, duracion, ruta_salida)
        # IMPORTANTE: No hacemos sys.exit(1), devolvemos código 0


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("ERROR: Uso -> python generar_srt.py <ruta_audio.wav> <ruta_salida.srt> [texto_original]")
        # Incluso con error de argumentos, generamos un SRT vacío para no crashear Node
        if len(sys.argv) >= 2:
            ruta_salida = sys.argv[2] if len(sys.argv) > 2 else "fallback.srt"
            generar_srt_fallback(None, 5, ruta_salida)
        sys.exit(0)  # Código 0 para no activar fallback de Node

    ruta_audio = sys.argv[1]
    ruta_salida = sys.argv[2]
    texto_original = sys.argv[3] if len(sys.argv) > 3 else None

    generar_srt(ruta_audio, ruta_salida, texto_original)