// Процедурные спрайты: монстры, предметы, эффекты, оружие в руках и лицо героя.
// Всё рисуется примитивами canvas и превращается в «пиксель-арт»:
// жёсткая альфа, шум, затенение и тёмный контур.
import { makeCanvas, mulberry32 } from './textures.js';

const TAU = Math.PI * 2;
const R = (g, x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); };
const E = (g, cx, cy, rx, ry, col) => { g.fillStyle = col; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill(); };
const P = (g, pts, col) => {
  g.fillStyle = col; g.beginPath(); g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath(); g.fill();
};
const L = (g, x0, y0, x1, y1, w, col) => {
  g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round';
  g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
};

function star(g, cx, cy, r, col, inner, points = 8, rot = 0) {
  const pts = [];
  for (let i = 0; i < points * 2; i++) {
    const a = rot + (i / (points * 2)) * TAU;
    const rr = i % 2 ? r * 0.45 : r;
    pts.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
  }
  P(g, pts, col);
  if (inner) E(g, cx, cy, r * 0.4, r * 0.4, inner);
}

function ball(g, x, y, r, kind) {
  const [o, m, i] = kind === 'plasma' ? ['#128a2a', '#3fe05a', '#d8ffc8'] : ['#d83a00', '#ff8a10', '#ffe890'];
  E(g, x, y, r, r, o); E(g, x, y, r * 0.68, r * 0.68, m); E(g, x - r * 0.15, y - r * 0.15, r * 0.34, r * 0.34, i);
}

/** Превратить рисунок в пиксель-арт. */
function finalize(c, o = {}) {
  const g = c.getContext('2d');
  const w = c.width, h = c.height;
  g.setTransform(1, 0, 0, 1, 0, 0);
  if (o.shade !== false) {
    g.globalCompositeOperation = 'source-atop';
    const gr = g.createLinearGradient(0, 0, w, 0);
    gr.addColorStop(0, 'rgba(255,255,255,0.10)');
    gr.addColorStop(0.45, 'rgba(0,0,0,0)');
    gr.addColorStop(1, 'rgba(0,0,0,0.36)');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
  }
  const img = g.getImageData(0, 0, w, h);
  const d = img.data;
  const rng = mulberry32(o.seed || 7);
  const noise = o.noise === undefined ? 0.16 : o.noise;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 110) { d[i + 3] = 0; continue; }
    d[i + 3] = 255;
    const k = 1 + (rng() - 0.5) * noise;
    d[i] = Math.min(255, d[i] * k); d[i + 1] = Math.min(255, d[i + 1] * k); d[i + 2] = Math.min(255, d[i + 2] * k);
  }
  if (o.outline !== false) {
    const a = new Uint8Array(w * h);
    for (let i = 0; i < a.length; i++) a[i] = d[i * 4 + 3];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (a[i]) continue;
        if ((x > 0 && a[i - 1]) || (x < w - 1 && a[i + 1]) || (y > 0 && a[i - w]) || (y < h - 1 && a[i + w])) {
          d[i * 4] = 12; d[i * 4 + 1] = 8; d[i * 4 + 2] = 8; d[i * 4 + 3] = 255;
        }
      }
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

// ---------------------------------------------------------------- монстры

const PALETTES = {
  zombie: {
    skin: '#8a9a72', body: '#5c6448', vest: '#3c4430', legs: '#4c4c3c', boots: '#1c1814', belt: '#22201a',
    helmet: '#3a4630', eyes: '#ff2a10', gun: true,
  },
  sergeant: {
    skin: '#a89484', body: '#7a2c24', vest: '#2a2a30', legs: '#3c3c44', boots: '#16141a', belt: '#1a1a1e',
    eyes: '#ffd020', gun: true,
  },
  imp: {
    skin: '#94602f', body: '#94602f', legs: '#84542a', boots: '#6a4220', belt: '#7a4c26',
    eyes: '#ffe020', spikes: '#eadcb8', hands: '#eadcb8', ribs: '#6e4520', ball: 'fire',
  },
  baron: {
    skin: '#c8705c', body: '#c8705c', legs: '#6e4c2c', boots: '#241c14', belt: '#5a3c22',
    eyes: '#40ff50', horns: '#eee0c0', hands: '#c8705c', ribs: '#96483a', ball: 'plasma',
  },
};

