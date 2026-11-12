import test from 'node:test';
import assert from 'node:assert/strict';
import { GameMap, rayCylinder, rayBox } from '../src/map.js';
import { LEVELS } from '../src/levels.js';
import { TEXTURE_NAMES } from '../src/textures.js';
import { ITEM_SPRITES } from '../src/sprites.js';

const MONSTERS = new Set(['zombie', 'sergeant', 'imp', 'demon', 'baron']);

function reachable(map) {
  // Собираем ключи, пока множество достижимых ячеек не перестанет расти.
  const keys = {};
  let reach;
  for (let pass = 0; pass < 5; pass++) {
    reach = map.flood(map.start.x, map.start.y, { keys, playerMove: true, throughDoors: true });
    let grew = false;
    for (const t of map.things) {
      if (!t.type.startsWith('key_')) continue;
      const k = t.type.slice(4);
      if (!keys[k] && reach[Math.floor(t.y) * map.w + Math.floor(t.x)] !== 65535) { keys[k] = true; grew = true; }
    }
    if (!grew) break;
  }
  return { reach, keys };
}

for (const def of LEVELS) {
  test(`уровень «${def.name}» корректен и проходим`, () => {
    const map = new GameMap(def);
    if (process.env.DUMP) console.log(`\n${def.name}\n${map.toAscii()}`);

    assert.equal(map.isSolid(Math.floor(map.start.x), Math.floor(map.start.y)), false, 'старт в стене');

    const used = new Set();
    for (const t of map.things) {
      const cx = Math.floor(t.x), cy = Math.floor(t.y);
      const i = cy * map.w + cx;
      assert.equal(map.isSolid(cx, cy), false, `${t.type} в стене (${cx},${cy})`);
      assert.equal(map.doors.has(i), false, `${t.type} в дверном проёме (${cx},${cy})`);
      assert.equal(used.has(i), false, `две вещи в одной ячейке (${cx},${cy})`);
      used.add(i);
    }

    // все текстуры и типы вещей существуют
    const tex = new Set(TEXTURE_NAMES);
    for (const [name, z] of Object.entries(def.zones)) {
      for (const t of [z.ftex, z.ctex, z.side]) if (t) assert.ok(tex.has(t), `зона ${name}: нет текстуры ${t}`);
    }
    for (let i = 0; i < map.wallTex.length; i++) assert.ok(tex.has(map.wallTex[i]), `нет текстуры стены ${map.wallTex[i]}`);
    const known = new Set([...ITEM_SPRITES, ...MONSTERS, 'exit', 'lamp', 'torch']);
    for (const t of map.things) assert.ok(known.has(t.type), `неизвестная вещь ${t.type}`);
    assert.ok(def.zones.door, 'нет зоны door');

    const { reach, keys } = reachable(map);
    for (const t of map.things) {
      const i = Math.floor(t.y) * map.w + Math.floor(t.x);
      assert.notEqual(reach[i], 65535, `${t.type} недостижим (${Math.floor(t.x)},${Math.floor(t.y)})`);
    }
    for (const d of map.doorList) {
      assert.notEqual(reach[d.i], 65535, `дверь недостижима (${d.cx},${d.cy})`);
      if (d.key) assert.ok(keys[d.key], `нет ключа ${d.key} для двери (${d.cx},${d.cy})`);
      // дверь должна быть зажата стенами с двух сторон
      const side = (x, y) => map.isSolid(x, y) || map.doors.has(y * map.w + x);
      const ok = d.axis === 'x'
        ? side(d.cx - 1, d.cy) && side(d.cx + 1, d.cy)
        : side(d.cx, d.cy - 1) && side(d.cx, d.cy + 1);
      assert.ok(ok, `дверь (${d.cx},${d.cy}) не в проёме`);
    }
    assert.ok(map.things.some((t) => t.type === 'exit'), 'нет выхода');
    assert.ok(map.things.filter((t) => MONSTERS.has(t.type)).length >= 15, 'мало монстров');
    if (def.boss) assert.ok(map.things.some((t) => t.type === 'baron'), 'нет босса');

    // монстры могут дойти до игрока от своих стартовых точек (когда двери открыты)
    for (const d of map.doorList) d.unlocked = true;
    map.computeDistField(map.start.x, map.start.y);
    for (const t of map.things) {
      if (!MONSTERS.has(t.type)) continue;
      const i = Math.floor(t.y) * map.w + Math.floor(t.x);
      assert.notEqual(map.dist[i], 65535, `${t.type} (${Math.floor(t.x)},${Math.floor(t.y)}) не может дойти до старта`);
    }
  });
}

