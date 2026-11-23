# -*- coding: utf-8 -*-
"""Diagnóstico aislado; no modifica Studio, voces ni registro. Solo Python embebido x86."""
import argparse
import array
import gc
import hashlib
import importlib.metadata
import json
import linecache
import os
from pathlib import Path
import platform
import re
import runpy
import struct
import subprocess
import sys
import time
import uuid
import wave
import zipfile

VERSION = 2
TEXT = 'Prueba de voz. Uno, dos, tres.'


class Redactor:
    def __init__(self, roots=(), public=False):
        self.public = public
        self.values = []
        for value in [*roots, os.environ.get('USERPROFILE'), os.environ.get('APPDATA'),
                      os.environ.get('LOCALAPPDATA'), os.environ.get('TEMP')]:
            if value:
                self.values.append((str(value), '[RUTA]'))
                self.values.append((str(value).replace('\\', '/'), '[RUTA]'))
        self.values.sort(key=lambda pair: len(pair[0]), reverse=True)

    def text(self, value):
        value = str(value)
        for original, replacement in self.values:
            value = re.sub(re.escape(original), lambda _: replacement, value, flags=re.I)
        value = re.sub(r'(?i)(?:[a-z]:[\\/]|\\\\)[^\r\n\t"<>|]+', '[RUTA]', value)
        value = re.sub(r'S-1-5-21-(?:\d+-)*\d+', '[SID]', value, flags=re.I)
        for key in ('USERNAME', 'COMPUTERNAME', 'USERDOMAIN'):
            name = os.environ.get(key, '')
            if len(name) >= 3:
                value = re.sub(r'(?<!\w)' + re.escape(name) + r'(?!\w)', '[IDENTIDAD]', value, flags=re.I)
        value = re.sub(r'\b[\w.+-]+@[\w.-]+\.[a-zA-Z]{2,}\b', '[EMAIL]', value)
        if self.public:
            def token_ref(match):
                token = match.group().lower().replace('hkey_local_machine', 'hklm').replace('hkey_current_user', 'hkcu')
                return 'token-sha256:' + hashlib.sha256(token.encode('utf-8')).hexdigest()[:16]
            value = re.sub(r'(?:HKEY_LOCAL_MACHINE|HKEY_CURRENT_USER|HKLM|HKCU)\\[^\r\n\'",)]+', token_ref, value, flags=re.I)
        return value

    def clean(self, value):
        if isinstance(value, str):
            return self.text(value)
        if isinstance(value, dict):
            return {str(k): self.clean(v) for k, v in value.items()}
        if isinstance(value, (tuple, list)):
            return [self.clean(v) for v in value]
        if value is None or isinstance(value, (int, float, bool)):
            return value
        return self.text(value)


def error_info(error):
    result = {'type': type(error).__name__, 'description': str(error)}
    hr = getattr(error, 'hresult', None)
    if isinstance(hr, int):
        result.update(hresult_signed=hr, hresult_hex='0x%08X' % (hr & 0xffffffff))
    info = getattr(error, 'excepinfo', None)
    if info:
        names = ('wCode', 'source', 'description', 'helpFile', 'helpContext', 'scode')
        result['excepinfo'] = dict(zip(names, info))
        if len(info) > 5 and isinstance(info[5], int):
            result['excepinfo']['scode_hex'] = '0x%08X' % (info[5] & 0xffffffff)
    result['argerror'] = getattr(error, 'argerror', None)
    return result


def sha256(file):
    if not file.is_file():
        return None
    digest = hashlib.sha256()
    with file.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            digest.update(chunk)
    return digest.hexdigest()


def pe_machine(file):
    try:
        with open(file, 'rb') as stream:
            if stream.read(2) != b'MZ':
                return 'not_PE'
            stream.seek(0x3c)
            offset = struct.unpack('<I', stream.read(4))[0]
            stream.seek(offset)
            if stream.read(4) != b'PE\0\0':
                return 'not_PE'
            machine = struct.unpack('<H', stream.read(2))[0]
            return {0x14c: 'x86', 0x8664: 'x64', 0xaa64: 'ARM64'}.get(machine, hex(machine))
    except (OSError, struct.error):
        return 'unavailable'


