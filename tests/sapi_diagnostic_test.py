import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location('diagnostico_sapi', Path(__file__).resolve().parents[1] / 'tools/diagnostico_sapi/diagnostico_sapi.py')
diag = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(diag)


class COMError(Exception):
    hresult = -2147352567
    excepinfo = (0, 'SAPI', 'Fallo de prueba', None, 0, -2147201021)
    argerror = 0


class Token:
    Id = 'HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Speech\\Voices\\Tokens\\Leonor'
    def GetDescription(self):
        return 'Leonor'


class Speaker:
    def __init__(self):
        self.bound = False
        self.token = Token()

    def GetVoices(self):
        return types.SimpleNamespace(Count=1, Item=lambda index: self.token)

    @property
    def Voice(self):
        return self.token

    @Voice.setter
    def Voice(self, value):
        if self.bound:
            raise COMError('No se puede cambiar la voz en esta prueba')

    @property
    def AudioOutputStream(self):
        return None

    @AudioOutputStream.setter
    def AudioOutputStream(self, value):
        self.bound = value is not None


class DiagnosticTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='sapi-unit-')
        self.root = Path(self.temp.name)
        self.rec = diag.Recorder(self.root / 'events.jsonl', diag.Redactor([self.root]))

    def tearDown(self):
        self.temp.cleanup()

    def events(self):
        return [json.loads(line) for line in self.rec.file.read_text(encoding='utf-8').splitlines()]

    def test_direct_identifies_assignment_after_binding_and_preserves_hresult(self):
        speaker = Speaker()
        stream = types.SimpleNamespace(Format=types.SimpleNamespace(Type=0), Open=lambda *args: None, Close=lambda: None)
        client = types.SimpleNamespace(Dispatch=lambda name: speaker if name == 'SAPI.SpVoice' else stream)
        with self.assertRaises(COMError):
            diag.direct_case(client, self.root, {'token_id': Token.Id, 'format': 39, 'reassign': True, 'text': 'Prueba', 'flags': 0}, self.root / 'audio.wav', self.rec)
        failure = next(e for e in self.events() if e.get('status') == 'error')
        self.assertEqual(failure['operation'], 'SpVoice.Voice.set.after_stream')
        self.assertEqual(failure['token']['id'], Token.Id)
        self.assertEqual(failure['error']['hresult_hex'], '0x80020009')
        self.assertEqual(failure['error']['excepinfo']['scode_hex'], '0x80045003')
        self.assertFalse(speaker.bound)

    def test_trace_points_to_original_source_line_without_wrapping_com(self):
        source = self.root / 'generar_voz.py'
        source.write_text("def buscar_voz(speaker, nombre_busqueda):\n    return speaker.token\ndef _procesar_audio_voz(speaker):\n    voz_default = buscar_voz(speaker, 'Leonor')\n    speaker.Voice = voz_default\n", encoding='utf-8')
        namespace = {}; exec(compile(source.read_text(encoding='utf-8'), str(source), 'exec'), namespace)
        speaker = Speaker(); speaker.bound = True
        previous = sys.gettrace()
        sys.settrace(diag.source_trace(source, self.rec))
        try:
            with self.assertRaises(COMError):
                namespace['_procesar_audio_voz'](speaker)
        finally:
            sys.settrace(previous)
        events = self.events()
        failure = next(e for e in events if e.get('status') == 'error')
        self.assertEqual(failure['line'], 5)
        self.assertEqual(failure['code'], 'speaker.Voice = voz_default')
        self.assertEqual(failure['function'], '_procesar_audio_voz')
        self.assertEqual(next(e for e in events if e['operation'] == 'source.selected_token')['token']['id'], Token.Id)

    def test_redaction_removes_identities_paths_and_email_but_not_error_codes(self):
        with patch.dict(os.environ, {'USERNAME': 'TesterPrivado', 'COMPUTERNAME': 'PC_PRIVADO', 'USERDOMAIN': 'DOM_PRIVADO'}):
            redactor = diag.Redactor([r'C:\Users\TesterPrivado\Studio'])
            error = COMError(r'Archivo C:\Users\TesterPrivado\Studio\audio.wav; usuario TesterPrivado')
            error.excepinfo = (0, 'SAPI', r'Fallo en D:\Privado\voz.dll', r'\\servidor\privado\help.chm', 0, -2147201021)
            result = redactor.clean({'error': diag.error_info(error), 'host': 'PC_PRIVADO DOM_PRIVADO', 'email': 'privado@example.com'})
        text = json.dumps(result)
        for private in ['TesterPrivado', 'PC_PRIVADO', 'DOM_PRIVADO', 'voz.dll', 'servidor', 'privado@example.com']:
            self.assertNotIn(private, text)
        self.assertEqual(result['error']['excepinfo']['scode_hex'], '0x80045003')

    def test_timeout_keeps_last_operation_and_never_claims_success(self):
        folder = self.root / 'case'
        def timeout(*args, **kwargs):
            (folder / 'events.jsonl').write_text(json.dumps({'operation': 'SpVoice.Speak', 'status': 'begin'}) + '\n', encoding='utf-8')
            raise subprocess.TimeoutExpired('python', 1, output=b'C:\\Users\\Secreto\\archivo.wav')
        with patch.object(diag.subprocess, 'run', side_effect=timeout):
            result = diag.run_case(self.root, folder, {'mode': 'direct', 'id': 'timeout'}, 1, diag.Redactor([self.root]))
        self.assertEqual(result['status'], 'timeout')
        self.assertEqual(result['last_operation']['operation'], 'SpVoice.Speak')
        self.assertNotIn('Secreto', json.dumps(result))

    def test_missing_or_ambiguous_voice_does_not_fall_back_and_pass_as_leonor(self):
        control = {'description': 'Jorge', 'id': 'control'}
        self.assertEqual(diag.select_match([control], 'Leonor'), [])
        matches = diag.select_match([{'description': 'Leonor antigua'}, {'description': 'Leonor nueva'}], 'Leonor')
        self.assertEqual(len(matches), 2)
        cases = diag.build_cases(None, control)
        self.assertTrue(cases)
        self.assertTrue(all(c['id'].startswith('control_') for c in cases))

    def test_share_archive_contains_only_sanitized_reports(self):
        report = diag.Redactor([self.root]).clean({'environment': {'file': str(self.root / 'privado')}, 'selection': {'token': Token.Id}, 'cases': []})
        (self.root / 'audio.wav').write_bytes(b'no se comparte')
        diag.write_report(self.root, report)
        with zipfile.ZipFile(self.root / 'para_compartir.zip') as archive:
            self.assertEqual(sorted(archive.namelist()), ['informe.json', 'informe.md'])
            self.assertNotIn(str(self.root).encode(), archive.read('informe.json'))
            self.assertNotIn(Token.Id, archive.read('informe.json').decode('utf-8'))
            self.assertIn('token-sha256:', archive.read('informe.json').decode('utf-8'))

    def test_native_registry_view_avoids_x86_filesystem_redirection(self):
        with patch.dict(os.environ, {'PROCESSOR_ARCHITEW6432': 'AMD64', 'WINDIR': r'C:\Windows', 'ProgramW6432': r'C:\Program Files'}), patch.object(diag.struct, 'calcsize', return_value=4):
            self.assertEqual(diag.engine_file(r'C:\Windows\System32\Speech\engine.dll', '64'), r'C:\Windows\Sysnative\Speech\engine.dll')
            self.assertEqual(diag.engine_file(r'C:\Windows\System32\Speech\engine.dll', '32'), r'C:\Windows\System32\Speech\engine.dll')
            self.assertEqual(diag.engine_file(r'%ProgramFiles%\Loquendo\engine.dll', '64'), r'C:\Program Files\Loquendo\engine.dll')


if __name__ == '__main__':
    unittest.main(verbosity=2)
