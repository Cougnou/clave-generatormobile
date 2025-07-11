// app.js

// Variables globales
const claveInput = document.getElementById('clave-input');
const generateBtn = document.getElementById('generate-btn');
const basesDisplay = document.getElementById('bases-display');
const claveCanvas = document.getElementById('clave-canvas');
const metroCanvas = document.getElementById('metronome-canvas');
const subdivSelect = document.getElementById('subdiv-select');
const muteMetroCheckbox = document.getElementById('mute-metronome');
const tempoInput = document.getElementById('tempo-input');
const volumeClave = document.getElementById('volume-clave');
const volumeMetro = document.getElementById('volume-metronome');
const volumeMaster = document.getElementById('volume-master');
const playBtn = document.getElementById('play-btn');
const loopCheckbox = document.getElementById('loop-checkbox');
const errorMsg = document.getElementById('error-msg');

let claveSequence = [];
let metronomeSequence = [];
let playing = false;
let playInterval = null;
let currentIndex = 0;

// Si tu n'as pas encore de gestion de l'audio ctx au démarrage utilisateur :

// Variable globale AudioContext
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Fonction pour débloquer l'audio au premier clic/tap
function unlockAudio() {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  document.body.removeEventListener('touchstart', unlockAudio);
  document.body.removeEventListener('click', unlockAudio);
}

// Ajouter des écouteurs au chargement de la page pour débloquer l'audio
document.body.addEventListener('touchstart', unlockAudio, false);
document.body.addEventListener('click', unlockAudio, false);


// Audio context setup
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

// Load sounds
let noteBuffer = null;
let kickBuffer = null;

