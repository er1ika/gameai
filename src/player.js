// Игрок: движение, обзор, оружие, здоровье.
import { STEP_UP } from './map.js';

export const PLAYER_R = 0.25;
export const PLAYER_H = 0.9;
export const EYE = 0.74;

export const WEAPONS = {
  fist: { slot: 1, name: 'Кулак', ammo: null, rate: 0.42, melee: true, dmg: [12, 28], kick: 0 },
  pistol: { slot: 2, name: 'Пистолет', ammo: 'bullets', rate: 0.3, dmg: [9, 19], pellets: 1, spread: 0.01, sound: 'pistol', kick: 0.012 },
  shotgun: { slot: 3, name: 'Дробовик', ammo: 'shells', rate: 0.95, dmg: [6, 15], pellets: 8, spread: 0.07, sound: 'shotgun', kick: 0.05 },
  chaingun: { slot: 4, name: 'Пулемёт', ammo: 'bullets', rate: 0.1, dmg: [8, 17], pellets: 1, spread: 0.028, sound: 'chaingun', kick: 0.01 },
  launcher: { slot: 5, name: 'Ракетница', ammo: 'rockets', rate: 0.75, projectile: true, sound: 'launcher', kick: 0.06 },
};
export const WEAPON_ORDER = ['fist', 'pistol', 'shotgun', 'chaingun', 'launcher'];
export const MAX_AMMO = { bullets: 200, shells: 50, rockets: 50 };

const rand = (a, b) => a + Math.random() * (b - a);

export class Player {
  constructor() {
    this.sensitivity = 1;
    this.reset();
  }

  /** Новая игра. */
  reset() {
    this.hp = 100;
    this.armor = 0;
    this.ammo = { bullets: 50, shells: 0, rockets: 0 };
    this.weapons = { fist: true, pistol: true };
    this.weapon = 'pistol';
    this.keys = {};
  }

  snapshot() {
    return JSON.stringify({ hp: this.hp, armor: this.armor, ammo: this.ammo, weapons: this.weapons, weapon: this.weapon });
  }

  restore(s) {
    Object.assign(this, JSON.parse(s));
  }

  spawn(map) {
    this.x = map.start.x;
    this.y = map.start.y;
    this.z = map.groundZ(this.x, this.y, PLAYER_R);
    this.yaw = map.start.angle;
    this.pitch = 0;
    this.vx = this.vy = this.vz = 0;
    this.keys = {};
    this.dead = false;
    this.deadT = 0;
    this.viewOff = 0;
    this.bob = 0;
    this.bobAmp = 0;
    this.kick = 0;
    this.cooldown = 0;
    this.fireT = 10;
    this.switchT = 0;
    this.pending = null;
    this.raise = 1; // оружие поднимается в начале уровня
    this.painFlash = 0;
    this.bonusFlash = 0;
    this.ouchT = 0;
    this.grinT = 0;
    this.floorDmgT = 0;
    this.onGround = true;
    this.god = false;
    if (this.hp <= 0) this.hp = 100;
  }

  get eyeZ() {
    const dip = this.dead ? Math.min(0.52, this.deadT * 1.4) : 0;
    return this.z + EYE + this.viewOff - dip + Math.sin(this.bob * 2) * this.bobAmp * 0.028;
  }

