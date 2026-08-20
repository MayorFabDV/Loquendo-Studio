// js/main.ts - Versión TypeScript con DictionaryEditor integrado
// ==========================================
// 0. DEFINICIONES E INTERFACES (TYPES)
// ==========================================
const API_BASE_URL = 'http://localhost:3000';

interface DiccionarioSimple {
  [key: string]: string | string[];
}

interface AudioResponse {
  url: string;
  srt?: string;
  error?: string;
}

interface VideoResponse {
  video: string;
  error?: string;
}

interface DuckingOptions {
  musicVolume: number;
  duckAmount: number;
  loopMusic: boolean;
  fadeInMusic: number;
  fadeOutMusic: number;
}

// ==========================================
// CREDENCIALES PARA TYPESCRIPT (declare global)
// ==========================================

// 1. Definimos cómo es el audioEditor
interface AudioEditor {
  wavesurfer?: unknown;
  isReady: boolean;
  cargarMusica: (url: string) => void;
  subirVolumen: (paso: number) => void;
  bajarVolumen: (paso: number) => void;
  mutear: () => void;
  cambiarVolumenDesdeSlider: (valor: number) => void;
  playPause: () => void;
  eliminarSeleccion: () => Promise<string | null>;
  deshacer: () => void;
  rehacer: () => void;
  inicializar: (containerId?: string) => boolean;
  cargarAudio: (url: string) => void;
  play: () => void;
  pause: () => void;
  stop: () => void;
  getDuration: () => number;
  normalizarVolume: (peak?: number) => Promise<boolean | null>;
  eliminarSilencios: (threshold?: number, minDuration?: number) => Promise<boolean | null>;
  aplicarFadeIn: (duration?: number) => Promise<boolean | null>;
  aplicarFadeOut: (duration?: number) => Promise<boolean | null>;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoom: () => void;
}

// 2. Definimos cómo es el dictionaryEditor
interface DictionaryEditorClass {
  dictionaries: {
    jergas: DiccionarioSimple;
    sinonimos: DiccionarioSimple;
    fonetica: DiccionarioSimple;
  };
  currentTab: 'jergas' | 'sinonimos' | 'fonetica';
  searchTerm: string;
  loadAll: () => Promise<void>;
  render: () => void;
  switchTab: (tab: 'jergas' | 'sinonimos' | 'fonetica') => void;
  applyToText: (texto: string) => string;
  addEntry: () => Promise<void>;
  deleteEntry: (word: string) => Promise<void>;
  handleSearch: (term: string) => void;
}

// 3. Le decimos a TypeScript que agregue estas cosas al Window
declare global {
  interface Window {
    audioEditor?: AudioEditor;
    dictionaryEditor?: DictionaryEditorClass;
    cargarYReproducir?: (url: string, srt?: string) => void;
  }
}


// ==========================================
// CLASE DICTIONARYEDITOR (INTEGRADA)
// ==========================================
class DictionaryEditor {
  public dictionaries: {
    jergas: DiccionarioSimple;
    sinonimos: DiccionarioSimple;
    fonetica: DiccionarioSimple;
  };
  public currentTab: 'jergas' | 'sinonimos' | 'fonetica';
  public searchTerm: string;

  constructor() {
    this.dictionaries = {
      jergas: {},
      sinonimos: {},
      fonetica: {}
    };
    this.currentTab = 'jergas';
    this.searchTerm = '';
  }

  async loadAll(): Promise<void> {
    try {
      const [resJer, resSin] = await Promise.all([
        fetch(`${API_BASE_URL}/api/jergas`),
        fetch(`${API_BASE_URL}/api/sinonimos`)
      ]);
      
      if (resJer.ok) this.dictionaries.jergas = await resJer.json();
      if (resSin.ok) this.dictionaries.sinonimos = await resSin.json();
      
      // Cargar fonética desde localStorage
      const foneticaLocal = localStorage.getItem('diccionarioFonetica');
      if (foneticaLocal) {
        this.dictionaries.fonetica = JSON.parse(foneticaLocal);
      } else {
        // Fonética por defecto
        this.dictionaries.fonetica = {
          'sql': 'ese-cu-ele',
          'xq': 'porque',
          'tb': 'también',
          'afaik': 'a lo que yo sé',
          'imo': 'en mi opinión'
        };
        this.saveFonetica();
      }
      
      this.render();
      console.log('✅ Diccionarios cargados:', this.dictionaries);
    } catch (error) {
      console.error('❌ Error cargando diccionarios:', error);
    }
  }

