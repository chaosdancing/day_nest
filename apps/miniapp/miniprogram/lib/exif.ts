/**
 * Tiny EXIF reader. Extracts only DateTimeOriginal (tag 0x9003) from a JPEG
 * APP1 segment. Designed to be small and robust — any parse error returns
 * a sentinel { dateTimeOriginal: null } rather than throwing. Heavy lifting
 * libraries like exifr are too large for a mini-program bundle.
 */

export interface ExifInfo {
  dateTimeOriginal: string | null;
}

const EXIF_NULL: ExifInfo = { dateTimeOriginal: null };

export function parseExif(buf: ArrayBuffer): ExifInfo {
  try {
    const view = new DataView(buf);
    // SOI marker
    if (buf.byteLength < 4 || view.getUint16(0) !== 0xFFD8) return EXIF_NULL;
    // Walk segments to find APP1 (0xFFE1) with "Exif\0\0" magic
    let offset = 2;
    while (offset < buf.byteLength - 8) {
      if (view.getUint8(offset) !== 0xFF) return EXIF_NULL;
      const marker = view.getUint8(offset + 1);
      const segLen = view.getUint16(offset + 2);
      if (marker === 0xDA /* SOS */ || marker === 0xD9 /* EOI */) return EXIF_NULL;
      if (marker === 0xE1) {
        const magic = readAscii(view, offset + 4, 6);
        if (magic === 'Exif\0\0') {
          return parseTiff(buf, offset + 10, segLen - 8);
        }
      }
      offset += 2 + segLen;
    }
    return EXIF_NULL;
  } catch {
    return EXIF_NULL;
  }
}

function readAscii(view: DataView, offset: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += String.fromCharCode(view.getUint8(offset + i));
  }
  return out;
}

function parseTiff(buf: ArrayBuffer, tiffOffset: number, _maxLen: number): ExifInfo {
  try {
    const view = new DataView(buf);
    const order = view.getUint16(tiffOffset);
    const little = order === 0x4949; // 'II'
    if (!little && order !== 0x4D4D /* 'MM' */) return EXIF_NULL;
    const u16 = (off: number) => view.getUint16(off, little);
    const u32 = (off: number) => view.getUint32(off, little);
    if (u16(tiffOffset + 2) !== 0x002A) return EXIF_NULL;
    const ifd0Offset = tiffOffset + u32(tiffOffset + 4);

    // Walk IFD0 to find ExifOffset (0x8769)
    const exifOffset = findTagValue(view, ifd0Offset, 0x8769, u16, u32);
    if (exifOffset === null) return EXIF_NULL;
    const exifIfdOffset = tiffOffset + exifOffset;

    // Walk ExifIFD to find DateTimeOriginal (0x9003) — ASCII, 20 bytes incl. null
    const dtoOffset = findTagValue(view, exifIfdOffset, 0x9003, u16, u32);
    if (dtoOffset === null) return EXIF_NULL;
    const raw = readAscii(view, tiffOffset + dtoOffset, 19); // "YYYY:MM:DD HH:MM:SS"
    return { dateTimeOriginal: formatExifDate(raw) };
  } catch {
    return EXIF_NULL;
  }
}

/**
 * Find a tag in an IFD and return its 32-bit value. Only handles tags whose
 * value is itself a 32-bit offset (ExifOffset) or a small ASCII whose offset
 * is stored in the value slot. Returns the value-slot interpretation as a
 * uint32; callers interpret it as an offset relative to the TIFF base.
 */
function findTagValue(
  view: DataView,
  ifdOffset: number,
  targetTag: number,
  u16: (off: number) => number,
  u32: (off: number) => number,
): number | null {
  const count = u16(ifdOffset);
  for (let i = 0; i < count; i++) {
    const entry = ifdOffset + 2 + i * 12;
    const tag = u16(entry);
    if (tag === targetTag) {
      return u32(entry + 8);
    }
  }
  return null;
}

function formatExifDate(raw: string): string | null {
  // EXIF format: "YYYY:MM:DD HH:MM:SS"
  const m = raw.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

/**
 * Read up to 64KB from a wx temp file path and parse EXIF from it. Returns
 * a sentinel { dateTimeOriginal: null } on any I/O or parse failure. This
 * wrapper is only used at runtime in the mini-program (the unit tests call
 * parseExif directly with a fixture).
 */
export function readExifFromPath(filePath: string): Promise<ExifInfo> {
  return new Promise((resolveOk) => {
    try {
      const fs = wx.getFileSystemManager();
      fs.readFile({
        filePath,
        position: 0,
        length: 65536,
        success: (res) => {
          const data = res.data;
          const buf = typeof data === 'string'
            ? new TextEncoder().encode(data).buffer
            : data;
          resolveOk(parseExif(buf as ArrayBuffer));
        },
        fail: () => resolveOk(EXIF_NULL),
      });
    } catch {
      resolveOk(EXIF_NULL);
    }
  });
}
