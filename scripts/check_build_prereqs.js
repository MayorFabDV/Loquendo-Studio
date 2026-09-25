// scripts/check_build_prereqs.js
const fs = require('fs');
const path = require('path');

// Resolver rutas relativas a la raíz del repo (independiente del cwd)
const rootDir = path.join(__dirname, '..');

const required = [
    'backend/bin/generar_voz.exe',
    'backend/bin/ffmpeg.exe',
    'backend/modules/generar_voz.py',
    'backend/modules/generar_srt.py',
    'backend/modules/generar_ass.py'
];

for (const file of required) {
    if (!fs.existsSync(path.join(rootDir, file))) {
        console.error(`❌ FALTA ARCHIVO CRÍTICO: ${file}`);
        console.error('Colócalo antes de ejecutar npm run build');
        process.exit(1);
    }
}
console.log('✅ Todos los prerequisitos presentes');