  render(): void {
    const container = document.getElementById('dictionaryEditor');
    if (!container) return;

    container.innerHTML = `
      <div class="dictionary-tabs">
        <button class="tab-btn ${this.currentTab === 'jergas' ? 'active' : ''}" 
                onclick="window.dictionaryEditor?.switchTab('jergas')">
          🌎 Jergas
        </button>
        <button class="tab-btn ${this.currentTab === 'sinonimos' ? 'active' : ''}" 
                onclick="window.dictionaryEditor?.switchTab('sinonimos')">
          🧠 Sinónimos
        </button>
        <button class="tab-btn ${this.currentTab === 'fonetica' ? 'active' : ''}" 
                onclick="window.dictionaryEditor?.switchTab('fonetica')">
          🗣️ Fonética
        </button>
      </div>

      <div class="dictionary-content">
        <div class="dictionary-header">
          <h4>${this.getTabTitle()}</h4>
          <input type="text" 
                 id="searchDictionary" 
                 placeholder="Buscar..." 
                 value="${this.searchTerm}"
                 oninput="window.dictionaryEditor?.handleSearch(this.value)">
        </div>

        <div class="dictionary-add-form">
          <input type="text" 
                 id="newWord" 
                 placeholder="Palabra original">
          <input type="text" 
                 id="newReplacement" 
                 placeholder="${this.getPlaceholder()}">
          <button onclick="window.dictionaryEditor?.addEntry()">➕ Agregar</button>
        </div>

        <div class="dictionary-list" id="dictionaryList">
          ${this.renderEntries()}
        </div>
      </div>
    `;
  }

  switchTab(tab: 'jergas' | 'sinonimos' | 'fonetica'): void {
    this.currentTab = tab;
    this.searchTerm = '';
    this.render();
  }

  getTabTitle(): string {
    const titles = {
      jergas: '🌎 Jergas y Regionalismos',
      sinonimos: '🧠 Sinónimos (variaciones aleatorias)',
      fonetica: '🗣️ Fonética Loquendo (correcciones de pronunciación)'
    };
    return titles[this.currentTab];
  }

  getPlaceholder(): string {
    const placeholders = {
      jergas: 'Reemplazo (ej: amigo)',
      sinonimos: 'Sinónimos separados por coma (ej: hogar,vivienda)',
      fonetica: 'Cómo debe sonar (ej: ese-cu-ele)'
    };
    return placeholders[this.currentTab];
  }

  handleSearch(term: string): void {
    this.searchTerm = term.toLowerCase();
    const listElement = document.getElementById('dictionaryList');
    if (listElement) {
      listElement.innerHTML = this.renderEntries();
    }
  }

  renderEntries(): string {
    const dict = this.dictionaries[this.currentTab];
    const entries = Object.entries(dict).filter(([key]) => 
      key.toLowerCase().includes(this.searchTerm)
    );

    if (entries.length === 0) {
      return '<p class="empty-message">No hay entradas en este diccionario</p>';
    }

    return entries.map(([original, replacement]) => {
      const replacementText = Array.isArray(replacement) ? replacement.join(', ') : replacement;
      return `
        <div class="dictionary-entry">
          <span class="entry-word">${original}</span>
          <span class="entry-arrow">→</span>
          <span class="entry-replacement">${replacementText}</span>
          <button class="btn-delete" onclick="window.dictionaryEditor?.deleteEntry('${original}')">🗑️</button>
        </div>
      `;
    }).join('');
  }