function humanoid(o, pose, size = 64) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  g.scale(size / 64, size / 64);
  const cx = 32, s = pose.step || 0, arms = pose.arms || 'walk';
  const lean = arms === 'pain' ? 2 : 0;

  // ноги
  for (const side of [-1, 1]) {
    const lift = (side === -1) === (s === 0) ? 0 : 3;
    const x = cx + (side === -1 ? -8 : 2);
    R(g, x, 39, 6, 24 - lift, o.legs);
    R(g, x - (side === -1 ? 1 : 0), 59 - lift, 7, 4, o.boots);
  }
  // торс
  P(g, [cx - 10 + lean, 21, cx + 10 + lean, 21, cx + 7, 41, cx - 7, 41], o.body);
  R(g, cx - 7, 38, 14, 3, o.belt);
  if (o.vest) R(g, cx - 6 + lean, 24, 12, 11, o.vest);
  if (o.ribs) {
    L(g, cx - 6, 27, cx - 1, 28, 1.5, o.ribs); L(g, cx + 6, 27, cx + 1, 28, 1.5, o.ribs);
    L(g, cx, 23, cx, 36, 1.2, o.ribs);
    L(g, cx - 4, 32, cx + 4, 32, 1.2, o.ribs); L(g, cx - 4, 35, cx + 4, 35, 1.2, o.ribs);
  }
  if (o.spikes) {
    P(g, [cx - 12, 23, cx - 17, 13, cx - 7, 21], o.spikes);
    P(g, [cx + 12, 23, cx + 17, 13, cx + 7, 21], o.spikes);
  }
  // голова
  const hx = cx + lean;
  R(g, hx - 2, 17, 4, 5, o.skin);
  if (o.helmet) { E(g, hx, 11, 7, 7, o.helmet); E(g, hx, 14, 5.5, 5.5, o.skin); }
  else E(g, hx, 12, 6.5, 7.5, o.skin);
  if (o.horns) {
    P(g, [hx - 4, 9, hx - 13, 0, hx - 7, 12], o.horns);
    P(g, [hx + 4, 9, hx + 13, 0, hx + 7, 12], o.horns);
  }
  if (o.spikes) { P(g, [hx - 3, 6, hx, 0, hx + 3, 6], o.spikes); }
  R(g, hx - 4, 12, 2, 2, o.eyes); R(g, hx + 2, 12, 2, 2, o.eyes);
  if (pose.mouth) R(g, hx - 2, 15, 4, 4, '#2a0404'); else R(g, hx - 2, 17, 4, 1, '#2a0c08');

  // руки
  const ac = o.arms || o.skin, hc = o.hands || o.skin;
  const arm = (x0, y0, x1, y1, hr = 2.6) => { L(g, x0, y0, x1, y1, 5, ac); E(g, x1, y1, hr, hr, hc); };
  const lsx = cx - 11 + lean, rsx = cx + 11 + lean, sy = 23;
  if (arms === 'walk') {
    const sw = s === 0 ? 2 : -2;
    if (o.gun) {
      arm(lsx, sy, cx - 5, 32); arm(rsx, sy, cx + 6, 30);
      L(g, cx - 13, 35, cx + 13, 27, 3, '#1a1a1e');
      R(g, cx - 15, 34, 5, 4, '#4a3018');
    } else {
      arm(lsx, sy, cx - 13, 37 + sw); arm(rsx, sy, cx + 13, 37 - sw);
    }
  } else if (arms === 'aim' || arms === 'fire') {
    arm(lsx, sy, cx - 3, 29); arm(rsx, sy, cx + 3, 29);
    R(g, cx - 3, 25, 6, 7, '#18181c'); R(g, cx - 1, 27, 2, 2, '#000');
    if (arms === 'fire') star(g, cx, 28, 10, '#ffb020', '#fff6c0', 7, 0.3);
  } else if (arms === 'raise') {
    arm(lsx, sy, cx - 13, 37); arm(rsx, sy, cx + 16, 9);
    if (o.ball) ball(g, cx + 17, 5, 5.5, o.ball);
  } else if (arms === 'throw') {
    arm(lsx, sy, cx - 13, 36); arm(rsx, sy, cx + 5, 31, 4);
  } else if (arms === 'both') {
    arm(lsx, sy, cx - 17, 8); arm(rsx, sy, cx + 17, 8);
    if (o.ball) { ball(g, cx - 18, 5, 5, o.ball); ball(g, cx + 18, 5, 5, o.ball); }
  } else if (arms === 'bothThrow') {
    arm(lsx, sy, cx - 6, 31, 4); arm(rsx, sy, cx + 6, 31, 4);
  } else if (arms === 'pain') {
    arm(lsx, sy, cx - 18, 30); arm(rsx, sy, cx + 19, 27);
  }
  return c;
}