def token_info(token):
    if token is None:
        return None
    result = {}
    for name, read in [('id', lambda: token.Id), ('description', token.GetDescription)]:
        try:
            result[name] = read()
        except Exception as error:
            result[name + '_error'] = error_info(error)
    return result


def engine_file(raw, view):
    # Un proceso x86 no debe confundir System32 nativo con la redirección a SysWOW64.
    native = view == '64' and struct.calcsize('P') == 4 and bool(os.environ.get('PROCESSOR_ARCHITEW6432'))
    if native:
        for old, new in [('ProgramFiles', 'ProgramW6432'), ('CommonProgramFiles', 'CommonProgramW6432')]:
            if os.environ.get(new):
                raw = re.sub('%' + old + '%', lambda _: os.environ[new], raw, flags=re.I)
    file = os.path.expandvars(raw).strip('"')
    windows = os.environ.get('WINDIR', r'C:\Windows')
    prefix = windows.rstrip('\\/') + '\\System32\\'
    if native and file.lower().startswith(prefix.lower()):
        file = windows.rstrip('\\/') + '\\Sysnative\\' + file[len(prefix):]
    return file


class Recorder:
    def __init__(self, file, redactor):
        self.file, self.redactor = file, redactor

    def event(self, operation, **data):
        row = self.redactor.clean({'operation': operation, **data})
        with self.file.open('a', encoding='utf-8') as stream:
            stream.write(json.dumps(row, ensure_ascii=False) + '\n')

    def call(self, operation, fn, **data):
        self.event(operation, status='begin', **data)
        try:
            result = fn()
        except Exception as error:
            self.event(operation, status='error', error=error_info(error), **data)
            raise
        self.event(operation, status='ok')
        return result


def registry_inventory():
    """Solo lectura: categorías SAPI/OneCore y motor COM en ambas vistas."""
    import winreg
    rows = []
    for label, view in [('32', winreg.KEY_WOW64_32KEY), ('64', winreg.KEY_WOW64_64KEY)]:
        for hive_name, hive in [('HKLM', winreg.HKEY_LOCAL_MACHINE), ('HKCU', winreg.HKEY_CURRENT_USER)]:
            for category in ['SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens',
                             'SOFTWARE\\Microsoft\\Speech_OneCore\\Voices\\Tokens']:
                try:
                    with winreg.OpenKey(hive, category, 0, winreg.KEY_READ | view) as key:
                        for i in range(winreg.QueryInfoKey(key)[0]):
                            name = winreg.EnumKey(key, i)
                            row = {'view': label, 'token_id': hive_name + '\\' + category + '\\' + name}
                            try:
                                with winreg.OpenKey(key, name, 0, winreg.KEY_READ | view) as token:
                                    row['description'] = winreg.QueryValueEx(token, None)[0]
                                    clsid = winreg.QueryValueEx(token, 'CLSID')[0]
                                    row['clsid'] = clsid
                                with winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, 'CLSID\\' + clsid + '\\InprocServer32', 0, winreg.KEY_READ | view) as engine:
                                    dll = engine_file(winreg.QueryValueEx(engine, None)[0], label)
                                    row.update(engine_registered=True, dll_name=Path(dll).name,
                                               dll_exists=os.path.isfile(dll), dll_machine=pe_machine(dll),
                                               dll_sha256=sha256(Path(dll)))
                                    try:
                                        import win32api
                                        info = win32api.GetFileVersionInfo(dll, '\\')
                                        row['dll_version'] = '.'.join(str(v) for v in (
                                            info['FileVersionMS'] >> 16, info['FileVersionMS'] & 65535,
                                            info['FileVersionLS'] >> 16, info['FileVersionLS'] & 65535))
                                    except Exception:
                                        row['dll_version'] = 'unknown'
                            except OSError as error:
                                row.update(engine_registered=False, registry_error_code=error.winerror)
                            rows.append(row)
                except OSError as error:
                    rows.append({'view': label, 'category': hive_name + '\\' + category,
                                 'registry_error_code': error.winerror})
    return rows