  async addEntry(): Promise<void> {
    const originalInput = document.getElementById('newWord') as HTMLInputElement | null;
    const replacementInput = document.getElementById('newReplacement') as HTMLInputElement | null;

    const original = originalInput?.value.trim().toLowerCase() || '';
    const replacement = replacementInput?.value.trim().toLowerCase() || '';

    if (!original || !replacement) {
      alert('Completa ambos campos');
      return;
    }

    if (this.currentTab === 'sinonimos') {
      const valores = replacement.split(',').map(s => s.trim()).filter(s => s);
      this.dictionaries.sinonimos[original] = valores.length > 1 ? valores : replacement;
    } else {
      this.dictionaries[this.currentTab][original] = replacement;
    }

    if (this.currentTab === 'fonetica') {
      this.saveFonetica();
    } else {
      await this.saveToServer(this.currentTab, original, this.dictionaries[this.currentTab][original]);
    }

    if (originalInput) originalInput.value = '';
    if (replacementInput) replacementInput.value = '';
    this.render();
  }

  async deleteEntry(word: string): Promise<void> {
    if (!confirm(`¿Eliminar "${word}" del diccionario?`)) return;

    delete this.dictionaries[this.currentTab][word];

    if (this.currentTab === 'fonetica') {
      this.saveFonetica();
    } else {
      await fetch(`${API_BASE_URL}/api/${this.currentTab}/${encodeURIComponent(word)}`, {
        method: 'DELETE'
      });
    }

    this.render();
  }

  async saveToServer(tipo: 'jergas' | 'sinonimos', original: string, reemplazo: string | string[]): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/api/${tipo}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ original, reemplazo })
      });
    } catch (error) {
      console.error('❌ Error guardando en servidor:', error);
    }
  }

  saveFonetica(): void {
    localStorage.setItem('diccionarioFonetica', JSON.stringify(this.dictionaries.fonetica));
  }

  applyToText(texto: string): string {
    let resultado = texto;

    // Aplicar fonética
    for (const [original, reemplazo] of Object.entries(this.dictionaries.fonetica)) {
      const reemplazoStr = Array.isArray(reemplazo) ? reemplazo[0] : reemplazo;
      resultado = resultado.replace(new RegExp(`\\b${original}\\b`, 'gi'), reemplazoStr);
    }

    // Aplicar jergas
    for (const [original, reemplazo] of Object.entries(this.dictionaries.jergas)) {
      const reemplazoStr = Array.isArray(reemplazo) ? reemplazo[0] : reemplazo;
      resultado = resultado.replace(new RegExp(`\\b${original}\\b`, 'gi'), reemplazoStr);
    }

    // Aplicar sinónimos (aleatorio)
    for (const [original, reemplazo] of Object.entries(this.dictionaries.sinonimos)) {
      const valores = Array.isArray(reemplazo) ? reemplazo : [reemplazo];
      const elegido = valores[Math.floor(Math.random() * valores.length)];
      resultado = resultado.replace(new RegExp(`\\b${original}\\b`, 'gi'), elegido);
    }

    return resultado;
  }
}

// ==========================================
// 1. VARIABLES DE ESTADO
// ==========================================
let diccionarioServidor: Record<string, string> = {};
let textoBaseParaAprender: string = "";
let musicaFondoPath: string | null = null;
let voiceAudioRealPath: string | null = null;

// Inicializar DictionaryEditor global
window.dictionaryEditor = new DictionaryEditor();

