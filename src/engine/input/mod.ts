export type InputSize = {
  readonly width: number;
  readonly height: number;
};

export type PointerPhase = "move" | "down" | "up" | "cancel";
export type PointerInteraction = "cursor" | "tap";

export type PointerInput = {
  readonly phase: PointerPhase;
  readonly x: number;
  readonly y: number;
  readonly pointerId: number;
  readonly pointerType: string;
  readonly interaction: PointerInteraction;
  readonly button: number;
};

export type KeyPress = {
  readonly code: string;
};

export type TouchGesture =
  | { readonly type: "tap"; readonly x: number; readonly y: number }
  | { readonly type: "doubleTap"; readonly x: number; readonly y: number }
  | { readonly type: "swipe"; readonly direction: "up" | "down" | "left" | "right" };