def inventory_com(client, rec):
    speaker = rec.call('SpVoice.Dispatch', lambda: client.Dispatch('SAPI.SpVoice'))
    tokens = rec.call('SpVoice.GetVoices', speaker.GetVoices)
    result = []
    for i in range(tokens.Count):
        token = tokens.Item(i)
        row = token_info(token)
        for attribute in ['Language', 'Vendor', 'Gender']:
            try:
                row[attribute.lower()] = token.GetAttribute(attribute)
            except Exception:
                row[attribute.lower()] = None
        result.append(row)
    return result


def select_match(voices, query):
    token = [v for v in voices if v.get('id', '').lower() == query.strip().lower()]
    if token:
        return token
    exact = [v for v in voices if v.get('description', '').casefold() == query.casefold()]
    partial = exact or [v for v in voices if query.casefold() in v.get('description', '').casefold()]
    return partial


def source_trace(source, rec):
    """Observa el código original sin proxies COM, monkeypatch ni referencias retenidas."""
    source = os.path.normcase(str(source.resolve()))
    def trace(frame, event, arg):
        if os.path.normcase(os.path.abspath(frame.f_code.co_filename)) != source:
            return None
        code = linecache.getline(frame.f_code.co_filename, frame.f_lineno).strip()
        location = {'file': 'generar_voz.py', 'function': frame.f_code.co_name,
                    'line': frame.f_lineno, 'code': code}
        if event == 'exception' and (hasattr(arg[1], 'hresult') or type(arg[1]).__name__ == 'com_error'):
            rec.event('source.COM_exception', status='error', error=error_info(arg[1]), **location)
        elif event == 'return' and frame.f_code.co_name == 'buscar_voz':
            rec.event('source.selected_token', requested=frame.f_locals.get('nombre_busqueda'), token=token_info(arg))
        elif event == 'line' and any(s in code for s in ['Dispatch(', 'GetVoices(', '.GetDescription(',
                '.Voice =', '.Format.Type =', 'stream.Open(', 'stream.Close(', '.AudioOutputStream =',
                'speaker.Speak(', '.CoInitialize(', '.CoUninitialize(']):
            data = {'segment': frame.f_locals.get('i'), 'flags': frame.f_locals.get('flags')}
            if 'speaker.Voice =' in code:
                variable = code.split('=', 1)[1].strip()
                data['token'] = token_info(frame.f_locals.get(variable))
            rec.event('source.COM_call', status='begin', **location, **data)
        return trace
    return trace


def source_case(backend, case, output, rec):
    source = backend / 'modules' / 'generar_voz.py'
    namespace = rec.call('source.load', lambda: runpy.run_path(str(source), run_name='diagnostic_original_source'))
    sys.settrace(source_trace(source, rec))
    try:
        namespace['generar_audio_multivoz'](case['text'], case['default_voice'], str(output))
    finally:
        sys.settrace(None)


