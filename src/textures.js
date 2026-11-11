// Процедурные текстуры стен, полов, потолков и неба.
// Никаких внешних файлов — всё рисуется на canvas при запуске.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Бесшовный шум значений (несколько октав). */
function makeNoise(seed, size = 64) {
  const rng = mulberry32(seed);
  const octaves = [4, 8, 16, 32].map((p) => {
    const cells = size / p;
    const g = new Float32Array(cells * cells);
    for (let i = 0; i < g.length; i++) g[i] = rng();
    return { p, cells, g };
  });
  const smooth = (t) => t * t * (3 - 2 * t);
  const sample = (o, x, y) => {
    const fx = x / o.p, fy = y / o.p;
    const x0 = Math.floor(fx), y0 = Math.floor(fy);
    const tx = smooth(fx - x0), ty = smooth(fy - y0);
    const c = o.cells;
    const a = o.g[(y0 % c) * c + (x0 % c)], b = o.g[(y0 % c) * c + ((x0 + 1) % c)];
    const d = o.g[((y0 + 1) % c) * c + (x0 % c)], e = o.g[((y0 + 1) % c) * c + ((x0 + 1) % c)];
    return a + (b - a) * tx + (d - a) * ty + (a - b - d + e) * tx * ty;
  };
  // octave 0 — мелкий, 3 — крупный
  return {
    fine: (x, y) => sample(octaves[0], x, y),
    fbm: (x, y) =>
      sample(octaves[3], x, y) * 0.5 + sample(octaves[2], x, y) * 0.28 + sample(octaves[1], x, y) * 0.14 + sample(octaves[0], x, y) * 0.08,
  };
}

/** Текстура по функции цвета пикселя. fn(x, y) -> [r, g, b]. */
function pixelTex(size, fn) {
  const c = makeCanvas(size, size);
  const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, gg, b] = fn(x, y);
      const i = (y * size + x) * 4;
      img.data[i] = r; img.data[i + 1] = gg; img.data[i + 2] = b; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

const mul = (c, k) => [c[0] * k, c[1] * k, c[2] * k];
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

function ramp(stops, t) {
  t = clamp01(t);
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
      return mix(c0, c1, (t - t0) / (t1 - t0));
    }
  }
  return stops[stops.length - 1][1];
}

const S = 64;

