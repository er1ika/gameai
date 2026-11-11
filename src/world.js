// Three.js-часть: кэш текстур, геометрия уровня, двери, небо, спрайты.
import * as THREE from 'three';
import { makeTextureCanvas, makeSky } from './textures.js';
import {
  makeMonsterFrames, makeItemSprite, makeFxFrames, makeLamp, makeTorch, makeExitSign,
} from './sprites.js';
import { DOOR_THICK } from './map.js';

const FIT_SIDE = new Set(['crate']); // текстура растягивается на всю высоту уступа
const SCROLLING = { slime: [0.03, 0.02], lava: [0.02, 0.035] };

export class Assets {
  constructor() {
    this.wall = new Map();
    this.sprites = new Map();
    this.monsters = new Map();
    this.fx = new Map();
    this.spriteGeo = new THREE.PlaneGeometry(1, 1);
    this.spriteGeo.translate(0, 0.5, 0); // точка привязки — ноги
    this.centerGeo = new THREE.PlaneGeometry(1, 1);
  }

  /** Тайловая текстура стены/пола. */
  texture(name) {
    let t = this.wall.get(name);
    if (!t) {
      t = new THREE.CanvasTexture(makeTextureCanvas(name));
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.magFilter = THREE.NearestFilter;
      t.minFilter = THREE.NearestMipmapLinearFilter;
      t.colorSpace = THREE.SRGBColorSpace;
      this.wall.set(name, t);
    }
    return t;
  }

  _spriteTex(canvas) {
    const t = new THREE.CanvasTexture(canvas);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    t.generateMipmaps = false;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }

  sprite(name) {
    let t = this.sprites.get(name);
    if (!t) {
      let c;
      if (name === 'lamp') c = makeLamp();
      else if (name === 'torch0') c = makeTorch(0);
      else if (name === 'torch1') c = makeTorch(1);
      else if (name === 'exit') c = makeExitSign();
      else c = makeItemSprite(name);
      t = this._spriteTex(c);
      this.sprites.set(name, t);
    }
    return t;
  }

  monsterFrames(type) {
    let f = this.monsters.get(type);
    if (!f) {
      const src = makeMonsterFrames(type);
      f = {};
      for (const k of Object.keys(src)) f[k] = src[k].map((c) => this._spriteTex(c));
      this.monsters.set(type, f);
    }
    return f;
  }

  fxFrames(kind) {
    let f = this.fx.get(kind);
    if (!f) {
      f = makeFxFrames(kind).map((c) => this._spriteTex(c));
      this.fx.set(kind, f);
    }
    return f;
  }

  /** Спрайт-«билборд». fullbright — не затеняется туманом и светом сектора. */
  makeSprite(tex, w, h, { fullbright = false, centered = false } = {}) {
    const mat = new THREE.MeshBasicMaterial({
      map: tex, alphaTest: 0.5, side: THREE.DoubleSide, fog: !fullbright,
    });
    const mesh = new THREE.Mesh(centered ? this.centerGeo : this.spriteGeo, mat);
    mesh.scale.set(w, h, 1);
    return mesh;
  }

  /** Прогреть все спрайты заранее, чтобы не было рывков в бою. */
  warmup() {
    for (const m of ['zombie', 'sergeant', 'imp', 'demon', 'baron']) this.monsterFrames(m);
    for (const f of ['puff', 'blood', 'explosion', 'fireball', 'plasma', 'rocket']) this.fxFrames(f);
  }
}

/** Свет сектора -> цвет вершины. */
export function lightColor(light) {
  return Math.pow(Math.max(0, Math.min(1.15, light)), 2);
}

