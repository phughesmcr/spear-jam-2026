const KEY_EVENTS = ["keydown", "keyup"] as const;

export default class KeyboardState implements Disposable {
  private readonly window: Window;
  private readonly keyStates = new Map<string, boolean>();
  private readonly keyMap = new Map<string, (keyState: boolean) => void>();
  private readonly handleKeyboardEvent = (event: KeyboardEvent): void => {
    this.handleEvent(event);
  };
  private readonly clearKeyStates = (): void => {
    this.keyStates.clear();
  };

  constructor(window: Window) {
    this.window = window;
    this.listenTo();
  }

  addMapping(code: string, callback: (keyState: boolean) => void): void {
    this.keyMap.set(code, callback);
  }

  handleEvent(event: KeyboardEvent): void {
    const { code } = event;
    if (!this.keyMap.has(code)) return;
    event.preventDefault();
    const keyState = event.type === "keydown";
    if (this.keyStates.get(code) === keyState) return;
    this.keyStates.set(code, keyState);
    this.keyMap.get(code)?.(keyState);
  }

  [Symbol.dispose](): void {
    for (const eventName of KEY_EVENTS) {
      this.window.removeEventListener(eventName, this.handleKeyboardEvent);
    }
    this.window.removeEventListener("blur", this.clearKeyStates);
    this.window.document.removeEventListener("visibilitychange", this.clearKeyStates);
    this.keyStates.clear();
    this.keyMap.clear();
  }

  private listenTo(): void {
    for (const eventName of KEY_EVENTS) {
      this.window.addEventListener(eventName, this.handleKeyboardEvent);
    }
    this.window.addEventListener("blur", this.clearKeyStates);
    this.window.document.addEventListener("visibilitychange", this.clearKeyStates);
  }
}
