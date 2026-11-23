import contextlib
import gc
import importlib.util
import io
import json
from pathlib import Path
import runpy
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
import weakref

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend/modules'))
import sapi_voice_common as common
generator = runpy.run_path(str(ROOT / 'backend/modules/generar_voz.py'), run_name='sapi_unit')


class Failure(Exception):
    hresult = -2147352567
    strerror = 'Excepción de prueba'
    excepinfo = (0, 'Proveedor', 'fragmento privado del texto', None, 0, -2147467259)
    argerror = None


class Token:
    def __init__(self, identity, name): self.Id, self.name = identity, name
    def GetDescription(self): return self.name


def voices(tokens):
    return types.SimpleNamespace(GetVoices=lambda: types.SimpleNamespace(Count=len(tokens), Item=lambda index: tokens[index]))


def engine(fail_speak=False, fail_close=False, fail_clear=False, fail_uninit=False):
    state = {'close': 0, 'clear': 0, 'voices': [], 'flags': [], 'refs': {}}
    tokens = [Token('opaque-leonor', 'Leonor'), Token('opaque-jorge', 'Jorge')]
    class Speaker:
        def GetVoices(self): return voices(tokens).GetVoices()
        @property
        def Voice(self): return self._voice
        @Voice.setter
        def Voice(self, token): self._voice = token; state['voices'].append(token.Id)
        @property
        def AudioOutputStream(self): return self._stream
        @AudioOutputStream.setter
        def AudioOutputStream(self, value):
            if value is None:
                state['clear'] += 1
                if fail_clear: raise Failure('clear')
            self._stream = value
        def Speak(self, text, flags):
            state['flags'].append(flags)
            if fail_speak: raise Failure('Speak')
    class Stream:
        def __init__(self): self.Format = types.SimpleNamespace(Type=0)
        def Open(self, *args): state['format'] = self.Format.Type
        def Close(self):
            state['close'] += 1
            if fail_close: raise Failure('Close')
    client = types.ModuleType('win32com.client')
    def dispatch(name):
        obj = Speaker() if name == 'SAPI.SpVoice' else Stream()
        state['refs'][name] = weakref.ref(obj)
        return obj
    client.Dispatch = dispatch
    package = types.ModuleType('win32com'); package.__path__ = []; package.client = client
    python = types.ModuleType('pythoncom'); python.CoInitialize = lambda: None
    def uninitialize():
        gc.collect()
        state['alive_at_uninit'] = {name: ref() is not None for name, ref in state['refs'].items()}
        if fail_uninit: raise Failure('CoUninitialize')
    python.CoUninitialize = uninitialize
    return state, {'win32com': package, 'win32com.client': client, 'pythoncom': python}