async function loadSound(url) {
  const resp = await fetch(url);
  const arrayBuffer = await resp.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

async function initSounds() {
  noteBuffer = await loadSound('note.mp3');
  kickBuffer = await loadSound('kick.mp3');
}

initSounds();

// Remplit subdivSelect de 1 à 16
function fillSubdivisionOptions() {
  for(let i=1; i<=16; i++){
    const opt = document.createElement('option');
    opt.value = i;
    opt.textContent = i;
    subdivSelect.appendChild(opt);
  }
}
fillSubdivisionOptions();

// Convertit input clé en séquence (1 = note jouée, 0 = silence)
function parseClave(input) {
  const groups = input.trim().split(/\s+/);
  let seq = [];
  for(const g of groups){
    let n = parseInt(g, 10);
    if(isNaN(n) || n <= 0) throw new Error("Chaque nombre doit être un entier positif");
    for(let i=0; i<n; i++){
      seq.push(1);
      if(i !== n -1) seq.push(0);
    }
    seq.push(0, 0);
  }
  return seq;
}

// Met à jour la séquence metronome en fonction de subdiv
function updateMetronomeSequence(length, subdiv) {
  let metroSeq = new Array(length).fill(0);
  for(let i=0; i<length; i+=subdiv){
    metroSeq[i] = 1;
  }
  return metroSeq;
}

// Affiche bases possibles (3,4,5,7)
function updateBasesDisplay(length) {
  const basesMap = {3:"Ternaire",4:"Binaire",5:"Quinaire",7:"Septénaire"};
  let possibles = Object.entries(basesMap)
    .filter(([b, _]) => length % b === 0)
    .map(([_, name]) => name);
  basesDisplay.textContent = "Bases possibles : " + (possibles.length ? possibles.join(", ") : "Aucune");
}

// Dessine la clave et la metronome
function drawCanvas(highlightIndex = -1) {
  const ctxClave = claveCanvas.getContext('2d');
  const ctxMetro = metroCanvas.getContext('2d');

  const w = claveCanvas.width = claveCanvas.clientWidth;
  const hClave = claveCanvas.height;
  const hMetro = metroCanvas.height;

  ctxClave.clearRect(0,0,w,hClave);
  ctxMetro.clearRect(0,0,w,hMetro);

  const n = claveSequence.length;
  if(n === 0) return;

  const dia = Math.min(20, Math.floor(w / (n + 2)));
  const margin = (w - dia * n) / 2;
  const yClave = hClave / 2;
  const yMetro = hMetro / 2;

  for(let i=0; i<n; i++){
    const x = margin + i * dia + dia/2;

    // Clave: cercle plein noir si note (1), blanc sinon
    let colorClave = claveSequence[i] === 1 ? "black" : "white";
    if(i === highlightIndex && claveSequence[i] === 1) colorClave = "yellow";

    ctxClave.fillStyle = colorClave;
    ctxClave.strokeStyle = "black";
    ctxClave.lineWidth = 1;
    ctxClave.beginPath();
    ctxClave.ellipse(x, yClave, dia/2 * 0.9, dia/2 * 0.7, 0, 0, 2*Math.PI);
    ctxClave.fill();
    ctxClave.stroke();

    // Metronome: cercle rouge si 1, blanc sinon
    let colorMetro = metronomeSequence[i] === 1 ? "red" : "white";
    if(i === highlightIndex && metronomeSequence[i] === 1) colorMetro = "yellow";

    ctxMetro.fillStyle = colorMetro;
    ctxMetro.strokeStyle = "red";
    ctxMetro.lineWidth = 1;
    ctxMetro.beginPath();
    ctxMetro.ellipse(x, yMetro, dia/2 * 0.6, dia/2 * 0.6, 0, 0, 2*Math.PI);
    ctxMetro.fill();
    ctxMetro.stroke();
  }
}

// Joue un son buffer à un volume donné
function playSound(buffer, volume=1) {
  if(audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode).connect(audioCtx.destination);
  source.start(0);
}

// Fonction playLoop avec setInterval
function playLoop() {
  if(claveSequence.length === 0) return stopPlayback();

  const bpm = parseFloat(tempoInput.value);
  if(isNaN(bpm) || bpm <= 0) {
    errorMsg.textContent = "Tempo invalide";
    return stopPlayback();
  }
  const intervalMs = (60 / bpm / 2) * 1000; // subdivision à la demi noire

  playInterval = setInterval(() => {
    if(currentIndex >= claveSequence.length){
      if(loopCheckbox.checked){
        currentIndex = 0;
      } else {
        stopPlayback();
        return;
      }
    }

    const volMasterVal = parseFloat(volumeMaster.value);
    const volClaveVal = parseFloat(volumeClave.value) * volMasterVal;
    const volMetroVal = parseFloat(volumeMetro.value) * volMasterVal;

    if(claveSequence[currentIndex] === 1){
      playSound(noteBuffer, volClaveVal);
    }
    if(metronomeSequence[currentIndex] === 1 && !muteMetroCheckbox.checked){
      playSound(kickBuffer, volMetroVal);
    }

    drawCanvas(currentIndex);

    currentIndex++;
  }, intervalMs);
}

// Arrête la lecture
function stopPlayback() {
  if(playInterval) {
    clearInterval(playInterval);
    playInterval = null;
  }
  playing = false;
  currentIndex = 0;
  drawCanvas(-1);
  playBtn.textContent = "Play";
}

// Démarre la lecture
function startPlayback() {
  if(claveSequence.length === 0){
    errorMsg.textContent = "Générez une clave d'abord";
    return;
  }
  errorMsg.textContent = "";
  if(audioCtx.state === 'suspended'){
    audioCtx.resume();
  }
  playing = true;
  playBtn.textContent = "Stop";
  playLoop();
}

// Toggle play/pause
function togglePlay() {
  if(playing){
    stopPlayback();
  } else {
    startPlayback();
  }
}

// Quand subdiv change : recalcule metronome
function subdivChanged() {
  if(claveSequence.length === 0) return;
  metronomeSequence = updateMetronomeSequence(claveSequence.length, parseInt(subdivSelect.value));
  drawCanvas(-1);
}

// Génère la clave à partir de l'entrée
function generateClave() {
  try {
    claveSequence = parseClave(claveInput.value);
    metronomeSequence = updateMetronomeSequence(claveSequence.length, parseInt(subdivSelect.value));
    updateBasesDisplay(claveSequence.length);
    drawCanvas(-1);
    errorMsg.textContent = "";
    if(playing){
      stopPlayback();
    }
  } catch(e) {'use strict';

// Variables globales
let audioCtx = null;
let noteBuffer = null;
let kickBuffer = null;

const playBtn = document.getElementById("playBtn");
const generateBtn = document.getElementById("generateBtn");
const claveLengthInput = document.getElementById("claveLength");
const volumeMaster = document.getElementById("volumeMaster");
const volumeClave = document.getElementById("volumeClave");
const volumeMetro = document.getElementById("volumeMetro");
const tempoInput = document.getElementById("tempo");
const loopCheckbox = document.getElementById("loop");
const muteMetroCheckbox = document.getElementById("muteMetro");
const errorMsg = document.getElementById("errorMsg");

const canvas = document.getElementById("claveCanvas");
const ctx = canvas.getContext("2d");

let claveSequence = [];
let metronomeSequence = [];

let playing = false;
let currentIndex = 0;

// Variables pour scheduler audio
let nextNoteTime = 0.0;
let scheduleAheadTime = 0.1;
let timerID = null;

// Chargement des samples audio
async function loadSample(url) {
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return await audioCtx.decodeAudioData(arrayBuffer);
}

async function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  noteBuffer = await loadSample('note.wav');  // adapte le chemin
  kickBuffer = await loadSample('kick.wav');  // adapte le chemin
}

function generateClave(length) {
  // Exemple simple: alternance de 1 et 0
  const seq = [];
  for (let i = 0; i < length; i++) {
    seq.push(i % 2);
  }
  return seq;
}

function generateMetronome(sequence) {
  // Exemple : metronome sur toutes les subdivisions paires
  return sequence.map((v, i) => (i % 2 === 0 ? 1 : 0));
}

function drawCanvas(highlightIndex) {
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const circleRadius = 15;
  const gap = 10;
  const totalWidth = (circleRadius * 2 + gap) * claveSequence.length;

  let startX = (width - totalWidth) / 2 + circleRadius;
  const y = height / 2;

  for (let i = 0; i < claveSequence.length; i++) {
    const x = startX + i * (circleRadius * 2 + gap);
    ctx.beginPath();
    ctx.lineWidth = 2;

    if (i === highlightIndex) {
      ctx.fillStyle = 'orange';
      ctx.strokeStyle = 'orange';
    } else {
      ctx.fillStyle = claveSequence[i] === 1 ? 'black' : 'white';
      ctx.strokeStyle = 'black';
    }

    ctx.arc(x, y, circleRadius, 0, 2 * Math.PI);
    ctx.fill();
    ctx.stroke();
  }
}

function playSoundAtTime(buffer, volume = 1, time = 0) {
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  const gainNode = audioCtx.createGain();
  gainNode.gain.value = volume;
  source.connect(gainNode).connect(audioCtx.destination);
  source.start(time);
}

function scheduler() {
  while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
    if (currentIndex >= claveSequence.length) {
      if (loopCheckbox.checked) {
        currentIndex = 0;
      } else {
        stopPlayback();
        return;
      }
    }

    const volMasterVal = parseFloat(volumeMaster.value);
    const volClaveVal = parseFloat(volumeClave.value) * volMasterVal;
    const volMetroVal = parseFloat(volumeMetro.value) * volMasterVal;

    if (claveSequence[currentIndex] === 1) {
      playSoundAtTime(noteBuffer, volClaveVal, nextNoteTime);
    }
    if (metronomeSequence[currentIndex] === 1 && !muteMetroCheckbox.checked) {
      playSoundAtTime(kickBuffer, volMetroVal, nextNoteTime);
    }

    drawCanvas(currentIndex);

    const bpm = parseFloat(tempoInput.value);
    const secondsPerSubdivision = 60 / bpm / 2; // subdivision comme avant
    nextNoteTime += secondsPerSubdivision;
    currentIndex++;
  }

  timerID = setTimeout(scheduler, 25);
}

function startPlayback() {
  if (claveSequence.length === 0) {
    errorMsg.textContent = "Générez une clave d'abord";
    return;
  }
  errorMsg.textContent = "";
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  playing = true;
  playBtn.textContent = "Stop";

  currentIndex = 0;
  nextNoteTime = audioCtx.currentTime + 0.05;
  scheduler();
}

function stopPlayback() {
  if (timerID) {
    clearTimeout(timerID);
    timerID = null;
  }
  playing = false;
  currentIndex = 0;
  drawCanvas(-1);
  playBtn.textContent = "Play";
}

function togglePlayback() {
  if (playing) {
    stopPlayback();
  } else {
    startPlayback();
  }
}

// Gestion des événements
playBtn.addEventListener("click", togglePlayback);
generateBtn.addEventListener("click", () => {
  const length = parseInt(claveLengthInput.value, 10);
  if (isNaN(length) || length < 1 || length > 64) {
    errorMsg.textContent = "Longueur invalide (1-64)";
    return;
  }
  claveSequence = generateClave(length);
  metronomeSequence = generateMetronome(claveSequence);
  drawCanvas(-1);
  errorMsg.textContent = "";
});

window.addEventListener('load', async () => {
  await initAudio();
  drawCanvas(-1);
});
    errorMsg.textContent = "Erreur : " + e.message;
  }
}

// Listeners
generateBtn.addEventListener('click', generateClave);
subdivSelect.addEventListener('change', subdivChanged);
playBtn.addEventListener('click', togglePlay);
claveInput.addEventListener('keydown', (e) => {
  if(e.key === "Enter") generateClave();
});

// Re-dessine le canvas si fenêtre redimensionnée
window.addEventListener('resize', () => drawCanvas(-1));