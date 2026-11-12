// Интерфейс: оружие в руках, статус-бар с лицом, сообщения, автокарта.
import { makeWeaponSprite, makeMuzzleFlash, makeFace, WEAPON_FLASH_POS } from './sprites.js';
import { makeCanvas, mulberry32 } from './textures.js';
import { WEAPONS, WEAPON_ORDER, MAX_AMMO } from './player.js';
import { STEP_UP } from './map.js';

const BAR_H = 32; // высота статус-бара в «логических» пикселях (экран = 200 строк)
const FONT_NUM = 'Impact, "Arial Black", "DejaVu Sans", "Liberation Sans", sans-serif';
const FONT_TXT = '"Arial Black", Arial, "DejaVu Sans", "Liberation Sans", sans-serif';
const KEY_COLORS = { red: '#ff3020', blue: '#3070ff', yellow: '#ffd820' };

// насколько каждое оружие «утоплено» за нижний край и сдвинуто вбок
const WEAPON_BASE = {
  fist: [34, 10], pistol: [0, 20], shotgun: [0, 34], chaingun: [0, 22], launcher: [0, 24],
};

const WEAPON_SCALE = { shotgun: 1.3, pistol: 1.05 };

export class Hud {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d');
    this.weapons = {};
    for (const name of WEAPON_ORDER) this.weapons[name] = makeWeaponSprite(name);
    this.flashes = [makeMuzzleFlash(0), makeMuzzleFlash(1)];
    this.faces = new Map();
    this.bar = this._makeBar();
    this.showMap = false;
    this.look = 0;
    this.lookT = 0;
    this.shot = 0;
    this.lastFireT = 10;
  }

  resize(w, h) {
    this.canvas.width = w;
    this.canvas.height = h;
  }

  _makeBar() {
    const c = makeCanvas(320, BAR_H);
    const g = c.getContext('2d');
    const rng = mulberry32(77);
    const img = g.createImageData(320, BAR_H);
    for (let y = 0; y < BAR_H; y++) {
      for (let x = 0; x < 320; x++) {
        let k = 0.85 + rng() * 0.3;
        if (y === 0) k *= 1.5; else if (y === 1) k *= 1.2; else if (y === BAR_H - 1) k *= 0.5;
        const i = (y * 320 + x) * 4;
        img.data[i] = 74 * k; img.data[i + 1] = 70 * k; img.data[i + 2] = 64 * k; img.data[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // утопленные панели секций
    for (const [x, w] of [[2, 54], [58, 60], [120, 38], [160, 32], [194, 56], [252, 14], [268, 50]]) {
      g.fillStyle = '#1c1a18'; g.fillRect(x, 3, w, BAR_H - 6);
      g.fillStyle = '#0e0d0c'; g.fillRect(x, 3, w, 1); g.fillRect(x, 3, 1, BAR_H - 6);
      g.fillStyle = '#8a857a'; g.fillRect(x, BAR_H - 4, w, 1); g.fillRect(x + w - 1, 3, 1, BAR_H - 6);
    }
    return c;
  }

  _face(p) {
    const level = p.hp >= 80 ? 0 : p.hp >= 60 ? 1 : p.hp >= 40 ? 2 : p.hp >= 20 ? 3 : 4;
    const mood = p.dead ? 'dead' : p.ouchT > 0 ? 'ouch' : p.grinT > 0 ? 'grin' : 'normal';
    const look = mood === 'normal' ? this.look : 0;
    const key = `${level}|${look}|${mood}`;
    let f = this.faces.get(key);
    if (!f) { f = makeFace(level, look, mood); this.faces.set(key, f); }
    return f;
  }

  draw(game, dt, playing) {
    const g = this.g, W = this.canvas.width, H = this.canvas.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, W, H);
    if (!playing || !game.map) return;
    const p = game.player;
    const u = H / 200;
    g.imageSmoothingEnabled = false;

    this.lookT -= dt;
    if (this.lookT <= 0) { this.lookT = 0.5 + Math.random() * 1.2; this.look = Math.floor(Math.random() * 3) - 1; }
    if (p.fireT < this.lastFireT) this.shot++;
    this.lastFireT = p.fireT;

    if (!p.dead) this._drawWeapon(g, p, W, H, u);

    // вспышки на весь экран
    const lit = p.fireT < 0.05 && WEAPONS[p.weapon].sound ? 0.07 : 0;
    if (lit) { g.fillStyle = `rgba(255,220,140,${lit})`; g.fillRect(0, 0, W, H); }
    if (p.bonusFlash > 0) { g.fillStyle = `rgba(255,210,90,${p.bonusFlash * 0.4})`; g.fillRect(0, 0, W, H); }
    if (p.painFlash > 0 || p.dead) {
      g.fillStyle = `rgba(200,0,0,${Math.min(0.7, p.painFlash + (p.dead ? 0.35 : 0))})`;
      g.fillRect(0, 0, W, H);
    }

    // прицел
    if (!p.dead && !this.showMap) {
      const cx = Math.round(W / 2), cy = Math.round(H / 2), s = Math.max(1, Math.round(u * 0.7));
      g.fillStyle = 'rgba(255,255,255,0.75)';
      g.fillRect(cx - s * 3, cy - s / 2, s * 2, s); g.fillRect(cx + s, cy - s / 2, s * 2, s);
      g.fillRect(cx - s / 2, cy - s * 3, s, s * 2); g.fillRect(cx - s / 2, cy + s, s, s * 2);
    }

    if (this.showMap) this._drawMap(g, game, W, H, u);
    this._drawBoss(g, game, W, u);
    this._drawMessages(g, game, u);
    this._drawBar(g, game, W, H, u);
  }

  _drawWeapon(g, p, W, H, u) {
    const name = p.weapon, ft = p.fireT;
    let ox = WEAPON_BASE[name][0], oy = WEAPON_BASE[name][1];
    switch (name) {
      case 'pistol': oy += 9 * Math.exp(-ft * 16); break;
      case 'shotgun':
        oy += 14 * Math.exp(-ft * 9);
        if (ft > 0.3 && ft < 0.8) { const k = Math.sin((Math.PI * (ft - 0.3)) / 0.5); ox -= 12 * k; oy += 15 * k; }
        break;
      case 'chaingun': if (ft < 0.09) { oy += 3; ox += (this.shot % 2) * 2 - 1; } break;
      case 'launcher': oy += 22 * Math.exp(-ft * 7); break;
      case 'fist': if (ft < 0.3) { const k = Math.sin((Math.PI * ft) / 0.3); ox -= 26 * k; oy -= 30 * k; } break;
      default:
    }
    ox += Math.cos(p.bob) * p.bobAmp * 7;
    oy += Math.abs(Math.sin(p.bob)) * p.bobAmp * 6;
    oy += p.raise * 100;
    const s = u * (WEAPON_SCALE[name] || 1); // масштаб спрайта оружия
    const x0 = W / 2 - 80 * s + ox * u;
    const y0 = H - BAR_H * u - 110 * s + oy * u;
    const flash = WEAPON_FLASH_POS[name];
    if (flash && ft < 0.06) {
      const [fx, fy, fr] = flash;
      const img = this.flashes[this.shot % 2];
      g.drawImage(img, x0 + (fx - fr) * s, y0 + (fy - fr) * s, fr * 2 * s, fr * 2 * s);
    }
    g.drawImage(this.weapons[name], Math.round(x0), Math.round(y0), 160 * s, 110 * s);
  }

  _drawMessages(g, game, u) {
    g.textAlign = 'left';
    g.textBaseline = 'top';
    g.font = `${Math.round(7.5 * u)}px ${FONT_TXT}`;
    let y = 5 * u;
    for (const m of game.messages) {
      const a = Math.min(1, (4 - m.t) * 1.5);
      if (a <= 0) continue;
      g.fillStyle = `rgba(0,0,0,${a * 0.8})`;
      g.fillText(m.text, 6 * u + u * 0.7, y + u * 0.7);
      g.fillStyle = `rgba(255,96,64,${a})`;
      g.fillText(m.text, 6 * u, y);
      y += 10 * u;
    }
  }

  _drawBoss(g, game, W, u) {
    const b = game.boss;
    if (!b || !b.alive || b.state === 'idle') return;
    const w = 150 * u, x = (W - w) / 2, y = 8 * u;
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x - u, y - u, w + 2 * u, 7 * u);
    g.fillStyle = '#5a0c08'; g.fillRect(x, y, w, 5 * u);
    g.fillStyle = '#e02818'; g.fillRect(x, y, w * Math.max(0, b.hp / b.maxHp), 5 * u);
    g.fillStyle = '#ffe0c0'; g.font = `${Math.round(5.5 * u)}px ${FONT_TXT}`;
    g.textAlign = 'center'; g.textBaseline = 'top';
    g.fillText(b.def.name.toUpperCase(), W / 2, y + 7 * u);
  }

  _drawBar(g, game, W, H, u) {
    const p = game.player;
    const y0 = H - BAR_H * u;
    const x0 = Math.round((W - 320 * u) / 2);
    // фон на всю ширину
    g.imageSmoothingEnabled = false;
    g.fillStyle = '#3a3733'; g.fillRect(0, y0, W, BAR_H * u);
    g.fillStyle = '#8a8478'; g.fillRect(0, y0, W, u);
    g.drawImage(this.bar, x0, y0, 320 * u, BAR_H * u);

    g.setTransform(u, 0, 0, u, x0, y0);
    const label = (text, cx) => {
      g.font = `4.6px ${FONT_TXT}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillStyle = '#b4ab98'; g.fillText(text, cx, 27.2);
    };
    const big = (text, cx, color = '#e8281a') => {
      g.font = `19px ${FONT_NUM}`; g.textAlign = 'center'; g.textBaseline = 'alphabetic';
      g.fillStyle = '#300804'; g.fillText(text, cx + 0.8, 21.3);
      g.fillStyle = color; g.fillText(text, cx, 20.5);
    };
    const w = WEAPONS[p.weapon];
    big(w.ammo ? String(p.ammo[w.ammo]) : '—', 29, w.ammo && p.ammo[w.ammo] === 0 ? '#7a2018' : '#e8281a');
    label('ПАТРОНЫ', 29);
    big(`${Math.max(0, Math.ceil(p.hp))}%`, 88, p.hp > 100 ? '#58a8ff' : p.hp <= 25 ? '#ff6a20' : '#e8281a');
    label('ЗДОРОВЬЕ', 88);
    big(`${Math.ceil(p.armor)}%`, 222, p.armor > 100 ? '#58a8ff' : '#e8281a');
    label('БРОНЯ', 222);

    // оружие
    g.font = `7px ${FONT_NUM}`; g.textAlign = 'center';
    for (const name of WEAPON_ORDER) {
      const slot = WEAPONS[name].slot;
      const col = (slot - 1) % 3, row = Math.floor((slot - 1) / 3);
      g.fillStyle = name === (p.pending || p.weapon) ? '#ffffff' : p.weapons[name] ? '#ffd23a' : '#4a4640';
      g.fillText(String(slot), 127 + col * 12, 12 + row * 9);
    }
    label('ОРУЖИЕ', 139);

    // лицо
    g.imageSmoothingEnabled = false;
    g.drawImage(this._face(p), 163, 1, 26, 30);

    // ключи
    let ky = 5;
    for (const k of ['blue', 'yellow', 'red']) {
      g.fillStyle = '#0a0a0a'; g.fillRect(255, ky, 8, 6);
      if (p.keys[k]) { g.fillStyle = KEY_COLORS[k]; g.fillRect(256, ky + 1, 6, 4); g.fillStyle = '#fff'; g.fillRect(256, ky + 1, 6, 1); }
      ky += 8;
    }

    // таблица боезапаса
    g.font = `4.8px ${FONT_TXT}`; g.textBaseline = 'alphabetic';
    const rows = [['ПУЛИ', 'bullets'], ['ДРОБЬ', 'shells'], ['РАКЕТЫ', 'rockets']];
    rows.forEach(([title, kind], i) => {
      const y = 10.5 + i * 7.2;
      g.textAlign = 'left'; g.fillStyle = '#b4ab98'; g.fillText(title, 271, y);
      g.textAlign = 'right'; g.fillStyle = w.ammo === kind ? '#ffffff' : '#ffd23a';
      g.fillText(`${p.ammo[kind]}/${MAX_AMMO[kind]}`, 315.5, y);
    });
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  _drawMap(g, game, W, H, u) {
    const map = game.map, p = game.player;
    const s = 7 * u;
    const viewH = H - BAR_H * u;
    g.fillStyle = 'rgba(0,0,0,0.78)';
    g.fillRect(0, 0, W, viewH);
    g.save();
    g.beginPath(); g.rect(0, 0, W, viewH); g.clip();
    g.translate(W / 2 - p.x * s, viewH / 2 - p.y * s);
    g.lineWidth = Math.max(1, u * 0.8);
    g.lineCap = 'square';
    const line = (x0, y0, x1, y1, color) => {
      g.strokeStyle = color; g.beginPath(); g.moveTo(x0 * s, y0 * s); g.lineTo(x1 * s, y1 * s); g.stroke();
    };
    const { w, h } = map;
    for (let cy = 0; cy < h; cy++) {
      for (let cx = 0; cx < w; cx++) {
        const i = cy * w + cx;
        if (!map.seen[i] || map.solid[i]) continue;
        const f = map.floor[i];
        const zone = map.zone[i];
        if (zone.damage) { g.fillStyle = 'rgba(120,200,40,0.16)'; g.fillRect(cx * s, cy * s, s, s); }
        if (zone.ftex === 'exitpad') { g.fillStyle = 'rgba(40,255,110,0.5)'; g.fillRect(cx * s, cy * s, s, s); }
        const edge = (nx, ny, x0, y0, x1, y1) => {
          if (map.isSolid(nx, ny)) return line(x0, y0, x1, y1, '#d8402c');
          const j = ny * w + nx;
          if (map.doors.has(j) || map.doors.has(i)) return null;
          const df = Math.abs(map.floor[j] - f);
          if (df > STEP_UP) return line(x0, y0, x1, y1, '#b8862c');
          if (df > 0.01 && map.floor[j] > f) return line(x0, y0, x1, y1, '#6a5a3a');
          return null;
        };
        edge(cx + 1, cy, cx + 1, cy, cx + 1, cy + 1);
        edge(cx - 1, cy, cx, cy, cx, cy + 1);
        edge(cx, cy + 1, cx, cy + 1, cx + 1, cy + 1);
        edge(cx, cy - 1, cx, cy, cx + 1, cy);
      }
    }
    for (const d of map.doorList) {
      const near = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => map.inBounds(d.cx + dx, d.cy + dy) && map.seen[(d.cy + dy) * w + d.cx + dx] && !map.solid[(d.cy + dy) * w + d.cx + dx]);
      if (!near && !map.seen[d.i]) continue;
      const color = d.key ? KEY_COLORS[d.key] : '#e8d060';
      g.lineWidth = Math.max(2, u * 1.6);
      if (d.axis === 'x') line(d.cx, d.cy + 0.5, d.cx + 1, d.cy + 0.5, color);
      else line(d.cx + 0.5, d.cy, d.cx + 0.5, d.cy + 1, color);
      g.lineWidth = Math.max(1, u * 0.8);
    }
    // игрок
    g.translate(p.x * s, p.y * s);
    g.rotate(p.yaw);
    g.fillStyle = '#ffffff';
    g.beginPath(); g.moveTo(s * 0.55, 0); g.lineTo(-s * 0.35, s * 0.32); g.lineTo(-s * 0.15, 0); g.lineTo(-s * 0.35, -s * 0.32); g.closePath(); g.fill();
    g.restore();

    g.font = `${Math.round(6.5 * u)}px ${FONT_TXT}`; g.textAlign = 'right'; g.textBaseline = 'top';
    g.fillStyle = '#e8d060';
    g.fillText(map.name, W - 6 * u, 5 * u);
    g.fillStyle = '#c8c0b0';
    g.fillText(`Убито: ${game.kills}/${game.totalKills}`, W - 6 * u, 14 * u);
    g.fillText(`Предметы: ${game.items}/${game.totalItems}`, W - 6 * u, 22 * u);
    g.fillText(`Время: ${formatTime(game.levelTime)}`, W - 6 * u, 30 * u);
  }
}

export function formatTime(t) {
  const m = Math.floor(t / 60), s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}
