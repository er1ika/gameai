// Точка входа: рендерер, игровой цикл, меню и состояния игры.
import * as THREE from 'three';
import './style.css';
import { Game, DIFFICULTIES } from './game.js';
import { Hud, formatTime } from './hud.js';
import { Input } from './input.js';
import { Sound } from './audio.js';
import { LEVELS } from './levels.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const hudCanvas = $('hud');
const screens = {
  menu: $('screen-menu'), pause: $('screen-pause'), dead: $('screen-dead'), inter: $('screen-inter'),
};

// ---------------------------------------------------------------- настройки

const settings = { sensitivity: 1, volume: 0.7, retro: true };
try {
  Object.assign(settings, JSON.parse(localStorage.getItem('infernum-settings') || '{}'));
} catch { /* хранилище недоступно — играем с настройками по умолчанию */ }
const saveSettings = () => {
  try { localStorage.setItem('infernum-settings', JSON.stringify(settings)); } catch { /* не страшно */ }
};

// ---------------------------------------------------------------- запуск

let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas: view, antialias: false, powerPreference: 'high-performance' });
} catch (err) {
  console.error(err);
  screens.menu.classList.add('hidden');
  $('screen-error').classList.remove('hidden');
  throw err;
}
renderer.setPixelRatio(1);

const sound = new Sound();
sound.setVolume(settings.volume);
const input = new Input(view);
const game = new Game(renderer, sound);
const hud = new Hud(hudCanvas);
game.player.sensitivity = settings.sensitivity;

/** menu | playing | paused | dead | inter */
let state = 'menu';
let deadT = 0;
const totals = { kills: 0, totalKills: 0, items: 0, totalItems: 0, time: 0 };

function resize() {
  const w = Math.max(1, window.innerWidth), h = Math.max(1, window.innerHeight);
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // ретро-режим: рендерим примерно в 360 строк и растягиваем без сглаживания
  const div = settings.retro ? Math.max(1, Math.round((h * dpr) / 360)) : 1;
  renderer.setSize(Math.max(1, Math.floor((w * dpr) / div)), Math.max(1, Math.floor((h * dpr) / div)), false);
  hud.resize(Math.floor(w * dpr), Math.floor(h * dpr));
  game.resize(w, h);
}
window.addEventListener('resize', resize);

function show(name) {
  for (const [k, el] of Object.entries(screens)) el.classList.toggle('hidden', k !== name);
}

function setState(next) {
  state = next;
  input.enabled = next === 'playing';
  show({ menu: 'menu', paused: 'pause', inter: 'inter' }[next] || null);
  if (next !== 'playing') { input.unlock(); input.clear(); }
  updateHint();
}

function updateHint() {
  const need = state === 'playing' && !input.locked;
  $('hint').classList.toggle('hidden', !need);
  if (need) {
    $('hint').textContent = input.lockFailed
      ? 'Захват мыши недоступен — цельтесь мышью без захвата или стрелками ←/→, огонь — ЛКМ / Пробел'
      : 'Кликните по экрану, чтобы захватить мышь';
  }
}

function loadLevel(index) {
  game.loadLevel(index);
  sound.startMusic(LEVELS[index].music);
  hud.showMap = false;
}

function startGame(diff) {
  sound.unlock();
  game.difficulty = DIFFICULTIES[diff] || DIFFICULTIES.normal;
  game.player.reset();
  for (const k of Object.keys(totals)) totals[k] = 0;
  loadLevel(0);
  setState('playing');
  input.lock();
}

function resume() {
  sound.unlock();
  setState('playing');
  input.lock();
}

function pause() {
  if (state === 'playing') setState('paused');
}

function restartLevel() {
  sound.unlock();
  game.restartLevel();
  sound.startMusic(LEVELS[game.levelIndex].music);
  setState('playing');
  input.lock();
}

function toMenu() {
  game.player.reset();
  game.loadLevel(0);
  sound.stopMusic();
  setState('menu');
}

game.onDeath = () => {
  deadT = 0;
  state = 'dead';
  input.enabled = false;
  updateHint();
};

