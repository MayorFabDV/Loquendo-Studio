# -*- coding: utf-8 -*-
import sys
import os
import argparse
import re

if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())


def convertir_tags_textaloud_a_ssml(texto):
    """
    Convierte etiquetas de texto a SSML para SAPI.
    
    Etiquetas soportadas:
    - [pause] / [pause:1000] - Pausa (ms)
    - [slow]texto[/slow] / [slow:5]texto[/slow] - Lento (1-10)
    - [fast]texto[/fast] / [fast:3]texto[/fast] - Rápido (1-10)
    - [rate:+5]texto[/rate] - Velocidad personalizada (-10 a +10)
    - [pitch:+5]texto[/pitch] - Tono personalizado (-10 a +10)
    - [soft]texto[/soft] - Volumen bajo (25%)
    - [loud]texto[/loud] - Volumen alto (100%)
    - [vol:50]texto[/vol] - Volumen personalizado (0-100)
    - [emphasis]texto[/emphasis] - Énfasis
    - [spell]texto[/spell] - Deletrear
    - [voz:nombre]texto[/voz] - Cambiar voz
    - [laugh] / [sigh] / [scream] / [cry] / [whisper] - Expresiones
    """
    
    # ============================================================
    # PAUSAS
    # ============================================================
    texto = re.sub(r'\[pause:(\d+)\]', r'<silence msec="\1"/>', texto)
    texto = re.sub(r'\[pause\]', r'<silence msec="500"/>', texto)
    
    # ============================================================
    # VELOCIDAD (slow/fast/rate)
    # ============================================================
    texto = re.sub(
        r'\[slow:(\d+)\](.*?)\[/slow\]',
        lambda m: f'<rate speed="-{min(int(m.group(1)), 10)}">{m.group(2)}</rate>',
        texto, flags=re.DOTALL
    )
    texto = re.sub(r'\[slow\](.*?)\[/slow\]', r'<rate speed="-3">\1</rate>', texto, flags=re.DOTALL)
    
    texto = re.sub(
        r'\[fast:(\d+)\](.*?)\[/fast\]',
        lambda m: f'<rate speed="{min(int(m.group(1)), 10)}">{m.group(2)}</rate>',
        texto, flags=re.DOTALL
    )
    texto = re.sub(r'\[fast\](.*?)\[/fast\]', r'<rate speed="2">\1</rate>', texto, flags=re.DOTALL)
    
    texto = re.sub(
        r'\[rate:([+-]?\d+)\](.*?)\[/rate\]',
        lambda m: f'<rate speed="{max(-10, min(10, int(m.group(1))))}">{m.group(2)}</rate>',
        texto, flags=re.DOTALL
    )
    
    # ============================================================
    # TONO (pitch)
    # ============================================================
    texto = re.sub(
        r'\[pitch:([+-]?\d+)\](.*?)\[/pitch\]',
        lambda m: f'<pitch middle="{max(-10, min(10, int(m.group(1))))}">{m.group(2)}</pitch>',
        texto, flags=re.DOTALL
    )
    
    # ============================================================
    # VOLUMEN
    # ============================================================
    texto = re.sub(r'\[soft\](.*?)\[/soft\]', r'<volume level="25">\1</volume>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[loud\](.*?)\[/loud\]', r'<volume level="100">\1</volume>', texto, flags=re.DOTALL)
    texto = re.sub(
        r'\[vol:(\d+)\](.*?)\[/vol\]',
        lambda m: f'<volume level="{max(0, min(100, int(m.group(1))))}">{m.group(2)}</volume>',
        texto, flags=re.DOTALL
    )
    
    # ============================================================
    # ÉNFASIS Y DELETREO
    # ============================================================
    texto = re.sub(r'\[emphasis\](.*?)\[/emphasis\]', r'<emph>\1</emph>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[spell\](.*?)\[/spell\]', r'<spell>\1</spell>', texto, flags=re.DOTALL)
    
    # ============================================================
    # EXPRESIONES
    # ============================================================
    texto = re.sub(r'\[laugh\](.*?)\[/laugh\]', r'<emph>\1</emph>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[sigh\](.*?)\[/sigh\]', r'<break time="500ms"/>\1', texto, flags=re.DOTALL)
    texto = re.sub(r'\[scream\](.*?)\[/scream\]', r'<volume level="100"><rate speed="3">\1</rate></volume>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[cry\](.*?)\[/cry\]', r'<volume level="40"><rate speed="-2">\1</rate></volume>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[whisper\](.*?)\[/whisper\]', r'<volume level="15">\1</volume>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[angry\](.*?)\[/angry\]', r'<volume level="90"><rate speed="2">\1</rate></volume>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[happy\](.*?)\[/happy\]', r'<rate speed="1"><pitch middle="2">\1</pitch></rate>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[sad\](.*?)\[/sad\]', r'<rate speed="-2"><pitch middle="-2">\1</pitch></rate>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[surprise\](.*?)\[/surprise\]', r'<rate speed="3"><pitch middle="3">\1</pitch></rate>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[fear\](.*?)\[/fear\]', r'<volume level="60"><rate speed="2"><pitch middle="2">\1</pitch></rate></volume>', texto, flags=re.DOTALL)
    
    return texto


def limpiar_tags_para_subtitulos(texto):
    """Limpia todas las etiquetas para generar subtítulos limpios."""
    texto = re.sub(r'<[^>]+>', '', texto)
    texto = re.sub(r'\[pause(?::\d+)?\]', ' ', texto)
    texto = re.sub(r'\[\/(?:slow|fast|soft|loud|emphasis|spell|rate|pitch|vol|laugh|sigh|scream|cry|whisper|angry|happy|sad|surprise|fear)\]', '', texto)
    texto = re.sub(r'\[(?:slow|fast|soft|loud|emphasis|spell|rate|pitch|vol|laugh|sigh|scream|cry|whisper|angry|happy|sad|surprise|fear)(?::[+-]?\d+)?\]', '', texto)
    texto = re.sub(r'\[voz:[^\]]+\]', '', texto)
    texto = re.sub(r'\[\/voz\]', '', texto)
    texto = re.sub(r'\s+', ' ', texto).strip()
    return texto


