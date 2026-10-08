export const INPUT_ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'interact', 'restart'] as const;
export type InputAction = (typeof INPUT_ACTIONS)[number];

const KEY_ACTIONS: Readonly<Record<string, InputAction>> = {
  ArrowLeft: 'left',
  KeyA: 'left',
  ArrowRight: 'right',
  KeyD: 'right',
  ArrowUp: 'up',
  KeyW: 'up',
  ArrowDown: 'down',
  KeyS: 'down',
  Space: 'jump',
  KeyE: 'interact',
  KeyR: 'restart'
};

export class InputState {
  private readonly activeSources = new Map<string, InputAction>();
  private readonly actionSources = new Map<InputAction, Set<string>>();
  private readonly pressed = new Set<InputAction>();
  private cleanup: (() => void) | null = null;

  isDown(action: InputAction): boolean {
    return (this.actionSources.get(action)?.size ?? 0) > 0;
  }

  consumePressed(action: InputAction): boolean {
    const wasPressed = this.pressed.has(action);
    this.pressed.delete(action);
    return wasPressed;
  }

  press(action: InputAction, pointerId: number): void {
    this.pressSource(action, `pointer:${pointerId}`);
  }

  release(pointerId: number): void {
    this.releaseSource(`pointer:${pointerId}`);
  }

  releaseAll(): void {
    this.activeSources.clear();
    this.actionSources.clear();
    this.pressed.clear();
  }

  bindControls(container: HTMLElement): () => void {
    this.cleanup?.();
    const buttons = Array.from(container.querySelectorAll<HTMLElement>('[data-input]'));
    const removers: Array<() => void> = [];
    const updateButtons = () => {
      buttons.forEach((button) => {
        const action = button.dataset.input as InputAction | undefined;
        button.classList.toggle('pressed', !!action && this.isDown(action));
      });
    };
    const listen = <K extends keyof WindowEventMap>(
      target: Window,
      type: K,
      listener: (event: WindowEventMap[K]) => void
    ) => {
      target.addEventListener(type, listener);
      removers.push(() => target.removeEventListener(type, listener));
    };
    const listenDocument = <K extends keyof DocumentEventMap>(
      type: K,
      listener: (event: DocumentEventMap[K]) => void
    ) => {
      document.addEventListener(type, listener);
      removers.push(() => document.removeEventListener(type, listener));
    };

    buttons.forEach((button) => {
      const pointerDown = (event: PointerEvent) => {
        const action = button.dataset.input as InputAction | undefined;
        if (!action || !INPUT_ACTIONS.includes(action)) return;
        event.preventDefault();
        button.setPointerCapture?.(event.pointerId);
        this.press(action, event.pointerId);
        updateButtons();
      };
      const pointerRelease = (event: PointerEvent) => {
        this.release(event.pointerId);
        updateButtons();
      };
      button.addEventListener('pointerdown', pointerDown);
      button.addEventListener('pointerup', pointerRelease);
      button.addEventListener('pointercancel', pointerRelease);
      button.addEventListener('lostpointercapture', pointerRelease);
      removers.push(() => {
        button.removeEventListener('pointerdown', pointerDown);
        button.removeEventListener('pointerup', pointerRelease);
        button.removeEventListener('pointercancel', pointerRelease);
        button.removeEventListener('lostpointercapture', pointerRelease);
      });
    });

    const releasePointer = (event: PointerEvent) => {
      this.release(event.pointerId);
      updateButtons();
    };
    const keyDown = (event: KeyboardEvent) => {
      if (this.isEditableTarget(event.target)) return;
      const action = KEY_ACTIONS[event.code];
      if (!action) return;
      event.preventDefault();
      this.pressSource(action, `key:${event.code}`);
    };
    const keyUp = (event: KeyboardEvent) => {
      const source = `key:${event.code}`;
      if (!this.activeSources.has(source)) return;
      event.preventDefault();
      this.releaseSource(source);
    };
    const cancelAll = () => {
      this.releaseAll();
      updateButtons();
    };

    listen(window, 'pointerup', releasePointer);
    listen(window, 'pointercancel', releasePointer);
    listen(window, 'keydown', keyDown);
    listen(window, 'keyup', keyUp);
    listen(window, 'blur', cancelAll);
    listenDocument('visibilitychange', cancelAll);

    this.cleanup = () => {
      removers.forEach((remove) => remove());
      cancelAll();
      this.cleanup = null;
    };
    return this.cleanup;
  }

  private pressSource(action: InputAction, source: string): void {
    const previous = this.activeSources.get(source);
    if (previous === action) return;
    if (previous) this.releaseSource(source);
    const sources = this.actionSources.get(action) ?? new Set<string>();
    if (sources.size === 0) this.pressed.add(action);
    sources.add(source);
    this.actionSources.set(action, sources);
    this.activeSources.set(source, action);
  }

  private releaseSource(source: string): void {
    const action = this.activeSources.get(source);
    if (!action) return;
    this.activeSources.delete(source);
    const sources = this.actionSources.get(action);
    sources?.delete(source);
    if (sources?.size === 0) this.actionSources.delete(action);
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    return target instanceof HTMLElement &&
      (target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));
  }
}
