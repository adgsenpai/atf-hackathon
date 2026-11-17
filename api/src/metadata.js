// Strip location and other metadata from uploaded images without native deps.

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PNG_DROP = new Set(['eXIf', 'tEXt', 'zTXt', 'iTXt', 'tIME']);

export function detectType(buf) {
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 8 && buf.subarray(0, 8).equals(PNG_SIG)) return 'png';
  return null;
}

/** Remove APP1 (EXIF/XMP), APP3–APP15 and COM segments. Keeps APP0 (JFIF) and APP2 (ICC). */
export function stripJpeg(buf) {
  const out = [buf.subarray(0, 2)];
  let i = 2;
  while (i < buf.length) {
    if (buf[i] !== 0xff) throw new Error('Invalid JPEG');
    const marker = buf[i + 1];
    if (marker === 0xd9) { out.push(buf.subarray(i, i + 2)); break; }
    if (marker === 0xda) { out.push(buf.subarray(i)); break; } // start of scan: rest is image data
    if (marker >= 0xd0 && marker <= 0xd7) { out.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    const drop = marker === 0xe1 || (marker >= 0xe3 && marker <= 0xef) || marker === 0xfe;
    if (!drop) out.push(seg);
    i += 2 + len;
  }
  return Buffer.concat(out);
}

export function stripPng(buf) {
  const out = [PNG_SIG];
  let i = 8;
  while (i + 8 <= buf.length) {
    const len = buf.readUInt32BE(i);
    const type = buf.toString('latin1', i + 4, i + 8);
    const end = i + 12 + len;
    if (!PNG_DROP.has(type)) out.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}

export function stripMetadata(buf) {
  const type = detectType(buf);
  try {
    if (type === 'jpg') return { type, data: stripJpeg(buf) };
    if (type === 'png') return { type, data: stripPng(buf) };
  } catch { /* corrupt image */ }
  return { type: null, data: null };
}
