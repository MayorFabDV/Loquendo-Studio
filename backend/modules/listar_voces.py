# -*- coding: utf-8 -*-
import win32com.client
import json
import sys
import winreg

if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())


def voz_usable(tok):
    """True si el motor TTS de la voz está registrado (evita voces fantasma que rompen Speak)."""
    try:
        ruta = tok.Id.strip()
        if not ruta.upper().startswith("HKEY_LOCAL_MACHINE\\"):
            return False
        subkey = ruta.split("HKEY_LOCAL_MACHINE\\", 1)[1]
        k = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, subkey)
        clsid = winreg.QueryValueEx(k, "CLSID")[0]
        winreg.CloseKey(k)
        sub = "CLSID\\" + clsid
        winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, sub)
        winreg.OpenKey(winreg.HKEY_CLASSES_ROOT, sub + "\\InprocServer32")
        return True
    except Exception:
        return False


try:
    speaker = win32com.client.Dispatch("SAPI.SpVoice")
    voces = speaker.GetVoices()
    resultado = []
    for i in range(voces.Count):
        if not voz_usable(voces.Item(i)):
            continue
        desc = voces.Item(i).GetDescription()
        resultado.append({"id": desc, "nombre": desc})
    print(json.dumps(resultado, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)