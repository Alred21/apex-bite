import type { KeyboardInputState } from '../simulation/types';

type Shortcut = 'camera' | 'line' | 'ghost' | 'mode' | 'reset';
const shortcuts: Record<string, Shortcut> = {
  KeyC: 'camera', KeyV: 'camera', KeyL: 'line', KeyG: 'ghost', KeyM: 'mode', KeyR: 'reset',
};
export type DrivingAction = 'accelerator' | 'brake' | 'left' | 'right';
export type DrivingBindings = Record<DrivingAction, string[]>;
export interface BindingChangeResult { accepted: boolean; message: string; }
export const DRIVING_ACTION_LABELS: Record<DrivingAction, string> = {
  accelerator: 'Accelerator', brake: 'Brake/Reverse', left: 'Steer Left', right: 'Steer Right',
};
export const DEFAULT_DRIVING_BINDINGS: Readonly<Record<DrivingAction, readonly string[]>> = {
  accelerator: ['KeyW', 'ArrowUp'], brake: ['Space', 'KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
};
export function formatDrivingKey(code: string): string {
  return code === 'Space' ? 'Space' : code.replace(/^Key|^Digit/, '').replace('Arrow', '');
}
const defaultBindings = (): DrivingBindings => ({
  accelerator: [...DEFAULT_DRIVING_BINDINGS.accelerator], brake: [...DEFAULT_DRIVING_BINDINGS.brake],
  left: [...DEFAULT_DRIVING_BINDINGS.left], right: [...DEFAULT_DRIVING_BINDINGS.right],
});

/** Browser event adapter. The session remains the owner of Keyboard Assistance. */
export function bindDriverControls(onShortcut: (shortcut: Shortcut) => void, onRelease: () => void) {
  const pressed = new Set<string>();
  let bindings = defaultBindings();
  let suppressed = false;
  const isEditing = (target: EventTarget | null): boolean => target instanceof Element &&
    Boolean(target.closest('input, textarea, select, button, [contenteditable]'));
  const isPaused = (): boolean => document.hidden || !document.hasFocus() || Boolean(document.querySelector('dialog[open]'));
  function release(): void {
    pressed.clear();
    onRelease();
  }
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
    if (isPaused() || isEditing(event.target)) {
      if (pressed.size) release();
      return;
    }
    if (Object.values(bindings).some((codes) => codes.includes(event.code))) {
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
      up: bindings.accelerator.some((code) => pressed.has(code)),
      down: bindings.brake.some((code) => pressed.has(code)),
      left: bindings.left.some((code) => pressed.has(code)),
      right: bindings.right.some((code) => pressed.has(code)),
    };
  }
  function setBinding(action: DrivingAction, code: string): BindingChangeResult {
    if (!/^Key[A-Z]$|^Digit[0-9]$|^Arrow(Up|Down|Left|Right)$|^Space$/.test(code)) {
      return { accepted: false, message: 'Choose a letter, number, arrow key or Space.' };
    }
    if (shortcuts[code]) return { accepted: false, message: `${formatDrivingKey(code)} is reserved for ${shortcuts[code]}. Choose another key.` };
    const conflict = (Object.keys(bindings) as DrivingAction[]).find((other) => other !== action && bindings[other].includes(code));
    if (conflict) return { accepted: false, message: `${formatDrivingKey(code)} already belongs to ${DRIVING_ACTION_LABELS[conflict]}. Choose another key.` };
    release();
    bindings[action] = [code];
    return { accepted: true, message: `${DRIVING_ACTION_LABELS[action]} now uses ${formatDrivingKey(code)}. Its previous aliases have been replaced.` };
  }
  function restoreDefaultBindings(): void { release(); bindings = defaultBindings(); }
  function getBindings(): DrivingBindings {
    return { accelerator: [...bindings.accelerator], brake: [...bindings.brake], left: [...bindings.left], right: [...bindings.right] };
  }
  return { readKeys, isPaused, release, getBindings, setBinding, restoreDefaultBindings };
}
