// Validator for the "24 November 2026 in one image" make.fun entry.
//
// Checks entry.png next to this file:
//   - it is a PNG (8-byte signature)
//   - its IHDR chunk is first and declares 1024x1024
//   - bit depth is 8 and colour type is 2 (truecolour RGB)
//   - every chunk length stays inside the file (IDAT bounds included)
//   - the file ends with a valid IEND chunk
//   - the file is at most 1 MiB
// On success it copies entry.png to the output path and prints a log line.
//
// Output path resolution: first CLI argument, else MAKEFUN_OUTPUT_DIR,
// else /output. Exit code 0 on success, 1 on any failure.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);
const MAX_BYTES = 1024 * 1024;
const EXPECTED_WIDTH = 1024;
const EXPECTED_HEIGHT = 1024;

function fail(message: string): never {
  console.error(`entry.png: FAIL: ${message}`);
  process.exit(1);
}

function main(): void {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = join(here, "entry.png");
  let data: Buffer;
  try {
    data = readFileSync(source);
  } catch {
    fail(`cannot read ${source}`);
  }

  if (data.length > MAX_BYTES) {
    fail(`file is ${data.length} bytes, over the 1 MiB limit`);
  }
  if (data.length < 8 || !data.subarray(0, 8).equals(PNG_SIGNATURE)) {
    fail("missing PNG signature");
  }

  // Walk the chunk stream: length (4) + type (4) + data + CRC (4).
  let offset = 8;
  let sawIend = false;
  let sawIdat = false;
  let first = true;
  while (offset + 8 <= data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.toString("latin1", offset + 4, offset + 8);
    const chunkEnd = offset + 8 + length + 4;
    if (chunkEnd > data.length) {
      fail(`chunk ${type} at offset ${offset} runs past end of file`);
    }
    if (first) {
      if (type !== "IHDR") {
        fail(`first chunk is ${type}, expected IHDR`);
      }
      if (length !== 13) {
        fail(`IHDR length is ${length}, expected 13`);
      }
      const width = data.readUInt32BE(offset + 8);
      const height = data.readUInt32BE(offset + 12);
      if (width !== EXPECTED_WIDTH || height !== EXPECTED_HEIGHT) {
        fail(`dimensions are ${width}x${height}, expected 1024x1024`);
      }
      const bitDepth = data[offset + 16];
      const colorType = data[offset + 17];
      if (bitDepth !== 8) {
        fail(`bit depth is ${bitDepth}, expected 8`);
      }
      if (colorType !== 2) {
        fail(`colour type is ${colorType}, expected 2 (truecolour RGB)`);
      }
      first = false;
    }
    if (type === "IDAT") {
      sawIdat = true;
    }
    if (type === "IEND") {
      if (length !== 0) {
        fail(`IEND length is ${length}, expected 0`);
      }
      if (chunkEnd !== data.length) {
        fail("trailing data after IEND chunk");
      }
      sawIend = true;
      break;
    }
    offset = chunkEnd;
  }
  if (!sawIend) {
    fail("no IEND chunk found");
  }
  if (!sawIdat) {
    fail("no IDAT chunk found (image has no pixel data)");
  }

  const outDir =
    process.argv[2] ?? process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  const outPath = join(outDir, basename(source));
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, data);
  console.log(
    `entry.png: 1024x1024, ${data.length} bytes -> ${outPath}`,
  );
}

main();
