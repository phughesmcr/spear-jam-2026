import { PNG_SIGNATURE } from "@/src/map/authoring/catalog.ts";
import { concatBytes } from "./json_utils.ts";

export type RgbaImage = {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
};

export async function pngDimensions(path: string): Promise<{ readonly width: number; readonly height: number }> {
  const bytes = await Deno.readFile(path);
  if (bytes.length < 24) throw new Error(`${path} is not a valid PNG file.`);
  for (let index = 0; index < PNG_SIGNATURE.length; index++) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new Error(`${path} is not a valid PNG file.`);
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    width: view.getUint32(16),
    height: view.getUint32(20),
  };
}

export async function readPngImage(path: string): Promise<RgbaImage> {
  const bytes = await Deno.readFile(path);
  validatePngSignature(path, bytes);
  let offset = PNG_SIGNATURE.length;
  let width = 0;
  let height = 0;
  let colorType = -1;
  const idatChunks: Uint8Array[] = [];

  while (offset < bytes.length) {
    const chunkLength = uint32(bytes, offset);
    const chunkType = new TextDecoder().decode(bytes.subarray(offset + 4, offset + 8));
    const chunkData = bytes.subarray(offset + 8, offset + 8 + chunkLength);
    if (chunkType === "IHDR") {
      width = uint32(chunkData, 0);
      height = uint32(chunkData, 4);
      const bitDepth = chunkData[8];
      colorType = chunkData[9]!;
      const interlace = chunkData[12];
      if (bitDepth !== 8 || colorType !== 2 || interlace !== 0) {
        throw new Error(`${path} must be an 8-bit non-interlaced RGB PNG.`);
      }
    } else if (chunkType === "IDAT") {
      idatChunks.push(chunkData);
    } else if (chunkType === "IEND") {
      break;
    }
    offset += 12 + chunkLength;
  }

  if (width <= 0 || height <= 0 || colorType !== 2) throw new Error(`${path} is missing PNG image data.`);
  const compressed = concatBytes(idatChunks);
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(compressed);
      controller.close();
    },
  });
  const decompressor = new DecompressionStream("deflate") as unknown as TransformStream<Uint8Array, Uint8Array>;
  const inflated = new Uint8Array(await new Response(stream.pipeThrough(decompressor)).arrayBuffer());
  return decodeRgbPngScanlines(path, width, height, inflated);
}

export function encodePng(width: number, height: number, pixels: Uint8Array): Uint8Array {
  const scanlineLength = 1 + width * 4;
  const raw = new Uint8Array(scanlineLength * height);
  for (let y = 0; y < height; y++) {
    const rawOffset = y * scanlineLength;
    raw[rawOffset] = 0;
    raw.set(pixels.subarray(y * width * 4, (y + 1) * width * 4), rawOffset + 1);
  }

  return concatBytes([
    new Uint8Array(PNG_SIGNATURE),
    pngChunk("IHDR", ihdrData(width, height)),
    pngChunk("IDAT", zlibStored(raw)),
    pngChunk("IEND", new Uint8Array()),
  ]);
}

function decodeRgbPngScanlines(path: string, width: number, height: number, data: Uint8Array): RgbaImage {
  const bytesPerPixel = 3;
  const stride = width * bytesPerPixel;
  const expectedLength = height * (stride + 1);
  if (data.length !== expectedLength) {
    throw new Error(`${path} has unexpected PNG scanline length ${data.length}; expected ${expectedLength}.`);
  }

  const rgb = new Uint8Array(height * stride);
  for (let y = 0; y < height; y++) {
    const filter = data[y * (stride + 1)]!;
    const sourceOffset = y * (stride + 1) + 1;
    const targetOffset = y * stride;
    for (let x = 0; x < stride; x++) {
      const raw = data[sourceOffset + x]!;
      const left = x >= bytesPerPixel ? rgb[targetOffset + x - bytesPerPixel]! : 0;
      const up = y > 0 ? rgb[targetOffset + x - stride]! : 0;
      const upLeft = y > 0 && x >= bytesPerPixel ? rgb[targetOffset + x - stride - bytesPerPixel]! : 0;
      rgb[targetOffset + x] = unfilterPngByte(filter, raw, left, up, upLeft);
    }
  }

  const pixels = new Uint8Array(width * height * 4);
  for (let source = 0, target = 0; source < rgb.length; source += 3, target += 4) {
    pixels[target] = rgb[source]!;
    pixels[target + 1] = rgb[source + 1]!;
    pixels[target + 2] = rgb[source + 2]!;
    pixels[target + 3] = 0xff;
  }
  return { width, height, pixels };
}

function unfilterPngByte(filter: number, raw: number, left: number, up: number, upLeft: number): number {
  switch (filter) {
    case 0:
      return raw;
    case 1:
      return (raw + left) & 0xff;
    case 2:
      return (raw + up) & 0xff;
    case 3:
      return (raw + Math.floor((left + up) / 2)) & 0xff;
    case 4:
      return (raw + paethPredictor(left, up, upLeft)) & 0xff;
    default:
      throw new Error(`Unsupported PNG filter ${filter}.`);
  }
}

function paethPredictor(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upLeftDistance = Math.abs(estimate - upLeft);
  if (leftDistance <= upDistance && leftDistance <= upLeftDistance) return left;
  if (upDistance <= upLeftDistance) return up;
  return upLeft;
}

function validatePngSignature(path: string, bytes: Uint8Array): void {
  if (bytes.length < 24) throw new Error(`${path} is not a valid PNG file.`);
  for (let index = 0; index < PNG_SIGNATURE.length; index++) {
    if (bytes[index] !== PNG_SIGNATURE[index]) throw new Error(`${path} is not a valid PNG file.`);
  }
}

function uint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset + offset, 4).getUint32(0);
}

function ihdrData(width: number, height: number): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = 8;
  data[9] = 6;
  return data;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typeBytes = new TextEncoder().encode(type);
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(typeBytes, 4);
  chunk.set(data, 8);
  view.setUint32(8 + data.length, crc32(concatBytes([typeBytes, data])));
  return chunk;
}

function zlibStored(data: Uint8Array): Uint8Array {
  const blocks: Uint8Array[] = [new Uint8Array([0x78, 0x01])];
  for (let offset = 0; offset < data.length; offset += 0xffff) {
    const block = data.subarray(offset, Math.min(offset + 0xffff, data.length));
    const header = new Uint8Array(5);
    header[0] = offset + block.length >= data.length ? 0x01 : 0x00;
    header[1] = block.length & 0xff;
    header[2] = block.length >> 8;
    const inverse = 0xffff - block.length;
    header[3] = inverse & 0xff;
    header[4] = inverse >> 8;
    blocks.push(header, block);
  }

  const checksum = new Uint8Array(4);
  new DataView(checksum.buffer).setUint32(0, adler32(data));
  blocks.push(checksum);
  return concatBytes(blocks);
}

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function adler32(data: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of data) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}
