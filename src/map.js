// Игровая карта: сетка ячеек с высотами пола/потолка (упрощённые «секторы» Doom),
// двери, столкновения, трассировка лучей и поиск пути.
// Модуль не зависит от Three.js / DOM — его можно тестировать в Node.

export const STEP_UP = 0.36; // максимальная высота ступеньки
export const MAX_DROP = 0.7; // с какого уступа монстры ещё спрыгивают
export const DOOR_HEIGHT = 1.3;
export const DOOR_THICK = 0.24;
const INF = 65535;

export class GameMap {
  constructor(def) {
    this.def = def;
    this.name = def.name;
    this.w = def.w;
    this.h = def.h;
    const n = this.w * this.h;
    this.solid = new Uint8Array(n).fill(1);
    this.floor = new Float32Array(n);
    this.ceil = new Float32Array(n).fill(1);
    this.zone = new Array(n).fill(null);
    this.wallTex = new Array(n).fill(def.defaultWall || 'tech');
    this.doors = new Map();
    this.doorList = [];
    this.things = [];
    this.seen = new Uint8Array(n);
    this.dist = new Uint16Array(n).fill(INF);
    this._queue = new Int32Array(n);
    this.start = { x: 1.5, y: 1.5, angle: 0 };
    def.build(this);
    this._finishDoors();
  }

  // ---------- построение уровня ----------

