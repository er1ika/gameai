// Клавиатура и мышь. Мышь работает в режиме захвата указателя (pointer lock);
// если он недоступен — можно играть с клавиатуры (стрелки + пробел).

const GAME_KEYS = new Set([
  'Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyF', 'KeyQ',
]);

export class Input {
  constructor(target) {
    this.target = target;
    this.keys = new Set();
    this.pressed = new Set();
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.buttons = new Set();
    this.clicked = false;
    this.wheel = 0;
    this.enabled = false; // true во время игры: перехватываем игровые клавиши
    this.lockFailed = false;

    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (this.enabled && GAME_KEYS.has(e.code)) e.preventDefault();
      if (!e.repeat) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.clear());
    document.addEventListener('mousemove', (e) => {
      // без захвата указателя (например, во встроенном окне) мышь всё равно вращает камеру
      if (!this.locked && !(this.lockFailed && this.enabled)) return;
      // некоторые браузеры изредка выдают огромный скачок сразу после захвата — отсекаем
      const clamp = (v) => Math.max(-250, Math.min(250, v || 0));
      this.mouseDX += clamp(e.movementX);
      this.mouseDY += clamp(e.movementY);
    });
    target.addEventListener('mousedown', (e) => {
      if (this.enabled) e.preventDefault();
      this.buttons.add(e.button);
      if (e.button === 0) this.clicked = true;
    });
    window.addEventListener('mouseup', (e) => this.buttons.delete(e.button));
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('wheel', (e) => {
      if (this.enabled) e.preventDefault();
      this.wheel += Math.sign(e.deltaY);
    }, { passive: false });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
  }

  get locked() {
    return document.pointerLockElement === this.target;
  }

  /** Запросить захват мыши (только из обработчика жеста пользователя). */
  lock() {
    if (this.locked || !this.target.requestPointerLock) {
      if (!this.target.requestPointerLock) this.lockFailed = true;
      return;
    }
    try {
      const p = this.target.requestPointerLock();
      if (p && p.catch) p.catch(() => { this.lockFailed = true; });
    } catch {
      this.lockFailed = true;
    }
  }

  unlock() {
    if (this.locked && document.exitPointerLock) document.exitPointerLock();
  }

  down(code) { return this.keys.has(code); }
  hit(code) { return this.pressed.has(code); }

  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.buttons.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
    this.clicked = false;
  }

  endFrame() {
    this.pressed.clear();
    this.mouseDX = this.mouseDY = 0;
    this.wheel = 0;
    this.clicked = false;
  }
}