game.onExit = () => {
  totals.kills += game.kills; totals.totalKills += game.totalKills;
  totals.items += game.items; totals.totalItems += game.totalItems;
  totals.time += game.levelTime;
  const last = game.levelIndex >= game.levelCount - 1;
  $('inter-title').textContent = last ? 'ПОБЕДА!' : 'УРОВЕНЬ ПРОЙДЕН';
  $('inter-name').textContent = last ? 'Ад запечатан. Итог всей игры:' : game.map.name;
  const src = last ? totals : { kills: game.kills, totalKills: game.totalKills, items: game.items, totalItems: game.totalItems, time: game.levelTime };
  $('stat-kills').textContent = `${src.kills} / ${src.totalKills}`;
  $('stat-items').textContent = `${src.items} / ${src.totalItems}`;
  $('stat-time').textContent = formatTime(src.time);
  $('btn-next').textContent = last ? 'В главное меню' : 'Следующий уровень';
  setState('inter');
};

// ---------------------------------------------------------------- кнопки и клавиши

$('difficulty').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-diff]');
  if (b) startGame(b.dataset.diff);
});
$('btn-resume').addEventListener('click', resume);
$('btn-restart').addEventListener('click', restartLevel);
$('btn-quit').addEventListener('click', toMenu);
$('btn-retry').addEventListener('click', restartLevel);
$('btn-dead-quit').addEventListener('click', toMenu);
$('btn-next').addEventListener('click', () => {
  if (game.levelIndex >= game.levelCount - 1) { toMenu(); return; }
  sound.unlock();
  loadLevel(game.levelIndex + 1);
  setState('playing');
  input.lock();
});

view.addEventListener('mousedown', () => {
  sound.unlock();
  if (state === 'playing' && !input.locked) input.lock();
});

document.addEventListener('pointerlockchange', () => {
  if (input.locked) { input.lockFailed = false; input.buttons.clear(); }
  else if (state === 'playing' && !input.lockFailed) pause();
  updateHint();
});
document.addEventListener('pointerlockerror', updateHint);
document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (e.code === 'Escape' || e.code === 'KeyP') {
    if (state === 'playing') {
      if (e.code === 'Escape' && input.locked) return; // браузер сам снимет захват -> пауза
      pause();
    } else if (state === 'paused') resume();
    return;
  }
  if (state === 'playing') {
    if (e.code === 'Tab') hud.showMap = !hud.showMap;
    else if (e.code === 'KeyM') game.message(sound.toggleMusic() ? 'Музыка: вкл' : 'Музыка: выкл');
  } else if (state === 'dead' && deadT > 1 && (e.code === 'Space' || e.code === 'Enter')) {
    restartLevel();
  }
});

// настройки (один и тот же блок в меню и на паузе)
const settingBlocks = document.querySelectorAll('[data-settings]');
function renderSettings() {
  for (const el of settingBlocks) {
    el.innerHTML = `
      <span>Чувствительность мыши</span><input type="range" data-key="sensitivity" min="0.3" max="3" step="0.1" value="${settings.sensitivity}" aria-label="Чувствительность мыши">
      <span>Громкость</span><input type="range" data-key="volume" min="0" max="1" step="0.05" value="${settings.volume}" aria-label="Громкость">
      <label class="check"><input type="checkbox" data-key="retro" ${settings.retro ? 'checked' : ''}> Ретро-пиксели (низкое разрешение, как в 1993-м)</label>`;
  }
}
renderSettings();
for (const el of settingBlocks) {
  el.addEventListener('input', (e) => {
    const key = e.target.dataset.key;
    if (!key) return;
    settings[key] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    game.player.sensitivity = settings.sensitivity;
    sound.setVolume(settings.volume);
    if (key === 'retro') resize();
    saveSettings();
    for (const other of settingBlocks) {
      if (other === el) continue;
      const twin = other.querySelector(`[data-key="${key}"]`);
      if (twin.type === 'checkbox') twin.checked = settings[key]; else twin.value = settings[key];
    }
  });
}

// ---------------------------------------------------------------- цикл

game.loadLevel(0); // уровень виден на фоне главного меню
resize();
setState('menu');

let last = performance.now();
let menuYaw = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
  last = now;

  if (state === 'playing') {
    game.update(dt, input);
  } else if (state === 'dead') {
    deadT += dt;
    game.update(dt, input);
    if (deadT > 1.3 && screens.dead.classList.contains('hidden')) { show('dead'); input.unlock(); }
  } else if (state === 'menu') {
    menuYaw += dt * 0.12;
    game.animate(dt);
  }
  game.updateCamera(state === 'menu' ? menuYaw : 0);
  game.render();
  hud.draw(game, dt, state !== 'menu');
  input.endFrame();
}
requestAnimationFrame(frame);

// для отладки и автотестов
window.__infernum = { game, input, hud, sound, startGame, loadLevel, get state() { return state; } };