def direct_case(client, backend, case, output, rec):
    speaker = rec.call('SpVoice.Dispatch', lambda: client.Dispatch('SAPI.SpVoice'))
    voices = rec.call('SpVoice.GetVoices', speaker.GetVoices)
    token = next((voices.Item(i) for i in range(voices.Count) if voices.Item(i).Id == case['token_id']), None)
    if token is None:
        raise RuntimeError('El token seleccionado ya no está disponible')
    rec.call('SpVoice.Voice.set.before_stream', lambda: setattr(speaker, 'Voice', token), token=token_info(token))
    stream = rec.call('SpFileStream.Dispatch', lambda: client.Dispatch('SAPI.SpFileStream'))
    opened, cleared = False, False
    try:
        if case.get('format') is not None:
            rec.call('SpFileStream.Format.Type.set', lambda: setattr(stream.Format, 'Type', case['format']), value=case['format'])
        rec.call('SpFileStream.Open', lambda: stream.Open(str(output), 3)); opened = True
        rec.call('SpVoice.AudioOutputStream.set', lambda: setattr(speaker, 'AudioOutputStream', stream))
        if case.get('reassign'):
            rec.call('SpVoice.Voice.set.after_stream', lambda: setattr(speaker, 'Voice', token), token=token_info(token))
        rec.call('SpVoice.Speak', lambda: speaker.Speak(case['text'], case['flags']), flags=case['flags'], token=token_info(token))
        rec.call('SpFileStream.Close', stream.Close); opened = False
        rec.call('SpVoice.AudioOutputStream.clear', lambda: setattr(speaker, 'AudioOutputStream', None))
        cleared = True
    finally:
        primary_error = sys.exc_info()[0] is not None
        if opened:
            try:
                rec.call('cleanup.SpFileStream.Close', stream.Close)
            except Exception:
                pass
        if not cleared:
            try:
                rec.call('cleanup.SpVoice.AudioOutputStream.clear', lambda: setattr(speaker, 'AudioOutputStream', None))
            except Exception:
                if not primary_error:
                    raise


def worker(backend, folder):
    case = json.loads((folder / 'case.json').read_text(encoding='utf-8'))
    redactor = Redactor([backend.parent, folder.parent])
    rec = Recorder(folder / 'events.jsonl', redactor)
    result = {'status': 'error'}
    try:
        if struct.calcsize('P') != 4:
            raise RuntimeError('El diagnóstico requiere el Python embebido de 32 bits')
        if case['mode'] == 'source':
            source_case(backend, case, folder / 'audio.wav', rec)
        else:
            rec.event('import.pywin32', status='begin')
            import pythoncom
            import win32com.client
            rec.call('CoInitialize', pythoncom.CoInitialize)
            try:
                # Toda referencia COM queda en la función local antes de CoUninitialize.
                if case['mode'] == 'inventory':
                    result['voices'] = inventory_com(win32com.client, rec)
                else:
                    direct_case(win32com.client, backend, case, folder / 'audio.wav', rec)
            except Exception as error:
                result['error'] = error_info(error)
            finally:
                gc.collect()
                rec.call('CoUninitialize', pythoncom.CoUninitialize)
            if result.get('error'):
                raise RuntimeError('Falló la prueba COM; consulta la etapa y el HRESULT')
        if case['mode'] == 'inventory':
            result['registry'] = registry_inventory()
        result['status'] = 'ok'
    except BaseException as error:
        result.setdefault('error', error_info(error))
        result['status'] = 'error'
    (folder / 'result.json').write_text(json.dumps(redactor.clean(result), ensure_ascii=False, indent=2), encoding='utf-8')
    return 0 if result['status'] == 'ok' else 1


def wav_info(file):
    try:
        with wave.open(str(file), 'rb') as audio:
            frames, rate = audio.getnframes(), audio.getframerate()
            width = audio.getsampwidth()
            samples = audio.readframes(frames)
            peak = None
            if width == 2:
                values = array.array('h'); values.frombytes(samples)
                peak = max((abs(v) for v in values), default=0)
            elif width == 1:
                peak = max((abs(v-128) for v in samples), default=0)
            return {'frames': frames, 'rate': rate, 'channels': audio.getnchannels(),
                    'sample_width': width, 'duration': frames / rate, 'sample_peak': peak, 'valid': frames > 0}
    except (OSError, EOFError, wave.Error):
        return {'valid': False}