function demon(pose) {
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  const s = pose.step || 0;
  const skin = '#c88478', dark = '#9a5a52';
  for (const side of [-1, 1]) {
    const lift = (side === -1) === (s === 0) ? 0 : 3;
    const x = side === -1 ? 19 : 36;
    R(g, x, 42, 9, 21 - lift, dark);
    R(g, x - 2, 59 - lift, 13, 4, '#7a403a');
    R(g, x - 2, 61 - lift, 2, 2, '#f0e6d0'); R(g, x + 4, 61 - lift, 2, 2, '#f0e6d0'); R(g, x + 9, 61 - lift, 2, 2, '#f0e6d0');
  }
  const sw = pose.pain ? -4 : s === 0 ? 2 : -2;
  L(g, 15, 28, 9, 41 + sw, 7, dark); L(g, 49, 28, 55, 41 - sw, 7, dark);
  E(g, 9, 42 + sw, 3, 3, '#f0e6d0'); E(g, 55, 42 - sw, 3, 3, '#f0e6d0');
  E(g, 32, 33, 19, 15, skin);
  E(g, 32, 21, 14, 11, skin);
  P(g, [21, 15, 15, 5, 26, 12], '#f0e6d0'); P(g, [43, 15, 49, 5, 38, 12], '#f0e6d0');
  R(g, 24, 16, 4, 3, '#ffe020'); R(g, 36, 16, 4, 3, '#ffe020');
  R(g, 25, 17, 2, 2, '#200'); R(g, 37, 17, 2, 2, '#200');
  const open = pose.attack ? 10 : pose.pain ? 7 : 4;
  const my = 29 + (pose.attack ? 2 : 0);
  E(g, 32, my, 12, open, '#4a0808');
  if (open > 5) E(g, 32, my + 1, 8, open - 4, '#a01818');
  for (let i = 0; i < 6; i++) {
    const tx = 22 + i * 4;
    const edge = Math.sqrt(Math.max(0, 1 - ((tx + 1 - 32) / 12) ** 2)) * open;
    P(g, [tx, my - edge, tx + 3, my - edge, tx + 1.5, my - edge + 4], '#f4ead8');
    P(g, [tx, my + edge, tx + 3, my + edge, tx + 1.5, my + edge - 4], '#f4ead8');
  }
  return c;
}

/** Кадры смерти: сплющиваем кадр боли и добавляем кровь. */
function deathFrames(painCanvas, seed) {
  const w = painCanvas.width, h = painCanvas.height;
  const rng = mulberry32(seed);
  const out = [];
  const sy = [0.76, 0.5, 0.24], sx = [1.04, 1.18, 1.36];
  for (let k = 0; k < 3; k++) {
    const c = makeCanvas(w, h);
    const g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    if (k === 2) E(g, w / 2, h - h * 0.05, w * 0.4, h * 0.05, '#6a0806');
    const dw = Math.min(w, w * sx[k]), dh = h * sy[k];
    g.drawImage(painCanvas, (w - dw) / 2, h - dh - (k === 2 ? 1 : 0), dw, dh);
    g.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 10 + k * 14; i++) {
      R(g, rng() * w, h - rng() * dh, 1 + rng() * (w / 24), 1 + rng() * (h / 24), rng() > 0.5 ? '#a00c08' : '#6a0806');
    }
    g.globalCompositeOperation = 'source-over';
    out.push(finalize(c, { shade: false, noise: 0.06, seed: seed + k }));
  }
  return out;
}

