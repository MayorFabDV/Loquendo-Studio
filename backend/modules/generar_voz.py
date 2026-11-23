# -*- coding: utf-8 -*-
import sys
import os
import argparse
import re
import json
import struct

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sapi_voice_common import (configurar_stdout, resolver_voz, referencia_token,
                               registrar, capturar_fallo, detalle_error, ErrorVoz, PROTOCOL)

# UTF-8 cuando hay stream; compatible con stdout=None y ejecución mediante runpy.
configurar_stdout()

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


def preparar_ssml(texto_segmento):
    """Convierte tags TextAloud a SSML y decide si SAPI debe hablar en modo XML.

    Devuelve (texto_ssml, usar_xml):
    - Si el texto NO contenía tags (ni '[' ni '<'), se habla como texto plano
      (flags=0) y cualquier '<'/'&' del usuario se pronuncia literalmente.
    - Si contenía tags, se construye SSML válido escapando el contenido libre
      (&, <, >) para que el usuario pueda incluir comparaciones/ampersands
      sin romper el parseo XML.
    """
    texto_ssml = convertir_tags_textaloud_a_ssml(texto_segmento)

    if '<' not in texto_segmento and '[' not in texto_segmento:
        return texto_ssml, False

    etiquetas = []

    def guardar_etiqueta(m):
        etiquetas.append(m.group(0))
        return f"\x00TAG{len(etiquetas) - 1}\x00"

    con_placeholders = re.sub(r'<[^<>]*>', guardar_etiqueta, texto_ssml)
    con_placeholders = (
        con_placeholders.replace('&', '&amp;')
        .replace('<', '&lt;')
        .replace('>', '&gt;')
    )

    def restaurar_etiqueta(m):
        return etiquetas[int(m.group(1))]

    xml_seguro = re.sub(r'\x00TAG(\d+)\x00', restaurar_etiqueta, con_placeholders)

    return xml_seguro, True


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
    """ID exacto o nombre legacy inequívoco; nunca sustituir otra voz silenciosamente."""
    return resolver_voz(speaker, nombre_busqueda)


def _sintetizar(win32com_client, texto_input, nombre_voz_default, ruta_salida_input, context, cleanup):
    speaker = stream = voz_default = nueva_voz = None
    opened = associated = False
    try:
        registrar(context, 'SpVoice.Dispatch')
        speaker = win32com_client.Dispatch('SAPI.SpVoice')
        registrar(context, 'voice.resolve.default', request_ref=referencia_token(nombre_voz_default), token_ref=None, flags=None)
        voz_default = buscar_voz(speaker, nombre_voz_default)
        context['token_ref'] = referencia_token(voz_default.Id)
        registrar(context, 'SpVoice.Voice.default')
        speaker.Voice = voz_default
        ruta_absoluta = os.path.abspath(ruta_salida_input)
        registrar(context, 'output.makedirs')
        directorio = os.path.dirname(ruta_absoluta)
        if not os.path.exists(directorio):
            os.makedirs(directorio)
        if os.path.exists(ruta_absoluta):
            os.remove(ruta_absoluta)
        registrar(context, 'SpFileStream.Dispatch')
        stream = win32com_client.Dispatch('SAPI.SpFileStream')
        registrar(context, 'SpFileStream.Format.Type', format_requested=39)
        stream.Format.Type = 39  # 48 kHz, 16 bits, estéreo
        registrar(context, 'SpFileStream.Open')
        stream.Open(ruta_absoluta, 3)
        opened = True
        registrar(context, 'SpVoice.AudioOutputStream.set')
        associated = True  # Intentar desconexión también si el setter falla parcialmente.
        speaker.AudioOutputStream = stream
        wave_format = None
        try:
            wave_format = stream.Format.GetWaveFormatEx()
            context['format_observed'] = {'rate': wave_format.SamplesPerSec, 'bits': wave_format.BitsPerSample, 'channels': wave_format.Channels}
        except Exception:
            context['format_observed'] = None
        finally:
            wave_format = None
        for i, (nombre_voz, texto_segmento) in enumerate(parsear_segmentos_voz(texto_input), 1):
            registrar(context, 'voice.resolve.segment', segment=i, request_ref=referencia_token(nombre_voz or nombre_voz_default), token_ref=None, flags=None)
            nueva_voz = buscar_voz(speaker, nombre_voz) if nombre_voz else voz_default
            context['token_ref'] = referencia_token(nueva_voz.Id)
            registrar(context, 'SpVoice.Voice.segment')
            speaker.Voice = nueva_voz
            texto_ssml, usar_xml = preparar_ssml(texto_segmento)
            flags = 8 if usar_xml else 0
            registrar(context, 'SpVoice.Speak', flags=flags)
            speaker.Speak(texto_ssml, flags)
        registrar(context, 'SpVoice.Voice.restore', token_ref=referencia_token(voz_default.Id))
        speaker.Voice = voz_default
        return ruta_absoluta
    finally:
        # No alterar context: debe seguir señalando la etapa del error primario.
        if opened:
            try:
                stream.Close()
            except Exception as error:
                cleanup.append(detalle_error(error, dict(context, stage='cleanup.SpFileStream.Close')))
        if associated and speaker is not None:
            try:
                speaker.AudioOutputStream = None
            except Exception as error:
                cleanup.append(detalle_error(error, dict(context, stage='cleanup.AudioOutputStream.clear')))
        speaker = stream = voz_default = nueva_voz = None


