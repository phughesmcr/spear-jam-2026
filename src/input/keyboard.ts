const PRESSED = 1;
const RELEASED = 0;

export default class KeyboardState implements Disposable {
  private host: typeof globalThis;
  private keyStates: Map<string, number>;
  private keyMap: Map<string, (keyState: number) => void>;
  private listeners: Set<(event: KeyboardEvent) => void>;

  private listenTo() {
    ["keydown", "keyup"].forEach((eventName) => {
      const handler = (event: KeyboardEvent) => this.handleEvent(event as KeyboardEvent);
      this.host.addEventListener(eventName as keyof WindowEventMap, handler as EventListener);
      this.listeners.add(handler);
    });
  }

  constructor(host: typeof globalThis) {
    this.keyStates = new Map();
    this.keyMap = new Map();
    this.listeners = new Set();
    this.host = host;
    this.listenTo();
  }

  addMapping(code: string, callback: (keyState: number) => void) {
    this.keyMap.set(code, callback);
  }

  handleEvent(event: KeyboardEvent) {
    const { code } = event;
    if (!this.keyMap.has(code)) return;
    event.preventDefault();
    const keyState = event.type === "keydown" ? PRESSED : RELEASED;
    if (this.keyStates.get(code) === keyState) return;
    this.keyStates.set(code, keyState);
    this.keyMap.get(code)?.(keyState);
  }

  [Symbol.dispose](): void {
    ["keydown", "keyup"].forEach((eventName) => {
      for (const listener of this.listeners) {
        this.host.removeEventListener(eventName as keyof WindowEventMap, listener as EventListener);
      }
    });
    this.listeners.clear();
    this.keyStates.clear();
    this.keyMap.clear();
  }
}