// ==========================================
// 2. MOTOR DE TEXTO (INTEGRADO CON DICTIONARYEDITOR)
// ==========================================
function optimizar(): void {
  const entradaInput = document.getElementById("textoEntrada") as HTMLTextAreaElement | null;
  const modoSelect = document.getElementById("modo") as HTMLSelectElement | null;
  const salida = document.getElementById("resultado") as HTMLTextAreaElement | null;

  if (!entradaInput || !entradaInput.value.trim()) {
    alert("Escribe algo en el cuadro de texto primero.");
    return;
  }

  let texto = entradaInput.value.trim();
  const modo = modoSelect?.value || "normal";

  // ✅ APLICAR DICCIONARIOS DEL EDITOR
  if (window.dictionaryEditor) {
    texto = window.dictionaryEditor.applyToText(texto);
  }

  // PUNTUACIÓN INTELIGENTE
  const chkComas = document.getElementById("chkComas") as HTMLInputElement | null;
  if (chkComas?.checked) {
    texto = texto.replace(/\s+([,.!?])/g, "$1");
    texto = texto.replace(/^(Hola|Bueno|Pues|Entonces|Así que|Oye)\b/gi, "$1,");
    const conectores = ["pero", "aunque", "sin embargo", "además", "entonces", "no obstante", "mientras", "donde", "porque", "ya que"];
    conectores.forEach(conector => {
      const regex = new RegExp(`([^,.\\n])\\s+\\b(${conector})\\b`, "gi");
      texto = texto.replace(regex, "$1, $2");
    });
    const finales = ["he dicho", "obviamente", "por supuesto", "claro", "en fin", "obvio"];
    finales.forEach(final => {
      const regex = new RegExp(`\\s+(${final})\\b([.!?])?`, "gi");
      texto = texto.replace(regex, ", $1$2");
    });
    texto = texto.replace(/\b(he|de|la|el|un|una|se|me|te|lo|le|y|o|a|en|por)\s*,\s*/gi, "$1 ");
    texto = texto.replace(/,+/g, ",");
    texto = texto.replace(/,([^\s])/g, ", $1");
  }

  // Modo Gameplay
  if (modo === "gameplay") {
    texto = texto.replace(/!/g, "!!! ");
  }

  // Puntos finales inteligentes
  const chkPuntos = document.getElementById("chkPuntos") as HTMLInputElement | null;
  if (chkPuntos?.checked) {
    texto = texto.replace(/\.([^\s])/g, ". $1");
    if (!/[.!?]$/.test(texto)) {
      texto += ".";
    }
  }

  // Capitalizar primera letra
  const textoFinal = texto.charAt(0).toUpperCase() + texto.slice(1);
  textoBaseParaAprender = textoFinal;

  if (salida) {
    salida.value = textoFinal;
    salida.readOnly = false;
    salida.disabled = false;
  }
  console.log("✅ Texto optimizado con DictionaryEditor");
}

