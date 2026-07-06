export class DisposableListener implements Disposable {
  private readonly dispose: () => void;

  constructor(host: EventTarget, event: string, listener: (event: Event) => void) {
    host.addEventListener(event, listener);
    this.dispose = () => host.removeEventListener(event, listener);
  }

  [Symbol.dispose](): void {
    this.dispose();
  }
}

export function debounce<This, Args extends unknown[]>(
  func: (this: This, ...args: Args) => void,
  delay: number,
): (this: This, ...args: Args) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function (this: This, ...args: Args): void {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}
