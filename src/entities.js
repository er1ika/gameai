// Монстры, снаряды, предметы, бочки и эффекты.
import { STEP_UP, MAX_DROP, rayCylinder } from './map.js';
import { lightColor } from './world.js';
import { PLAYER_R, PLAYER_H, MAX_AMMO } from './player.js';

const rand = (a, b) => a + Math.random() * (b - a);
const GRAVITY = 20;

export const ENEMY_DEFS = {
  zombie: {
    name: 'Зомби', hp: 25, speed: 1.5, radius: 0.27, height: 0.95, size: [1, 1], pain: 0.8,
    ranged: 'hitscan', pellets: 1, dmg: [3, 12], cooldown: [1.6, 3.4], shotSound: 'pistol',
    drop: 'clip', sight: 'sight_zombie', death: 'death_enemy',
  },
  sergeant: {
    name: 'Сержант', hp: 35, speed: 1.6, radius: 0.27, height: 0.95, size: [1, 1], pain: 0.7,
    ranged: 'hitscan', pellets: 3, dmg: [3, 9], cooldown: [2, 3.8], shotSound: 'shotgun',
    drop: 'shells', sight: 'sight_zombie', death: 'death_enemy',
  },
  imp: {
    name: 'Имп', hp: 60, speed: 2, radius: 0.27, height: 0.95, size: [1, 1], pain: 0.55,
    ranged: 'projectile', proj: 'fireball', projSpeed: 7.5, dmg: [8, 20], cooldown: [1.4, 3],
    melee: [6, 18], sight: 'sight_imp', death: 'death_enemy',
  },
  demon: {
    name: 'Демон', hp: 150, speed: 3.4, radius: 0.36, height: 0.95, size: [1.15, 1.15], pain: 0.45,
    melee: [10, 28], sight: 'sight_demon', death: 'death_demon',
  },
  baron: {
    name: 'Барон Ада', hp: 900, speed: 2.1, radius: 0.42, height: 1.5, size: [1.7, 1.7], pain: 0.07,
    ranged: 'projectile', proj: 'plasma', projSpeed: 9.5, dmg: [14, 30], cooldown: [0.9, 2], volley: 3,
    melee: [18, 40], sight: 'sight_baron', death: 'death_demon', boss: true,
  },
};

export class Enemy {
  constructor(game, type, x, y) {
    this.game = game;
    this.type = type;
    this.def = ENEMY_DEFS[type];
    this.radius = this.def.radius;
    this.height = this.def.height;
    this.x = x;
    this.y = y;
    this.z = game.map.groundZ(x, y, this.radius);
    this.vz = 0;
    this.maxHp = Math.round(this.def.hp * game.difficulty.hp);
    this.hp = this.maxHp;
    this.alive = true;
    this.state = 'idle';
    this.stateT = 0;
    this.animT = Math.random();
    this.thinkT = Math.random() * 0.2;
    this.attackCd = rand(0.4, 1.5);
    this.canSee = false;
    this.direct = false;
    this.dodgeT = 0;
    this.stuckT = 0;
    this.ghostT = 0; // застряли в толпе — ненадолго проходим сквозь других монстров
    this.dodgeX = 0;
    this.dodgeY = 0;
    this.fired = false;
    this.meleeAttack = false;
    this.frames = game.assets.monsterFrames(type);
    this.mesh = game.assets.makeSprite(this.frames.walk[0], this.def.size[0], this.def.size[1]);
    game.addSprite(this.mesh);
    this._place();
  }

  _place() {
    this.mesh.position.set(this.x, this.z, this.y);
    const l = lightColor(this.game.map.lightAt(this.x, this.y));
    const flash = this.state === 'pain' ? 0.35 : 0;
    this.mesh.material.color.setRGB(Math.min(1, l + flash), l, l);
  }

  _frame(tex) {
    if (this.mesh.material.map !== tex) this.mesh.material.map = tex;
  }

  wake(silent = false) {
    if (!this.alive || this.state !== 'idle') return;
    this.state = 'chase';
    this.attackCd = rand(0.7, 1.8);
    if (!silent) this.game.sightSound(this);
  }

  damage(amount, source) {
    if (!this.alive) return;
    this.hp -= amount;
    if (this.hp <= 0) { this.die(); return; }
    if (this.state === 'idle') this.wake(true);
    if (Math.random() < this.def.pain) {
      this.state = 'pain';
      this.stateT = 0;
      this.game.playAt('pain_enemy', this.x, this.y, 0.7);
    }
  }