  /** Вырезать прямоугольник (включительно) и назначить ему зону. */
  carve(x0, y0, x1, y1, zoneName) {
    const zone = this.def.zones[zoneName];
    if (!zone) throw new Error(`Неизвестная зона: ${zoneName}`);
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        if (x < 1 || y < 1 || x >= this.w - 1 || y >= this.h - 1) {
          throw new Error(`carve выходит за границы карты: ${x},${y}`);
        }
        const i = y * this.w + x;
        this.solid[i] = 0;
        this.zone[i] = zone;
        this.floor[i] = zone.floor;
        this.ceil[i] = zone.ceil;
      }
    }
  }

  /** Вернуть стену (колонны, перегородки). */
  fill(x0, y0, x1, y1, tex) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const i = y * this.w + x;
        this.solid[i] = 1;
        this.zone[i] = null;
        if (tex) this.wallTex[i] = tex;
      }
    }
  }

  /** Назначить текстуру стен в прямоугольнике. */
  paint(x0, y0, x1, y1, tex) {
    for (let y = Math.max(0, Math.min(y0, y1)); y <= Math.min(this.h - 1, Math.max(y0, y1)); y++) {
      for (let x = Math.max(0, Math.min(x0, x1)); x <= Math.min(this.w - 1, Math.max(x0, x1)); x++) {
        this.wallTex[y * this.w + x] = tex;
      }
    }
  }

  /** Дверь в ячейке (key: null | 'red' | 'blue' | 'yellow'). */
  door(x, y, key = null, zoneName = 'door') {
    const zone = this.def.zones[zoneName];
    const i = y * this.w + x;
    this.solid[i] = 0;
    this.zone[i] = zone;
    const d = {
      cx: x, cy: y, i, key, open: 0, state: 'closed', timer: 0,
      axis: 'x', h: DOOR_HEIGHT, unlocked: false, links: [],
    };
    this.doors.set(i, d);
    this.doorList.push(d);
    return d;
  }

  thing(type, x, y, extra = {}) {
    this.things.push({ type, x: x + 0.5, y: y + 0.5, ...extra });
  }

  setStart(x, y, angle) {
    this.start = { x: x + 0.5, y: y + 0.5, angle };
  }

  _finishDoors() {
    for (const d of this.doorList) {
      const { cx, cy } = d;
      // ось двери: вдоль x, если слева и справа стены (или другие двери)
      const sideX = (x) => this.isSolid(x, cy) || this.doors.has(cy * this.w + x);
      d.axis = sideX(cx - 1) && sideX(cx + 1) ? 'x' : 'y';
      // пол двери — по самому низкому соседу, в который можно пройти
      let f = -Infinity;
      const nb = d.axis === 'x' ? [[cx, cy - 1], [cx, cy + 1]] : [[cx - 1, cy], [cx + 1, cy]];
      for (const [x, y] of nb) {
        if (!this.isSolid(x, y) && !this.doors.has(y * this.w + x)) f = Math.max(f, this.floor[y * this.w + x]);
      }
      if (!isFinite(f)) f = 0;
      this.floor[d.i] = f;
      this.ceil[d.i] = f + DOOR_HEIGHT;
    }
    // соседние двери открываются вместе (двустворчатые)
    for (const d of this.doorList) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const o = this.doors.get((d.cy + dy) * this.w + d.cx + dx);
        if (o && o.key === d.key) d.links.push(o);
      }
    }
  }

  // ---------- запросы ----------

  inBounds(cx, cy) {
    return cx >= 0 && cy >= 0 && cx < this.w && cy < this.h;
  }

  isSolid(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.w || cy >= this.h) return true;
    return this.solid[cy * this.w + cx] === 1;
  }

  zoneAt(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (this.isSolid(cx, cy)) return null;
    return this.zone[cy * this.w + cx];
  }

  floorAt(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (this.isSolid(cx, cy)) return 0;
    return this.floor[cy * this.w + cx];
  }

  lightAt(x, y) {
    const z = this.zoneAt(x, y);
    return z ? z.light : 0.5;
  }

  doorAt(cx, cy) {
    if (!this.inBounds(cx, cy)) return null;
    return this.doors.get(cy * this.w + cx) || null;
  }

  /** Самый высокий пол под квадратом игрока/монстра. */
  groundZ(x, y, r) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    let g = -Infinity;
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (this.isSolid(cx, cy)) continue;
        const f = this.floor[cy * this.w + cx];
        if (f > g) g = f;
      }
    }
    return g === -Infinity ? 0 : g;
  }

  /** Может ли тело (радиус r, высота height, ноги на z) стоять в точке. */
  blocked(x, y, r, z, height, stepUp = STEP_UP, maxDrop = Infinity) {
    const x0 = Math.floor(x - r), x1 = Math.floor(x + r);
    const y0 = Math.floor(y - r), y1 = Math.floor(y + r);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        if (this.isSolid(cx, cy)) return true;
        const i = cy * this.w + cx;
        const f = this.floor[i];
        if (f - z > stepUp) return true;
        if (this.ceil[i] - Math.max(f, z) < height) return true;
        if (z - f > maxDrop) return true;
        const d = this.doors.get(i);
        if (d && d.open * d.h < height) return true;
      }
    }
    return false;
  }

  /**
   * Сдвинуть тело со скольжением вдоль стен. ent: {x, y, z}.
   * extra(x, y) — дополнительная проверка (например, другие существа).
   * Возвращает true, если удалось сдвинуться хоть по одной оси.
   */
  move(ent, dx, dy, r, height, stepUp = STEP_UP, maxDrop = Infinity, extra = null) {
    const len = Math.hypot(dx, dy);
    if (len < 1e-9) return false;
    const steps = Math.max(1, Math.ceil(len / (r * 0.6)));
    const sx = dx / steps, sy = dy / steps;
    let moved = false;
    for (let s = 0; s < steps; s++) {
      let nx = ent.x + sx;
      if (!this.blocked(nx, ent.y, r, ent.z, height, stepUp, maxDrop) && !(extra && extra(nx, ent.y))) {
        ent.x = nx;
        moved = moved || Math.abs(sx) > 1e-9;
      }
      let ny = ent.y + sy;
      if (!this.blocked(ent.x, ny, r, ent.z, height, stepUp, maxDrop) && !(extra && extra(ent.x, ny))) {
        ent.y = ny;
        moved = moved || Math.abs(sy) > 1e-9;
      }
      const g = this.groundZ(ent.x, ent.y, r);
      if (g > ent.z) ent.z = g; // шаг на ступеньку
    }
    return moved;
  }

  // ---------- трассировка ----------

  /**
   * 3D-луч по сетке (DDA). Направление должно быть нормировано.
   * Возвращает {hit, t, x, y, z, type, nx, ny, nz}; type: wall|floor|ceil|sky|door.
   */
  raycast(ox, oy, oz, dx, dy, dz, maxDist = 64) {
    let cx = Math.floor(ox), cy = Math.floor(oy);
    const res = { hit: false, t: maxDist, x: 0, y: 0, z: 0, type: null, nx: 0, ny: 0, nz: 0 };
    const done = (type, t, nx, ny, nz) => {
      res.hit = true; res.type = type; res.t = t;
      res.nx = nx; res.ny = ny; res.nz = nz;
      res.x = ox + dx * t; res.y = oy + dy * t; res.z = oz + dz * t;
      return res;
    };
    if (this.isSolid(cx, cy)) return done('wall', 0, 0, 0, 0);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdy = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    let tmx = dx !== 0 ? (dx > 0 ? cx + 1 - ox : ox - cx) * tdx : Infinity;
    let tmy = dy !== 0 ? (dy > 0 ? cy + 1 - oy : oy - cy) * tdy : Infinity;
    let t = 0;
    for (let n = 0; n < 512; n++) {
      const i = cy * this.w + cx;
      const f = this.floor[i], c = this.ceil[i];
      const tExit = Math.min(tmx, tmy);
      const door = this.doors.get(i);
      if (door && door.open < 1) {
        const half = DOOR_THICK / 2;
        const bx0 = door.axis === 'x' ? cx : cx + 0.5 - half;
        const bx1 = door.axis === 'x' ? cx + 1 : cx + 0.5 + half;
        const by0 = door.axis === 'x' ? cy + 0.5 - half : cy;
        const by1 = door.axis === 'x' ? cy + 0.5 + half : cy + 1;
        const th = rayBox(ox, oy, oz, dx, dy, dz, bx0, by0, f + door.open * door.h, bx1, by1, c + 0.01);
        if (th !== null && th <= tExit) {
          if (th > maxDist) break;
          const horiz = door.axis === 'x';
          return done('door', Math.max(th, 0), horiz ? 0 : -sx, horiz ? -sy : 0, 0);
        }
      }
      if (dz < 0) {
        const tf = Math.max((f - oz) / dz, t);
        if (tf <= tExit) {
          if (tf > maxDist) break;
          return done('floor', tf, 0, 0, 1);
        }
      } else if (dz > 0) {
        const tc = Math.max((c - oz) / dz, t);
        if (tc <= tExit) {
          if (tc > maxDist) break;
          return done(this.zone[i].ctex ? 'ceil' : 'sky', tc, 0, 0, -1);
        }
      }
      if (tExit > maxDist) break;
      let nx = 0, ny = 0;
      if (tmx < tmy) { cx += sx; tmx += tdx; nx = -sx; } else { cy += sy; tmy += tdy; ny = -sy; }
      t = tExit;
      if (this.isSolid(cx, cy)) return done('wall', t, nx, ny, 0);
      const j = cy * this.w + cx;
      const z = oz + dz * t;
      if (z < this.floor[j]) return done('wall', t, nx, ny, 0);
      if (z > this.ceil[j]) return done(this.zone[j].ctex || this.zone[i].ctex ? 'wall' : 'sky', t, nx, ny, 0);
    }
    res.x = ox + dx * maxDist; res.y = oy + dy * maxDist; res.z = oz + dz * maxDist;
    return res;
  }

  /** Прямая видимость между двумя точками. */
  los(ax, ay, az, bx, by, bz) {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return true;
    return !this.raycast(ax, ay, az, dx / len, dy / len, dz / len, len).hit;
  }

  /** Можно ли монстру пройти по прямой (без стен и высоких уступов). */
  walkLine(ax, ay, bx, by, r, height) {
    const len = Math.hypot(bx - ax, by - ay);
    const steps = Math.ceil(len / 0.25);
    let z = this.groundZ(ax, ay, r);
    for (let s = 1; s <= steps; s++) {
      const k = s / steps;
      const x = ax + (bx - ax) * k, y = ay + (by - ay) * k;
      if (this.blocked(x, y, r, z, height, STEP_UP, MAX_DROP)) return false;
      z = this.groundZ(x, y, r);
    }
    return true;
  }

  // ---------- поиск пути ----------

  _doorPassable(i, forPlayerKeys) {
    const d = this.doors.get(i);
    if (!d) return true;
    if (!d.key || d.unlocked || d.open > 0) return true;
    return !!(forPlayerKeys && forPlayerKeys[d.key]);
  }

  /** Поле расстояний от игрока — монстры идут «вниз» по нему. */
  computeDistField(px, py) {
    const { w, h, dist, _queue: q } = this;
    dist.fill(INF);
    const sx = Math.floor(px), sy = Math.floor(py);
    if (this.isSolid(sx, sy)) return;
    let head = 0, tail = 0;
    const s = sy * w + sx;
    dist[s] = 0;
    q[tail++] = s;
    while (head < tail) {
      const b = q[head++];
      const bx = b % w, by = (b / w) | 0;
      const nd = dist[b] + 1;
      if (!this._doorPassable(b, null) && b !== s) continue; // запертые двери не пропускают
      for (let k = 0; k < 4; k++) {
        const ax = bx + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const ay = by + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (ax < 0 || ay < 0 || ax >= w || ay >= h) continue;
        const a = ay * w + ax;
        if (this.solid[a] || dist[a] !== INF) continue;
        // монстр идёт из a в b
        const up = this.floor[b] - this.floor[a];
        if (up > STEP_UP || -up > MAX_DROP) continue;
        dist[a] = nd;
        q[tail++] = a;
      }
    }
  }

  /** Следующая ячейка для монстра (по полю расстояний) или null. */
  nextCell(x, y) {
    const cx = Math.floor(x), cy = Math.floor(y);
    if (this.isSolid(cx, cy)) return null;
    const { w } = this;
    const here = this.dist[cy * w + cx];
    if (here === INF || here === 0) return null;
    let best = null, bestD = here;
    const tryCell = (nx, ny, diag) => {
      if (this.isSolid(nx, ny)) return;
      const j = ny * w + nx;
      const d = this.dist[j];
      if (d === INF) return;
      const up = this.floor[j] - this.floor[cy * w + cx];
      if (up > STEP_UP || -up > MAX_DROP) return;
      if (diag) {
        // по диагонали — только если оба ортогональных соседа свободны и на одном уровне
        if (this.isSolid(nx, cy) || this.isSolid(cx, ny)) return;
        const f0 = this.floor[cy * w + cx];
        if (Math.abs(this.floor[cy * w + nx] - f0) > 0.01 || Math.abs(this.floor[ny * w + cx] - f0) > 0.01) return;
        if (this.doors.has(j) || this.doors.has(cy * w + nx) || this.doors.has(ny * w + cx)) return;
      }
      const score = d - (diag ? 0.1 : 0);
      if (score < bestD) { bestD = score; best = { cx: nx, cy: ny }; }
    };
    tryCell(cx + 1, cy, false); tryCell(cx - 1, cy, false);
    tryCell(cx, cy + 1, false); tryCell(cx, cy - 1, false);
    tryCell(cx + 1, cy + 1, true); tryCell(cx - 1, cy + 1, true);
    tryCell(cx + 1, cy - 1, true); tryCell(cx - 1, cy - 1, true);
    return best;
  }

  /**
   * Заливка от точки (звук выстрела, проверка достижимости).
   * opts: {maxDepth, keys (ключи игрока), playerMove (учитывать ступеньки как игрок), throughDoors}
   * Возвращает Uint16Array глубин (65535 — недостижимо).
   */
  flood(px, py, opts = {}) {
    const { maxDepth = INF - 1, keys = null, playerMove = false, throughDoors = false } = opts;
    const { w, h } = this;
    const out = new Uint16Array(w * h).fill(INF);
    const q = new Int32Array(w * h);
    const sx = Math.floor(px), sy = Math.floor(py);
    if (this.isSolid(sx, sy)) return out;
    let head = 0, tail = 0;
    out[sy * w + sx] = 0;
    q[tail++] = sy * w + sx;
    while (head < tail) {
      const a = q[head++];
      if (out[a] >= maxDepth) continue;
      const ax = a % w, ay = (a / w) | 0;
      for (let k = 0; k < 4; k++) {
        const bx = ax + (k === 0 ? 1 : k === 1 ? -1 : 0);
        const by = ay + (k === 2 ? 1 : k === 3 ? -1 : 0);
        if (bx < 0 || by < 0 || bx >= w || by >= h) continue;
        const b = by * w + bx;
        if (this.solid[b] || out[b] !== INF) continue;
        const d = this.doors.get(b);
        if (d) {
          if (throughDoors) {
            if (!this._doorPassable(b, keys)) continue;
          } else if (d.open < 0.5) {
            continue; // закрытая дверь глушит звук
          }
        }
        if (playerMove) {
          if (this.floor[b] - this.floor[a] > STEP_UP) continue;
          if (this.ceil[b] - Math.max(this.floor[b], this.floor[a]) < 0.9) continue;
        }
        out[b] = out[a] + 1;
        q[tail++] = b;
      }
    }
    return out;
  }

  // ---------- двери ----------

  /**
   * Попробовать открыть дверь. keys — ключи того, кто открывает (null для монстров).
   * Возвращает 'ok' | 'locked' | 'busy'.
   */
  openDoor(d, keys, _chain = false) {
    if (d.key && !d.unlocked) {
      if (!keys || !keys[d.key]) return 'locked';
      d.unlocked = true;
    }
    if (d.state === 'open') { d.timer = 4; return 'busy'; }
    if (d.state === 'opening') return 'busy';
    d.state = 'opening';
    if (!_chain) for (const o of d.links) this.openDoor(o, keys, true);
    return 'ok';
  }

  /** occupied(d) -> true, если в проёме кто-то стоит. Возвращает список дверей, начавших движение. */
  updateDoors(dt, occupied) {
    const events = [];
    for (const d of this.doorList) {
      if (d.state === 'opening') {
        d.open += dt * 1.7;
        if (d.open >= 1) { d.open = 1; d.state = 'open'; d.timer = 4; }
      } else if (d.state === 'open') {
        d.timer -= dt;
        if (d.timer <= 0) {
          if (occupied(d)) d.timer = 0.5;
          else { d.state = 'closing'; events.push(d); }
        }
      } else if (d.state === 'closing') {
        if (occupied(d)) { d.state = 'opening'; continue; }
        d.open -= dt * 1.7;
        if (d.open <= 0) { d.open = 0; d.state = 'closed'; }
      }
    }
    return events;
  }

  /** Текстовый вид карты (для отладки и тестов). */
  toAscii() {
    const rows = [];
    const marks = new Map();
    for (const t of this.things) marks.set(Math.floor(t.y) * this.w + Math.floor(t.x), t.type[0]);
    for (let y = 0; y < this.h; y++) {
      let row = '';
      for (let x = 0; x < this.w; x++) {
        const i = y * this.w + x;
        if (this.solid[i]) row += '#';
        else if (this.doors.has(i)) row += this.doors.get(i).key ? '%' : '+';
        else if (marks.has(i)) row += marks.get(i);
        else if (x === Math.floor(this.start.x) && y === Math.floor(this.start.y)) row += '@';
        else row += this.zone[i].damage ? '~' : this.floor[i] > 0.01 ? '^' : this.zone[i].ctex ? '.' : ',';
      }
      rows.push(row);
    }
    return rows.join('\n');
  }
}

