const POINTER_EVENTS = ["pointermove", "pointerdown", "pointerup", "pointercancel"] as const;
const TAP_PRIMARY_INPUT_QUERY = "(hover: none) and (pointer: coarse)";

export type PointerPhase = "move" | "down" | "up" | "cancel";
export type PointerInteraction = "cursor" | "tap";
export type CanvasPointerInput = {
  readonly phase: PointerPhase;
  readonly x: number;
  readonly y: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly interaction: PointerInteraction;
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

export function setupPointer(
  target: HTMLElement,
  canvasSize: () => CanvasSize,
  receiver: CanvasPointerCallback,
): Disposable {
  const tapPrimaryInput = target.ownerDocument.defaultView?.matchMedia(TAP_PRIMARY_INPUT_QUERY);

  function handlePointerEvent(event: PointerEvent): void {
    if (!event.isPrimary) return;
    const phase = phaseForEventType(event.type);
    if (phase === undefined) return;

    event.preventDefault();
    updatePointerCapture(target, event, phase);
    const position = canvasPointerPosition(event, target.getBoundingClientRect(), canvasSize());
    receiver({
      phase,
      x: position.x,
      y: position.y,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      interaction: pointerInteraction(event.pointerType, tapPrimaryInput?.matches === true),
      button: event.button,
    });
  }

  for (const eventName of POINTER_EVENTS) {
    target.addEventListener(eventName, handlePointerEvent);
  }

  return {
    [Symbol.dispose](): void {
      for (const eventName of POINTER_EVENTS) {
        target.removeEventListener(eventName, handlePointerEvent);
      }
    },
  };
}

export function pointerInteraction(pointerType: string, tapPrimaryInput: boolean): PointerInteraction {
  return pointerType === "touch" || pointerType === "pen" || tapPrimaryInput ? "tap" : "cursor";
}

function updatePointerCapture(target: HTMLElement, event: PointerEvent, phase: PointerPhase): void {
  if (phase === "down" && !target.hasPointerCapture(event.pointerId)) {
    target.setPointerCapture(event.pointerId);
    return;
  }

  if ((phase === "up" || phase === "cancel") && target.hasPointerCapture(event.pointerId)) {
    target.releasePointerCapture(event.pointerId);
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