export function makeMonsterFrames(type) {
  if (type === 'demon') {
    const pain = finalize(demon({ pain: true }), { seed: 31 });
    return {
      walk: [finalize(demon({ step: 0 }), { seed: 32 }), finalize(demon({ step: 1 }), { seed: 33 })],
      attack: [finalize(demon({ step: 0, attack: true }), { seed: 34 })],
      pain: [pain],
      die: deathFrames(pain, 35),
    };
  }
  const o = PALETTES[type];
  const size = type === 'baron' ? 96 : 64;
  const f = (pose, seed) => finalize(humanoid(o, pose, size), { seed });
  const pain = f({ arms: 'pain', mouth: true }, 11);
  const walk = [f({ step: 0 }, 12), f({ step: 1 }, 13)];
  let attack;
  if (o.gun) attack = [f({ arms: 'aim' }, 14), f({ arms: 'fire' }, 15)];
  else if (type === 'baron') attack = [f({ arms: 'both', mouth: true }, 14), f({ arms: 'bothThrow', mouth: true }, 15)];
  else attack = [f({ arms: 'raise', mouth: true }, 14), f({ arms: 'throw', mouth: true }, 15)];
  return { walk, attack, pain: [pain], die: deathFrames(pain, 16) };
}

// ---------------------------------------------------------------- предметы и декор

const ITEM_DRAW = {
  stim(g) {
    R(g, 11, 23, 10, 8, '#d8d8d8'); R(g, 11, 23, 10, 2, '#f4f4f4');
    R(g, 15, 24, 2, 6, '#d01010'); R(g, 13, 26, 6, 2, '#d01010');
  },
  medkit(g) {
    R(g, 6, 17, 20, 14, '#dcdcdc'); R(g, 6, 17, 20, 3, '#f6f6f6'); R(g, 6, 29, 20, 2, '#9a9a9a');
    R(g, 14, 20, 4, 9, '#d01010'); R(g, 11, 23, 10, 3, '#d01010');
  },
  armor(g) { vest(g, '#2c9a30', '#6ad86a', '#1a5a1e'); },
  megaarmor(g) { vest(g, '#2c5ce0', '#7aa4ff', '#18308a'); },
  soul(g) {
    E(g, 16, 17, 11, 11, '#1c38c0'); E(g, 16, 17, 8.5, 8.5, '#3c68f0'); E(g, 13, 14, 4.5, 4.5, '#9cc0ff');
    E(g, 12, 13, 2, 2, '#ffffff');
    R(g, 11, 18, 3, 2, '#0c1a6a'); R(g, 18, 18, 3, 2, '#0c1a6a'); R(g, 13, 22, 6, 1, '#0c1a6a');
  },
  clip(g) {
    R(g, 11, 22, 10, 9, '#5a5030'); R(g, 11, 22, 10, 2, '#7a6e44');
    for (let i = 0; i < 4; i++) { R(g, 12 + i * 2.3, 19, 1.6, 4, '#e0b040'); }
  },
  shells(g) {
    for (let i = 0; i < 4; i++) {
      const x = 8 + i * 4.4;
      R(g, x, 19, 3.4, 9, '#c82a1c'); R(g, x, 27, 3.4, 3.5, '#e0b040'); R(g, x, 19, 1, 9, '#f0604a');
    }
  },
  rockets(g) {
    R(g, 6, 23, 20, 8, '#56643c'); R(g, 6, 23, 20, 2, '#74845a');
    for (const x of [11, 19]) {
      R(g, x, 11, 4, 14, '#b4b4b8'); P(g, [x, 11, x + 2, 5, x + 4, 11], '#d02010'); R(g, x, 20, 4, 2, '#6a6a70');
    }
  },
  shotgun(g) {
    P(g, [1, 22, 9, 19, 10, 24, 3, 29], '#6e401c');
    L(g, 9, 21, 30, 16, 3, '#2a2a30'); L(g, 9, 19.5, 30, 14.5, 1, '#70707c');
    L(g, 15, 22.5, 23, 20.5, 4, '#8a5424');
  },
  chaingun(g) {
    R(g, 5, 16, 14, 9, '#3c3c44'); R(g, 5, 16, 14, 2, '#6a6a76');
    for (const y of [17, 20, 23]) { R(g, 19, y, 11, 2, '#8a8a94'); }
    R(g, 28, 16, 2, 10, '#2a2a30'); R(g, 8, 25, 3, 5, '#2a2a30'); R(g, 2, 18, 3, 3, '#4a3018');
  },
  launcher(g) {
    L(g, 4, 19, 28, 19, 7, '#5c6c48'); L(g, 4, 17, 27, 17, 1.5, '#8a9a70');
    E(g, 29, 19, 2, 4, '#1a1a1a'); R(g, 11, 22, 3, 7, '#2e2e2e'); R(g, 17, 22, 2, 4, '#2e2e2e');
    R(g, 2, 15, 3, 9, '#3a4630');
  },
  key_red: (g) => keycard(g, '#e01c10', '#ff8070'),
  key_blue: (g) => keycard(g, '#1c50e8', '#80a8ff'),
  key_yellow: (g) => keycard(g, '#e8c010', '#fff090'),
  barrel(g) {
    R(g, 7, 9, 18, 21, '#56603e'); E(g, 16, 30, 9, 2.5, '#3a422a');
    R(g, 7, 14, 18, 2, '#343a26'); R(g, 7, 23, 18, 2, '#343a26');
    E(g, 16, 9, 9, 3, '#2e3622'); E(g, 16, 9, 7.5, 2.2, '#58e83c'); E(g, 14, 8.6, 3, 1, '#c8ff9a');
    R(g, 12, 17, 8, 5, '#d8c020'); R(g, 14, 18, 4, 3, '#1a1a10');
  },
};

