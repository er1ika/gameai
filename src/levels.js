// Уровни. Каждый уровень «вырезается» из сплошного камня функцией build(m):
//   m.carve(x0, y0, x1, y1, зона)  — комната/коридор
//   m.fill(x0, y0, x1, y1, текстура) — вернуть стену (колонна)
//   m.paint(x0, y0, x1, y1, текстура) — текстура стен в области
//   m.door(x, y, ключ)              — дверь
//   m.thing(тип, x, y)              — монстр / предмет / декор
// Зона задаёт высоту пола и потолка, освещённость и текстуры (как сектор в Doom).

const N = -Math.PI / 2; // взгляд на север (вверх по карте)

const level1 = {
  name: 'E1M1: Ангар',
  w: 40,
  h: 34,
  defaultWall: 'tech',
  sky: 'mars',
  fog: { color: 0x050403, near: 3, far: 30 },
  music: 0,
  zones: {
    room: { floor: 0, ceil: 1.6, light: 0.85, ftex: 'tile', ctex: 'panel' },
    dark: { floor: 0, ceil: 1.4, light: 0.5, ftex: 'concrete', ctex: 'metalceil' },
    hall: { floor: 0, ceil: 2.4, light: 0.8, ftex: 'tile', ctex: 'panel' },
    pit: { floor: -0.3, ceil: 2.4, light: 1, ftex: 'slime', ctex: 'panel', damage: 4, side: 'metal' },
    st1: { floor: 0.2, ceil: 2.4, light: 0.8, ftex: 'concrete', ctex: 'panel', side: 'step' },
    st2: { floor: 0.4, ceil: 2.4, light: 0.8, ftex: 'concrete', ctex: 'panel', side: 'step' },
    st3: { floor: 0.6, ceil: 2.4, light: 0.8, ftex: 'concrete', ctex: 'panel', side: 'step' },
    plat: { floor: 0.8, ceil: 2.4, light: 0.9, ftex: 'concrete', ctex: 'lightpanel', side: 'metal' },
    yard: { floor: 0, ceil: 4, light: 1, ftex: 'dirt', ctex: null },
    comp: { floor: 0, ceil: 1.6, light: 0.7, ftex: 'concrete', ctex: 'lightpanel' },
    store: { floor: 0, ceil: 2, light: 0.62, ftex: 'concrete', ctex: 'metalceil' },
    crate: { floor: 0.55, ceil: 2, light: 0.62, ftex: 'crate_top', ctex: 'metalceil', side: 'crate' },
    crate2: { floor: 1.1, ceil: 2, light: 0.62, ftex: 'crate_top', ctex: 'metalceil', side: 'crate' },
    exit: { floor: 0, ceil: 1.6, light: 0.9, ftex: 'tile', ctex: 'lightpanel' },
    exitpad: { floor: 0.06, ceil: 1.6, light: 1, ftex: 'exitpad', ctex: 'lightpanel', side: 'metal' },
    door: { floor: 0, ceil: 1.3, light: 0.7, ftex: 'grate', ctex: 'metalceil' },
  },
  build(m) {
    // --- стартовая комната
    m.carve(2, 27, 8, 31, 'room');
    m.setStart(5, 30, N);
    m.door(5, 26);
    m.thing('clip', 2, 27); m.thing('clip', 8, 27); m.thing('armor', 2, 31);
    m.thing('lamp', 8, 31);

    // --- тёмный коридор
    m.carve(4, 21, 6, 25, 'dark');
    m.thing('zombie', 5, 23); m.thing('zombie', 4, 21);

    // --- главный зал с кислотой и платформой
    m.carve(2, 8, 16, 20, 'hall');
    m.carve(5, 13, 10, 17, 'pit');
    m.carve(13, 8, 16, 12, 'plat');
    m.carve(12, 9, 12, 10, 'st3');
    m.carve(11, 9, 11, 10, 'st2');
    m.carve(10, 9, 10, 10, 'st1');
    m.paint(1, 7, 17, 7, 'comp');
    m.thing('shotgun', 15, 10); m.thing('shells', 16, 8); m.thing('medkit', 16, 12);
    m.thing('sergeant', 14, 11);
    m.thing('zombie', 3, 10); m.thing('zombie', 8, 11); m.thing('zombie', 14, 18);
    m.thing('imp', 3, 18); m.thing('imp', 12, 15);
    m.thing('barrel', 11, 19); m.thing('barrel', 12, 19); m.thing('barrel', 2, 13);
    m.thing('stim', 2, 8); m.thing('stim', 16, 20); m.thing('clip', 2, 20);
    m.thing('lamp', 2, 12); m.thing('lamp', 16, 14);

    // --- шлюз во двор
    m.door(17, 17);
    m.carve(18, 16, 22, 18, 'dark');
    m.door(23, 17);
    m.thing('zombie', 20, 16); m.thing('clip', 22, 18);

    // --- двор под открытым небом
    m.paint(23, 9, 37, 23, 'brick');
    m.carve(24, 10, 36, 22, 'yard');
    for (const [x, y] of [[28, 14], [32, 14], [28, 18], [32, 18]]) m.fill(x, y, x, y, 'brick');
    m.thing('imp', 26, 12); m.thing('imp', 34, 12); m.thing('imp', 34, 20);
    m.thing('demon', 30, 16); m.thing('zombie', 26, 20); m.thing('sergeant', 35, 16);
    m.thing('barrel', 27, 21); m.thing('barrel', 28, 21); m.thing('barrel', 33, 11); m.thing('barrel', 34, 11);
    m.thing('shells', 36, 10); m.thing('medkit', 24, 22); m.thing('clip', 36, 22); m.thing('stim', 24, 10);
    m.thing('lamp', 30, 12); m.thing('lamp', 30, 20);

    // --- компьютерный центр (синий ключ)
    m.paint(25, 2, 35, 8, 'comp');
    m.carve(26, 3, 34, 8, 'comp');
    m.door(30, 9);
    m.fill(28, 5, 28, 5, 'comp'); m.fill(32, 5, 32, 5, 'comp');
    m.thing('key_blue', 30, 4);
    m.thing('zombie', 27, 4); m.thing('zombie', 33, 4); m.thing('sergeant', 30, 6); m.thing('imp', 27, 7);
    m.thing('medkit', 26, 8); m.thing('shells', 34, 8); m.thing('clip', 34, 3); m.thing('armor', 26, 3);

    // --- склад (пулемёт)
    m.paint(25, 24, 36, 31, 'metal');
    m.carve(26, 24, 35, 30, 'store');
    m.door(30, 23);
    m.carve(27, 25, 28, 25, 'crate'); m.carve(27, 26, 27, 26, 'crate2');
    m.carve(34, 25, 34, 25, 'crate2'); m.carve(33, 25, 33, 25, 'crate');
    m.carve(33, 29, 34, 29, 'crate'); m.carve(34, 28, 34, 28, 'crate2');
    m.carve(29, 28, 29, 28, 'crate');
    m.thing('chaingun', 27, 29);
    m.thing('demon', 31, 27); m.thing('demon', 32, 29); m.thing('zombie', 28, 30); m.thing('sergeant', 35, 26);
    m.thing('clip', 35, 24); m.thing('clip', 35, 30); m.thing('medkit', 26, 24); m.thing('megaarmor', 35, 27);
    m.thing('barrel', 26, 30); m.thing('barrel', 31, 24);

    // --- выход за синей дверью
    m.door(8, 7, 'blue');
    m.carve(7, 5, 9, 6, 'dark');
    m.carve(4, 1, 12, 4, 'exit');
    m.carve(8, 2, 8, 2, 'exitpad');
    m.thing('exit', 8, 2);
    m.thing('imp', 5, 2); m.thing('imp', 11, 2); m.thing('demon', 8, 4);
    m.thing('medkit', 4, 4); m.thing('shells', 12, 4);
    m.thing('lamp', 4, 1); m.thing('lamp', 12, 1);
  },
};

