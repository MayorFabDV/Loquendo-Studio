"""Smoke explícito del parche fuente, sin recompilar ni tocar binarios publicados."""
import gc
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
import wave

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'backend/modules'))
import sapi_voice_common as common


def run():
    assert struct.calcsize('P')==4
    catalog=common.enumerar_voces()
    with tempfile.TemporaryDirectory(prefix='sapi-native-patch-') as root:
        for name in ['Leonor','Jorge']:
            matches=[v for v in catalog if v['nombre']==name]
            assert len(matches)==1,'Se requiere una voz de prueba inequívoca: '+name
            identity=matches[0]['id']
            for kind,identifier in [('token',identity),('legacy',name)]:
                for mode,text,flags in [('plain','Prueba de voz.',0),('xml','[pause:100][emphasis]Prueba de voz.[/emphasis]',8)]:
                    file=Path(root)/(name+'-'+kind+'-'+mode+'.wav')
                    result=subprocess.run([sys.executable,'-B',str(ROOT/'backend/modules/generar_voz.py'),text,identifier,str(file)],capture_output=True,timeout=45)
                    stdout=result.stdout.decode('utf-8',errors='replace');stderr=result.stderr.decode('utf-8',errors='replace')
                    assert result.returncode==0,name+' '+kind+' '+mode+' no terminó correctamente'
                    assert identity not in stdout+stderr,'Se filtró un ID completo'
                    assert 'IUnknown' not in stderr and 'EXITO' in stdout
                    stages=[json.loads(line[len('SAPI_STAGE '):]) for line in stdout.splitlines() if line.startswith('SAPI_STAGE ')]
                    speak=next(s for s in stages if s['stage']=='SpVoice.Speak')
                    assert speak['token_ref']==common.referencia_token(identity) and speak['flags']==flags
                    assert speak['format_requested']==39
                    with wave.open(str(file),'rb') as audio:
                        assert audio.getnframes()>0 and audio.getframerate()==48000 and audio.getnchannels()==2 and audio.getsampwidth()==2
                    print('SAPI_NATIVE_PATCH_PASS',name,kind,mode,flush=True)
        # Control negativo real ya observado en la auditoría: no modificar registro ni filtro.
        result=subprocess.run([sys.executable,'-B',str(ROOT/'backend/modules/generar_voz.py'),'Prueba de voz.','Microsoft Mary',str(Path(root)/'negative.wav')],capture_output=True,timeout=45)
        stderr=result.stderr.decode('utf-8',errors='replace')
        assert result.returncode==1
        diagnostic=next(json.loads(line[len('SAPI_DIAGNOSTIC '):]) for line in stderr.splitlines() if line.startswith('SAPI_DIAGNOSTIC '))
        if diagnostic['primary']['code']=='VOICE_NOT_FOUND':
            print('SAPI_NATIVE_NEGATIVE_NOT_AVAILABLE: voz de control ausente')
        else:
            assert diagnostic['primary']['stage']=='SpVoice.Speak'
            assert diagnostic['primary']['excepinfo']['scode_hex']=='0x80040154'
            assert 'IUnknown' not in stderr,'No debe liberar wrappers después de CoUninitialize'
            print('SAPI_NATIVE_NEGATIVE_PASS: error COM primario conservado, sin avisos IUnknown')


if __name__=='__main__':
    try:run()
    except Exception as error:
        print('SAPI_NATIVE_PATCH_FAIL',common.depurar(error),file=sys.stderr)
        sys.exit(1)
