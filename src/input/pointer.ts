const POINTER_EVENTS = ["pointermove", "pointerdown", "pointerup", "pointercancel"] as const;

export type PointerPhase = "move" | "down" | "up" | "cancel";
export type CanvasPointerInput = {
  readonly phase: PointerPhase;
  readonly x: number;
  readonly y: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly button: number;
};

type CanvasPointerCallback = (input: CanvasPointerInput) => void;
type CanvasSize = {
  readonly width: number;
  readonly height: number;
};
type ElementRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};
type PointerPositionEvent = {
  readonly clientX: number;
  readonly clientY: number;
};

export function canvasPointerPosition(
  event: PointerPositionEvent,
  rect: ElementRect,
  canvasSize: CanvasSize,
): { readonly x: number; readonly y: number } {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  return {
    x: ((event.clientX - rect.left) / rect.width) * canvasSize.width,
    y: ((event.clientY - rect.top) / rect.height) * canvasSize.height,
  };
}

export default class PointerState implements Disposable {
  private readonly target: HTMLElement;
  private readonly canvasSize: () => CanvasSize;
  private readonly pointerMap = new Map<PointerPhase, CanvasPointerCallback>();
  private readonly handlePointerEvent = (event: PointerEvent): void => {
    this.handleEvent(event);
  };

  constructor(target: HTMLElement, canvasSize: () => CanvasSize) {
    this.target = target;
    this.canvasSize = canvasSize;
    this.listenTo();
  }

  addMapping(phase: PointerPhase, callback: CanvasPointerCallback): void {
    this.pointerMap.set(phase, callback);
  }

  handleEvent(event: PointerEvent): void {
    if (!event.isPrimary) return;
    const phase = phaseForEventType(event.type);
    if (phase === undefined) return;
    const callback = this.pointerMap.get(phase);
    if (callback === undefined) return;

    event.preventDefault();
    this.updatePointerCapture(event, phase);
    const position = canvasPointerPosition(event, this.target.getBoundingClientRect(), this.canvasSize());
    callback({
      phase,
      x: position.x,
      y: position.y,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      button: event.button,
    });
  }

  [Symbol.dispose](): void {
    for (const eventName of POINTER_EVENTS) {
      this.target.removeEventListener(eventName, this.handlePointerEvent);
    }
    this.pointerMap.clear();
  }

  private listenTo(): void {
    for (const eventName of POINTER_EVENTS) {
      this.target.addEventListener(eventName, this.handlePointerEvent);
    }
  }

  private updatePointerCapture(event: PointerEvent, phase: PointerPhase): void {
    if (phase === "down" && !this.target.hasPointerCapture(event.pointerId)) {
      this.target.setPointerCapture(event.pointerId);
      return;
    }

    if ((phase === "up" || phase === "cancel") && this.target.hasPointerCapture(event.pointerId)) {
      this.target.releasePointerCapture(event.pointerId);
    }
  }
}

function phaseForEventType(type: string): PointerPhase | undefined {
  switch (type) {
    case "pointermove":
      return "move";
    case "pointerdown":
      return "down";
    case "pointerup":
      return "up";
    case "pointercancel":
      return "cancel";
    default:
      return undefined;
  }
}