function vest(g, col, hi, dark) {
  P(g, [7, 13, 12, 10, 16, 14, 20, 10, 25, 13, 24, 30, 8, 30], col);
  P(g, [9, 14, 12, 12, 13, 28, 10, 28], hi);
  R(g, 8, 27, 16, 3, dark); R(g, 15, 15, 2, 12, dark);
}

function keycard(g, col, hi) {
  R(g, 10, 12, 12, 18, col); R(g, 10, 12, 12, 2, hi); R(g, 10, 12, 2, 18, hi);
  R(g, 13, 16, 6, 4, '#101010'); R(g, 13, 23, 6, 1, hi); R(g, 13, 25, 6, 1, hi);
}

export function makeItemSprite(name) {
  const c = makeCanvas(32, 32);
  ITEM_DRAW[name](c.getContext('2d'));
  return finalize(c, { seed: name.length * 13 + name.charCodeAt(0), noise: 0.1 });
}

export const ITEM_SPRITES = Object.keys(ITEM_DRAW);

export function makeLamp() {
  const c = makeCanvas(16, 64);
  const g = c.getContext('2d');
  R(g, 7, 18, 2, 44, '#5a5a62'); R(g, 4, 60, 8, 4, '#3a3a40'); R(g, 5, 16, 6, 3, '#3a3a40');
  E(g, 8, 9, 5, 7, '#fff2b0'); E(g, 8, 9, 3, 5, '#ffffff');
  return finalize(c, { shade: false, noise: 0.05, seed: 3 });
}

export function makeTorch(frame) {
  const c = makeCanvas(16, 64);
  const g = c.getContext('2d');
  R(g, 7, 24, 2, 38, '#4a2a1c'); R(g, 4, 60, 8, 4, '#2a1810');
  P(g, [3, 20, 13, 20, 10, 26, 6, 26], '#6a3a24');
  const k = frame ? 1 : -1;
  P(g, [3, 20, 8 + k * 2, 2 + frame * 2, 13, 20], '#e84a08');
  P(g, [5, 20, 8 - k, 8, 11, 20], '#ffb020');
  P(g, [6.5, 20, 8, 13, 9.5, 20], '#fff4a0');
  return finalize(c, { shade: false, noise: 0.05, seed: 5 + frame });
}

export function makeExitSign() {
  const c = makeCanvas(64, 20);
  const g = c.getContext('2d');
  R(g, 0, 0, 64, 20, '#0a1a0c'); R(g, 1, 1, 62, 18, '#0e3a16'); R(g, 3, 3, 58, 14, '#06140a');
  g.fillStyle = '#40ff70'; g.font = 'bold 13px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText('ВЫХОД', 32, 10.5);
  return finalize(c, { shade: false, noise: 0, outline: false });
}

// ---------------------------------------------------------------- эффекты

