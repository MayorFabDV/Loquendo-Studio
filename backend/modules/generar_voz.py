# -*- coding: utf-8 -*-
import sys
import os
import argparse
import re

if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())


def convertir_tags_textaloud_a_ssml(texto):
    texto = re.sub(r'\[pause:(\d+)\]', r'<silence msec="\1"/>', texto)
    texto = re.sub(r'\[pause\]', r'<silence msec="500"/>', texto)
    texto = re.sub(r'\[slow\](.*?)\[/slow\]', r'<rate speed="-3">\1</rate>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[fast\](.*?)\[/fast\]', r'<rate speed="2">\1</rate>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[soft\](.*?)\[/soft\]', r'<volume level="25">\1</volume>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[loud\](.*?)\[/loud\]', r'<volume level="100">\1</volume>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[emphasis\](.*?)\[/emphasis\]', r'<emph>\1</emph>', texto, flags=re.DOTALL)
    texto = re.sub(r'\[spell\](.*?)\[/spell\]', r'<spell>\1</spell>', texto, flags=re.DOTALL)
    return texto


def limpiar_tags_para_subtitulos(texto):
    texto = re.sub(r'<[^>]+>', '', texto)
    texto = re.sub(r'\[pause(?::\d+)?\]', ' ', texto)
    texto = re.sub(r'\[\/(?:slow|fast|soft|loud|emphasis|spell)\]', '', texto)
    texto = re.sub(r'\[(?:slow|fast|soft|loud|emphasis|spell)\]', '', texto)
    texto = re.sub(r'\[voz:[^\]]+\]', '', texto)
    texto = re.sub(r'\[\/voz\]', '', texto)
    texto = re.sub(r'\s+', ' ', texto).strip()
    return texto


def parsear_segmentos_voz(texto):
    patron = r'\[voz:([^\]]+)\](.*?)(?=\[voz:|$)'
    matches = re.findall(patron, texto, re.DOTALL)
    
    if not matches:
        texto_limpio = re.sub(r'\[/?voz:[^\]]+\]', '', texto)
        return [(None, texto_limpio)]
    
    resultado = []
    for nombre_voz, texto_segmento in matches:
        texto_limpio = texto_segmento.replace('[/voz]', '').strip()
        if texto_limpio:
            resultado.append((nombre_voz.strip(), texto_limpio))
    
    return resultado


def buscar_voz(speaker, nombre_busqueda):
    nombre_busqueda = nombre_busqueda.lower().strip()
    voces = speaker.GetVoices()
    
    for i in range(voces.Count):
        desc = voces.Item(i).GetDescription()
        desc_lower = desc.lower()
        if nombre_busqueda in desc_lower or desc_lower in nombre_busqueda:
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
        
        # ============================================================
        # FIX CRÍTICO: Setear voz ANTES de abrir el stream
        # ============================================================
        voz_default = buscar_voz(speaker, nombre_voz_default)
        if voz_default:
            speaker.Voice = voz_default
            print(f"[OK] Voz por defecto: {voz_default.GetDescription()}")
        else:
            print(f"[WARN] Voz '{nombre_voz_default}' no encontrada, usando predeterminada del sistema")
        
        stream = win32com.client.Dispatch("SAPI.SpFileStream")
        stream.Format.Type = 39  # 16kHz, 16-bit, mono
        stream.Open(ruta_absoluta, 3)
        speaker.AudioOutputStream = stream
        
        for i, (nombre_voz, texto_segmento) in enumerate(segmentos, 1):
            print(f"\n  Segmento {i}: voz='{nombre_voz or 'default'}'")
            
            if nombre_voz:
                nueva_voz = buscar_voz(speaker, nombre_voz)
                if nueva_voz:
                    speaker.Voice = nueva_voz
                    print(f"  -> Cambiado a: {nueva_voz.GetDescription()}")
                else:
                    print(f"  [WARN] Voz '{nombre_voz}' no encontrada, usando actual")
            
            texto_ssml = convertir_tags_textaloud_a_ssml(texto_segmento)
            tiene_xml = '<' in texto_ssml and '>' in texto_ssml
            flags = 8 if tiene_xml else 0  # 8 = SVSFIsXML
            
            if tiene_xml:
                print(f"  [SSML] {texto_ssml[:80]}...")
            
            speaker.Speak(texto_ssml, flags)
        
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