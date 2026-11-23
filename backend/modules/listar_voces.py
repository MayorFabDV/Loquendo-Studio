# -*- coding: utf-8 -*-
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from sapi_voice_common import cli_listar, voz_usable

if __name__ == '__main__':
    sys.exit(cli_listar())