test('трассировка лучей: стены, пол, двери', () => {
  const map = new GameMap({
    name: 't', w: 9, h: 5,
    zones: {
      a: { floor: 0, ceil: 2, light: 1, ftex: 'f', ctex: 'c' },
      hi: { floor: 0.8, ceil: 2, light: 1, ftex: 'f', ctex: 'c' },
      door: { floor: 0, ceil: 1.3, light: 1, ftex: 'f', ctex: 'c' },
    },
    build(m) { m.carve(1, 1, 7, 3, 'a'); m.fill(4, 1, 4, 3); m.door(4, 2); m.carve(7, 1, 7, 3, 'hi'); },
  });
  const door = map.doorAt(4, 2);
  assert.equal(door.axis, 'y');

  let r = map.raycast(1.5, 2.5, 0.7, -1, 0, 0, 20);
  assert.equal(r.type, 'wall'); assert.ok(Math.abs(r.t - 0.5) < 1e-6);

  r = map.raycast(1.5, 2.5, 0.7, 1, 0, 0, 20);
  assert.equal(r.type, 'door'); assert.ok(Math.abs(r.x - (4.5 - 0.12)) < 1e-6);
  assert.equal(map.los(1.5, 2.5, 0.7, 6.5, 2.5, 0.7), false);
  assert.equal(map.blocked(4.5, 2.5, 0.25, 0, 0.9), true);

  door.open = 1;
  r = map.raycast(1.5, 2.5, 0.7, 1, 0, 0, 20);
  assert.equal(r.type, 'wall', 'луч упирается в уступ высотой 0.8');
  assert.ok(Math.abs(r.x - 7) < 1e-6);
  assert.equal(map.los(1.5, 2.5, 0.7, 6.5, 2.5, 0.7), true);
  assert.equal(map.blocked(4.5, 2.5, 0.25, 0, 0.9), false);
  assert.equal(map.blocked(6.9, 2.5, 0.25, 0, 0.9), true, 'уступ 0.8 выше ступеньки');

  const k = Math.SQRT1_2;
  r = map.raycast(1.5, 2.5, 0.7, k, 0, -k, 20);
  assert.equal(r.type, 'floor'); assert.ok(Math.abs(r.x - 2.2) < 1e-6);
  r = map.raycast(1.5, 2.5, 0.7, 0, 0, 1, 20);
  assert.equal(r.type, 'ceil'); assert.ok(Math.abs(r.t - 1.3) < 1e-6);

  // скольжение вдоль стены
  const e = { x: 1.5, y: 2.5, z: 0 };
  map.move(e, -1, 0.3, 0.25, 0.9);
  assert.ok(Math.abs(e.x - 1.5) < 0.26 && e.x >= 1.25, 'не прошёл сквозь стену');
  assert.ok(Math.abs(e.y - 2.8) < 1e-6, 'скользит вдоль стены');
});

test('пересечения луча с цилиндром и коробкой', () => {
  assert.ok(Math.abs(rayCylinder(0, 0, 0.5, 1, 0, 0, 5, 0, 0.5, 0, 1) - 4.5) < 1e-9);
  assert.equal(rayCylinder(0, 0, 1.5, 1, 0, 0, 5, 0, 0.5, 0, 1), null);
  assert.equal(rayCylinder(0, 1, 0.5, 1, 0, 0, 5, 0, 0.5, 0, 1), null);
  assert.equal(rayCylinder(0, 0, 0.5, -1, 0, 0, 5, 0, 0.5, 0, 1), null);
  assert.ok(Math.abs(rayBox(0, 0, 0, 1, 0, 0, 2, -1, -1, 3, 1, 1) - 2) < 1e-9);
  assert.equal(rayBox(0, 2, 0, 1, 0, 0, 2, -1, -1, 3, 1, 1), null);
});
