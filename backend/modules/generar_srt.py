# modules/generar_srt.py
# -*- coding: utf-8 -*-
"""
Generador de subtítulos SRT - VERSIÓN BULLETPROOF PARA ELECTRON.
- Busca ffmpeg.exe dinámicamente
- Anti-bucles de Whisper
- Anti-alucinaciones
- División configurable por palabras (2, 5, 7, etc.)
"""
import os
import sys
import re
import difflib
import traceback
import subprocess

# --- CONFIGURACIÓN DE RUTAS BULLETPROOF ---
current_dir = os.path.dirname(os.path.abspath(__file__))

def encontrar_ffmpeg():
    """Busca ffmpeg.exe en todas las rutas posibles de Electron."""
    posibles_rutas = [
        os.path.join(current_dir, '..', 'bin', 'ffmpeg.exe'),
        os.path.join(current_dir, 'ffmpeg.exe'),
        os.path.join(current_dir, '..', '..', 'app.asar.unpacked', 'bin', 'ffmpeg.exe'),
        os.path.join(current_dir, '..', '..', 'bin', 'ffmpeg.exe'),
    ]
    for ruta in posibles_rutas:
        ruta_absoluta = os.path.abspath(ruta)
        if os.path.exists(ruta_absoluta):
            return ruta_absoluta
    return None

ffmpeg_path = encontrar_ffmpeg()

if ffmpeg_path:
    os.environ["PATH"] = os.path.dirname(ffmpeg_path) + os.pathsep + os.environ.get("PATH", "")
    print(f"[OK] FFmpeg encontrado en: {ffmpeg_path}")
else:
    print("[WARN] FFmpeg no encontrado en las rutas esperadas.")

def encontrar_ffprobe():
    """Busca ffprobe.exe en el mismo directorio que ffmpeg (o rutas comunes)."""
    base_dir = os.path.dirname(ffmpeg_path) if ffmpeg_path else os.path.join(current_dir, '..', 'bin')
    posibles_rutas = [
        os.path.join(base_dir, 'ffprobe.exe'),
        os.path.join(current_dir, 'ffprobe.exe'),
    ]
    for ruta in posibles_rutas:
        ruta_absoluta = os.path.abspath(ruta)
        if os.path.exists(ruta_absoluta):
            return ruta_absoluta
    return None

ffprobe_path = encontrar_ffprobe()

try:
    import whisper
    WHISPER_DISPONIBLE = True
except ImportError:
    WHISPER_DISPONIBLE = False
    print("[WARN] Módulo 'whisper' no instalado. Usando fallback matemático.")