  die() {
    const g = this.game;
    this.alive = false;
    this.state = 'dead';
    this.stateT = 0;
    this.hp = 0;
    g.kills++;
    g.playAt(this.def.death, this.x, this.y, 1);
    if (this.def.drop) g.spawnPickup(this.def.drop, this.x, this.y, true);
    if (this.def.boss) g.onBossDeath(this);
  }

  _blocked(nx, ny) {
    return this.game.bodyBlocks(this, nx, ny, this.radius, this.ghostT > 0);
  }

  update(dt) {
    const g = this.game, map = g.map, p = g.player, def = this.def;

    // падение с уступов
    const ground = map.groundZ(this.x, this.y, this.radius);
    if (this.z > ground + 1e-4) {
      this.vz -= GRAVITY * dt;
      this.z = Math.max(ground, this.z + this.vz * dt);
    } else { this.z = ground; this.vz = 0; }

    if (!this.alive) {
      this.stateT += dt;
      this._frame(this.frames.die[Math.min(2, Math.floor(this.stateT / 0.13))]);
      this._place();
      return;
    }

    const dx = p.x - this.x, dy = p.y - this.y;
    const dist = Math.hypot(dx, dy);

    this.thinkT -= dt;
    if (this.thinkT <= 0) {
      this.thinkT = 0.14;
      this.canSee = !p.dead && dist < 26 && map.los(this.x, this.y, this.z + this.height * 0.8, p.x, p.y, p.z + 0.6);
      this.direct = this.canSee && dist < 10 && map.walkLine(this.x, this.y, p.x, p.y, this.radius, this.height);
      if (this.state === 'idle' && this.canSee && dist < 22) this.wake();
    }

    switch (this.state) {
      case 'idle':
        this._frame(this.frames.walk[0]);
        break;

      case 'pain':
        this.stateT += dt;
        this._frame(this.frames.pain[0]);
        if (this.stateT > 0.22) { this.state = 'chase'; this.attackCd = Math.min(this.attackCd, 0.5); }
        break;

      case 'attack': {
        this.stateT += dt;
        const windup = this.meleeAttack ? 0.22 : 0.32;
        const fr = this.frames.attack;
        this._frame(this.stateT < windup ? fr[0] : fr[fr.length - 1]);
        if (!this.fired && this.stateT >= windup) { this.fired = true; this._strike(dist); }
        if (this.stateT > windup + 0.28) {
          this.state = 'chase';
          this.attackCd = def.cooldown ? rand(def.cooldown[0], def.cooldown[1]) * g.difficulty.cd : 0.2;
        }
        break;
      }

      case 'chase': {
        if (p.dead) { this._frame(this.frames.walk[0]); break; }
        this.attackCd -= dt;
        this.animT += dt * def.speed * 1.5;
        this._frame(this.frames.walk[Math.floor(this.animT) % 2]);
        const reach = this.radius + PLAYER_R + 0.42;
        if (def.melee && dist < reach && Math.abs(p.z - this.z) < 0.9) {
          this._startAttack(true);
          break;
        }
        if (def.ranged && this.canSee && this.attackCd <= 0) {
          this._startAttack(false);
          break;
        }
        // куда идти
        let tx = null, ty = null;
        if (this.direct) { tx = p.x; ty = p.y; }
        else {
          const n = map.nextCell(this.x, this.y);
          if (n) {
            tx = n.cx + 0.5; ty = n.cy + 0.5;
            // узкий проход: сначала выравниваемся по его оси, потом заходим
            const cx = Math.floor(this.x), cy = Math.floor(this.y);
            const slack = 0.5 - this.radius - 0.03;
            if (n.cy === cy && n.cx !== cx && Math.abs(this.y - ty) > slack
              && map.blocked(tx, this.y, this.radius, this.z, this.height, STEP_UP, MAX_DROP)) tx = this.x;
            else if (n.cx === cx && n.cy !== cy && Math.abs(this.x - tx) > slack
              && map.blocked(this.x, ty, this.radius, this.z, this.height, STEP_UP, MAX_DROP)) ty = this.y;
            const door = map.doorAt(n.cx, n.cy);
            if (door && (door.state === 'closed' || door.state === 'closing')) {
              if (map.openDoor(door, null) === 'ok') g.playAt('door', door.cx + 0.5, door.cy + 0.5, 1);
            }
          } else if (this.canSee && dist > reach) { tx = p.x; ty = p.y; }
        }
        if (tx === null) break;
        let mx = tx - this.x, my = ty - this.y;
        const ml = Math.hypot(mx, my);
        if (ml < 0.02) break;
        mx /= ml; my /= ml;
        if (this.dodgeT > 0) {
          this.dodgeT -= dt;
          mx = this.dodgeX; my = this.dodgeY;
        }
        const step = Math.min(def.speed * dt, ml);
        const ox = this.x, oy = this.y;
        map.move(this, mx * step, my * step, this.radius, this.height, STEP_UP, MAX_DROP, (nx, ny) => this._blocked(nx, ny));
        const done = Math.hypot(this.x - ox, this.y - oy);
        this.ghostT -= dt;
        if (done < step * 0.35) {
          this.stuckT += dt;
          if (this.stuckT > 0.9) { this.stuckT = 0; this.ghostT = 1.2; }
        } else this.stuckT = Math.max(0, this.stuckT - dt * 2);
        if (done < step * 0.35 && this.dodgeT <= 0) {
          // упёрлись — обходим боком
          const s = Math.random() < 0.5 ? 1 : -1;
          this.dodgeX = -my * s * 0.85 + mx * 0.3;
          this.dodgeY = mx * s * 0.85 + my * 0.3;
          this.dodgeT = rand(0.25, 0.6);
        }
        break;
      }
      default:
    }
    this._place();
  }

