# -*- coding: utf-8 -*-
"""Identidad SAPI y diagnóstico sin objetos COM persistentes ni escritura de registro."""
import gc
import hashlib
import json
import os
import re
import struct
import sys
import traceback

PROTOCOL = 2


def configurar_stdout():
    stream = sys.stdout
    if stream is not None and hasattr(stream, 'reconfigure'):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except (AttributeError, OSError, ValueError):
            pass


def referencia_token(value):
    normalized = str(value).strip().lower()
    normalized = re.sub(r'^hkey_local_machine\\', lambda _: 'hklm\\', normalized)
    normalized = re.sub(r'^hkey_current_user\\', lambda _: 'hkcu\\', normalized)
    return 'token-sha256:' + hashlib.sha256(normalized.encode('utf-8')).hexdigest()[:16]


def depurar(value):
    text = str(value)
    for key in ('USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'USERNAME', 'COMPUTERNAME'):
        original = os.environ.get(key, '')
        if len(original) >= 3:
            text = re.sub(re.escape(original), '[PRIVADO]', text, flags=re.I)
    text = re.sub(r'(?:HKEY_LOCAL_MACHINE|HKEY_CURRENT_USER|HKLM|HKCU)\\[^\r\n\'",)]+', lambda m: referencia_token(m.group()), text, flags=re.I)
    text = re.sub(r'(?:[A-Za-z]:[\\/]|\\\\)[^\r\n"<>|]+', '[RUTA]', text)
    return text[:500]


class ErrorVoz(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def resolver_voz(speaker, identifier):
    query = str(identifier or '').strip().lower()
    if not query:
        raise ErrorVoz('VOICE_REQUIRED', 'Falta seleccionar una voz')
    voices = speaker.GetVoices()
    tokens = [voices.Item(i) for i in range(voices.Count)]
    exact_id = [token for token in tokens if token.Id.strip().lower() == query]
    if len(exact_id) == 1:
        return exact_id[0]
    if query.startswith(('hkey_', 'hklm\\', 'hkcu\\')):
        raise ErrorVoz('VOICE_NOT_FOUND', 'El token seleccionado ya no está disponible')
    names = [(token, token.GetDescription().strip().lower()) for token in tokens]
    matches = [token for token, name in names if name == query]
    if not matches:
        matches = [token for token, name in names if query in name]
    # Alias histórico del backend; no adivinar una voz por la última palabra arbitraria.
    if not matches and query.startswith('loquendo '):
        matches = [token for token, name in names if name == query[len('loquendo '):].strip()]
    if len(matches) != 1:
        raise ErrorVoz('VOICE_AMBIGUOUS' if matches else 'VOICE_NOT_FOUND',
                       'El nombre coincide con varias voces; selecciona una voz concreta' if matches else 'La voz solicitada no está disponible')
    return matches[0]


def voz_usable(token):
    """Mismo filtro de metadatos HKLM/CLSID/InprocServer32, con cierres explícitos."""
    import winreg
    try:
        route = token.Id.strip()
        prefix = 'HKEY_LOCAL_MACHINE\\'
        if not route.upper().startswith(prefix):
            return False
        with winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, route[len(prefix):]) as key:
            clsid = winreg.QueryValueEx(key, 'CLSID')[0]
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, 'CLSID\\' + clsid):
            pass
        with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, 'CLSID\\' + clsid + '\\InprocServer32'):
            pass
        return True
    except Exception:
        return False


def _listar(client):
    speaker = client.Dispatch('SAPI.SpVoice')
    voices = speaker.GetVoices()
    result = []
    for i in range(voices.Count):
        token = voices.Item(i)
        if voz_usable(token):
            result.append({'id': token.Id, 'nombre': token.GetDescription(), 'tokenRef': referencia_token(token.Id)})
    return result