// ==========================================
// 3. PIPELINE DE AUDIO
// ==========================================
async function generarAudio(event?: Event): Promise<void> {
  if (event) event.preventDefault();

  const btn = document.querySelector(".btn-audio") as HTMLButtonElement | null;
  const resultado = document.getElementById("resultado") as HTMLTextAreaElement | null;
  const textoEntrada = document.getElementById("textoEntrada") as HTMLTextAreaElement | null;
  const vozSelect = document.getElementById('vozSeleccionada') as HTMLSelectElement | null;
  const chkSRT = document.getElementById('chkSRT_IA') as HTMLInputElement | null;

  const textoFinal = resultado ? resultado.value : "";

  if (!textoFinal || textoFinal === "El texto aparecerá aquí...") {
    alert("Primero debes automatizar un texto.");
    return;
  }

  if (btn) {
    btn.innerText = "Procesando Pipeline... ⏳";
    btn.disabled = true;
  }

  try {
    const respuesta = await fetch(`${API_BASE_URL}/api/generar-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        texto: textoFinal,
        voz: vozSelect?.value || 'default',
        usarIA: chkSRT?.checked || false
      })
    });

    if (respuesta.ok) {
      const data: AudioResponse = await respuesta.json();
      voiceAudioRealPath = data.url;

      if (typeof window.cargarYReproducir === 'function') {
        window.cargarYReproducir(data.url, data.srt);
      }
    } else {
      const errorData: AudioResponse = await respuesta.json();
      alert("¡Asu! Error: " + (errorData.error || "El servidor falló"));
    }
  } catch (error) {
    console.error("Error fatal en red:", error);
    alert("¿Prendiste el servidor? No hay conexión.");
  } finally {
    if (btn) {
      btn.innerText = "️ Generar Audio Loquendo";
      btn.disabled = false;
    }
    if (resultado) {
      resultado.readOnly = false;
      resultado.disabled = false;
      resultado.focus();
    }
    if (textoEntrada) {
      textoEntrada.readOnly = false;
      textoEntrada.disabled = false;
    }
  }
}

// ==========================================
// 4. INTERFAZ
// ==========================================
function cambiarTema(): void {
  const h = document.documentElement;
  h.setAttribute("data-theme", h.getAttribute("data-theme") === "light" ? "dark" : "light");
}

function cambiarDiseno(): void {
  document.querySelector('.contenedor-flexible')?.classList.toggle('modo-columnas');
}

async function automatizarTodo(): Promise<void> {
  optimizar();
  await new Promise(resolve => setTimeout(resolve, 100));
  await generarAudio();
}

// ==========================================
// 5. GENERADOR DE VIDEO PNGTUBER
// ==========================================
async function generarVideoPNGTuber(): Promise<void> {
  const btnDescargar = document.getElementById('btnDescargar') as HTMLAnchorElement | null;
  const audioElement = document.getElementById('audioReproductor') as HTMLAudioElement | null;
  let audioPath: string | null = null;

  if (audioElement && audioElement.src && !audioElement.src.includes('blob:')) {
    audioPath = audioElement.src;
  } else if (btnDescargar && btnDescargar.href && btnDescargar.href !== window.location.href) {
    audioPath = btnDescargar.href;
  }

  if (!audioPath) {
    alert('⚠️ Primero genera un audio válido.');
    return;
  }

  let rutaLimpia = audioPath.replace(API_BASE_URL, '');
  rutaLimpia = rutaLimpia.split('?')[0];

  const btnVideo = document.querySelector('.btn-video') as HTMLButtonElement | null;
  const textoOriginalBtn = btnVideo ? btnVideo.innerText : 'Generar Video PNGTuber';

  if (btnVideo) {
    btnVideo.innerText = '⏳ Procesando video...';
    btnVideo.disabled = true;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/api/generar-video-pngtuber`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ audioPath: rutaLimpia })
    });
    const data: VideoResponse = await res.json();

    if (res.ok) {
      alert('✅ ¡Video PNGTuber generado con éxito!');
      const link = document.createElement('a');
      link.href = `${API_BASE_URL}${data.video}`;
      link.download = 'video_pngtuber.mp4';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else {
      alert(' Error al generar el video:\n' + (data.error || 'Desconocido'));
    }
  } catch (error) {
    console.error('Error de conexión:', error);
    alert('Error de conexión con el servidor.');
  } finally {
    if (btnVideo) {
      btnVideo.innerText = textoOriginalBtn;
      btnVideo.disabled = false;
    }
  }
}

// ==========================================
// 6. MÚSICA DE FONDO Y DUCKING
// ==========================================
function subirMusicaFondo(): void {
  const input = document.getElementById('backgroundMusicInput') as HTMLInputElement | null;
  if (!input || !input.files || input.files.length === 0) {
    alert('Selecciona un archivo de audio primero.');
    return;
  }

  const formData = new FormData();
  formData.append('music', input.files[0]);

  fetch(`${API_BASE_URL}/api/upload-music`, {
    method: 'POST',
    body: formData
  })
    .then(response => response.json())
    .then((data: { url?: string }) => {
      if (data.url) {
        musicaFondoPath = data.url;
        if (window.audioEditor && typeof window.audioEditor.cargarMusica === 'function') {
          const urlCompleta = `${API_BASE_URL}${data.url}`;
          window.audioEditor.cargarMusica(urlCompleta);
        }
        alert('✅ Música de fondo subida y cargada en waveform');
      }
    })
    .catch(error => {
      console.error('Error al subir música:', error);
      alert('Error al subir la música de fondo');
    });
}