  update(dt, input, game) {
    this.painFlash = Math.max(0, this.painFlash - dt * 1.6);
    this.bonusFlash = Math.max(0, this.bonusFlash - dt * 2.5);
    this.ouchT -= dt;
    this.grinT -= dt;
    this.kick *= Math.exp(-dt * 10);
    this.fireT += dt;
    this.cooldown -= dt;
    const map = game.map;

    if (this.dead) {
      this.deadT += dt;
      this._fall(dt, map, game);
      return;
    }

    // --- обзор
    const sens = 0.0022 * this.sensitivity;
    this.yaw += input.mouseDX * sens;
    this.pitch -= input.mouseDY * sens;
    const turn = (input.down('ArrowRight') ? 1 : 0) - (input.down('ArrowLeft') ? 1 : 0);
    this.yaw += turn * 2.7 * dt;
    this.pitch = Math.max(-1.15, Math.min(1.15, this.pitch));
    if (this.yaw > Math.PI) this.yaw -= Math.PI * 2;
    else if (this.yaw < -Math.PI) this.yaw += Math.PI * 2;

    // --- движение
    const fwd = (input.down('KeyW') || input.down('ArrowUp') ? 1 : 0) - (input.down('KeyS') || input.down('ArrowDown') ? 1 : 0);
    const side = (input.down('KeyD') ? 1 : 0) - (input.down('KeyA') ? 1 : 0);
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    let wx = cos * fwd - sin * side, wy = sin * fwd + cos * side;
    const wl = Math.hypot(wx, wy);
    const speed = input.down('ShiftLeft') || input.down('ShiftRight') ? 7.4 : 5;
    if (wl > 0) { wx = (wx / wl) * speed; wy = (wy / wl) * speed; }
    const k = 1 - Math.exp(-dt * (wl > 0 ? 11 : 9));
    this.vx += (wx - this.vx) * k;
    this.vy += (wy - this.vy) * k;

    const z0 = this.z;
    const blocker = (nx, ny) => game.bodyBlocks(this, nx, ny, PLAYER_R);
    map.move(this, this.vx * dt, this.vy * dt, PLAYER_R, PLAYER_H, STEP_UP, Infinity, blocker);
    if (this.z > z0) this.viewOff -= this.z - z0; // плавный подъём по ступенькам
    this.viewOff *= Math.exp(-dt * 11);
    this._fall(dt, map, game);

    const v = Math.hypot(this.vx, this.vy);
    this.bob += v * dt * 1.9;
    this.bobAmp += ((this.onGround ? Math.min(1, v / 5) : 0) - this.bobAmp) * Math.min(1, dt * 8);

    // --- опасный пол
    const zone = map.zoneAt(this.x, this.y);
    if (zone && zone.damage && this.onGround && this.z <= zone.floor + 0.01) {
      this.floorDmgT -= dt;
      if (this.floorDmgT <= 0) {
        this.floorDmgT = 0.7;
        this.hurt(zone.damage, game, null, true);
        game.sound.play('burn', 0.6);
      }
    } else this.floorDmgT = Math.min(this.floorDmgT, 0.25);

    // --- использовать (двери)
    if (input.hit('KeyE') || input.hit('KeyF')) this.use(game);

    // --- оружие
    for (const name of WEAPON_ORDER) {
      if (input.hit(`Digit${WEAPONS[name].slot}`) || input.hit(`Numpad${WEAPONS[name].slot}`)) this.selectWeapon(name);
    }
    if (input.wheel !== 0 || input.hit('KeyQ')) this.cycleWeapon(input.wheel < 0 ? -1 : 1);

    if (this.pending) {
      this.raise += dt / 0.16;
      if (this.raise >= 1) { this.raise = 1; this.weapon = this.pending; this.pending = null; }
    } else if (this.raise > 0) {
      this.raise = Math.max(0, this.raise - dt / 0.2);
    }

    if (!this.pending && this.cooldown <= 0 && !this.hasAmmo(this.weapon)) this.autoSwitch();

    const firing = input.down('Space') || input.down('Enter') || (input.buttons.has(0) && (input.locked || input.lockFailed));
    if (firing && this.cooldown <= 0 && !this.pending && this.raise < 0.3) this.fire(game);
  }

  _fall(dt, map, game) {
    const ground = map.groundZ(this.x, this.y, PLAYER_R);
    if (this.z > ground + 1e-4) {
      this.vz -= 20 * dt;
      this.z += this.vz * dt;
      this.onGround = false;
      if (this.z <= ground) {
        if (this.vz < -4) { this.viewOff -= Math.min(0.22, -this.vz * 0.03); game.sound.play('land', 0.5); }
        this.z = ground; this.vz = 0; this.onGround = true;
      }
    } else {
      this.z = ground; this.vz = 0; this.onGround = true;
    }
  }