# ============================================================
# FORMATEAR TIEMPO
# ============================================================
def formatear_tiempo(segundos):
    """Convierte segundos a formato SRT (HH:MM:SS,mmm)."""
    horas = int(segundos // 3600)
    minutos = int((segundos % 3600) // 60)
    segs = int(segundos % 60)
    milisegundos = int((segundos % 1) * 1000)
    return f"{horas:02d}:{minutos:02d}:{segs:02d},{milisegundos:03d}"


# ============================================================
# NUEVO: DIVIDIR POR PALABRAS
# ============================================================
def dividir_por_palabras(texto, max_palabras=7):
    """
    Divide un texto en fragmentos de máximo N palabras.
    
    Args:
        texto (str): Texto a dividir
        max_palabras (int): Máximo de palabras por fragmento (2-20)
    
    Returns:
        list: Lista de fragmentos (strings)
    """
    if not texto or texto.strip() == '':
        return []
    
    # Validar rango
    max_palabras = max(2, min(20, int(max_palabras)))
    
    # Separar por oraciones primero
    oraciones = re.split(r'(?<=[.!?])\s+', texto.strip())
    
    fragmentos = []
    for oracion in oraciones:
        palabras = oracion.strip().split()
        
        if len(palabras) <= max_palabras:
            if palabras:
                fragmentos.append(' '.join(palabras))
        else:
            # Dividir en bloques
            for i in range(0, len(palabras), max_palabras):
                bloque = palabras[i:i + max_palabras]
                if bloque:
                    fragmentos.append(' '.join(bloque))
    
    return fragmentos


# ============================================================
# EXTRAER VOCABULARIO DEL GUION
# ============================================================
def extraer_vocabulario_guion(texto_original):
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


# ============================================================
# LIMPIAR REPETICIONES DE WHISPER
# ============================================================
def limpiar_repeticiones_whisper(texto):
    if not texto:
        return texto
    texto_limpio = texto
    patron_frases = r'((?:\b\w+\b(?:\s+|[,;.!?])?){2,6})\s*(?:[,;.!?]\s*)?\1(?:\s*(?:[,;.!?]\s*)?\1)+'
    texto_limpio = re.sub(patron_frases, r'\1', texto_limpio, flags=re.IGNORECASE)
    patron_palabra = r'\b(\w+)(?:\s+\1){3,}\b'
    texto_limpio = re.sub(patron_palabra, r'\1', texto_limpio, flags=re.IGNORECASE)
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


# ============================================================
# CORREGIR POR SIMILITUD FONÉTICA
# ============================================================
def corregir_por_similitud_fonetica(texto, vocabulario_guion, umbral=0.75):
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


# ============================================================
# CORREGIR ALUCINACIONES
# ============================================================
def corregir_alucinaciones_universal(texto, texto_original=None):
    if not texto:
        return texto
    texto = limpiar_repeticiones_whisper(texto)
    vocabulario = extraer_vocabulario_guion(texto_original) if texto_original else {}
    if vocabulario:
        texto = corregir_por_similitud_fonetica(texto, vocabulario)
    return texto.strip()


# ============================================================
# DEDUPLICAR SEGMENTOS REPETIDOS
# ============================================================
def deduplicar_segmentos_repetidos(segmentos, texto_original=None):
    resultado = []
    for seg in segmentos:
        if not isinstance(seg, dict):
            continue
        texto_crudo = str(seg.get('text', '') or '').strip()
        texto_final = corregir_alucinaciones_universal(texto_crudo, texto_original)
        if len(texto_final.split()) < 2:
            continue

        # Detección de duplicados
        es_duplicado = False
        if resultado:
            ultimo_texto = resultado[-1]['text'].lower()
            actual_texto = texto_final.lower()
            palabras_actuales = set(actual_texto.split())
            palabras_anteriores = set(ultimo_texto.split())
            
            if len(palabras_actuales) > 0:
                similitud = len(palabras_actuales.intersection(palabras_anteriores)) / len(palabras_actuales)
                if similitud > 0.6:
                    es_duplicado = True
                    resultado[-1]['end'] = max(resultado[-1]['end'], float(seg.get('end', 0) or 0))

        if not es_duplicado:
            resultado.append({
                'start': float(seg.get('start', 0) or 0),
                'end': float(seg.get('end', 0) or 0),
                'text': texto_final,
            })
    return resultado


# ============================================================
# FALLBACK MATEMÁTICO CON DIVISIÓN POR PALABRAS
# ============================================================
def generar_srt_fallback(texto_original, duracion_total, ruta_salida, max_palabras=7):
    """Fallback matemático con división por palabras."""
    print(f"[FALLBACK] Generando SRT con {max_palabras} palabras máximo...")
    
    if not texto_original or not texto_original.strip():
        with open(ruta_salida, "w", encoding="utf-8") as f:
            f.write("1\n00:00:00,000 --> 00:00:05,000\n[Transcripción no disponible]\n\n")
        return
    
    # ✅ Usar la nueva función de división por palabras
    fragmentos = dividir_por_palabras(texto_original, max_palabras)
    
    if not fragmentos:
        with open(ruta_salida, "w", encoding="utf-8") as f:
            f.write("1\n00:00:00,000 --> 00:00:05,000\n[Texto no válido]\n\n")
        return
    
    # Calcular tiempos
    total_palabras = sum(len(f.split()) for f in fragmentos)
    if total_palabras == 0:
        return
    
    tiempo_total_gaps = len(fragmentos) * 0.15
    tiempo_disponible = max(0, duracion_total - tiempo_total_gaps)
    tiempo_por_palabra = max(0.05, tiempo_disponible / total_palabras)
    
    with open(ruta_salida, "w", encoding="utf-8") as f:
        tiempo_actual = 0.0
        for i, fragmento in enumerate(fragmentos, 1):
            palabras_fragmento = len(fragmento.split())
            duracion_fragmento = min(palabras_fragmento * tiempo_por_palabra, 7.0)
            
            if tiempo_actual + duracion_fragmento > duracion_total:
                duracion_fragmento = duracion_total - tiempo_actual
            
            if duracion_fragmento <= 0:
                duracion_fragmento = 0.5
            
            inicio_str = formatear_tiempo(tiempo_actual)
            tiempo_actual += duracion_fragmento
            fin_str = formatear_tiempo(tiempo_actual)
            
            f.write(f"{i}\n{inicio_str} --> {fin_str}\n{fragmento}\n\n")
            tiempo_actual += 0.15
    
    print(f"[FALLBACK] SRT generado: {ruta_salida} ({len(fragmentos)} subtítulos)")


# ============================================================
# OBTENER DURACIÓN DEL AUDIO
# ============================================================
def obtener_duracion_audio(ruta_audio):
    # 1) ffprobe: opción más fiable y limpia
    if ffprobe_path:
        try:
            cmd = [ffprobe_path, '-v', 'error',
                   '-show_entries', 'format=duration',
                   '-of', 'default=noprint_wrappers=1:nokey=1', ruta_audio]
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
            if result.returncode == 0 and result.stdout.strip():
                try:
                    return float(result.stdout.strip())
                except ValueError:
                    pass
        except Exception:
            pass

    # 2) ffmpeg -i: parsear la duración desde stderr
    if ffmpeg_path:
        try:
            result = subprocess.run([ffmpeg_path, '-i', ruta_audio],
                                    capture_output=True, text=True, timeout=15)
            match = re.search(r'Duration:\s*(\d{2}):(\d{2}):(\d{2}\.\d{2})', result.stderr)
            if match:
                hh, mm, ss = int(match.group(1)), int(match.group(2)), float(match.group(3))
                return hh * 3600 + mm * 60 + ss
        except Exception:
            pass

    return 0


# ============================================================
# GENERAR SRT PRINCIPAL (WHISPER + DIVISIÓN POR PALABRAS)
# ============================================================
def generar_srt(ruta_audio, ruta_salida, texto_original=None, max_palabras=7):
    """Genera SRT usando Whisper con división configurable por palabras."""
    print(f"[IA] Analizando audio: {os.path.basename(ruta_audio)}")
    print(f"[IA] Max palabras por subtítulo: {max_palabras}")
    
    tamano = os.path.getsize(ruta_audio)
    if tamano < 1000:
        print("[ERROR] Audio demasiado pequeño, usando fallback")
        generar_srt_fallback(texto_original, 5, ruta_salida, max_palabras)
        return

    try:
        if not WHISPER_DISPONIBLE:
            raise ImportError("Whisper no disponible")

        # Inyectar 0.5s de silencio al inicio
        ruta_temporal = ruta_audio.replace('.wav', '_temp_silence.wav')
        audio_a_transcribir = ruta_audio
        
        if ffmpeg_path and os.path.exists(ffmpeg_path):
            print("[IA] Inyectando 0.5s de silencio...")
            cmd = [ffmpeg_path, '-y', '-i', ruta_audio, '-af', 'adelay=500|500:all=1', ruta_temporal]
            subprocess.run(cmd, capture_output=True, text=True)
            
            if os.path.exists(ruta_temporal):
                audio_a_transcribir = ruta_temporal

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
        
        # Pasar nombres propios como guía
        if texto_original and len(texto_original.strip()) > 0:
            nombres_propios = re.findall(r'\b[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\b', texto_original)
            vocabulario = " ".join(sorted(set(nombres_propios)))[:200]
            if vocabulario:
                opciones["initial_prompt"] = f"Vocabulario: {vocabulario}."

        print("[IA] Transcribiendo...")
        result = model.transcribe(audio_a_transcribir, **opciones)

        # Restar 0.5s a los timestamps
        for seg in result.get("segments", []):
            seg['start'] = max(0.0, seg['start'] - 0.5)
            seg['end'] = max(0.0, seg['end'] - 0.5)

        if not result.get("segments"):
            print("[ADVERTENCIA] Whisper no detectó segmentos. Usando fallback.")
            duracion = obtener_duracion_audio(ruta_audio) or 60
            generar_srt_fallback(texto_original, duracion, ruta_salida, max_palabras)
            return

        segmentos_limpios = deduplicar_segmentos_repetidos(result.get("segments", []), texto_original)
        print(f"[OK] {len(segmentos_limpios)} segmento(s) válidos")

        # ✅ NUEVO: Dividir cada segmento por max_palabras
        segmentos_finales = []
        for seg in segmentos_limpios:
            texto_seg = seg['text'].strip()
            inicio = seg['start']
            fin = seg['end']
            
            fragmentos = dividir_por_palabras(texto_seg, max_palabras)
            
            if len(fragmentos) <= 1:
                # Un solo fragmento
                segmentos_finales.append({
                    'start': inicio,
                    'end': fin,
                    'text': texto_seg
                })
            else:
                # Múltiples fragmentos: dividir el tiempo proporcionalmente
                duracion_total = fin - inicio
                total_palabras = sum(len(f.split()) for f in fragmentos)
                
                tiempo_actual = inicio
                for frag in fragmentos:
                    palabras = len(frag.split())
                    duracion_frag = (palabras / total_palabras) * duracion_total
                    
                    segmentos_finales.append({
                        'start': tiempo_actual,
                        'end': tiempo_actual + duracion_frag,
                        'text': frag
                    })
                    tiempo_actual += duracion_frag

        print(f"[OK] {len(segmentos_finales)} subtítulos finales (divididos por {max_palabras} palabras)")

        # Escribir SRT
        with open(ruta_salida, "w", encoding="utf-8") as f:
            for i, segment in enumerate(segmentos_finales, 1):
                inicio = formatear_tiempo(segment['start'])
                fin = formatear_tiempo(segment['end'])
                texto_final = segment['text'].strip()
                if len(texto_final.split()) < 2:
                    continue
                f.write(f"{i}\n{inicio} --> {fin}\n{texto_final}\n\n")
        
        print(f"[OK] SRT generado con Whisper: {ruta_salida}")
        
        # Limpiar archivo temporal
        if os.path.exists(ruta_temporal):
            try: os.remove(ruta_temporal)
            except: pass

    except Exception as e:
        print(f"[ERROR] Whisper falló: {str(e)}")
        traceback.print_exc()
        print("[INFO] Cambiando a fallback matemático...")
        duracion = obtener_duracion_audio(ruta_audio) or 60
        generar_srt_fallback(texto_original, duracion, ruta_salida, max_palabras)


# ============================================================
# PUNTO DE ENTRADA
# ============================================================
if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("ERROR: Uso -> python generar_srt.py <ruta_audio.wav> <ruta_salida.srt> [texto_original] [max_palabras]")
        if len(sys.argv) >= 2:
            ruta_salida = sys.argv[2] if len(sys.argv) > 2 else "fallback.srt"
            generar_srt_fallback(None, 5, ruta_salida, 7)
        sys.exit(0)
    
    ruta_audio = sys.argv[1]
    ruta_salida = sys.argv[2]
    texto_original = sys.argv[3] if len(sys.argv) > 3 else None
    max_palabras = int(sys.argv[4]) if len(sys.argv) > 4 else 7  # ✅ NUEVO
    
    generar_srt(ruta_audio, ruta_salida, texto_original, max_palabras)