export function makeFxFrames(kind) {
  const rng = mulberry32(kind.length * 97 + 5);
  const frames = [];
  if (kind === 'puff') {
    for (let k = 0; k < 4; k++) {
      const c = makeCanvas(16, 16), g = c.getContext('2d');
      const shades = ['#e8e8e0', '#b8b8b0', '#8a8a84', '#5a5a56'];
      for (let i = 0; i < 9 - k * 2; i++) {
        const a = rng() * TAU, r = rng() * (1.5 + k * 1.3);
        E(g, 8 + Math.cos(a) * r, 9 - k * 1.2 + Math.sin(a) * r, 1.6, 1.6, shades[Math.min(3, k + (i % 2))]);
      }
      if (k === 0) E(g, 8, 9, 2, 2, '#ffe890');
      frames.push(finalize(c, { shade: false, outline: false, noise: 0.05 }));
    }
  } else if (kind === 'blood') {
    for (let k = 0; k < 4; k++) {
      const c = makeCanvas(16, 16), g = c.getContext('2d');
      for (let i = 0; i < 8 - k; i++) {
        const a = rng() * TAU, r = rng() * (2 + k * 1.6);
        const sz = 1 + rng() * (2.2 - k * 0.4);
        R(g, 8 + Math.cos(a) * r, 6 + k * 1.6 + Math.sin(a) * r, sz, sz, i % 3 ? '#b00c08' : '#e02018');
      }
      frames.push(finalize(c, { shade: false, outline: false, noise: 0.05 }));
    }
  } else if (kind === 'explosion') {
    const radii = [9, 17, 24, 28, 30, 29];
    for (let k = 0; k < 6; k++) {
      const c = makeCanvas(64, 64), g = c.getContext('2d');
      const r = radii[k];
      const layers = [
        ['#3a2a24', 1.0, k >= 2 ? 26 : 0],
        ['#c82a08', 0.95 - Math.max(0, k - 2) * 0.2, 30],
        ['#ff7a10', 0.75 - Math.max(0, k - 1) * 0.16, 26],
        ['#ffd040', 0.52 - k * 0.11, 20],
        ['#fffbe0', 0.3 - k * 0.09, 12],
      ];
      for (const [col, scale, count] of layers) {
        if (scale <= 0) continue;
        for (let i = 0; i < count; i++) {
          const a = rng() * TAU, d = Math.sqrt(rng()) * r * scale;
          const br = 2 + rng() * r * 0.24 * (k >= 4 && col !== '#3a2a24' ? 0.5 : 1);
          E(g, 32 + Math.cos(a) * d, 32 + Math.sin(a) * d * 0.92, br, br, col);
        }
      }
      frames.push(finalize(c, { shade: false, outline: false, noise: 0.08 }));
    }
  } else if (kind === 'fireball' || kind === 'plasma') {
    for (let k = 0; k < 2; k++) {
      const c = makeCanvas(24, 24), g = c.getContext('2d');
      const outer = kind === 'plasma' ? '#128a2a' : '#d83a00';
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * TAU + k * 0.45;
        P(g, [12 + Math.cos(a - 0.3) * 6, 12 + Math.sin(a - 0.3) * 6, 12 + Math.cos(a) * 11.5, 12 + Math.sin(a) * 11.5, 12 + Math.cos(a + 0.3) * 6, 12 + Math.sin(a + 0.3) * 6], outer);
      }
      ball(g, 12, 12, 7.5, kind === 'plasma' ? 'plasma' : 'fire');
      frames.push(finalize(c, { shade: false, outline: false, noise: 0.05 }));
    }
  } else if (kind === 'rocket') {
    for (let k = 0; k < 2; k++) {
      const c = makeCanvas(16, 16), g = c.getContext('2d');
      star(g, 8, 8, 7.5 - k, '#ff8a10', null, 6, k * 0.5);
      E(g, 8, 8, 4, 4, '#ffe890'); E(g, 8, 8, 2.6, 2.6, '#3c3c40'); E(g, 7.4, 7.4, 1, 1, '#b0b0b8');
      frames.push(finalize(c, { shade: false, outline: false, noise: 0.05 }));
    }
  }
  return frames;
}

// ---------------------------------------------------------------- оружие в руках (HUD)

const SKIN = '#c89068', SKIN_D = '#9a6844', GLOVE = '#4a4034';

function hand(g, cx, cy, rx, ry) {
  E(g, cx, cy, rx, ry, SKIN);
  for (let i = -1; i <= 1; i++) L(g, cx + i * rx * 0.45, cy - ry * 0.7, cx + i * rx * 0.5, cy + ry * 0.2, 1, SKIN_D);
}