function aplicarDucking(): void {
  const btnDescargar = document.getElementById('btnDescargar') as HTMLAnchorElement | null;
  const voiceAudioPath = voiceAudioRealPath || btnDescargar?.href || '';

  if (!voiceAudioPath) {
    alert('Primero genera un audio de voz.');
    return;
  }

  if (voiceAudioPath.startsWith('blob:')) {
    alert('⚠️ El audio actual es una versión editada temporal. Para aplicar Ducking, genera un audio nuevo primero.');
    return;
  }

  if (!musicaFondoPath) {
    alert('Primero sube una música de fondo.');
    return;
  }

  const chkLoop = document.getElementById('chkLoopMusica') as HTMLInputElement | null;
  const fadeInInput = document.getElementById('fadeInMusicaDuration') as HTMLInputElement | null;
  const fadeOutInput = document.getElementById('fadeOutMusicaDuration') as HTMLInputElement | null;

  const options: DuckingOptions = {
    musicVolume: 0.3,
    duckAmount: 0.15,
    loopMusic: chkLoop?.checked || false,
    fadeInMusic: parseFloat(fadeInInput?.value || '2') || 2,
    fadeOutMusic: parseFloat(fadeOutInput?.value || '3') || 3
  };

  fetch(`${API_BASE_URL}/api/audio/apply-ducking`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      voiceAudioPath: voiceAudioPath.replace(API_BASE_URL, '').split('?')[0],
      musicPath: musicaFondoPath,
      options
    })
  })
    .then(response => response.json())
    .then((data: { url?: string; error?: string }) => {
      if (data.url) {
        if (btnDescargar) btnDescargar.href = `${API_BASE_URL}${data.url}`;
        
        const btnSRT = document.getElementById('btnDescargaSRT');
        if (btnSRT) btnSRT.style.display = 'inline-flex';

        if (typeof window.cargarYReproducir === 'function') {
          window.cargarYReproducir(data.url);
        }
        alert('✅ Ducking aplicado. ¡Audio y música fusionados!');
      } else {
        alert('Error: ' + (data.error || 'Desconocido'));
      }
    })
    .catch(error => {
      console.error('Error al aplicar ducking:', error);
      alert('Error de conexión con el servidor');
    });
}

// ==========================================
// 7. CONTROL DE VOLUMEN
// ==========================================
function subirVolumenMusica(): void {
  window.audioEditor?.subirVolumen(10);
}

function bajarVolumenMusica(): void {
  window.audioEditor?.bajarVolumen(10);
}

function mutearMusica(): void {
  window.audioEditor?.mutear();
}

function cambiarVolumenMusica(valor: number): void {
  window.audioEditor?.cambiarVolumenDesdeSlider(valor);
}

// ==========================================
// 8. EXPORTAR A MP3
// ==========================================
async function exportarAMp3(): Promise<void> {
  const btnDescargar = document.getElementById('btnDescargar') as HTMLAnchorElement | null;
  const voiceAudioPath = voiceAudioRealPath || btnDescargar?.href || '';

  if (!voiceAudioPath) {
    alert('Primero genera un audio válido.');
    return;
  }

  if (voiceAudioPath.startsWith('blob:')) {
    alert('⚠️ El audio actual es una versión editada temporal. Para exportar a MP3, genera un audio nuevo primero.');
    return;
  }

  const btnMP3 = document.getElementById('btnExportarMP3') as HTMLButtonElement | null;
  const textoOriginal = btnMP3 ? btnMP3.innerText : '🎵 Exportar a MP3';

  if (btnMP3) {
    btnMP3.innerText = '⏳ Convirtiendo...';
    btnMP3.disabled = true;
  }

  try {
    const rutaLimpia = voiceAudioPath.replace(API_BASE_URL, '').split('?')[0];

    const respuesta = await fetch(`${API_BASE_URL}/api/audio/convertir-mp3`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ wavPath: rutaLimpia })
    });

    const data: { url?: string; error?: string } = await respuesta.json();

    if (respuesta.ok && data.url) {
      const link = document.createElement('a');
      link.href = `${API_BASE_URL}${data.url}`;
      link.download = `audio_loquendo_${Date.now()}.mp3`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      alert('✅ Audio exportado a MP3 correctamente');
    } else {
      alert('❌ Error al convertir: ' + (data.error || 'Desconocido'));
    }
  } catch (error) {
    console.error('Error al exportar MP3:', error);
    alert('Error de conexión con el servidor');
  } finally {
    if (btnMP3) {
      btnMP3.innerText = textoOriginal;
      btnMP3.disabled = false;
    }
  }
}