def parsear_segmentos_voz(texto):
    """Parsea el texto y devuelve una lista de segmentos (nombre_voz, texto)."""
    patron = r'\[voz:([^\]]+)\](.*?)\[\/voz\]'
    matches = list(re.finditer(patron, texto, re.DOTALL))
    
    if not matches:
        texto_limpio = re.sub(r'\[voz:[^\]]+\]', '', texto)
        texto_limpio = re.sub(r'\[\/voz\]', '', texto_limpio)
        return [(None, texto_limpio)]
    
    resultado = []
    pos_actual = 0
    
    for match in matches:
        texto_antes = texto[pos_actual:match.start()].strip()
        if texto_antes:
            resultado.append((None, texto_antes))
        
        nombre_voz = match.group(1).strip()
        texto_segmento = match.group(2).strip()
        if texto_segmento:
            resultado.append((nombre_voz, texto_segmento))
        
        pos_actual = match.end()
    
    texto_despues = texto[pos_actual:].strip()
    if texto_despues:
        resultado.append((None, texto_despues))
    
    return resultado


def buscar_voz(speaker, nombre_busqueda):
    """Busca una voz por nombre exacto o parcial."""
    nombre_busqueda = nombre_busqueda.lower().strip()
    voces = speaker.GetVoices()
    
    for i in range(voces.Count):
        desc = voces.Item(i).GetDescription()
        if nombre_busqueda == desc.lower():
            return voces.Item(i)
    
    for i in range(voces.Count):
        desc = voces.Item(i).GetDescription()
        if nombre_busqueda in desc.lower():
            return voces.Item(i)
    
    partes = nombre_busqueda.split()
    if len(partes) > 1:
        busqueda = partes[-1]
        for i in range(voces.Count):
            if busqueda in voces.Item(i).GetDescription().lower():
                return voces.Item(i)
    
    return None


def generar_audio_multivoz(texto_input, nombre_voz_default, ruta_salida_input):
    try:
        import win32com.client
        import pythoncom
        
        pythoncom.CoInitialize()
        speaker = win32com.client.Dispatch("SAPI.SpVoice")
        voces = speaker.GetVoices()
        print(f"Voces disponibles: {voces.Count}")
        
        for i in range(voces.Count):
            print(f"  {i}: {voces.Item(i).GetDescription()}")
        
        segmentos = parsear_segmentos_voz(texto_input)
        print(f"[OK] {len(segmentos)} segmento(s) de voz detectados")
        
        ruta_absoluta = os.path.abspath(ruta_salida_input)
        directorio = os.path.dirname(ruta_absoluta)
        if not os.path.exists(directorio):
            os.makedirs(directorio)
        
        if os.path.exists(ruta_absoluta):
            os.remove(ruta_absoluta)
            print("Archivo anterior eliminado")
        
        # VOZ POR DEFECTO
        voz_default = buscar_voz(speaker, nombre_voz_default)
        if voz_default:
            speaker.Voice = voz_default
            print(f"[OK] Voz por defecto: {voz_default.GetDescription()}")
        else:
            print(f"[WARN] Voz '{nombre_voz_default}' no encontrada, usando predeterminada")
            voz_default = speaker.Voice
        
        # Abrir stream
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        stream.Format.Type = 39  # 16kHz, 16-bit, mono
        stream.Open(ruta_absoluta, 3)
        speaker.AudioOutputStream = stream
        
        # PROCESAR CADA SEGMENTO
        for i, (nombre_voz, texto_segmento) in enumerate(segmentos, 1):
            print(f"\n  Segmento {i}: voz='{nombre_voz or 'default'}'")
            
            if nombre_voz:
                nueva_voz = buscar_voz(speaker, nombre_voz)
                if nueva_voz:
                    speaker.Voice = nueva_voz
                    print(f"  -> Voz cambiada a: {nueva_voz.GetDescription()}")
                else:
                    print(f"  [WARN] Voz '{nombre_voz}' no encontrada")
            else:
                if voz_default:
                    speaker.Voice = voz_default
                    print(f"  -> Voz restaurada a: {voz_default.GetDescription()}")
            
            texto_ssml = convertir_tags_textaloud_a_ssml(texto_segmento)
            tiene_xml = '<' in texto_ssml and '>' in texto_ssml
            flags = 8 if tiene_xml else 0
            
            if tiene_xml:
                print(f"  [SSML] {texto_ssml[:80]}...")
            
            speaker.Speak(texto_ssml, flags)
        
        if voz_default:
            speaker.Voice = voz_default
        
        stream.Close()
        pythoncom.CoUninitialize()
        print("\nEXITO")
        return ruta_absoluta
        
    except ImportError:
        print("ERROR: win32com no disponible. Instala: pip install pywin32")
        sys.exit(1)
    except Exception as e:
        print("ERROR CRITICO: " + str(e))
        import traceback
        traceback.print_exc()
        sys.exit(1)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generador de voz Loquendo Multi-Voz + SSML")
    parser.add_argument("texto", help="Texto a sintetizar")
    parser.add_argument("voz", help="Nombre de la voz por defecto")
    parser.add_argument("salida", help="Ruta de salida del archivo WAV")
    args = parser.parse_args()
    generar_audio_multivoz(args.texto, args.voz, args.salida)