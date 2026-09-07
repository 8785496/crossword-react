/**
 * Minimal ZIP reader for .xlsx files (an .xlsx is a ZIP archive of XML
 * parts). The project has no runtime dependencies, so the archive format is
 * parsed by hand: the End of Central Directory record is located, the central
 * directory entries are walked, and each requested entry is cut out of the
 * file and inflated with the standard DecompressionStream ('deflate-raw').
 * Stored (uncompressed) and deflate entries are supported; Zip64, encrypted
 * and multi-disk archives are rejected with a clear error.
 */

import { PuzzleError } from './puzzle';

const EOCD_SIG = 0x06054b50;
const CD_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
/** EOCD is 22 bytes; the archive comment cannot exceed 65535. */
const EOCD_SCAN_LIMIT = 22 + 0xffff;
const METHOD_STORED = 0;
const METHOD_DEFLATE = 8;

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new PuzzleError([
      'Браузер не поддерживает распаковку XLSX — обновите браузер.',
    ]);
  }
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function findEocd(view: DataView): number {
  const end = view.byteLength;
  if (end < 22) {
    throw new PuzzleError(['Не удалось прочитать файл: это не книга Excel (XLSX).']);
  }
  const from = Math.max(0, end - EOCD_SCAN_LIMIT);
  for (let p = end - 22; p >= from; p--) {
    if (view.getUint32(p, true) === EOCD_SIG) return p;
  }
  throw new PuzzleError(['Не удалось прочитать файл: это не книга Excel (XLSX).']);
}

/** Read a ZIP archive; returns a map from entry name to uncompressed bytes. */
export async function unzipEntries(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const view = new DataView(buffer);
  const eocd = findEocd(view);
  const entryCount = view.getUint16(eocd + 10, true);
  let pos = view.getUint32(eocd + 16, true);

  const entries = new Map<string, Uint8Array>();
  const decoder = new TextDecoder();

  for (let i = 0; i < entryCount; i++) {
    if (pos + 46 > view.byteLength || view.getUint32(pos, true) !== CD_SIG) {
      throw new PuzzleError(['Не удалось прочитать файл: это не книга Excel (XLSX).']);
    }
    const flags = view.getUint16(pos + 8, true);
    const method = view.getUint16(pos + 10, true);
    const compressedSize = view.getUint32(pos + 20, true);
    const nameLen = view.getUint16(pos + 28, true);
    const extraLen = view.getUint16(pos + 30, true);
    const commentLen = view.getUint16(pos + 32, true);
    const localOffset = view.getUint32(pos + 42, true);
    const name = decoder.decode(new Uint8Array(buffer, pos + 46, nameLen));
    pos += 46 + nameLen + extraLen + commentLen;

    if (flags & 0x1) {
      throw new PuzzleError([
        'Файл защищён паролем — снимите защиту листа в Excel и сохраните заново.',
      ]);
    }
    if (localOffset + 30 > view.byteLength || view.getUint32(localOffset, true) !== LOCAL_SIG) {
      throw new PuzzleError(['Не удалось прочитать файл: это не книга Excel (XLSX).']);
    }
    const localNameLen = view.getUint16(localOffset + 26, true);
    const localExtraLen = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLen + localExtraLen;
    const dataEnd = dataStart + compressedSize;
    if (dataEnd > view.byteLength) {
      throw new PuzzleError(['Не удалось прочитать файл: это не книга Excel (XLSX).']);
    }
    const packed = new Uint8Array(buffer, dataStart, compressedSize);

    let bytes: Uint8Array;
    if (method === METHOD_STORED) {
      bytes = packed;
    } else if (method === METHOD_DEFLATE) {
      bytes = await inflateRaw(packed);
    } else {
      throw new PuzzleError([`Запись «${name}» сжата неподдерживаемым способом.`]);
    }
    entries.set(name, bytes);
  }
  return entries;
}