const level2 = {
  name: 'E1M2: Адские врата',
  w: 44,
  h: 38,
  defaultWall: 'hell',
  sky: 'hell',
  fog: { color: 0x0c0201, near: 3, far: 28 },
  music: 1,
  boss: true, // выход откроется только после смерти босса
  zones: {
    cave: { floor: 0, ceil: 1.5, light: 0.55, ftex: 'hellfloor', ctex: 'rock' },
    hall: { floor: 0, ceil: 2.6, light: 0.7, ftex: 'hellfloor', ctex: 'rock' },
    lava: { floor: -0.25, ceil: 2.6, light: 1, ftex: 'lava', ctex: 'rock', damage: 8, side: 'hell' },
    bridge: { floor: 0, ceil: 2.6, light: 0.85, ftex: 'marble', ctex: 'rock' },
    temple: { floor: 0, ceil: 2, light: 0.62, ftex: 'marble', ctex: 'rock' },
    a1: { floor: 0.2, ceil: 2, light: 0.7, ftex: 'marble', ctex: 'rock', side: 'stone' },
    a2: { floor: 0.4, ceil: 2, light: 0.8, ftex: 'marble', ctex: 'rock', side: 'stone' },
    a3: { floor: 0.6, ceil: 2, light: 0.9, ftex: 'marble', ctex: 'rock', side: 'stone' },
    a4: { floor: 0.8, ceil: 2, light: 1, ftex: 'marble', ctex: 'rock', side: 'stone' },
    arena: { floor: 0, ceil: 5, light: 0.95, ftex: 'hellfloor', ctex: null },
    lavasky: { floor: -0.25, ceil: 5, light: 1, ftex: 'lava', ctex: null, damage: 8, side: 'hell' },
    exitpad: { floor: 0.06, ceil: 5, light: 1, ftex: 'exitpad', ctex: null, side: 'metal' },
    door: { floor: 0, ceil: 1.3, light: 0.7, ftex: 'grate', ctex: 'metalceil' },
  },
  build(m) {
    // --- стартовая пещера
    m.carve(2, 32, 6, 35, 'cave');
    m.setStart(4, 34, N);
    m.thing('shotgun', 2, 32); m.thing('shells', 6, 32); m.thing('armor', 2, 35); m.thing('clip', 6, 35);
    m.thing('torch', 2, 33); m.thing('torch', 6, 33);

    // --- извилистый ход
    m.carve(4, 27, 5, 31, 'cave');
    m.carve(4, 25, 12, 26, 'cave');
    m.thing('imp', 4, 27); m.thing('zombie', 8, 25); m.thing('sergeant', 11, 26);
    m.thing('stim', 12, 25);
    m.door(13, 25); m.door(13, 26);

    // --- лавовый зал с мостом и островом
    m.carve(14, 18, 28, 32, 'hall');
    m.carve(16, 20, 26, 30, 'lava');
    m.carve(16, 25, 26, 26, 'bridge');
    m.carve(19, 23, 23, 28, 'bridge');
    m.fill(21, 25, 21, 26, 'stone');
    m.thing('chaingun', 20, 24); m.thing('medkit', 22, 27); m.thing('clip', 22, 24); m.thing('clip', 20, 27);
    m.thing('imp', 19, 23); m.thing('imp', 23, 28);
    m.thing('sergeant', 15, 19); m.thing('imp', 27, 19);
    m.thing('demon', 15, 31); m.thing('demon', 27, 31);
    m.thing('torch', 14, 18); m.thing('torch', 28, 18); m.thing('torch', 14, 32); m.thing('torch', 28, 32);
    m.thing('barrel', 27, 22); m.thing('barrel', 28, 22); m.thing('shells', 28, 29); m.thing('stim', 14, 22);

    // --- пещера с красным ключом
    m.door(13, 30);
    m.carve(8, 28, 12, 32, 'cave');
    m.thing('key_red', 9, 30);
    m.thing('sergeant', 11, 28); m.thing('sergeant', 11, 32); m.thing('imp', 8, 29);
    m.thing('shells', 8, 32); m.thing('medkit', 8, 28); m.thing('torch', 12, 28);

    // --- зал алтаря (жёлтый ключ)
    m.paint(14, 4, 28, 16, 'stone');
    m.door(21, 17);
    m.carve(15, 5, 27, 15, 'temple');
    m.carve(21, 16, 21, 16, 'temple');
    m.carve(18, 7, 24, 13, 'a1');
    m.carve(19, 8, 23, 12, 'a2');
    m.carve(20, 9, 22, 11, 'a3');
    m.carve(21, 10, 21, 10, 'a4');
    m.thing('key_yellow', 21, 10);
    m.thing('demon', 16, 6); m.thing('demon', 26, 6); m.thing('demon', 16, 14);
    m.thing('imp', 26, 14); m.thing('imp', 21, 5);
    m.thing('torch', 15, 5); m.thing('torch', 27, 5); m.thing('torch', 15, 15); m.thing('torch', 27, 15);
    m.thing('medkit', 15, 10); m.thing('shells', 27, 10); m.thing('clip', 21, 14);

    // --- храм за красной дверью
    m.paint(29, 21, 37, 30, 'stone');
    m.door(29, 25, 'red'); m.door(29, 26, 'red');
    m.carve(30, 22, 36, 29, 'temple');
    for (const [x, y] of [[32, 24], [34, 24], [32, 27], [34, 27]]) m.fill(x, y, x, y, 'stone');
    m.thing('demon', 35, 23); m.thing('demon', 31, 28); m.thing('sergeant', 36, 28); m.thing('imp', 36, 22);
    m.thing('medkit', 30, 29); m.thing('shells', 36, 25); m.thing('torch', 30, 22); m.thing('torch', 36, 29);

    // --- арсенал за жёлтой дверью
    m.paint(31, 17, 35, 21, 'metal');
    m.door(33, 21, 'yellow');
    m.carve(32, 18, 34, 20, 'temple');
    m.thing('launcher', 33, 19); m.thing('rockets', 32, 18); m.thing('rockets', 34, 18);
    m.thing('megaarmor', 32, 20); m.thing('soul', 34, 20);
    m.door(33, 17);

    // --- арена босса под багровым небом
    m.paint(29, 2, 42, 17, 'stone');
    m.carve(30, 3, 41, 16, 'arena');
    m.carve(30, 3, 31, 4, 'lavasky'); m.carve(40, 3, 41, 4, 'lavasky');
    for (const [x, y] of [[33, 7], [38, 7], [33, 12], [38, 12]]) m.fill(x, y, x, y, 'stone');
    m.carve(36, 3, 36, 3, 'exitpad');
    m.thing('exit', 36, 3);
    m.thing('baron', 36, 6);
    m.thing('imp', 31, 9); m.thing('imp', 40, 9); m.thing('demon', 35, 10);
    m.thing('rockets', 30, 16); m.thing('rockets', 41, 16); m.thing('rockets', 30, 6); m.thing('rockets', 41, 6);
    m.thing('medkit', 30, 12); m.thing('medkit', 41, 12); m.thing('shells', 36, 16);
    m.thing('torch', 32, 3); m.thing('torch', 39, 3);
  },
};

export const LEVELS = [level1, level2];
