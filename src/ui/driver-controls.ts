import type { KeyboardInputState } from '../simulation/types';

type Shortcut = 'camera' | 'line' | 'ghost' | 'mode' | 'reset';
const shortcuts: Record<string, Shortcut> = {
  KeyC: 'camera', KeyV: 'camera', KeyL: 'line', KeyG: 'ghost', KeyM: 'mode', KeyR: 'reset',
};
const drivingCodes = new Set(['KeyW', 'ArrowUp', 'KeyS', 'ArrowDown', 'KeyA', 'ArrowLeft', 'KeyD', 'ArrowRight', 'Space']);

/** Browser event adapter. The session remains the owner of Keyboard Assistance. */
export function bindDriverControls(onShortcut: (shortcut: Shortcut) => void, onRelease: () => void) {
  const pressed = new Set<string>();
  let suppressed = false;
  const isEditing = (target: EventTarget | null): boolean => target instanceof Element &&
    Boolean(target.closest('input, textarea, select, button, [contenteditable]'));
  const isPaused = (): boolean => document.hidden || !document.hasFocus() || Boolean(document.querySelector('dialog[open]'));
  function release(): void {
    pressed.clear();
    onRelease();
  }
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (isPaused() || isEditing(event.target)) {
      if (pressed.size) release();
      return;
    }
    if (drivingCodes.has(event.code)) {
      event.preventDefault();
      if (event.repeat && !pressed.has(event.code)) return;
      pressed.add(event.code);
    } else if (!event.repeat && shortcuts[event.code]) {
      event.preventDefault();
      if (shortcuts[event.code] === 'reset' || shortcuts[event.code] === 'mode') release();
      onShortcut(shortcuts[event.code]);
    }
  });
  window.addEventListener('keyup', (event) => pressed.delete(event.code));
  window.addEventListener('blur', release);
  window.addEventListener('focus', release);
  document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });
  document.addEventListener('focusin', (event) => { if (isEditing(event.target)) release(); });

  function readKeys(): KeyboardInputState {
    const blocked = isPaused() || isEditing(document.activeElement);
    if (blocked) {
      if (!suppressed || pressed.size) release();
      suppressed = true;
      return {};
    }
    suppressed = false;
    return {
      up: pressed.has('KeyW') || pressed.has('ArrowUp'),
      down: pressed.has('KeyS') || pressed.has('ArrowDown'),
      left: pressed.has('KeyA') || pressed.has('ArrowLeft'),
      right: pressed.has('KeyD') || pressed.has('ArrowRight'),
      space: pressed.has('Space'),
    };
  }
  return { readKeys, isPaused, release };
}