  use(game) {
    const map = game.map;
    const cos = Math.cos(this.yaw), sin = Math.sin(this.yaw);
    for (const dist of [0.35, 0.7, 1.05, 1.35]) {
      const cx = Math.floor(this.x + cos * dist), cy = Math.floor(this.y + sin * dist);
      if (map.isSolid(cx, cy)) break;
      const d = map.doorAt(cx, cy);
      if (!d) continue;
      const r = map.openDoor(d, this.keys);
      if (r === 'ok') game.playAt('door', d.cx + 0.5, d.cy + 0.5, 1);
      else if (r === 'locked') {
        const names = { red: 'красный', blue: 'синий', yellow: 'жёлтый' };
        game.message(`Нужен ${names[d.key]} ключ`);
        game.sound.play('locked', 0.8);
      }
      return;
    }
    game.sound.play('empty', 0.4);
  }

  hasAmmo(name) {
    const w = WEAPONS[name];
    return !w.ammo || this.ammo[w.ammo] > 0;
  }

  selectWeapon(name) {
    if (!this.weapons[name] || name === this.weapon || name === this.pending) return false;
    this.pending = name;
    return true;
  }

  cycleWeapon(dir) {
    const cur = WEAPON_ORDER.indexOf(this.pending || this.weapon);
    for (let i = 1; i <= WEAPON_ORDER.length; i++) {
      const name = WEAPON_ORDER[(cur + dir * i + WEAPON_ORDER.length * 2) % WEAPON_ORDER.length];
      if (this.weapons[name] && this.hasAmmo(name)) { this.selectWeapon(name); return; }
    }
  }

  autoSwitch() {
    for (const name of ['chaingun', 'shotgun', 'pistol', 'launcher', 'fist']) {
      if (this.weapons[name] && this.hasAmmo(name)) { this.selectWeapon(name); return; }
    }
  }

  fire(game) {
    const w = WEAPONS[this.weapon];
    if (w.ammo && this.ammo[w.ammo] < 1) {
      game.sound.play('empty', 0.5);
      this.cooldown = 0.25;
      this.autoSwitch();
      return;
    }
    if (w.ammo) this.ammo[w.ammo]--;
    this.cooldown = w.rate;
    this.fireT = 0;
    this.kick += w.kick;
    const eye = this.eyeZ;
    const pitch = game.autoAim(this.x, this.y, eye, this.yaw, this.pitch, w.melee ? 1.3 : 40);
    const dirOf = (yaw, p) => [Math.cos(yaw) * Math.cos(p), Math.sin(yaw) * Math.cos(p), Math.sin(p)];

    if (w.melee) {
      const [dx, dy, dz] = dirOf(this.yaw, pitch);
      const hit = game.hitscan(this.x, this.y, eye, dx, dy, dz, 1.25, rand(w.dmg[0], w.dmg[1]), this, true);
      game.sound.play(hit ? 'punch' : 'swing', 0.8);
      return;
    }
    game.sound.play(w.sound, 0.9);
    game.alert();
    if (w.projectile) {
      const [dx, dy, dz] = dirOf(this.yaw, pitch);
      game.spawnProjectile('rocket', this.x + dx * 0.2, this.y + dy * 0.2, eye - 0.1, dx, dy, dz, this);
    } else {
      for (let i = 0; i < w.pellets; i++) {
        const yaw = this.yaw + (Math.random() - Math.random()) * w.spread;
        const p = pitch + (Math.random() - Math.random()) * w.spread * 0.6;
        const [dx, dy, dz] = dirOf(yaw, p);
        game.hitscan(this.x, this.y, eye, dx, dy, dz, 48, rand(w.dmg[0], w.dmg[1]), this, false);
      }
    }
  }

  hurt(amount, game, source = null, floor = false) {
    if (this.dead || this.god) return;
    amount = Math.max(1, Math.round(amount * (floor ? 1 : game.difficulty.dmg)));
    if (this.armor > 0) {
      const absorbed = Math.min(this.armor, Math.ceil(amount * (this.armor > 100 ? 0.5 : 0.34)));
      this.armor -= absorbed;
      amount -= absorbed;
    }
    this.hp -= amount;
    this.painFlash = Math.min(0.8, this.painFlash + 0.18 + amount * 0.012);
    this.ouchT = 0.5;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deadT = 0;
      this.vx = this.vy = 0;
      game.sound.play('death_player', 1);
      game.onPlayerDeath();
    } else if (!floor) {
      game.sound.play('pain_player', 0.8);
    }
  }
}
