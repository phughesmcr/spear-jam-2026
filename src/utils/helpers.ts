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

export function debounce<T extends (...args: any[]) => void>(
  func: T,
  delay: number,
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  return function (this: any, ...args: Parameters<T>): void {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      func.apply(this, args);
    }, delay);
  };
}