/** Пересечение луча с AABB; возвращает t входа или null. */
export function rayBox(ox, oy, oz, dx, dy, dz, x0, y0, z0, x1, y1, z1) {
  let tmin = -Infinity, tmax = Infinity;
  const o = [ox, oy, oz], d = [dx, dy, dz], lo = [x0, y0, z0], hi = [x1, y1, z1];
  for (let a = 0; a < 3; a++) {
    if (Math.abs(d[a]) < 1e-9) {
      if (o[a] < lo[a] || o[a] > hi[a]) return null;
    } else {
      let t1 = (lo[a] - o[a]) / d[a], t2 = (hi[a] - o[a]) / d[a];
      if (t1 > t2) { const s = t1; t1 = t2; t2 = s; }
      if (t1 > tmin) tmin = t1;
      if (t2 < tmax) tmax = t2;
      if (tmin > tmax) return null;
    }
  }
  if (tmax < 0) return null;
  return Math.max(tmin, 0);
}

/**
 * Пересечение луча с вертикальным цилиндром (центр cx,cy; радиус r; z0..z1).
 * Возвращает t или null.
 */
export function rayCylinder(ox, oy, oz, dx, dy, dz, cx, cy, r, z0, z1) {
  const a = dx * dx + dy * dy;
  if (a < 1e-9) return null;
  const fx = ox - cx, fy = oy - cy;
  const b = 2 * (fx * dx + fy * dy);
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const sq = Math.sqrt(disc);
  const tb = (-b + sq) / (2 * a);
  if (tb < 0) return null;
  const ta = Math.max((-b - sq) / (2 * a), 0);
  const za = oz + dz * ta, zb = oz + dz * tb;
  if (za >= z0 && za <= z1) return ta;
  if (za > z1 && zb <= z1) return (z1 - oz) / dz;
  if (za < z0 && zb >= z0) return (z0 - oz) / dz;
  return null;
}