def _procesar_audio_voz(win32com_client, pythoncom, texto_input, nombre_voz_default, ruta_salida_input):
    context = {'stage': 'start', 'format_requested': 39}
    cleanup = []
    try:
        path = _sintetizar(win32com_client, texto_input, nombre_voz_default, ruta_salida_input, context, cleanup)
    except Exception as error:
        return {'ok': False, 'primary': capturar_fallo(error, context), 'cleanup_errors': cleanup}
    if cleanup:
        return {'ok': False, 'primary': cleanup[0], 'cleanup_errors': cleanup[1:]}
    return {'ok': True, 'path': path, 'cleanup_errors': []}


def generar_audio_multivoz(texto_input, nombre_voz_default, ruta_salida_input):
    outcome = None
    initialized = False
    try:
        import win32com.client
        import pythoncom
        if struct.calcsize('P') != 4:
            raise ErrorVoz('ARCHITECTURE_MISMATCH', 'SAPI requiere 32 bits')
        pythoncom.CoInitialize()
        initialized = True
        outcome = _procesar_audio_voz(win32com.client, pythoncom, texto_input, nombre_voz_default, ruta_salida_input)
    except Exception as error:
        outcome = {'ok': False, 'primary': capturar_fallo(error, {'stage': 'COM.initialize'}), 'cleanup_errors': []}
    finally:
        if initialized:
            import gc
            gc.collect()
            try:
                pythoncom.CoUninitialize()
            except Exception as error:
                secondary = capturar_fallo(error, {'stage': 'cleanup.CoUninitialize'})
                if outcome and not outcome['ok']:
                    outcome['cleanup_errors'].append(secondary)
                else:
                    outcome = {'ok': False, 'primary': secondary, 'cleanup_errors': []}
    if not outcome['ok']:
        if sys.stderr is not None:
            print('SAPI_DIAGNOSTIC ' + json.dumps(outcome, ensure_ascii=False), file=sys.stderr, flush=True)
        sys.exit(1)
    print('\nEXITO')
    return outcome['path']


if __name__ == "__main__":
    if sys.argv[1:] == ['--sapi-protocol']:
        print(json.dumps({'protocol': PROTOCOL, 'bits': struct.calcsize('P') * 8}))
        sys.exit(0)
    parser = argparse.ArgumentParser(description="Generador de voz Loquendo Multi-Voz + SSML")
    parser.add_argument("texto", help="Texto a sintetizar")
    parser.add_argument("voz", help="ID de token SAPI o nombre antiguo inequívoco")
    parser.add_argument("salida", help="Ruta de salida del archivo WAV")
    args = parser.parse_args()
    generar_audio_multivoz(args.texto, args.voz, args.salida)