/** Построить статическую геометрию уровня. Возвращает {group, animated, dispose}. */
export function buildLevel(map, assets) {
  const group = new THREE.Group();
  const buckets = new Map();
  const bucket = (tex) => {
    let b = buckets.get(tex);
    if (!b) { b = { pos: [], uv: [], col: [] }; buckets.set(tex, b); }
    return b;
  };
  // вершины задаются в координатах карты (x, y, высота z)
  const quad = (tex, p, uv, light) => {
    const b = bucket(tex);
    const l = lightColor(light);
    for (const i of [0, 1, 2, 0, 2, 3]) {
      b.pos.push(p[i][0], p[i][2], p[i][1]);
      b.uv.push(uv[i][0], uv[i][1]);
      b.col.push(l, l, l);
    }
  };

  const { w, h } = map;
  const dirs = [
    // dx, dy, край ячейки (x0,y0)-(x1,y1), вдоль какой оси идёт u, коэффициент света
    [1, 0, 1, 0, 1, 1, 'y', 0.8],
    [-1, 0, 0, 0, 0, 1, 'y', 0.8],
    [0, 1, 0, 1, 1, 1, 'x', 1],
    [0, -1, 0, 0, 1, 0, 'x', 1],
  ];

  for (let cy = 0; cy < h; cy++) {
    for (let cx = 0; cx < w; cx++) {
      const i = cy * w + cx;
      if (map.solid[i]) continue;
      const zone = map.zone[i];
      const f = map.floor[i], c = map.ceil[i];
      // пол
      quad(zone.ftex,
        [[cx, cy, f], [cx + 1, cy, f], [cx + 1, cy + 1, f], [cx, cy + 1, f]],
        [[cx, -cy], [cx + 1, -cy], [cx + 1, -cy - 1], [cx, -cy - 1]],
        zone.damage || zone.ftex === 'exitpad' ? 1.1 : zone.light);
      // потолок (нет у зон под открытым небом)
      if (zone.ctex) {
        quad(zone.ctex,
          [[cx, cy, c], [cx + 1, cy, c], [cx + 1, cy + 1, c], [cx, cy + 1, c]],
          [[cx, -cy], [cx + 1, -cy], [cx + 1, -cy - 1], [cx, -cy - 1]],
          zone.ctex === 'lightpanel' ? Math.max(zone.light, 0.95) : zone.light * 0.92);
      }
      // стены по четырём сторонам
      for (const [dx, dy, ax, ay, bx, by, uAxis, shade] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        const x0 = cx + ax, y0 = cy + ay, x1 = cx + bx, y1 = cy + by;
        const u0 = uAxis === 'x' ? x0 : y0, u1 = uAxis === 'x' ? x1 : y1;
        const light = zone.light * shade;
        const face = (tex, z0, z1, v0, v1) => {
          if (z1 - z0 < 1e-4) return;
          quad(tex,
            [[x0, y0, z0], [x1, y1, z0], [x1, y1, z1], [x0, y0, z1]],
            [[u0, v0], [u1, v0], [u1, v1], [u0, v1]],
            light);
        };
        if (map.isSolid(nx, ny)) {
          face(map.wallTex[ny * w + nx] || map.def.defaultWall, f, c, f, c);
          continue;
        }
        const j = ny * w + nx;
        const nz = map.zone[j];
        const nf = map.floor[j], nc = map.ceil[j];
        if (nf > f) {
          // уступ / ступенька / ящик
          const tex = nz.side || zone.side || 'metal';
          const top = Math.min(nf, c);
          if (FIT_SIDE.has(tex)) face(tex, f, top, 0, 1);
          else face(tex, f, top, 1 - (top - f), 1);
        }
        if (nc < c && (zone.ctex || nz.ctex)) {
          // перемычка над проёмом / фасад здания
          face(map.wallTex[j] || map.def.defaultWall, Math.max(nc, f), c, Math.max(nc, f), c);
        }
      }
    }
  }

  const animated = [];
  const materials = [];
  const geometries = [];
  for (const [tex, b] of buckets) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
    const mat = new THREE.MeshBasicMaterial({ map: assets.texture(tex), vertexColors: true, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.matrixAutoUpdate = false;
    group.add(mesh);
    materials.push(mat);
    geometries.push(geo);
    if (SCROLLING[tex]) animated.push({ tex: assets.texture(tex), speed: SCROLLING[tex] });
  }

  // двери
  const doorMeshes = [];
  for (const d of map.doorList) {
    const geo = d.axis === 'x'
      ? new THREE.BoxGeometry(1, d.h, DOOR_THICK)
      : new THREE.BoxGeometry(DOOR_THICK, d.h, 1);
    const l = lightColor(map.zone[d.i].light);
    const mat = new THREE.MeshBasicMaterial({
      map: assets.texture(d.key ? `door_${d.key}` : 'door'),
      color: new THREE.Color(l, l, l),
    });
    const mesh = new THREE.Mesh(geo, mat);
    group.add(mesh);
    materials.push(mat);
    geometries.push(geo);
    doorMeshes.push({ d, mesh, base: map.floor[d.i] + d.h / 2 });
  }

  const updateDoors = () => {
    for (const { d, mesh, base } of doorMeshes) {
      mesh.position.set(d.cx + 0.5, base + d.open * (d.h - 0.04), d.cy + 0.5);
    }
  };
  updateDoors();

  return {
    group,
    updateDoors,
    update(time) {
      for (const a of animated) a.tex.offset.set((time * a.speed[0]) % 1, (time * a.speed[1]) % 1);
    },
    dispose() {
      for (const m of materials) m.dispose();
      for (const g of geometries) g.dispose();
    },
  };
}

/** Небо: цилиндр с панорамой, который следует за камерой. */
export function buildSky(kind) {
  const { canvas, top } = makeSky(kind);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(2, 1);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.CylinderGeometry(120, 120, 110, 32, 1, true);
  const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.BackSide, fog: false, depthWrite: false });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return {
    mesh,
    topColor: new THREE.Color().setRGB(top[0] / 255, top[1] / 255, top[2] / 255, THREE.SRGBColorSpace),
    follow(camera) { mesh.position.set(camera.position.x, camera.position.y + 110 / 2 - 14, camera.position.z); },
    dispose() { geo.dispose(); mat.dispose(); tex.dispose(); },
  };
}