  _startAttack(melee) {
    this.state = 'attack';
    this.stateT = 0;
    this.fired = false;
    this.meleeAttack = melee;
  }

  _strike(dist) {
    const g = this.game, p = g.player, def = this.def;
    if (p.dead) return;
    if (this.meleeAttack) {
      if (dist < this.radius + PLAYER_R + 0.7) {
        p.hurt(rand(def.melee[0], def.melee[1]), g, this);
        g.playAt('punch', this.x, this.y, 1);
      }
      return;
    }
    const ez = this.z + this.height * 0.62;
    if (def.ranged === 'hitscan') {
      g.playAt(def.shotSound, this.x, this.y, 0.9);
      if (!g.map.los(this.x, this.y, ez, p.x, p.y, p.z + 0.5)) return;
      const chance = Math.max(0.12, Math.min(0.62, 0.9 - dist / 14));
      let total = 0;
      for (let i = 0; i < def.pellets; i++) if (Math.random() < chance) total += rand(def.dmg[0], def.dmg[1]);
      if (total > 0) p.hurt(total, g, this);
      else {
        // промах — пуля бьёт в стену рядом с игроком
        const a = Math.atan2(p.y - this.y, p.x - this.x) + (Math.random() < 0.5 ? 1 : -1) * rand(0.06, 0.16);
        g.hitscan(this.x, this.y, ez, Math.cos(a), Math.sin(a), 0, 40, 0, this, false);
      }
      return;
    }
    // снаряд
    g.playAt(def.proj, this.x, this.y, 0.9);
    const tz = p.z + 0.5;
    const base = Math.atan2(p.y - this.y, p.x - this.x);
    const n = def.volley || 1;
    for (let i = 0; i < n; i++) {
      const a = base + (n > 1 ? (i - (n - 1) / 2) * 0.17 : 0);
      const dxy = Math.max(0.3, dist);
      let vx = Math.cos(a) * dxy, vy = Math.sin(a) * dxy, vz = tz - ez;
      const l = Math.hypot(vx, vy, vz);
      vx /= l; vy /= l; vz /= l;
      g.spawnProjectile(def.proj, this.x + vx * 0.35, this.y + vy * 0.35, ez, vx, vy, vz, this, rand(def.dmg[0], def.dmg[1]), def.projSpeed);
    }
  }

  dispose() {
    this.mesh.material.dispose();
  }
}

// ---------------------------------------------------------------- снаряды

const PROJ = {
  fireball: { size: 0.42, radius: 0.1, boom: 0.7, sound: 'fireball' },
  plasma: { size: 0.5, radius: 0.12, boom: 0.9, sound: 'fireball' },
  rocket: { size: 0.3, radius: 0.08, speed: 17, splash: 2.4, splashDmg: 115, direct: [40, 80], boom: 2.6 },
};

export class Projectile {
  constructor(game, kind, x, y, z, dx, dy, dz, owner, dmg, speed) {
    this.game = game;
    this.kind = kind;
    this.def = PROJ[kind];
    this.x = x; this.y = y; this.z = z;
    this.dx = dx; this.dy = dy; this.dz = dz;
    this.owner = owner;
    this.dmg = dmg;
    this.speed = speed || this.def.speed;
    this.alive = true;
    this.life = 6;
    this.t = Math.random();
    this.frames = game.assets.fxFrames(kind);
    this.mesh = game.assets.makeSprite(this.frames[0], this.def.size, this.def.size, { fullbright: true, centered: true });
    this.mesh.position.set(x, z, y);
    game.addSprite(this.mesh);
  }