// ==========================================
// 9. ATAJOS DE TECLADO
// ==========================================
document.addEventListener('keydown', (e: KeyboardEvent) => {
  const target = e.target as HTMLElement;
  if (target && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT')) {
    return;
  }

  if (e.code === 'Space') {
    e.preventDefault();
    if (window.audioEditor?.wavesurfer) {
      window.audioEditor.playPause();
    }
  }

  if (e.code === 'Delete' || e.code === 'Backspace') {
    window.audioEditor?.eliminarSeleccion();
  }

  if (e.ctrlKey && e.code === 'KeyZ') {
    e.preventDefault();
    window.audioEditor?.deshacer();
  }

  if (e.ctrlKey && e.code === 'KeyY') {
    e.preventDefault();
    window.audioEditor?.rehacer();
  }

  if (e.code === 'KeyM') {
    window.audioEditor?.mutear();
  }
});

// ==========================================
// 10. INICIALIZACIÓN
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  // Cargar diccionarios en el editor
  if (window.dictionaryEditor) {
    window.dictionaryEditor.loadAll();
  }

  const resultado = document.getElementById("resultado") as HTMLTextAreaElement | null;
  if (resultado) {
    resultado.readOnly = false;
    resultado.disabled = false;
  }

  const btnGenerar = document.querySelector('.btn-audio') as HTMLButtonElement | null;
  if (btnGenerar) {
    btnGenerar.removeAttribute('onclick');
    btnGenerar.setAttribute('type', 'button');
    btnGenerar.addEventListener('click', (e) => generarAudio(e));
  }

  const textoEntrada = document.getElementById('textoEntrada') as HTMLTextAreaElement | null;
  if (textoEntrada) {
    textoEntrada.addEventListener('input', function (this: HTMLTextAreaElement) {
      const contador = document.getElementById('contadorCaracteres');
      if (!contador) return;

      const longitud = this.value.length;
      contador.innerText = `Caracteres: ${longitud}`;

      if (longitud > 3000) {
        contador.style.color = '#e74c3c';
        contador.innerText += ' ️ (Texto muy largo)';
      } else {
        contador.style.color = '#2ecc71';
      }
    });
  }

  console.log('✅ Loquendo Studio TypeScript + DictionaryEditor cargado');
});
export {};

// Asegurar que TypeScript reconozca las variables globales
declare global {
  interface Window {
    audioEditor?: AudioEditor;
    dictionaryEditor?: DictionaryEditorClass;
    cargarYReproducir?: (url: string, srt?: string) => void;
    togglePlay?: () => void;
    stopAudio?: () => void;
    restartAudio?: () => void;
    eliminarSeleccion?: () => Promise<string | null>;
    optimizar?: () => void;
    generarAudio?: (event?: Event) => Promise<void>;
    cambiarTema?: () => void;
    cambiarDiseno?: () => void;
    subirMusicaFondo?: () => void;
    aplicarDucking?: () => void;
    subirVolumenMusica?: () => void;
    bajarVolumenMusica?: () => void;
    mutearMusica?: () => void;
    cambiarVolumenMusica?: (valor: number) => void;
    exportarAMp3?: () => Promise<void>;
    automatizarTodo?: () => Promise<void>;
    generarVideoPNGTuber?: () => Promise<void>;
    guardarPalabra?: () => Promise<void>;
    borrarMemoria?: () => Promise<void>;
  }
}