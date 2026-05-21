// Generates icon-192.png and icon-512.png with the bookmark glyph.
// Pure-Node PNG writer; no external dependencies.
import zlib from 'node:zlib';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function makePng(size, draw) {
  const w = size;
  const h = size;
  const bytesPerPixel = 4;
  const stride = w * bytesPerPixel;
  const raw = Buffer.alloc((stride + 1) * h);

  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter byte
    for (let x = 0; x < w; x++) {
      const off = y * (stride + 1) + 1 + x * 4;
      const [r, g, b, a] = draw(x, y, w, h);
      raw[off] = r;
      raw[off + 1] = g;
      raw[off + 2] = b;
      raw[off + 3] = a;
    }
  }

  const idat = zlib.deflateSync(raw);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length, 0);
    const typeBuf = Buffer.from(type, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
    return Buffer.concat([len, typeBuf, data, crc]);
  }

  function crc32(buf) {
    let c;
    const table = crc32.table || (crc32.table = (() => {
      const t = new Int32Array(256);
      for (let n = 0; n < 256; n++) {
        let c2 = n;
        for (let k = 0; k < 8; k++) {
          c2 = (c2 & 1) ? (0xedb88320 ^ (c2 >>> 1)) : (c2 >>> 1);
        }
        t[n] = c2;
      }
      return t;
    })());
    c = -1;
    for (let i = 0; i < buf.length; i++) {
      c = (c >>> 8) ^ table[(c ^ buf[i]) & 0xff];
    }
    return c ^ -1;
  }

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr.writeUInt8(8, 8);   // bit depth
  ihdr.writeUInt8(6, 9);   // color type RGBA
  ihdr.writeUInt8(0, 10);
  ihdr.writeUInt8(0, 11);
  ihdr.writeUInt8(0, 12);

  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

// Render: dark rounded square with a stylized bookmark glyph.
function drawBookmark(x, y, w, h) {
  const bg = [10, 10, 13, 255]; // #0a0a0d

  // outer "rounded" mask: just keep full square (PWA maskable handles cropping).
  // glyph: a centered bookmark, white, with cutout V at the bottom.
  const cx = w / 2;
  // bookmark dimensions
  const bw = Math.round(w * 0.46);
  const bh = Math.round(h * 0.6);
  const bx0 = Math.round(cx - bw / 2);
  const bx1 = bx0 + bw;
  const by0 = Math.round(h * 0.2);
  const by1 = by0 + bh;
  const cutDepth = Math.round(bh * 0.32);

  if (x >= bx0 && x < bx1 && y >= by0 && y < by1) {
    // inside the rectangle. Now subtract the V cutout from the bottom.
    if (y >= by1 - cutDepth) {
      const localY = by1 - y; // distance from bottom
      // V: x must be outside the inner triangle expanding from center
      const halfWidthAtY = Math.round((cutDepth - localY) * (bw / 2) / cutDepth);
      const innerLeft = cx - halfWidthAtY;
      const innerRight = cx + halfWidthAtY;
      if (x > innerLeft && x < innerRight) {
        return bg; // V cutout
      }
    }
    return [255, 255, 255, 255]; // white glyph
  }
  return bg;
}

const outDir = path.resolve(__dirname, '..', 'public');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'icon-192.png'), makePng(192, drawBookmark));
fs.writeFileSync(path.join(outDir, 'icon-512.png'), makePng(512, drawBookmark));
console.log('Wrote icon-192.png and icon-512.png');
