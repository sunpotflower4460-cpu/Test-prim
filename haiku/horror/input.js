// Keyboard, mouse (pointer lock with a drag fallback) and touch.
// poll() returns the movement and look for this frame plus queued one-shot actions.

const LOOK_MOUSE = 0.0022;
const LOOK_TOUCH = 0.0042;
const PITCH_MAX = 1.15;
const STICK_R = 56;

export function createInput(opts) {
  const canvas = opts.canvas;
  const touchLayer = opts.touchLayer;
  const keys = new Set();
  const queue = [];
  let turn = 0;
  let pitch = 0;
  let touchRun = false;
  let lockFailed = false;
  let dragging = false;
  let expectUnlock = false;
  let stickId = null;
  let stickOx = 0;
  let stickOy = 0;
  let stickVx = 0;
  let stickVy = 0;
  const looks = new Map();
  const isPlaying = opts.isPlaying || (() => false);
  const sens = opts.sens || (() => 1);

  const locked = () => document.pointerLockElement === canvas;

  function act(name) {
    if (isPlaying()) queue.push(name);
  }

  function isTypingTarget(el) {
    return !!(el && el.closest && el.closest("input, textarea, select"));
  }

  window.addEventListener("keydown", e => {
    if (!isPlaying() || isTypingTarget(e.target)) return;
    // Escape is handled by main.js, which pauses or resumes once per press.
    if (e.code === "Escape") return;
    keys.add(e.code);
    if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    if (e.repeat) return;
    switch (e.code) {
      case "KeyF": act("flash"); break;
      case "KeyR": act("reload"); break;
      case "KeyE": act("interact"); break;
      case "Digit1": act("answer"); break;
      case "Digit2": act("silence"); break;
      default: break;
    }
  });
  window.addEventListener("keyup", e => keys.delete(e.code));
  window.addEventListener("blur", () => {
    keys.clear();
    dragging = false;
  });

  // Mouse: a click locks the pointer (or starts a drag when locking is unavailable).
  canvas.addEventListener("mousedown", e => {
    if (e.button !== 0 || !isPlaying()) return;
    if (locked()) {
      act("fire");
      return;
    }
    if (lockFailed) {
      dragging = true;
      act("fire");
      return;
    }
    try {
      const p = canvas.requestPointerLock();
      if (p && p.catch) p.catch(() => { lockFailed = true; });
    } catch (err) {
      lockFailed = true;
    }
  });
  window.addEventListener("mouseup", () => { dragging = false; });
  document.addEventListener("pointerlockerror", () => { lockFailed = true; });
  document.addEventListener("pointerlockchange", () => {
    // A release we asked for is not the player leaving the game.
    const asked = expectUnlock;
    expectUnlock = false;
    if (!locked() && !asked && isPlaying() && opts.onLockLost) opts.onLockLost();
  });
  window.addEventListener("mousemove", e => {
    if (!isPlaying()) return;
    if (locked() || dragging) {
      const k = LOOK_MOUSE * sens();
      turn -= e.movementX * k;
      pitch = clamp(pitch - e.movementY * k, -PITCH_MAX, PITCH_MAX);
    }
  });

  // Touch: anything starting on a control is a button; the left half is the stick,
  // the right half drags the view.
  if (touchLayer) {
    touchLayer.addEventListener("pointerdown", e => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      const b = e.target.closest && e.target.closest("[data-act]");
      if (b) {
        e.preventDefault();
        const name = b.dataset.act;
        if (name === "run") touchRun = true;
        else act(name);
        b.setPointerCapture && b.setPointerCapture(e.pointerId);
        b.classList.add("down");
        b.dataset.pid = String(e.pointerId);
        return;
      }
      e.preventDefault();
      if (e.clientX < window.innerWidth / 2) {
        if (stickId === null) {
          stickId = e.pointerId;
          stickOx = e.clientX;
          stickOy = e.clientY;
          stickVx = 0;
          stickVy = 0;
          if (opts.onStick) opts.onStick({ active: true, ax: stickOx, ay: stickOy, kx: 0, ky: 0 });
        }
      } else {
        looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
    });
    touchLayer.addEventListener("pointermove", e => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      if (e.pointerId === stickId) {
        const dx = e.clientX - stickOx;
        const dy = e.clientY - stickOy;
        const len = Math.hypot(dx, dy);
        const k = len > STICK_R ? STICK_R / len : 1;
        stickVx = (dx * k) / STICK_R;
        stickVy = (dy * k) / STICK_R;
        if (opts.onStick) opts.onStick({ active: true, ax: stickOx, ay: stickOy, kx: dx * k, ky: dy * k });
      }
      const l = looks.get(e.pointerId);
      if (l) {
        const dx = e.clientX - l.x;
        const dy = e.clientY - l.y;
        l.x = e.clientX;
        l.y = e.clientY;
        const s = LOOK_TOUCH * sens();
        turn -= dx * s;
        pitch = clamp(pitch - dy * s * 0.85, -PITCH_MAX, PITCH_MAX);
      }
    });
    const release = e => {
      if (e.pointerId === stickId) {
        stickId = null;
        stickVx = 0;
        stickVy = 0;
        if (opts.onStick) opts.onStick({ active: false });
      }
      looks.delete(e.pointerId);
      const b = touchLayer.querySelector(`[data-pid="${e.pointerId}"]`);
      if (b) {
        b.classList.remove("down");
        delete b.dataset.pid;
        if (b.dataset.act === "run") touchRun = false;
      }
    };
    touchLayer.addEventListener("pointerup", release);
    touchLayer.addEventListener("pointercancel", release);
  }

  function clamp(v, a, b) {
    return v < a ? a : v > b ? b : v;
  }

  return {
    // Per-frame input for the sim. Clears the look delta and the action queue.
    poll() {
      const fwd = (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) - (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
      const side = (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) - (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);
      const run = keys.has("ShiftLeft") || keys.has("ShiftRight") || touchRun;
      const input = {
        mx: clamp(side + stickVx, -1, 1),
        mz: clamp(fwd - stickVy, -1, 1),
        turn,
        pitch,
        run,
        actions: queue.splice(0, queue.length)
      };
      turn = 0;
      return input;
    },
    clear() {
      queue.length = 0;
      turn = 0;
      keys.clear();
      touchRun = false;
      stickVx = 0;
      stickVy = 0;
    },
    get pitch() {
      return pitch;
    },
    setPitch(v) {
      pitch = clamp(v, -PITCH_MAX, PITCH_MAX);
    },
    lock() {
      if (lockFailed) return false;
      try {
        const p = canvas.requestPointerLock();
        if (p && p.catch) p.catch(() => { lockFailed = true; });
        return true;
      } catch (e) {
        lockFailed = true;
        return false;
      }
    },
    unlock() {
      if (locked()) {
        expectUnlock = true;
        document.exitPointerLock();
      }
      dragging = false;
    },
    isLocked: locked,
    get lockFailed() {
      return lockFailed;
    }
  };
}