const WEAPON_DRAW = {
  fist(g) {
    P(g, [58, 110, 104, 110, 98, 70, 66, 66], GLOVE);
    P(g, [62, 110, 76, 110, 74, 72, 68, 72], '#5c5044');
    E(g, 81, 60, 19, 15, SKIN);
    for (let i = 0; i < 4; i++) { E(g, 67 + i * 9.4, 50, 5.4, 6, SKIN); L(g, 71.6 + i * 9.4, 48, 71.6 + i * 9.4, 60, 1, SKIN_D); }
    R(g, 62, 54, 39, 6, '#8a8a92'); R(g, 62, 54, 39, 2, '#c4c4cc');
    E(g, 99, 66, 6, 8, SKIN_D);
  },
  pistol(g) {
    P(g, [56, 110, 106, 110, 98, 82, 64, 82], GLOVE);
    P(g, [75, 34, 85, 34, 89, 46, 71, 46], '#8c8c98');
    R(g, 79, 31, 2, 4, '#e8e8e8');
    R(g, 70, 45, 20, 38, '#50505a'); R(g, 70, 45, 20, 3, '#a4a4b0'); R(g, 70, 45, 2, 38, '#74747e');
    R(g, 73, 41, 3, 5, '#2a2a30'); R(g, 84, 41, 3, 5, '#2a2a30');
    for (let y = 54; y < 76; y += 4) R(g, 73, y, 14, 1, '#34343c');
    R(g, 77, 78, 6, 6, '#2a2a30');
    hand(g, 80, 88, 21, 13);
    E(g, 62, 84, 6, 9, SKIN); E(g, 98, 84, 6, 9, SKIN);
  },
  shotgun(g) {
    P(g, [60, 110, 100, 110, 94, 86, 66, 86], '#3a2a1c');
    P(g, [74, 32, 86, 32, 92, 90, 68, 90], '#3c3c46');
    P(g, [77, 32, 80, 32, 79, 90, 72, 90], '#7c7c8a');
    E(g, 80, 32, 6, 2.6, '#101014');
    R(g, 79, 27, 2, 4, '#d8d8d8');
    P(g, [69, 58, 91, 58, 95, 84, 65, 84], '#8a5626');
    for (let y = 62; y < 84; y += 4) L(g, 68, y, 92, y, 1, '#5a3414');
    P(g, [69, 58, 73, 58, 70, 84, 65, 84], '#b07a3c');
    hand(g, 58, 78, 12, 10);
    P(g, [48, 110, 62, 110, 66, 84, 50, 80], GLOVE);
  },
  chaingun(g) {
    P(g, [69, 30, 91, 30, 98, 76, 62, 76], '#70707c');
    for (let i = 0; i < 5; i++) L(g, 71.5 + i * 4.2, 31, 65 + i * 7.5, 76, 1.4, '#30303a');
    E(g, 80, 30, 11, 4.5, '#24242a');
    for (let i = 0; i < 6; i++) E(g, 80 + Math.cos(i * 1.047) * 7, 30 + Math.sin(i * 1.047) * 2.6, 1.7, 1.2, '#000');
    R(g, 62, 50, 36, 4, '#3a3a44');
    P(g, [50, 110, 110, 110, 104, 72, 56, 72], '#464650');
    P(g, [50, 110, 60, 110, 62, 72, 56, 72], '#7e7e8c');
    R(g, 66, 80, 28, 3, '#2a2a32'); R(g, 66, 88, 28, 3, '#2a2a32'); R(g, 66, 96, 28, 3, '#2a2a32');
    hand(g, 46, 98, 11, 12); hand(g, 114, 98, 11, 12);
  },
  launcher(g) {
    P(g, [64, 36, 96, 36, 108, 110, 52, 110], '#5a6a46');
    P(g, [64, 36, 71, 36, 62, 110, 52, 110], '#8c9c74');
    P(g, [90, 36, 96, 36, 108, 110, 98, 110], '#3a4630');
    E(g, 80, 36, 16, 6.5, '#8c9c74'); E(g, 80, 36, 13, 5, '#0c0c0c'); E(g, 80, 37.5, 9, 3, '#2a1a10');
    R(g, 58, 74, 44, 4, '#2e3626'); R(g, 55, 92, 50, 4, '#2e3626');
    R(g, 78, 22, 4, 9, '#2a2a2a'); R(g, 76, 20, 8, 3, '#2a2a2a');
    hand(g, 112, 100, 11, 12);
  },
};

