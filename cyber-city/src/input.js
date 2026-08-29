export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pointerLocked = false;
    this.mouseDx = 0;
    this.mouseDy = 0;
    this.axisX = 0;
    this.axisY = 0;
    this.turbo = false;
    this.anyInputAt = 0;
    this.touchActive = false;
    this.listeners = new Map();
    this.dragging = false;
    this.lastTouch = null;
    this.moveTouchId = null;
    this.lookTouchId = null;
    this.moveOrigin = [0, 0];
    this.bind();
  }

  on(event, handler) {
    if (!this.listeners.has(event)) this.listeners.set(event, []);
    this.listeners.get(event).push(handler);
  }

  emit(event, payload) {
    const list = this.listeners.get(event);
    if (list) for (const fn of list) fn(payload);
  }

  bind() {
    window.addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return;
      this.keys.add(e.code);
      this.anyInputAt = performance.now();
      this.emit('key', e.code);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
    });

    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });

    window.addEventListener('blur', () => this.keys.clear());

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.anyInputAt = performance.now();
      this.emit('primary');
    });

    window.addEventListener('mouseup', () => {
      this.dragging = false;
    });

    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        this.mouseDx += e.movementX;
        this.mouseDy += e.movementY;
        this.anyInputAt = performance.now();
      } else if (this.dragging) {
        this.mouseDx += e.movementX;
        this.mouseDy += e.movementY;
        this.anyInputAt = performance.now();
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      this.emit('pointerlock', this.pointerLocked);
    });

    this.canvas.addEventListener('touchstart', (e) => {
      this.touchActive = true;
      this.anyInputAt = performance.now();
      for (const touch of e.changedTouches) {
        if (touch.clientX < window.innerWidth * 0.45 && this.moveTouchId === null) {
          this.moveTouchId = touch.identifier;
          this.moveOrigin = [touch.clientX, touch.clientY];
        } else if (this.lookTouchId === null) {
          this.lookTouchId = touch.identifier;
          this.lastTouch = [touch.clientX, touch.clientY];
        }
      }
      e.preventDefault();
    }, { passive: false });

    this.canvas.addEventListener('touchmove', (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.moveTouchId) {
          const dx = (touch.clientX - this.moveOrigin[0]) / 70;
          const dy = (this.moveOrigin[1] - touch.clientY) / 70;
          this.axisX = Math.max(-1, Math.min(1, dx));
          this.axisY = Math.max(-1, Math.min(1, dy));
        } else if (touch.identifier === this.lookTouchId && this.lastTouch) {
          this.mouseDx += touch.clientX - this.lastTouch[0];
          this.mouseDy += touch.clientY - this.lastTouch[1];
          this.lastTouch = [touch.clientX, touch.clientY];
        }
      }
      this.anyInputAt = performance.now();
      e.preventDefault();
    }, { passive: false });

    const endTouch = (e) => {
      for (const touch of e.changedTouches) {
        if (touch.identifier === this.moveTouchId) {
          this.moveTouchId = null;
          this.axisX = 0;
          this.axisY = 0;
        }
        if (touch.identifier === this.lookTouchId) {
          this.lookTouchId = null;
          this.lastTouch = null;
        }
      }
    };
    this.canvas.addEventListener('touchend', endTouch);
    this.canvas.addEventListener('touchcancel', endTouch);
  }

  isDown(code) {
    return this.keys.has(code);
  }

  consumeMouse() {
    const dx = this.mouseDx;
    const dy = this.mouseDy;
    this.mouseDx = 0;
    this.mouseDy = 0;
    return [dx, dy];
  }

  requestPointerLock() {
    if (this.canvas.requestPointerLock) this.canvas.requestPointerLock();
  }

  exitPointerLock() {
    if (document.exitPointerLock) document.exitPointerLock();
  }

  idleFor() {
    return performance.now() - this.anyInputAt;
  }
}