def run_case(backend, folder, case, timeout, redactor):
    folder.mkdir()
    (folder / 'case.json').write_text(json.dumps(case, ensure_ascii=False, indent=2), encoding='utf-8')
    command = [sys.executable, '-B', '-X', 'faulthandler', str(Path(__file__).resolve()), '--worker', '--backend', str(backend), '--folder', str(folder)]
    if case['mode'] == 'exe':
        command = [str(backend / 'bin' / 'generar_voz.exe'), case['text'], case['default_voice'], str(folder / 'audio.wav')]
    elif case['mode'] == 'list':
        command = [sys.executable, '-B', str(backend / 'modules' / 'listar_voces.py')]
    started = time.monotonic()
    try:
        done = subprocess.run(command, capture_output=True, timeout=timeout, cwd=str(backend / 'bin'))
        code, stdout, stderr = done.returncode, done.stdout, done.stderr
        status = 'ok' if code == 0 else 'error'
    except subprocess.TimeoutExpired as error:
        code, stdout, stderr, status = None, error.stdout or b'', error.stderr or b'', 'timeout'
    except OSError as error:
        code, stdout, stderr, status = None, b'', str(error).encode('utf-8'), 'unavailable'
    result = {'case': case, 'status': status, 'exit_code': code, 'elapsed_seconds': round(time.monotonic()-started, 2),
              'stdout': stdout.decode('utf-8', errors='replace')[-12000:],
              'stderr': stderr.decode('utf-8', errors='replace')[-12000:]}
    for line in result['stderr'].splitlines():
        if line.startswith('SAPI_DIAGNOSTIC '):
            try:
                result['sapi_diagnostic'] = json.loads(line[len('SAPI_DIAGNOSTIC '):])
            except ValueError:
                pass
    if code:
        result['exit_code_hex'] = '0x%08X' % (code & 0xffffffff)
    if (folder / 'result.json').is_file():
        details = json.loads((folder / 'result.json').read_text(encoding='utf-8'))
        result['details'] = details
        if details['status'] != 'ok':
            result['status'] = details['status']
    if (folder / 'events.jsonl').is_file():
        result['events'] = [json.loads(line) for line in (folder / 'events.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
        result['first_failure'] = next((e for e in result['events'] if e.get('status') == 'error'), None)
        result['last_operation'] = result['events'][-1] if result['events'] else None
    if case['mode'] == 'list':
        try:
            result['listed_voices'] = json.loads(result['stdout'].strip())
        except ValueError:
            result['status'] = 'invalid_voice_list'
    if case['mode'] not in ['inventory', 'list']:
        result['wav'] = wav_info(folder / 'audio.wav')
        if result['status'] == 'ok' and not result['wav']['valid']:
            result['status'] = 'invalid_wav'
        elif result['status'] == 'ok' and result['wav'].get('sample_peak') == 0:
            result['status'] = 'silent_wav'
        if re.search(r'Win32 exception.*IUnknown|access violation|Fatal Python error|Exception ignored', result['stdout'] + result['stderr'], re.I):
            result['native_lifecycle_warning'] = True
            if result['status'] == 'ok':
                result['status'] = 'warning'
    return redactor.clean(result)


def build_cases(target, control):
    cases = []
    for role, voice in [('control', control), ('target', target)]:
        if not voice:
            continue
        name = voice['description']
        for suffix, fmt, reassign, text, flags in [
                ('plain_39', 39, False, TEXT, 0), ('plain_39_reassign', 39, True, TEXT, 0),
                ('plain_default_format', None, False, TEXT, 0),
                ('xml_39', 39, False, '<rate speed="0">' + TEXT + '</rate>', 8)]:
            cases.append({'id': role + '_direct_' + suffix, 'mode': 'direct', 'token_id': voice['id'],
                          'text': text, 'flags': flags, 'format': fmt, 'reassign': reassign})
        for mode in ['source', 'exe']:
            for suffix, text in [('plain', TEXT), ('xml', '[pause:100][emphasis]' + TEXT + '[/emphasis]'),
                                 ('self_tag', '[voz:' + name + ']' + TEXT + '[/voz]')]:
                cases.append({'id': role + '_' + mode + '_' + suffix, 'mode': mode, 'default_voice': name, 'text': text})
    if target and control and target['id'] != control['id']:
        for mode in ['source', 'exe']:
            for first, second, label in [(control, target, 'control_target_control'), (target, control, 'target_control_target')]:
                cases.append({'id': 'switch_' + mode + '_' + label, 'mode': mode, 'default_voice': first['description'],
                              'text': 'Primera voz. [voz:' + second['description'] + ']Segunda voz.[/voz] Regreso a la primera.'})
    return cases


def find_backend(studio):
    for candidate in [studio / 'backend', studio / 'resources' / 'backend', studio]:
        if (candidate / 'python' / 'python.exe').is_file() and (candidate / 'modules' / 'generar_voz.py').is_file():
            return candidate.resolve()
    raise RuntimeError('No se encontró backend/python/python.exe y backend/modules/generar_voz.py en la carpeta elegida')


def write_report(folder, report):
    # Los datos de trabajo privados conservan IDs para seleccionar; el ZIP público no.
    report = Redactor([folder], public=True).clean(report)
    data = json.dumps(report, ensure_ascii=False, indent=2)
    (folder / 'informe.json').write_text(data, encoding='utf-8')
    lines = ['# Diagnóstico SAPI / Leonor', '', 'Versión del diagnóstico: %s' % VERSION,
             '', 'Resumen: ' + json.dumps(report.get('summary', {}), ensure_ascii=False),
             'Conclusión técnica: ' + report.get('conclusion', 'diagnostico_en_curso'),
             '', '## Entorno', '```json', json.dumps(report['environment'], ensure_ascii=False, indent=2), '```',
             '', '## Selección de voces', '```json', json.dumps(report['selection'], ensure_ascii=False, indent=2), '```',
             '', '## Casos', '| Caso | Estado | Primera etapa COM fallida / última etapa | HRESULT |', '|---|---|---|---|']
    for result in report['cases']:
        events = result.get('events', [])
        event = next((e for e in events if e.get('status') == 'error'), events[-1] if events else {})
        location = '%s:%s %s' % (event.get('file', ''), event.get('line', ''), event.get('code', event.get('operation', '')))
        hr = event.get('error', {}).get('hresult_hex', '')
        lines.append('| %s | %s | %s | %s |' % (result['case']['id'], result['status'], location.replace('|', '/'), hr))
    lines += ['', 'El JSON contiene eventos, HRESULT/excepinfo, referencias de token anonimizadas, inventario de solo lectura y hashes.',
              'Las pruebas usan únicamente texto fijo. El ZIP no contiene WAV ni carpetas de instalación.',
              'Que una voz funcione en Loquendo TTS no demuestra por sí solo que use el mismo token o motor SAPI x86.',
              'Un error del exe sin eventos debe compararse con el caso source equivalente; no se deduce una llamada COM solo por el código de salida.']
    (folder / 'informe.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    with zipfile.ZipFile(folder / 'para_compartir.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in ['informe.json', 'informe.md']:
            archive.write(folder / name, name)


def main(args):
    backend = find_backend(Path(args.studio).resolve())
    if struct.calcsize('P') != 4:
        raise RuntimeError('Usa el lanzador: este diagnóstico requiere el Python embebido x86 de Studio')
    if not os.path.samefile(sys.executable, backend / 'python' / 'python.exe'):
        raise RuntimeError('Ejecuta el diagnóstico con el Python embebido de la instalación seleccionada, no con Python del sistema')
    parent = Path(args.output_parent or (Path(os.environ.get('LOCALAPPDATA', str(Path.home()))) / 'LoquendoStudio' / 'Diagnosticos'))
    parent.mkdir(parents=True, exist_ok=True)
    folder = parent / ('sapi-' + uuid.uuid4().hex[:12]); folder.mkdir()
    redactor = Redactor([backend.parent, folder])
    inventory = run_case(backend, folder / 'inventory', {'id': 'inventory', 'mode': 'inventory'}, args.timeout, redactor)
    voices = inventory.get('details', {}).get('voices', [])
    matches = select_match(voices, args.voice)
    target = matches[0] if len(matches) == 1 else None
    control_matches = select_match(voices, args.control) if args.control else select_match(voices, 'Jorge')
    control = next((v for v in control_matches if not target or v['id'] != target['id']), None)
    if not control and not args.control:
        control = next((v for v in voices if not target or v['id'] != target['id']), None)
    report = {'diagnostic_version': VERSION,
              'environment': {'python_bits': struct.calcsize('P') * 8, 'python_version': platform.python_version(),
                              'windows_version': platform.version(), 'os_arch': os.environ.get('PROCESSOR_ARCHITEW6432', os.environ.get('PROCESSOR_ARCHITECTURE')),
                              'exe_machine': pe_machine(backend / 'bin' / 'generar_voz.exe')},
              'hashes': {name: sha256(backend / name) for name in ['python/python.exe', 'modules/generar_voz.py', 'modules/listar_voces.py', 'modules/sapi_voice_common.py', 'bin/generar_voz.exe']},
              'selection': {'requested': args.voice, 'target_status': 'selected' if target else 'ambiguous' if matches else 'not_found',
                            'matches': matches, 'target': target, 'control': control},
              'cases': [inventory]}
    report['hashes']['diagnostico_sapi.py'] = sha256(Path(__file__))
    try:
        report['environment']['pywin32_version'] = importlib.metadata.version('pywin32')
    except importlib.metadata.PackageNotFoundError:
        report['environment']['pywin32_version'] = 'unknown'
    listing = run_case(backend, folder / 'studio_voice_list', {'id': 'studio_voice_list', 'mode': 'list'}, args.timeout, redactor)
    report['cases'].append(listing)
    listed = listing.get('listed_voices', [])
    report['selection']['target_visible_in_studio_list'] = any(v.get('nombre') == target['description'] for v in listed if isinstance(v, dict)) if target and isinstance(listed, list) else None
    write_report(folder, redactor.clean(report))
    for case in build_cases(target, control):
        print('Prueba: ' + case['id'], flush=True)
        result = run_case(backend, folder / case['id'], case, args.timeout, redactor)
        report['cases'].append(result)
        write_report(folder, redactor.clean(report))
    report['summary'] = {status: sum(c['status'] == status for c in report['cases']) for status in sorted({c['status'] for c in report['cases']})}
    report['conclusion'] = ('inventory_failed' if inventory['status'] != 'ok' else
                            'target_not_testable_missing_or_ambiguous' if not target else
                            'failures_observed_requires_analysis' if any(c['status'] != 'ok' for c in report['cases']) else
                            'not_reproduced_with_fixed_cases')
    write_report(folder, redactor.clean(report))
    print('Informe listo: ' + str(folder), flush=True)
    return 0


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--studio', default=str(Path(__file__).resolve().parents[2]))
    parser.add_argument('--voice', default='Leonor')
    parser.add_argument('--control')
    parser.add_argument('--output-parent')
    parser.add_argument('--timeout', type=int, default=45)
    parser.add_argument('--worker', action='store_true', help=argparse.SUPPRESS)
    parser.add_argument('--backend', help=argparse.SUPPRESS)
    parser.add_argument('--folder', help=argparse.SUPPRESS)
    options = parser.parse_args()
    try:
        sys.exit(worker(Path(options.backend), Path(options.folder)) if options.worker else main(options))
    except Exception as error:
        print(Redactor().text('No se pudo completar el diagnóstico: ' + str(error)), file=sys.stderr)
        sys.exit(1)
