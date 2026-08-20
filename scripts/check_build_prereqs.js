// scripts/check_build_prereqs.js
const fs = require('fs');
const required = [
    'bin/generar_voz.exe',
    'bin/ffmpeg.exe',
    'modules/generar_voz.py',
    'modules/generar_srt.py',
    'modules/generar_ass.py'
];

for (const file of required) {
    if (!fs.existsSync(file)) {
        console.error(`❌ FALTA ARCHIVO CRÍTICO: ${file}`);
        console.error('Colócalo antes de ejecutar npm run build');
        process.exit(1);
    }
}
console.log('✅ Todos los prerequisitos presentes');