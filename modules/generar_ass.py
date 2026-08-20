# -*- coding: utf-8 -*-
"""
Generador de subtítulos ASS (Advanced SubStation Alpha) con efectos visuales.
Versión UNIVERSAL: El modo SOLO controla colores/efectos visuales.
"""
import os
import sys
import re
import difflib

os.environ["OMP_NUM_THREADS"] = "2"
os.environ["MKL_NUM_THREADS"] = "2"
os.environ["OPENBLAS_NUM_THREADS"] = "2"

if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

try:
    import whisper
    WHISPER_DISPONIBLE = True
except ImportError:
    WHISPER_DISPONIBLE = False


def formatear_tiempo_ass(segundos):
    horas = int(segundos // 3600)
    minutos = int((segundos % 3600) // 60)
    segs = int(segundos % 60)
    centesimas = int((segundos % 1) * 100)
    return f"{horas}:{minutos:02d}:{segs:02d}.{centesimas:02d}"


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


def corregir_alucinaciones_universal(texto, texto_original=None):
    if not texto:
        return texto
    texto = limpiar_repeticiones_whisper(texto)
    vocabulario = extraer_vocabulario_guion(texto_original) if texto_original else {}
    if vocabulario:
        texto = corregir_por_similitud_fonetica(texto, vocabulario)
    return texto.strip()


def parsear_srt(ruta_srt):
    segmentos = []
    if not os.path.exists(ruta_srt):
        return segmentos
    with open(ruta_srt, 'r', encoding='utf-8') as f:
        contenido = f.read()
    bloques = re.split(r'\n\s*\n', contenido.strip())
    for bloque in bloques:
        lineas = bloque.strip().split('\n')
        if len(lineas) < 3:
            continue
        tiempo_linea = lineas[1]
        match = re.match(r'(\d{2}:\d{2}:\d{2},\d{3})\s*-->\s*(\d{2}:\d{2}:\d{2},\d{3})', tiempo_linea)
        if not match:
            continue
        inicio_str = match.group(1).replace(',', '.')
        fin_str = match.group(2).replace(',', '.')
        def a_segundos(t):
            h, m, s = t.split(':')
            return int(h) * 3600 + int(m) * 60 + float(s)
        inicio = a_segundos(inicio_str)
        fin = a_segundos(fin_str)
        texto = ' '.join(lineas[2:]).strip()
        segmentos.append({'start': inicio, 'end': fin, 'text': texto})
    return segmentos


def generar_script_ass(segmentos, modo="normal", titulo="Loquendo Studio"):
    estilos_modo = {
        "normal": {
            "PrimaryColour": "&H00FFFFFF", "SecondaryColour": "&H00FFFF00",
            "OutlineColour": "&H00000000", "BackColour": "&H80000000",
            "Outline": 3, "Shadow": 2, "Fontsize": 48, "Bold": -1, "Italic": 0,
        },
        "creepy": {
            "PrimaryColour": "&H000000FF", "SecondaryColour": "&H000000AA",
            "OutlineColour": "&H00000000", "BackColour": "&H80000000",
            "Outline": 4, "Shadow": 3, "Fontsize": 52, "Bold": -1, "Italic": 0,
        },
        "tutorial": {
            "PrimaryColour": "&H00FFFF80", "SecondaryColour": "&H00FFFF00",
            "OutlineColour": "&H00000000", "BackColour": "&H40000000",
            "Outline": 2, "Shadow": 1, "Fontsize": 44, "Bold": -1, "Italic": 0,
        },
        "gameplay": {
            "PrimaryColour": "&H0000FF00", "SecondaryColour": "&H0000AA00",
            "OutlineColour": "&H00000000", "BackColour": "&H80000000",
            "Outline": 3, "Shadow": 2, "Fontsize": 48, "Bold": -1, "Italic": 0,
        }
    }
    estilo = estilos_modo.get(modo, estilos_modo["normal"])
    lines = []
    lines.append("[Script Info]")
    lines.append(f"Title: {titulo}")
    lines.append("ScriptType: v4.00+")
    lines.append("PlayResX: 1920")
    lines.append("PlayResY: 1080")
    lines.append("ScaledBorderAndShadow: yes")
    lines.append("")
    lines.append("[V4+ Styles]")
    lines.append("Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding")
    estilo_str = (
        f"Style: Default,Arial,{estilo['Fontsize']},"
        f"{estilo['PrimaryColour']},{estilo['SecondaryColour']},"
        f"{estilo['OutlineColour']},{estilo['BackColour']},"
        f"{estilo['Bold']},{estilo['Italic']},0,0,100,100,0,0,1,"
        f"{estilo['Outline']},{estilo['Shadow']},2,10,10,40,1"
    )
    lines.append(estilo_str)
    lines.append("")
    lines.append("[Events]")
    lines.append("Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text")
    for seg in segmentos:
        inicio = formatear_tiempo_ass(seg['start'])
        fin = formatear_tiempo_ass(seg['end'])
        texto = seg['text'].strip()
        if not texto:
            continue
        duracion = seg['end'] - seg['start']
        texto_fx = aplicar_efectos(texto, duracion, modo)
        linea = f"Dialogue: 0,{inicio},{fin},Default,,0,0,0,,{texto_fx}"
        lines.append(linea)
    return '\n'.join(lines)


def aplicar_efectos(texto, duracion, modo):
    palabras = texto.split(' ')
    if not palabras:
        return texto
    if len(palabras) <= 2 or duracion < 2.0:
        if modo == "creepy":
            return "{\\fad(300,500)}" + texto
        elif modo == "gameplay":
            return "{\\fad(100,200)}" + texto
        elif modo == "tutorial":
            return "{\\fad(400,400)}" + texto
        else:
            return "{\\fad(200,200)}" + texto
    duracion_total_cs = int(duracion * 100)
    duracion_palabra = duracion_total_cs // max(len(palabras), 1)
    resultado = []
    for palabra in palabras:
        palabra_limpia = palabra.strip()
        if not palabra_limpia:
            continue
        karaoke_tag = "{\\k" + str(duracion_palabra) + "}"
        if modo == "creepy":
            fx_extra = "{\\fad(300,500)\\t(0,500,\\fscx105\\fscy105)}"
            resultado.append(fx_extra + karaoke_tag + palabra_limpia)
        elif modo == "gameplay":
            fx_extra = "{\\fad(100,200)\\t(0,300,\\fscx110\\fscy110)}"
            resultado.append(fx_extra + karaoke_tag + palabra_limpia)
        elif modo == "tutorial":
            fx_extra = "{\\fad(400,400)}"
            resultado.append(fx_extra + palabra_limpia)
        else:
            fx_extra = "{\\fad(200,200)}"
            resultado.append(fx_extra + karaoke_tag + palabra_limpia)
    return ' '.join(resultado)


def generar_ass(ruta_audio, ruta_salida, ruta_srt=None, modo="normal", texto_original=None):
    print(f"[ASS] Generando subtitulos con efectos ({modo})...")
    segmentos = []
    if ruta_srt and os.path.exists(ruta_srt):
        print(f"[ASS] Parseando SRT existente: {ruta_srt}")
        segmentos = parsear_srt(ruta_srt)
        for seg in segmentos:
            seg['text'] = corregir_alucinaciones_universal(seg['text'], texto_original)
    elif WHISPER_DISPONIBLE and os.path.exists(ruta_audio):
        print("[ASS] Transcribiendo con Whisper (modelo small)...")
        model = whisper.load_model("small")
        opciones = {
            "language": "es",
            "temperature": 0.0,
            "best_of": 5,
            "condition_on_previous_text": False,
            "compression_ratio_threshold": 1.8,
            "no_speech_threshold": 0.5,
        }
        if texto_original:
            opciones["initial_prompt"] = texto_original[:300]
        result = model.transcribe(ruta_audio, **opciones)
        for seg in result.get("segments", []):
            texto_raw = seg['text'].strip()
            texto_corregido = corregir_alucinaciones_universal(texto_raw, texto_original)
            if texto_corregido and len(texto_corregido.split()) >= 2:
                segmentos.append({
                    'start': seg['start'],
                    'end': seg['end'],
                    'text': texto_corregido
                })
    if not segmentos:
        print("[ASS] No hay segmentos. Creando ASS vacio.")
        segmentos = [{'start': 0, 'end': 5, 'text': '[Sin subtitulos]'}]
    contenido_ass = generar_script_ass(segmentos, modo=modo)
    with open(ruta_salida, 'w', encoding='utf-8') as f:
        f.write(contenido_ass)
    print(f"[ASS] Generado exitosamente: {ruta_salida} ({len(segmentos)} segmentos)")
    return ruta_salida


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("ERROR: Uso -> python generar_ass.py <ruta_audio.wav> <ruta_salida.ass> [modo] [ruta_srt] [texto_original]")
        print("  modo: normal | creepy | tutorial | gameplay")
        sys.exit(1)
    ruta_audio = sys.argv[1]
    ruta_salida = sys.argv[2]
    modo = sys.argv[3] if len(sys.argv) > 3 else "normal"
    ruta_srt = sys.argv[4] if len(sys.argv) > 4 else None
    texto_original = sys.argv[5] if len(sys.argv) > 5 else None
    generar_ass(ruta_audio, ruta_salida, ruta_srt=ruta_srt, modo=modo, texto_original=texto_original)