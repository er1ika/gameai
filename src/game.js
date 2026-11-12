// Симуляция: уровень, сущности, стрельба, взрывы, камера.
import * as THREE from 'three';
import { GameMap, rayCylinder } from './map.js';
import { LEVELS } from './levels.js';
import { Assets, buildLevel, buildSky } from './world.js';
import { Player, PLAYER_R, PLAYER_H } from './player.js';
import { Enemy, Projectile, Barrel, Pickup, Fx, ENEMY_DEFS } from './entities.js';

export const DIFFICULTIES = {
  easy: { name: 'Легко', dmg: 0.5, hp: 0.8, cd: 1.3 },
  normal: { name: 'Нормально', dmg: 1, hp: 1, cd: 1 },
  hard: { name: 'Кошмар', dmg: 1.7, hp: 1.25, cd: 0.7 },
};

const FOV = 64;

export class Game {
  constructor(renderer, sound) {
    this.renderer = renderer;
    this.sound = sound;
    this.assets = new Assets();
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.05, 400);
    this.camera.rotation.order = 'YXZ';
    this.player = new Player();
    this.difficulty = DIFFICULTIES.normal;
    this.levelIndex = 0;
    this.map = null;
    this.level = null;
    this.sky = null;
    this.sprites = new THREE.Group();
    this.scene.add(this.sprites);
    this.enemies = [];
    this.barrels = [];
    this.pickups = [];
    this.projectiles = [];
    this.fx = [];
    this.decor = [];
    this.messages = [];
    this.time = 0;
    this.onExit = () => {};
    this.onDeath = () => {};
    this.assets.warmup();
  }

  get levelCount() { return LEVELS.length; }

  // ---------------------------------------------------------------- уровень

  loadLevel(index) {
    this._unload();
    this.levelIndex = index;
    const def = LEVELS[index];
    const map = (this.map = new GameMap(def));
    this.level = buildLevel(map, this.assets);
    this.scene.add(this.level.group);
    this.sky = buildSky(def.sky);
    this.scene.add(this.sky.mesh);
    this.scene.background = this.sky.topColor;
    this.scene.fog = new THREE.Fog(def.fog.color, def.fog.near, def.fog.far);

    this.kills = 0;
    this.items = 0;
    this.totalKills = 0;
    this.totalItems = 0;
    this.levelTime = 0;
    this.finished = false;
    this.boss = null;
    this.bossDead = !def.boss;
    this.exitCell = null;
    this.exitWarnT = 0;
    this.alertT = 0;
    this.sightT = 0;
    this.fieldT = 0;
    this.seenT = 0;
    this.torchT = 0;
    this.messages.length = 0;

    for (const t of map.things) {
      if (ENEMY_DEFS[t.type]) {
        const e = new Enemy(this, t.type, t.x, t.y);
        this.enemies.push(e);
        this.totalKills++;
        if (e.def.boss) this.boss = e;
      } else if (t.type === 'barrel') {
        this.barrels.push(new Barrel(this, t.x, t.y));
      } else if (t.type === 'exit') {
        this.exitCell = { cx: Math.floor(t.x), cy: Math.floor(t.y) };
        const sign = this.assets.makeSprite(this.assets.sprite('exit'), 0.8, 0.25, { fullbright: true });
        sign.position.set(t.x, map.floorAt(t.x, t.y) + 1.05, t.y);
        this.addSprite(sign);
        this.decor.push({ mesh: sign });
      } else if (t.type === 'lamp' || t.type === 'torch') {
        const torch = t.type === 'torch';
        const mesh = this.assets.makeSprite(this.assets.sprite(torch ? 'torch0' : 'lamp'), 0.25, 1, { fullbright: true });
        mesh.position.set(t.x, map.floorAt(t.x, t.y), t.y);
        this.addSprite(mesh);
        this.decor.push({ mesh, torch, phase: Math.random() * 2 });
      } else {
        this.pickups.push(new Pickup(this, t.type, t.x, t.y));
        if (!t.type.startsWith('key_')) this.totalItems++;
      }
    }

    this.player.spawn(map);
    this.snapshot = this.player.snapshot();
    map.computeDistField(this.player.x, this.player.y);
    this._markSeen();
    this.message(def.name);
    this.updateCamera(0);
  }

  restartLevel() {
    this.player.restore(this.snapshot);
    this.player.hp = Math.max(this.player.hp, 1);
    this.loadLevel(this.levelIndex);
  }

  _unload() {
    for (const list of [this.enemies, this.barrels, this.pickups, this.projectiles, this.fx]) {
      for (const e of list) e.dispose();
      list.length = 0;
    }
    for (const d of this.decor) d.mesh.material.dispose();
    this.decor.length = 0;
    this.sprites.clear();
    if (this.level) { this.scene.remove(this.level.group); this.level.dispose(); this.level = null; }
    if (this.sky) { this.scene.remove(this.sky.mesh); this.sky.dispose(); this.sky = null; }
  }

  addSprite(mesh) {
    this.sprites.add(mesh);
  }

  // ---------------------------------------------------------------- сервисы для сущностей

  message(text) {
    this.messages.push({ text, t: 0 });
    if (this.messages.length > 4) this.messages.shift();
  }

  /** Звук в точке карты: громкость по расстоянию, панорама по направлению. */
  playAt(name, x, y, vol = 1) {
    const p = this.player;
    const d = Math.hypot(x - p.x, y - p.y);
    const v = vol * Math.pow(Math.max(0, 1 - d / 24), 1.4);
    if (v <= 0.01) return;
    const rel = Math.atan2(y - p.y, x - p.x) - p.yaw;
    this.sound.play(name, v, d < 0.5 ? 0 : Math.sin(rel) * 0.8);
  }

  sightSound(e) {
    if (this.sightT > 0) return;
    this.sightT = 0.25;
    this.playAt(e.def.sight, e.x, e.y, 1);
  }

  /** Мешает ли кто-то телу встать в точку (монстры, игрок, бочки). */
  bodyBlocks(self, nx, ny, r, ghost = false) {
    const check = (o, or) => {
      const rr = r + or;
      const dn = (nx - o.x) ** 2 + (ny - o.y) ** 2;
      if (dn >= rr * rr) return false;
      return dn < (self.x - o.x) ** 2 + (self.y - o.y) ** 2; // отходить всегда можно
    };
    const p = this.player;
    if (self !== p && !p.dead && Math.abs(p.z - self.z) < 1 && check(p, PLAYER_R)) return true;
    if (!ghost) {
      for (const e of this.enemies) {
        if (e === self || !e.alive) continue;
        if (Math.abs(e.z - self.z) < 1 && check(e, e.radius)) return true;
      }
    }
    for (const b of this.barrels) if (b.alive && check(b, b.radius)) return true;
    return false;
  }

  /** Вертикальное автонаведение, как в Doom: возвращает угол возвышения. */
  autoAim(x, y, eyeZ, yaw, pitch, range) {
    const dx = Math.cos(yaw), dy = Math.sin(yaw);
    let best = null, bestT = range;
    const test = (o) => {
      const t = rayCylinder(x, y, 0, dx, dy, 0, o.x, o.y, o.radius * 1.1, -1, 1);
      if (t === null || t >= bestT) return;
      if (!this.map.los(x, y, eyeZ, o.x, o.y, o.z + o.height * 0.6)) return;
      best = o; bestT = t;
    };
    for (const e of this.enemies) if (e.alive) test(e);
    for (const b of this.barrels) if (b.alive) test(b);
    if (!best) return pitch;
    const zAt = eyeZ + Math.tan(pitch) * bestT;
    if (zAt > best.z + 0.05 && zAt < best.z + best.height - 0.05) return pitch;
    const want = Math.atan2(best.z + best.height * 0.55 - eyeZ, Math.max(0.2, bestT));
    return Math.abs(want - pitch) < 0.7 ? want : pitch;
  }

  /** Мгновенный выстрел. Возвращает поражённую цель или null. */
  hitscan(ox, oy, oz, dx, dy, dz, range, dmg, shooter, melee) {
    const wall = this.map.raycast(ox, oy, oz, dx, dy, dz, range);
    let bestT = wall.t, target = null;
    const test = (o) => {
      const t = rayCylinder(ox, oy, oz, dx, dy, dz, o.x, o.y, o.radius, o.z, o.z + o.height);
      if (t !== null && t < bestT) { bestT = t; target = o; }
    };
    for (const e of this.enemies) if (e.alive && e !== shooter) test(e);
    for (const b of this.barrels) if (b.alive) test(b);
    const hx = ox + dx * bestT, hy = oy + dy * bestT, hz = oz + dz * bestT;
    if (target) {
      if (dmg > 0) {
        const isEnemy = target instanceof Enemy;
        this.spawnFx(isEnemy ? 'blood' : 'puff', hx - dx * 0.05, hy - dy * 0.05, hz, 0.34, { fps: 14, rise: isEnemy ? -0.3 : 0.3 });
        target.damage(dmg, shooter);
      }
      return target;
    }
    if (wall.hit && wall.type !== 'sky' && !melee) {
      this.spawnFx('puff', hx - dx * 0.06, hy - dy * 0.06, hz - dz * 0.06, 0.3, { fps: 14, rise: 0.35 });
    }
    return melee && wall.hit ? wall : null;
  }

  spawnFx(kind, x, y, z, size, opts) {
    if (this.fx.length > 120) return;
    this.fx.push(new Fx(this, kind, x, y, z, size, opts));
  }

  spawnProjectile(kind, x, y, z, dx, dy, dz, owner, dmg = 0, speed = 0) {
    this.projectiles.push(new Projectile(this, kind, x, y, z, dx, dy, dz, owner, dmg, speed));
  }

  spawnPickup(type, x, y, dropped) {
    this.pickups.push(new Pickup(this, type, x + (Math.random() - 0.5) * 0.2, y + (Math.random() - 0.5) * 0.2, dropped));
  }

  /** Взрыв с уроном по площади. */
  explode(x, y, z, radius, maxDmg, owner) {
    this.spawnFx('explosion', x, y, Math.max(z, this.map.floorAt(x, y) + radius * 0.35), radius * 1.15, { fps: 15 });
    this.playAt('explosion', x, y, 1.2);
    const p = this.player;
    const splash = (o, cz, h) => {
      const d = Math.hypot(o.x - x, o.y - y, cz - z) - (o.radius || PLAYER_R);
      if (d >= radius) return 0;
      if (!this.map.los(x, y, z + 0.05, o.x, o.y, cz) && !this.map.los(x, y, z + 0.05, o.x, o.y, o.z + h * 0.9)) return 0;
      return maxDmg * (1 - Math.max(0, d) / radius);
    };
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const dmg = splash(e, e.z + e.height * 0.5, e.height);
      if (dmg > 0) e.damage(dmg, owner);
    }
    for (const b of this.barrels) {
      if (!b.alive) continue;
      const dmg = splash(b, b.z + 0.3, b.height);
      if (dmg > 0) b.damage(dmg);
    }
    if (!p.dead) {
      const dmg = splash(p, p.z + 0.5, PLAYER_H);
      if (dmg > 0) p.hurt(dmg * (owner === p ? 0.55 : 0.8), this, owner);
    }
    this.alert();
  }

  /** Шум: будит монстров, до которых «долетает» звук (закрытые двери глушат). */
  alert() {
    if (this.alertT > 0) return;
    this.alertT = 0.3;
    const p = this.player;
    const heard = this.map.flood(p.x, p.y, { maxDepth: 16 });
    for (const e of this.enemies) {
      if (!e.alive || e.state !== 'idle') continue;
      if (heard[Math.floor(e.y) * this.map.w + Math.floor(e.x)] !== 65535) e.wake();
    }
  }

  onPlayerDeath() {
    this.message('Вы погибли');
    this.onDeath();
  }

  onBossDeath(e) {
    this.bossDead = true;
    this.message(`${e.def.name} повержен! Выход открыт`);
    this.sound.play('exit', 0.8);
  }

  _markSeen() {
    const p = this.player, map = this.map;
    const near = map.flood(p.x, p.y, { maxDepth: 7 });
    for (let i = 0; i < near.length; i++) if (near[i] !== 65535) map.seen[i] = 1;
  }

  // ---------------------------------------------------------------- кадр

  update(dt, input) {
    const map = this.map, p = this.player;
    this.time += dt;
    if (!p.dead && !this.finished) this.levelTime += dt;
    this.alertT -= dt;
    this.sightT -= dt;

    p.update(dt, input, this);

    const closing = map.updateDoors(dt, (d) => {
      const inCell = (o, r) => o.x + r > d.cx && o.x - r < d.cx + 1 && o.y + r > d.cy && o.y - r < d.cy + 1;
      if (inCell(p, PLAYER_R)) return true;
      for (const e of this.enemies) if (e.alive && inCell(e, e.radius)) return true;
      return false;
    });
    for (const d of closing) this.playAt('door', d.cx + 0.5, d.cy + 0.5, 0.8);
    this.level.updateDoors();

    this.fieldT -= dt;
    if (this.fieldT <= 0) { this.fieldT = 0.25; map.computeDistField(p.x, p.y); }
    this.seenT -= dt;
    if (this.seenT <= 0) { this.seenT = 0.3; this._markSeen(); }

    for (const e of this.enemies) e.update(dt);
    for (const b of this.barrels) b.update(dt);
    for (const pr of this.projectiles) if (pr.alive) pr.update(dt);
    for (const f of this.fx) f.update(dt);
    for (const pk of this.pickups) if (pk.alive) pk.update();
    this._sweep(this.projectiles);
    this._sweep(this.fx);
    this._sweep(this.pickups);

    for (const m of this.messages) m.t += dt;
    while (this.messages.length && this.messages[0].t > 4) this.messages.shift();

    // выход
    if (this.exitCell && !this.finished && !p.dead) {
      this.exitWarnT -= dt;
      if (Math.floor(p.x) === this.exitCell.cx && Math.floor(p.y) === this.exitCell.cy) {
        if (this.bossDead) {
          this.finished = true;
          this.sound.play('exit', 0.9);
          this.onExit();
        } else if (this.exitWarnT <= 0) {
          this.exitWarnT = 3;
          this.message('Выход запечатан — убей Барона Ада!');
          this.sound.play('locked', 0.8);
        }
      }
    }
    this.animate(dt);
  }

  /** Анимации окружения (идут и в меню). */
  animate(dt) {
    this.torchT += dt;
    this.level.update(this.torchT);
    const frame = Math.floor(this.torchT * 9);
    for (const d of this.decor) {
      if (d.torch) d.mesh.material.map = this.assets.sprite((frame + Math.floor(d.phase)) % 2 ? 'torch1' : 'torch0');
    }
  }

  _sweep(list) {
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.alive) list[n++] = e;
      else { this.sprites.remove(e.mesh); e.dispose(); }
    }
    list.length = n;
  }

  updateCamera(extraYaw = 0) {
    const p = this.player, cam = this.camera;
    cam.position.set(p.x, p.eyeZ, p.y);
    const yaw = p.yaw + extraYaw;
    const rotY = Math.atan2(-Math.cos(yaw), -Math.sin(yaw));
    cam.rotation.set(p.pitch + p.kick, rotY, p.dead ? Math.min(0.5, p.deadT * 1.2) : 0);
    // все спрайты повёрнуты к камере (цилиндрические билборды)
    for (const m of this.sprites.children) m.rotation.y = rotY;
    this.sky.follow(cam);
  }

  resize(w, h) {
    const aspect = w / h;
    this.camera.aspect = aspect;
    // на узких экранах сохраняем горизонтальный обзор
    const t = Math.tan((FOV * Math.PI) / 360);
    this.camera.fov = aspect < 16 / 9 ? Math.min(95, (2 * Math.atan((t * (16 / 9)) / aspect) * 180) / Math.PI) : FOV;
    this.camera.updateProjectionMatrix();
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }
}

