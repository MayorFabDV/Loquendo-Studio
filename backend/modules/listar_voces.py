# -*- coding: utf-8 -*-
import win32com.client
import json
import sys

if sys.platform == "win32":
    import codecs
    sys.stdout = codecs.getwriter("utf-8")(sys.stdout.detach())

try:
    speaker = win32com.client.Dispatch("SAPI.SpVoice")
    voces = speaker.GetVoices()
    resultado = []
    for i in range(voces.Count):
        desc = voces.Item(i).GetDescription()
        resultado.append({"id": desc, "nombre": desc})
    print(json.dumps(resultado, ensure_ascii=False))
except Exception as e:
    print(json.dumps({"error": str(e)}))
    sys.exit(1)