  update(dt) {
    const g = this.game, map = g.map;
    this.life -= dt;
    this.t += dt * 12;
    this.mesh.material.map = this.frames[Math.floor(this.t) % this.frames.length];
    const step = this.speed * dt;
    const wall = map.raycast(this.x, this.y, this.z, this.dx, this.dy, this.dz, step + this.def.radius);
    let bestT = wall.hit ? Math.max(0, wall.t - this.def.radius) : step;
    let victim = null;
    const fromPlayer = this.owner === g.player;
    const test = (e, r, z0, z1) => {
      const t = rayCylinder(this.x, this.y, this.z, this.dx, this.dy, this.dz, e.x, e.y, r + this.def.radius, z0 - this.def.radius, z1 + this.def.radius);
      if (t !== null && t <= bestT) { bestT = t; victim = e; }
    };
    if (fromPlayer) {
      for (const e of g.enemies) if (e.alive) test(e, e.radius, e.z, e.z + e.height);
    } else if (!g.player.dead) {
      test(g.player, PLAYER_R, g.player.z, g.player.z + PLAYER_H);
    }
    for (const b of g.barrels) if (b.alive) test(b, b.radius, b.z, b.z + b.height);

    this.x += this.dx * bestT; this.y += this.dy * bestT; this.z += this.dz * bestT;
    this.mesh.position.set(this.x, this.z, this.y);

    if (victim || wall.hit || this.life <= 0) {
      this.alive = false;
      if (!victim && wall.hit && wall.type === 'sky') return; // улетел в небо
      if (victim) {
        if (victim === g.player) victim.hurt(this.dmg, g, this.owner);
        else victim.damage(this.kind === 'rocket' ? rand(this.def.direct[0], this.def.direct[1]) : this.dmg, this.owner);
      }
      if (this.def.splash) g.explode(this.x, this.y, this.z, this.def.splash, this.def.splashDmg, this.owner);
      else {
        g.spawnFx('explosion', this.x, this.y, this.z, this.def.boom, { fps: 20 });
        g.playAt('punch', this.x, this.y, 0.6);
      }
    } else if (this.kind === 'rocket' && Math.random() < dt * 40) {
      g.spawnFx('puff', this.x - this.dx * 0.2, this.y - this.dy * 0.2, this.z - this.dz * 0.2, 0.3, { fps: 14 });
    }
  }

  dispose() {
    this.mesh.material.dispose();
  }
}

// ---------------------------------------------------------------- бочки

export class Barrel {
  constructor(game, x, y) {
    this.game = game;
    this.x = x; this.y = y;
    this.radius = 0.24;
    this.height = 0.62;
    this.z = game.map.groundZ(x, y, this.radius);
    this.hp = 20;
    this.alive = true;
    this.fuse = -1;
    this.mesh = game.assets.makeSprite(game.assets.sprite('barrel'), 0.72, 0.72);
    this.mesh.position.set(x, this.z, y);
    const l = Math.max(0.5, lightColor(game.map.lightAt(x, y)));
    this.mesh.material.color.setRGB(l, l, l);
    game.addSprite(this.mesh);
  }

  damage(amount) {
    if (!this.alive || this.fuse >= 0) return;
    this.hp -= amount;
    if (this.hp <= 0) this.fuse = rand(0.05, 0.16);
  }

  update(dt) {
    if (this.fuse < 0) return;
    this.fuse -= dt;
    if (this.fuse <= 0) {
      this.alive = false;
      this.mesh.visible = false;
      this.game.explode(this.x, this.y, this.z + 0.3, 2.3, 95, null);
    }
  }

  dispose() {
    this.mesh.material.dispose();
  }
}

// ---------------------------------------------------------------- предметы

const KEY_NAMES = { key_red: 'красный', key_blue: 'синий', key_yellow: 'жёлтый' };