const BUILDERS = {
  // ---------- стены ----------
  tech() {
    const n = makeNoise(11), rng = mulberry32(5);
    const c = pixelTex(S, (x, y) => {
      let k = 0.72 + n.fbm(x, y) * 0.4 + (rng() - 0.5) * 0.08;
      const px = x % 32, py = y % 32;
      if (px === 0 || py === 0) k *= 0.45;
      else if (px === 1 || py === 1) k *= 1.25;
      else if (px === 31 || py === 31) k *= 0.75;
      if (y >= 26 && y <= 29) k *= 0.6; // тёмная полоса
      return mul([112, 106, 94], k);
    });
    const g = c.getContext('2d');
    for (const [x, y] of [[4, 4], [27, 4], [4, 21], [36, 4], [59, 4], [36, 21], [4, 36], [27, 36], [4, 59], [27, 59], [36, 36], [59, 36], [36, 59], [59, 59], [27, 21], [59, 21]]) {
      g.fillStyle = '#2c2a26'; g.fillRect(x, y, 2, 2);
      g.fillStyle = '#b4ac9a'; g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = '#b8802a'; g.fillRect(0, 27, 64, 1);
    return c;
  },
  comp() {
    const n = makeNoise(21), rng = mulberry32(8);
    const c = pixelTex(S, (x, y) => {
      let k = 0.8 + n.fbm(x, y) * 0.3;
      if (x % 32 === 0 || y % 32 === 0) k *= 0.4;
      else if (x % 32 === 1 || y % 32 === 1) k *= 1.3;
      return mul([52, 58, 70], k);
    });
    const g = c.getContext('2d');
    // экран
    g.fillStyle = '#04140a'; g.fillRect(6, 6, 22, 16);
    for (let y = 7; y < 21; y += 2) {
      g.fillStyle = y % 4 === 3 ? '#1fae48' : '#12702e';
      g.fillRect(8, y, 4 + Math.floor(rng() * 15), 1);
    }
    g.fillStyle = '#04080e'; g.fillRect(38, 38, 20, 12);
    g.strokeStyle = '#3fb0e8'; g.lineWidth = 1; g.beginPath();
    for (let x = 0; x < 18; x++) g.lineTo(39.5 + x, 44.5 + Math.sin(x * 0.9) * 3 * (x % 5 ? 1 : -0.4));
    g.stroke();
    // лампочки
    const cols = ['#ff3b30', '#2fe05a', '#ffd23a', '#38b6ff', '#30343c'];
    for (let y = 36; y < 60; y += 4) for (let x = 5; x < 28; x += 4) {
      g.fillStyle = cols[Math.floor(rng() * cols.length)]; g.fillRect(x, y, 2, 2);
    }
    for (let y = 6; y < 26; y += 4) for (let x = 38; x < 58; x += 4) {
      g.fillStyle = cols[Math.floor(rng() * cols.length)]; g.fillRect(x, y, 2, 2);
    }
    g.fillStyle = '#20242c'; g.fillRect(5, 26, 24, 3); g.fillRect(37, 54, 22, 3);
    return c;
  },
  brick() {
    const n = makeNoise(31), rng = mulberry32(3);
    const tint = new Float32Array(64);
    for (let i = 0; i < 64; i++) tint[i] = 0.78 + rng() * 0.44;
    return pixelTex(S, (x, y) => {
      const row = Math.floor(y / 8);
      const xx = (x + (row % 2) * 8) % 64;
      const col = Math.floor(xx / 16);
      const bx = xx % 16, by = y % 8;
      if (bx === 0 || by === 0) return mul([52, 44, 38], 0.8 + rng() * 0.3);
      let k = tint[(row * 4 + col) % 64] * (0.82 + n.fbm(x, y) * 0.3 + (rng() - 0.5) * 0.12);
      if (by === 1 || bx === 1) k *= 1.18;
      if (by === 7 || bx === 15) k *= 0.78;
      return mul([128, 62, 42], k);
    });
  },
  stone() {
    const n = makeNoise(41), rng = mulberry32(13);
    const tint = new Float32Array(16);
    for (let i = 0; i < 16; i++) tint[i] = 0.8 + rng() * 0.4;
    return pixelTex(S, (x, y) => {
      const row = Math.floor(y / 16);
      const xx = (x + (row % 2) * 16) % 64;
      const bx = xx % 32, by = y % 16;
      if (bx === 0 || by === 0) return mul([30, 30, 28], 0.8 + rng() * 0.4);
      let k = tint[(row * 2 + Math.floor(xx / 32)) % 16] * (0.7 + n.fbm(x, y) * 0.55 + (rng() - 0.5) * 0.1);
      if (bx === 1 || by === 1) k *= 1.2;
      if (bx === 31 || by === 15) k *= 0.72;
      if (Math.abs(n.fbm(x + 20, y + 9) - 0.5) < 0.012) k *= 0.5; // трещины
      return mul([104, 100, 92], k);
    });
  },
  hell() {
    const n = makeNoise(51), n2 = makeNoise(52), rng = mulberry32(7);
    return pixelTex(S, (x, y) => {
      const a = n.fbm(x, y), b = n2.fbm(x, y);
      let col = ramp([[0.25, [44, 8, 6]], [0.5, [118, 28, 18]], [0.75, [150, 52, 30]]], a);
      const vein = Math.abs(b - 0.5);
      if (vein < 0.02) col = mul(col, 0.35);
      else if (vein < 0.04) col = mul(col, 0.7);
      if (b > 0.72) col = mix(col, [230, 110, 30], (b - 0.72) * 3);
      return mul(col, 0.9 + rng() * 0.2);
    });
  },
  metal() {
    const n = makeNoise(61), rng = mulberry32(17);
    const c = pixelTex(S, (x, y) => {
      let k = 0.8 + n.fbm(x, y) * 0.3 + (rng() - 0.5) * 0.06;
      const px = x % 16;
      if (px === 0) k *= 0.45; else if (px === 1) k *= 1.3; else if (px === 15) k *= 0.7;
      if (y % 32 === 0) k *= 0.5; else if (y % 32 === 1) k *= 1.25;
      return mul([74, 78, 86], k);
    });
    const g = c.getContext('2d');
    for (let y = 5; y < 64; y += 32) for (let x = 7; x < 64; x += 16) {
      g.fillStyle = '#1e2026'; g.fillRect(x, y, 2, 2); g.fillStyle = '#a8aeb8'; g.fillRect(x, y, 1, 1);
    }
    return c;
  },
  crate() {
    const n = makeNoise(71), rng = mulberry32(19);
    const c = pixelTex(S, (x, y) => {
      let k = 0.78 + n.fbm(x * 0.5, y) * 0.35 + (rng() - 0.5) * 0.1;
      if (x % 8 === 0) k *= 0.6;
      const border = x < 6 || y < 6 || x > 57 || y > 57;
      if (border) k *= x === 0 || y === 0 ? 1.3 : x === 63 || y === 63 ? 0.55 : 1.12;
      else if (x === 6 || y === 6) k *= 0.55;
      const d1 = Math.abs(x - y), d2 = Math.abs(x + y - 63);
      if (!border && (d1 < 4 || d2 < 4)) k *= d1 === 3 || d2 === 3 ? 0.6 : 1.15;
      return mul([138, 98, 52], k);
    });
    const g = c.getContext('2d');
    for (const [x, y] of [[2, 2], [59, 2], [2, 59], [59, 59]]) { g.fillStyle = '#2a2018'; g.fillRect(x, y, 2, 2); }
    return c;
  },
  crate_top() {
    const n = makeNoise(72), rng = mulberry32(23);
    return pixelTex(S, (x, y) => {
      let k = 0.74 + n.fbm(x, y * 0.5) * 0.35 + (rng() - 0.5) * 0.1;
      if (y % 8 === 0) k *= 0.6;
      if (x < 5 || y < 5 || x > 58 || y > 58) k *= 1.15;
      else if (x === 5 || y === 5 || x === 58 || y === 58) k *= 0.55;
      return mul([126, 90, 48], k);
    });
  },
  step() {
    const n = makeNoise(81), rng = mulberry32(29);
    return pixelTex(S, (x, y) => {
      let k = 0.75 + n.fbm(x, y) * 0.3 + (rng() - 0.5) * 0.1;
      if (y < 2) k *= 1.45; else if (y < 4) k *= 0.6;
      if (x % 32 === 0) k *= 0.6;
      return mul([96, 96, 92], k);
    });
  },
  door: () => doorTex(null),
  door_red: () => doorTex('#ff2a1a'),
  door_blue: () => doorTex('#2a6cff'),
  door_yellow: () => doorTex('#ffd21a'),

  // ---------- полы и потолки ----------
  tile() {
    const n = makeNoise(91), rng = mulberry32(31);
    return pixelTex(S, (x, y) => {
      let k = 0.78 + n.fbm(x, y) * 0.32 + (rng() - 0.5) * 0.08;
      const px = x % 16, py = y % 16;
      if (px === 0 || py === 0) k *= 0.5; else if (px === 1 || py === 1) k *= 1.15;
      const odd = (Math.floor(x / 16) + Math.floor(y / 16)) % 2;
      return mul(odd ? [86, 92, 86] : [100, 104, 96], k);
    });
  },
  concrete() {
    const n = makeNoise(101), rng = mulberry32(37);
    return pixelTex(S, (x, y) => {
      let k = 0.7 + n.fbm(x, y) * 0.5 + (rng() - 0.5) * 0.14;
      if (x % 32 === 0 || y % 32 === 0) k *= 0.6;
      return mul([84, 82, 78], k);
    });
  },
  dirt() {
    const n = makeNoise(111), n2 = makeNoise(112), rng = mulberry32(41);
    return pixelTex(S, (x, y) => {
      const a = n.fbm(x, y);
      let col = ramp([[0.2, [86, 50, 30]], [0.55, [136, 84, 48]], [0.85, [164, 108, 62]]], a);
      if (n2.fine(x, y) > 0.82) col = mul(col, 0.6);
      return mul(col, 0.88 + rng() * 0.24);
    });
  },
  slime() {
    const n = makeNoise(121), n2 = makeNoise(122);
    return pixelTex(S, (x, y) => {
      const a = n.fbm(x, y) * 0.6 + n2.fbm(y, x) * 0.4;
      return ramp([[0.3, [14, 70, 10]], [0.5, [40, 150, 24]], [0.65, [90, 210, 40]], [0.8, [190, 255, 110]]], a);
    });
  },
  lava() {
    const n = makeNoise(131), n2 = makeNoise(132);
    return pixelTex(S, (x, y) => {
      const a = n.fbm(x, y) * 0.6 + n2.fbm(y, x) * 0.4;
      return ramp([[0.28, [40, 6, 2]], [0.45, [170, 30, 4]], [0.6, [240, 100, 10]], [0.78, [255, 220, 80]]], a);
    });
  },
  hellfloor() {
    const n = makeNoise(141), n2 = makeNoise(142), rng = mulberry32(43);
    return pixelTex(S, (x, y) => {
      let col = ramp([[0.25, [44, 20, 16]], [0.6, [92, 40, 30]], [0.9, [120, 60, 40]]], n.fbm(x, y));
      const crack = Math.abs(n2.fbm(x, y) - 0.5);
      if (crack < 0.015) col = mul(col, 0.3);
      return mul(col, 0.88 + rng() * 0.24);
    });
  },
  marble() {
    const n = makeNoise(151), n2 = makeNoise(152), rng = mulberry32(47);
    return pixelTex(S, (x, y) => {
      let col = ramp([[0.2, [30, 52, 40]], [0.6, [58, 92, 70]], [0.9, [84, 120, 94]]], n.fbm(x, y));
      const vein = Math.abs(n2.fbm(x, y) - 0.5);
      if (vein < 0.014) col = mix(col, [190, 210, 190], 0.6);
      const px = x % 32, py = y % 32;
      if (px === 0 || py === 0) col = mul(col, 0.45);
      return mul(col, 0.92 + rng() * 0.16);
    });
  },
  grate() {
    const rng = mulberry32(53);
    return pixelTex(S, (x, y) => {
      const px = x % 8, py = y % 8;
      let k = 0.9 + rng() * 0.2;
      if (px < 2 || py < 2) return mul([92, 94, 100], k * (px === 0 || py === 0 ? 1.2 : 0.8));
      return mul([18, 18, 22], k);
    });
  },
  exitpad() {
    const rng = mulberry32(59);
    return pixelTex(S, (x, y) => {
      const d = Math.max(Math.abs(x - 31.5), Math.abs(y - 31.5));
      const k = 0.9 + rng() * 0.2;
      if (d > 29) return mul([70, 72, 78], k);
      const ring = Math.floor(d / 5) % 2;
      return mul(ring ? [30, 230, 90] : [8, 70, 30], k);
    });
  },
  panel() {
    const n = makeNoise(161), rng = mulberry32(61);
    return pixelTex(S, (x, y) => {
      let k = 0.78 + n.fbm(x, y) * 0.3 + (rng() - 0.5) * 0.08;
      const px = x % 32, py = y % 32;
      if (px === 0 || py === 0) k *= 0.5; else if (px === 1 || py === 1) k *= 1.2;
      return mul([92, 90, 84], k);
    });
  },
  lightpanel() {
    const n = makeNoise(162), rng = mulberry32(67);
    return pixelTex(S, (x, y) => {
      let k = 0.78 + n.fbm(x, y) * 0.3 + (rng() - 0.5) * 0.08;
      const px = x % 32, py = y % 32;
      if (px >= 8 && px < 24 && py >= 8 && py < 24) {
        if (px === 8 || py === 8 || px === 23 || py === 23) return [60, 60, 56];
        return mul([255, 248, 214], px % 4 === 0 ? 0.82 : 1);
      }
      if (px === 0 || py === 0) k *= 0.5;
      return mul([92, 90, 84], k);
    });
  },
  metalceil() {
    const n = makeNoise(171), rng = mulberry32(71);
    return pixelTex(S, (x, y) => {
      let k = 0.75 + n.fbm(x, y) * 0.35 + (rng() - 0.5) * 0.08;
      const py = y % 16;
      if (py === 0) k *= 0.45; else if (py === 1) k *= 1.25;
      if (x % 32 === 0) k *= 0.6;
      return mul([62, 62, 68], k);
    });
  },
  rock() {
    const n = makeNoise(181), n2 = makeNoise(182), rng = mulberry32(73);
    return pixelTex(S, (x, y) => {
      let col = ramp([[0.2, [34, 24, 20]], [0.6, [78, 56, 44]], [0.9, [104, 80, 62]]], n.fbm(x, y));
      if (Math.abs(n2.fbm(x, y) - 0.5) < 0.015) col = mul(col, 0.4);
      return mul(col, 0.88 + rng() * 0.24);
    });
  },
};

function doorTex(keyColor) {
  const n = makeNoise(201), rng = mulberry32(79);
  const c = pixelTex(S, (x, y) => {
    let k = 0.8 + n.fbm(x, y) * 0.25 + (rng() - 0.5) * 0.06;
    const py = y % 8;
    if (y < 52) { if (py === 0) k *= 0.5; else if (py === 1) k *= 1.3; else if (py === 7) k *= 0.8; }
    if (x === 31 || x === 32) k *= 0.4;
    if (x === 0 || x === 63) k *= 0.5;
    if (y >= 52) {
      const stripe = Math.floor((x + (y - 52)) / 6) % 2;
      return mul(stripe ? [214, 170, 20] : [24, 22, 20], k);
    }
    return mul([116, 118, 126], k);
  });
  const g = c.getContext('2d');
  if (keyColor) {
    g.fillStyle = '#101014'; g.fillRect(3, 4, 8, 44); g.fillRect(53, 4, 8, 44);
    g.fillStyle = keyColor;
    for (let y = 6; y < 46; y += 6) { g.fillRect(5, y, 4, 4); g.fillRect(55, y, 4, 4); }
  } else {
    g.fillStyle = '#34363c'; g.fillRect(26, 22, 12, 12);
    g.fillStyle = '#8a8c94'; g.fillRect(27, 23, 10, 1); g.fillRect(27, 23, 1, 10);
  }
  return c;
}

/** Панорама неба 512x128, бесшовная по горизонтали. */
export function makeSky(kind) {
  const W = 512, H = 128;
  const hell = kind === 'hell';
  const rng = mulberry32(hell ? 301 : 300);
  const top = hell ? [18, 0, 0] : [26, 14, 20];
  const stops = hell
    ? [[0, top], [0.35, [70, 6, 4]], [0.62, [170, 36, 8]], [0.8, [250, 130, 30]]]
    : [[0, top], [0.35, [70, 34, 34]], [0.62, [150, 78, 48]], [0.8, [226, 150, 84]]];
  // бесшовный шум облаков
  const cw = 16, ch = 8;
  const grid = new Float32Array(cw * ch);
  for (let i = 0; i < grid.length; i++) grid[i] = rng();
  const cloud = (x, y) => {
    const fx = (x / W) * cw, fy = (y / H) * ch;
    const x0 = Math.floor(fx), y0 = Math.min(ch - 2, Math.floor(fy));
    const tx = fx - x0, ty = fy - y0;
    const a = grid[y0 * cw + (x0 % cw)], b = grid[y0 * cw + ((x0 + 1) % cw)];
    const d = grid[(y0 + 1) * cw + (x0 % cw)], e = grid[(y0 + 1) * cw + ((x0 + 1) % cw)];
    return a + (b - a) * tx + (d - a) * ty + (a - b - d + e) * tx * ty;
  };
  // силуэты гор (два плана)
  const ridge = (seed, amp, base) => {
    const r = mulberry32(seed);
    const pts = 32, arr = new Float32Array(pts);
    for (let i = 0; i < pts; i++) arr[i] = r();
    return (x) => {
      const f = (x / W) * pts, i0 = Math.floor(f), t = f - i0;
      const s = t * t * (3 - 2 * t);
      const v = arr[i0 % pts] * (1 - s) + arr[(i0 + 1) % pts] * s;
      const f2 = (x / W) * pts * 4, j0 = Math.floor(f2), t2 = f2 - j0;
      const w = arr[(j0 * 7) % pts] * (1 - t2) + arr[((j0 + 1) * 7) % pts] * t2;
      return base + (v * 0.8 + w * 0.2) * amp;
    };
  };
  const far = ridge(hell ? 11 : 12, 34, 24), near = ridge(hell ? 21 : 22, 24, 10);
  const c = makeCanvas(W, H);
  const g = c.getContext('2d');
  const img = g.createImageData(W, H);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / (H - 1);
      let col = ramp(stops, t);
      const fade = clamp01((t - 0.12) * 4); // верхняя кромка — ровный цвет
      const cl = cloud(x, y);
      if (cl > 0.5) col = mix(col, hell ? [40, 4, 4] : [56, 30, 34], clamp01((cl - 0.5) * 2.4) * fade * 0.85);
      else if (!hell && t < 0.5 && rng() > 0.9975) col = mix(col, [255, 240, 220], fade);
      const hFromBottom = H - 1 - y;
      if (hFromBottom < near(x)) col = hell ? [22, 4, 4] : [38, 22, 22];
      else if (hFromBottom < far(x)) col = hell ? [64, 12, 8] : [78, 44, 36];
      const i = (y * W + x) * 4;
      img.data[i] = col[0]; img.data[i + 1] = col[1]; img.data[i + 2] = col[2]; img.data[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  return { canvas: c, top };
}

export const TEXTURE_NAMES = Object.keys(BUILDERS);

/** Создать canvas для текстуры по имени. */
export function makeTextureCanvas(name) {
  const b = BUILDERS[name];
  if (!b) throw new Error(`Нет текстуры: ${name}`);
  return b();
}
