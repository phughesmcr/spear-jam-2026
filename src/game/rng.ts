/** A source of pseudo-random floats in [0, 1). */
export type RandomSource = () => number;

const UINT32_RANGE = 0x1_0000_0000;
const SPLITMIX32_INCREMENT = 0x9e37_79b9;

export class SplitMix32 {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  getState(): number {
    return this.state;
  }

  nextFloat(): number {
    return this.nextUint32() / UINT32_RANGE;
  }

  nextUint32(): number {
    this.state = (this.state + SPLITMIX32_INCREMENT) >>> 0;
    let value = this.state;
    value = Math.imul(value ^ (value >>> 16), 0x85eb_ca6b) >>> 0;
    value = Math.imul(value ^ (value >>> 13), 0xc2b2_ae35) >>> 0;
    return (value ^ (value >>> 16)) >>> 0;
  }
}