/** Эффекты подбора. Возвращает сообщение или null, если предмет не нужен. */
function applyPickup(type, p, dropped) {
  const addAmmo = (kind, n) => {
    if (p.ammo[kind] >= MAX_AMMO[kind]) return false;
    p.ammo[kind] = Math.min(MAX_AMMO[kind], p.ammo[kind] + n);
    return true;
  };
  const weapon = (name, title, kind, n) => {
    const had = p.weapons[name];
    const got = addAmmo(kind, n);
    if (had && !got) return null;
    p.weapons[name] = true;
    if (!had) { p.selectWeapon(name); p.grinT = 1.5; return `Получен ${title}!`; }
    return `Патроны (${title})`;
  };
  switch (type) {
    case 'stim':
      if (p.hp >= 100) return null;
      p.hp = Math.min(100, p.hp + 10); return 'Стимулятор +10';
    case 'medkit':
      if (p.hp >= 100) return null;
      p.hp = Math.min(100, p.hp + 25); return 'Аптечка +25';
    case 'soul':
      p.hp = Math.min(200, p.hp + 100); return 'Сфера душ! +100';
    case 'armor':
      if (p.armor >= 100) return null;
      p.armor = 100; return 'Бронежилет';
    case 'megaarmor':
      if (p.armor >= 200) return null;
      p.armor = 200; return 'Мегаброня!';
    case 'clip':
      return addAmmo('bullets', dropped ? 5 : 10) ? 'Обойма' : null;
    case 'shells':
      return addAmmo('shells', 4) ? 'Патроны для дробовика' : null;
    case 'rockets':
      return addAmmo('rockets', 3) ? 'Ракеты' : null;
    case 'shotgun': return weapon('shotgun', 'дробовик', 'shells', 8);
    case 'chaingun': return weapon('chaingun', 'пулемёт', 'bullets', 20);
    case 'launcher': return weapon('launcher', 'ракетница', 'rockets', 2);
    case 'key_red': case 'key_blue': case 'key_yellow':
      p.keys[type.slice(4)] = true;
      return `Подобран ${KEY_NAMES[type]} ключ`;
    default:
      return null;
  }
}

const PICKUP_SOUND = {
  shotgun: 'weapon', chaingun: 'weapon', launcher: 'weapon',
  key_red: 'key', key_blue: 'key', key_yellow: 'key', soul: 'power', megaarmor: 'power',
};
const BRIGHT = new Set(['key_red', 'key_blue', 'key_yellow', 'soul']);

export class Pickup {
  constructor(game, type, x, y, dropped = false) {
    this.game = game;
    this.type = type;
    this.x = x; this.y = y;
    this.z = game.map.groundZ(x, y, 0.1);
    this.dropped = dropped;
    this.alive = true;
    const big = type === 'shotgun' || type === 'chaingun' || type === 'launcher';
    const size = big ? 0.8 : 0.56;
    this.mesh = game.assets.makeSprite(game.assets.sprite(type), size, size, { fullbright: BRIGHT.has(type) });
    this.mesh.position.set(x, this.z, y);
    if (!BRIGHT.has(type)) {
      const l = Math.max(0.55, lightColor(game.map.lightAt(x, y)));
      this.mesh.material.color.setRGB(l, l, l);
    }
    game.addSprite(this.mesh);
  }

  update() {
    const p = this.game.player;
    if (p.dead) return;
    const dx = p.x - this.x, dy = p.y - this.y;
    if (dx * dx + dy * dy > 0.3 || Math.abs(p.z - this.z) > 0.7) return;
    const msg = applyPickup(this.type, p, this.dropped);
    if (!msg) return;
    this.alive = false;
    this.mesh.visible = false;
    p.bonusFlash = 0.35;
    if (!this.dropped) this.game.items++;
    this.game.message(msg);
    this.game.sound.play(PICKUP_SOUND[this.type] || 'item', 0.7);
  }

  dispose() {
    this.mesh.material.dispose();
  }
}

// ---------------------------------------------------------------- одноразовые эффекты

export class Fx {
  constructor(game, kind, x, y, z, size, { fps = 16, rise = 0 } = {}) {
    this.game = game;
    this.frames = game.assets.fxFrames(kind);
    this.t = 0;
    this.fps = fps;
    this.rise = rise;
    this.alive = true;
    this.mesh = game.assets.makeSprite(this.frames[0], size, size, { fullbright: kind === 'explosion', centered: true });
    this.mesh.position.set(x, z, y);
    game.addSprite(this.mesh);
  }

  update(dt) {
    this.t += dt * this.fps;
    const i = Math.floor(this.t);
    if (i >= this.frames.length) { this.alive = false; return; }
    this.mesh.material.map = this.frames[i];
    this.mesh.position.y += this.rise * dt;
  }

  dispose() {
    this.mesh.material.dispose();
  }
}
