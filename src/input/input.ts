import Keyboard from "@/src/input/keyboard.ts";

const KEYMAP = {
  FORWARD: "KeyW",
  BACK: "KeyS",
  STRAFE_LEFT: "KeyA",
  STRAFE_RIGHT: "KeyD",
  TURN_LEFT: "KeyQ",
  TURN_RIGHT: "KeyE",
  INTERACT: "Comma",
  ATTACK: "Period",
  MENU: "Escape",
  PAUSE: "KeyP",
  ITEM_1: "Digit1",
  ITEM_2: "Digit2",
  ITEM_3: "Digit3",
  WEAPON_1: "Digit4",
  WEAPON_2: "Digit5",
  WEAPON_3: "Digit6",
};

export class InputRouter implements Disposable {
  private receivers: Set<any>;

  constructor() {
    this.receivers = new Set();
  }

  addReceiver(receiver: any) {
    this.receivers.add(receiver);
  }

  dropReceiver(receiver: any) {
    this.receivers.delete(receiver);
  }

  route(routeInput: (receiver: any) => void) {
    for (const receiver of this.receivers) {
      routeInput(receiver);
    }
  }

  [Symbol.dispose](): void {
    this.receivers.clear();
  }
}

export function setupKeyboard(host: typeof globalThis) {
  const input = new Keyboard(host);
  const router = new InputRouter();

  input.addMapping(KEYMAP.FORWARD, (keyState) => {
    if (keyState) {
      router.route((entity) => entity.move({ dx: 0, dy: 1 }));
    }
  });

  input.addMapping(KEYMAP.BACK, (keyState) => {
    if (keyState) {
      router.route((entity) => entity.move({ dx: 0, dy: -1 }));
    }
  });

  input.addMapping(KEYMAP.STRAFE_LEFT, (keyState) => {
    if (keyState) {
      router.route((entity) => entity.move({ dx: -1, dy: 0 }));
    }
  });

  input.addMapping(KEYMAP.STRAFE_RIGHT, (keyState) => {
    if (keyState) {
      router.route((entity) => entity.move({ dx: 1, dy: 0 }));
    }
  });

  input.addMapping(KEYMAP.TURN_LEFT, (keyState) => {
    if (keyState) {
      router.route((entity) => entity.turn(-1));
    }
  });

  input.addMapping(KEYMAP.TURN_RIGHT, (keyState) => {
    if (keyState) {
      router.route((entity) => entity.turn(1));
    }
  });

  return router;
}