export const WEAPON_FLASH_POS = {
  fist: null,
  pistol: [80, 27, 13],
  shotgun: [80, 24, 20],
  chaingun: [80, 22, 18],
  launcher: [80, 30, 22],
};

export function makeWeaponSprite(name) {
  const c = makeCanvas(160, 110);
  WEAPON_DRAW[name](c.getContext('2d'));
  return finalize(c, { seed: name.length * 7 + 3, noise: 0.1 });
}

export function makeMuzzleFlash(variant) {
  const c = makeCanvas(64, 64), g = c.getContext('2d');
  star(g, 32, 32, 30, '#ff7a10', null, 7, variant * 0.5);
  star(g, 32, 32, 22, '#ffc830', null, 6, 0.3 + variant * 0.4);
  E(g, 32, 32, 10, 10, '#fffbe0');
  return finalize(c, { shade: false, outline: false, noise: 0.04 });
}

// ---------------------------------------------------------------- лицо в статус-баре

/** level: 0 (здоров) … 4 (при смерти); look: -1/0/1; mood: 'normal' | 'ouch' | 'grin' | 'dead' */
export function makeFace(level, look, mood) {
  const c = makeCanvas(26, 30), g = c.getContext('2d');
  const dead = mood === 'dead';
  const skin = dead ? '#8a8478' : '#d09c70', shade = dead ? '#6a665c' : '#a87850';
  R(g, 8, 24, 10, 6, shade);
  R(g, 4, 5, 18, 21, skin);
  R(g, 3, 9, 1, 11, skin); R(g, 22, 9, 1, 11, skin);
  R(g, 2, 12, 1, 5, shade); R(g, 23, 12, 1, 5, shade);
  R(g, 4, 2, 18, 6, '#5a3a1c'); R(g, 3, 4, 2, 6, '#5a3a1c'); R(g, 21, 4, 2, 6, '#5a3a1c'); R(g, 6, 1, 14, 2, '#6e4a26');
  R(g, 5, 23, 16, 3, shade); R(g, 7, 25, 12, 1, shade);
  // глаза
  if (dead) {
    for (const ex of [7, 15]) { L(g, ex, 11, ex + 4, 15, 1.2, '#201010'); L(g, ex + 4, 11, ex, 15, 1.2, '#201010'); }
  } else {
    const wide = mood === 'ouch' ? 1 : 0;
    R(g, 6, 12 - wide, 5, 3 + wide, '#f4f4f0'); R(g, 15, 12 - wide, 5, 3 + wide, '#f4f4f0');
    R(g, 8 + look, 12, 2, 3, '#181010'); R(g, 17 + look, 12, 2, 3, '#181010');
    const brow = mood === 'grin' || level >= 3 ? 1 : 0;
    L(g, 6, 10 + brow * 0, 11, 10 + brow, 1.3, '#3a2410'); L(g, 20, 10, 15, 10 + brow, 1.3, '#3a2410');
  }
  R(g, 12, 14, 2, 5, shade); R(g, 11, 18, 4, 1, shade);
  // рот
  if (mood === 'ouch') { R(g, 9, 20, 8, 4, '#2a0808'); R(g, 10, 20, 6, 1, '#f0f0e8'); }
  else if (mood === 'grin') { R(g, 8, 20, 10, 3, '#2a0808'); R(g, 9, 20, 8, 2, '#f0f0e8'); }
  else if (dead) R(g, 9, 21, 8, 1, '#2a0808');
  else { R(g, 9, 21, 8, 1, '#5a2418'); if (level >= 2) R(g, 10, 22, 6, 1, '#f0f0e8'); }
  // кровь
  const rng = mulberry32(level * 31 + 9);
  const drops = dead ? 9 : level * 2;
  for (let i = 0; i < drops; i++) {
    const x = 5 + Math.floor(rng() * 16), y = 6 + Math.floor(rng() * 12), len = 2 + Math.floor(rng() * (3 + level * 2));
    R(g, x, y, 1 + (i % 3 === 0 ? 1 : 0), len, i % 2 ? '#b00c08' : '#e01c14');
  }
  return finalize(c, { shade: false, noise: 0.05, seed: 2 });
}