def enumerar_voces():
    import pythoncom
    import win32com.client
    if struct.calcsize('P') != 4:
        raise ErrorVoz('ARCHITECTURE_MISMATCH', 'SAPI requiere el Python embebido de 32 bits')
    pythoncom.CoInitialize()
    failure = None
    try:
        try:
            result = _listar(win32com.client)
        except Exception as error:
            failure = capturar_fallo(error, {'stage': 'voices.enumerate'})
    finally:
        gc.collect()
        try:
            pythoncom.CoUninitialize()
        except Exception as error:
            secondary = capturar_fallo(error, {'stage': 'cleanup.CoUninitialize'})
            if failure:
                failure.setdefault('cleanup_errors', []).append(secondary)
            else:
                failure = secondary
    if failure:
        error = ErrorVoz('VOICE_ENUMERATION_FAILED', 'No se pudieron detectar las voces')
        error.diagnostic = failure
        raise error
    return result


def registrar(context, stage, **extra):
    context.update(stage=stage, **extra)
    if sys.stdout is not None:
        print('SAPI_STAGE ' + json.dumps(context, ensure_ascii=False), flush=True)


def detalle_error(error, context):
    # No incluir str(error), argumentos/texto SSML ni traceback con rutas del usuario.
    result = dict(context, code=getattr(error, 'code', 'SAPI_ERROR'), type=type(error).__name__)
    hr = getattr(error, 'hresult', None)
    if isinstance(hr, int):
        result.update(hresult=hr, hresult_hex='0x%08X' % (hr & 0xffffffff))
    result['description'] = depurar(str(error)) if isinstance(error, ErrorVoz) else 'Fallo en la etapa indicada'
    if isinstance(hr, int):
        try:
            import ctypes
            result['description'] = ctypes.FormatError(hr & 0xffffffff).strip()
        except Exception:
            result['description'] = 'Excepción COM'
    provider_description = getattr(error, 'strerror', None)
    if isinstance(provider_description, str):
        result['description_ref'] = hashlib.sha256(provider_description.encode('utf-8')).hexdigest()
    info = getattr(error, 'excepinfo', None)
    if isinstance(info, (tuple, list)) and info:
        values = list(info[:6]) + [None] * max(0, 6 - len(info))
        # Los campos libres del proveedor pueden contener fragmentos de texto: solo huellas.
        result['excepinfo'] = dict(zip(('wCode', 'source', 'description', 'helpFile', 'helpContext', 'scode'),
            [values[0] if isinstance(values[0], int) else None, '[PROVEEDOR]' if values[1] else None,
             '[DETALLE OMITIDO]' if values[2] else None, '[RUTA]' if values[3] else None,
             values[4] if isinstance(values[4], int) else None, values[5] if isinstance(values[5], int) else None]))
        if isinstance(values[2], str):
            result['excepinfo']['description_ref'] = hashlib.sha256(values[2].encode('utf-8')).hexdigest()
        if isinstance(values[5], int):
            result['excepinfo']['scode_hex'] = '0x%08X' % (values[5] & 0xffffffff)
    result['argerror'] = getattr(error, 'argerror', None)
    if isinstance(error, OSError):
        result['winerror'] = getattr(error, 'winerror', None)
    return result


def capturar_fallo(error, context):
    result = detalle_error(error, context)
    tb = error.__traceback__
    result['frames'] = [{'function': frame.name, 'line': frame.lineno} for frame in traceback.extract_tb(tb)]
    traceback.clear_frames(tb)
    error.__traceback__ = None
    return result


def cli_listar():
    configurar_stdout()
    try:
        result = enumerar_voces()
        if sys.stdout is not None:
            print(json.dumps(result, ensure_ascii=False))
        return 0
    except Exception as error:
        detail = getattr(error, 'diagnostic', None) or capturar_fallo(error, {'stage': 'voices.enumerate'})
        if sys.stdout is not None:
            print(json.dumps({'error': 'No se pudieron detectar las voces', 'diagnostic': detail}, ensure_ascii=False))
        return 1


if __name__ == '__main__':
    sys.exit(cli_listar())