class RobustnessTests(unittest.TestCase):
    def test_exact_token_wins_over_duplicate_description(self):
        a, b = Token('opaque-a','Leonor'), Token('opaque-b','Leonor')
        self.assertIs(common.resolver_voz(voices([a,b]), 'opaque-b'), b)
        with self.assertRaises(common.ErrorVoz) as error: common.resolver_voz(voices([a,b]), 'Leonor')
        self.assertEqual(error.exception.code, 'VOICE_AMBIGUOUS')

    def test_unique_legacy_names_and_partial_alias_are_compatible(self):
        token = Token('opaque-id','Loquendo Leonor')
        for query in ['Loquendo Leonor','Leonor','  loquendo leonor ']:
            self.assertIs(common.resolver_voz(voices([token]), query), token)
        jorge = Token('opaque-j','Jorge')
        self.assertIs(common.resolver_voz(voices([jorge]),'Loquendo Jorge'),jorge)
        with self.assertRaises(common.ErrorVoz): common.resolver_voz(voices([jorge]),'Voz inexistente Jorge')

    def test_ambiguous_partial_and_unknown_never_choose_first_or_default(self):
        tokens = [Token('a','Leonor primera'), Token('b','Leonor segunda')]
        for query,code in [('Leonor','VOICE_AMBIGUOUS'),('No existe','VOICE_NOT_FOUND')]:
            with self.assertRaises(common.ErrorVoz) as error: common.resolver_voz(voices(tokens),query)
            self.assertEqual(error.exception.code, code)

    def run_generation(self, text, **faults):
        state, modules = engine(**faults)
        stdout, stderr = io.StringIO(), io.StringIO()
        with tempfile.TemporaryDirectory() as root, patch.dict(sys.modules, modules), contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
            try: result = generator['generar_audio_multivoz'](text,'opaque-leonor',str(Path(root)/'voice.wav'))
            except SystemExit as error: result = error.code
        diagnostic = None
        for line in stderr.getvalue().splitlines():
            if line.startswith('SAPI_DIAGNOSTIC '): diagnostic = json.loads(line[len('SAPI_DIAGNOSTIC '):])
        return state, result, stdout.getvalue(), stderr.getvalue(), diagnostic

    def test_success_keeps_format_and_releases_before_uninitialize(self):
        state, result, stdout, stderr, diagnostic = self.run_generation('Prueba')
        self.assertIsInstance(result,str); self.assertIn('EXITO',stdout); self.assertEqual(stderr,'')
        self.assertEqual(state['format'],39); self.assertEqual(state['close'],1); self.assertEqual(state['clear'],1)
        self.assertFalse(any(state['alive_at_uninit'].values()))
        self.assertEqual(state['flags'],[0]); self.assertNotIn('opaque-leonor',stdout)

    def test_xml_and_multivoice_preserve_selection_and_restore_default(self):
        state, result, *_ = self.run_generation('Inicio. [voz:Jorge][pause:100]Prueba[/voz] Regreso.')
        self.assertIsInstance(result,str); self.assertEqual(state['flags'],[0,8,0])
        self.assertIn('opaque-jorge',state['voices']); self.assertEqual(state['voices'][-1],'opaque-leonor')

    def test_speak_failure_remains_primary_despite_close_and_disconnect_failures(self):
        state, result, stdout, stderr, diagnostic = self.run_generation('Prueba',fail_speak=True,fail_close=True,fail_clear=True)
        self.assertEqual(result,1); self.assertNotIn('EXITO',stdout)
        self.assertEqual(diagnostic['primary']['stage'],'SpVoice.Speak')
        self.assertEqual(diagnostic['primary']['hresult_hex'],'0x80020009')
        self.assertEqual(diagnostic['primary']['excepinfo']['scode_hex'],'0x80004005')
        self.assertEqual(len(diagnostic['cleanup_errors']),2)
        self.assertEqual(state['close'],1); self.assertEqual(state['clear'],1)
        self.assertFalse(any(state['alive_at_uninit'].values()),'El traceback no debe retener wrappers')
        self.assertNotIn('fragmento privado',stderr); self.assertNotIn('opaque-leonor',stderr)

    def test_cleanup_failure_is_reported_if_speak_succeeded(self):
        state, result, stdout, stderr, diagnostic = self.run_generation('Prueba',fail_close=True)
        self.assertEqual(result,1); self.assertEqual(diagnostic['primary']['stage'],'cleanup.SpFileStream.Close')
        self.assertNotIn('EXITO',stdout); self.assertEqual(state['close'],1)

    def test_uninitialize_failure_does_not_mask_speak(self):
        state, result, stdout, stderr, diagnostic = self.run_generation('Prueba',fail_speak=True,fail_uninit=True)
        self.assertEqual(diagnostic['primary']['stage'],'SpVoice.Speak')
        self.assertEqual(diagnostic['cleanup_errors'][-1]['stage'],'cleanup.CoUninitialize')

    def test_stdout_none_is_supported_by_detector_and_generator(self):
        state, modules = engine()
        with tempfile.TemporaryDirectory() as root, patch.dict(sys.modules,modules), patch.object(sys,'stdout',None):
            common.configurar_stdout()
            self.assertEqual(common.cli_listar(),0)
            self.assertIsInstance(generator['generar_audio_multivoz']('Prueba','opaque-leonor',str(Path(root)/'voice.wav')),str)

    def test_registry_filter_is_retained_and_every_open_is_closed(self):
        state={'opened':0,'closed':0}
        class Key:
            def __enter__(self): return self
            def __exit__(self,*args): state['closed']+=1
        def open_key(*args): state['opened']+=1; return Key()
        registry=types.SimpleNamespace(HKEY_LOCAL_MACHINE=1,HKEY_CLASSES_ROOT=2,OpenKey=open_key,QueryValueEx=lambda *args:('{dummy}',1))
        with patch.dict(sys.modules,{'winreg':registry}):
            self.assertFalse(common.voz_usable(Token('HKEY_CURRENT_USER\\dummy','Leonor')))
            self.assertEqual(state['opened'],0)
            self.assertTrue(common.voz_usable(Token('HKEY_LOCAL_MACHINE\\dummy','Leonor')))
        self.assertEqual(state,{'opened':3,'closed':3})

    def test_registry_handle_closes_when_query_raises(self):
        state={'closed':0}
        class Key:
            def __enter__(self): return self
            def __exit__(self,*args): state['closed']+=1
        def denied(*args): raise PermissionError('fixture')
        registry=types.SimpleNamespace(HKEY_LOCAL_MACHINE=1,HKEY_CLASSES_ROOT=2,OpenKey=lambda *args:Key(),QueryValueEx=denied)
        with patch.dict(sys.modules,{'winreg':registry}):
            self.assertFalse(common.voz_usable(Token('HKEY_LOCAL_MACHINE\\dummy','Leonor')))
        self.assertEqual(state['closed'],1)

    def test_incomplete_provider_details_do_not_break_primary_error_serialization(self):
        error=Failure('private');error.excepinfo=(0,'provider')
        detail=common.detalle_error(error,{'stage':'SpVoice.Speak'})
        self.assertEqual(detail['hresult_hex'],'0x80020009');self.assertIsNone(detail['excepinfo']['scode'])


if __name__=='__main__': unittest.main(verbosity=2)
