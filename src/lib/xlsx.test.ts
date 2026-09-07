import { describe, expect, it } from 'vitest';

import { parseXlsxWords } from './xlsx';
import { generatePuzzle } from './generator';
import { PuzzleError, validatePuzzle } from './puzzle';

// ---------- Test-only ZIP writer (read back by src/lib/zip.ts) ----------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

async function deflateRaw(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Build an in-memory ZIP archive (deflate or stored) from text parts. */
async function buildZip(files: Record<string, string>, compress = true): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const body: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(content);
    const packed = compress ? await deflateRaw(raw) : raw;
    const method = compress ? 8 : 0;

    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true); // UTF-8 names
    lv.setUint16(8, method, true);
    lv.setUint32(14, crc32(raw), true);
    lv.setUint32(18, packed.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    body.push(local, packed);

    const cd = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, method, true);
    cv.setUint32(16, crc32(raw), true);
    cv.setUint32(20, packed.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameBytes, 46);
    central.push(cd);
    offset += local.length + packed.length;
  }

  const cdStart = offset;
  const cdSize = central.reduce((sum, c) => sum + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, cdStart, true);

  const out = new Uint8Array(cdStart + cdSize + 22);
  let pos = 0;
  for (const chunk of [...body, ...central, eocd]) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  return out.buffer;
}

// ---------- XLSX fixtures ----------

const WORKBOOK_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
  '<sheets><sheet name="Слова" sheetId="1" r:id="rId1"/></sheets></workbook>';

const WORKBOOK_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" ' +
  'Target="worksheets/sheet1.xml"/></Relationships>';

function sheetXml(rowsXml: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    `<sheetData>${rowsXml}</sheetData></worksheet>`
  );
}

function sharedStringsXml(strings: string[]): string {
  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    strings.map((s) => `<si><t>${s}</t></si>`).join('') +
    '</sst>'
  );
}

async function issuesOf(buffer: ArrayBuffer): Promise<string[]> {
  try {
    await parseXlsxWords(buffer);
  } catch (e) {
    expect(e).toBeInstanceOf(PuzzleError);
    return (e as PuzzleError).issues;
  }
  throw new Error('expected parseXlsxWords to throw, but the file parsed');
}

describe('parseXlsxWords', () => {
  it('reads shared strings and skips the header row', async () => {
    const buffer = await buildZip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': WORKBOOK_RELS_XML,
      'xl/sharedStrings.xml': sharedStringsXml([
        'Слово',
        'Вопрос',
        'КОШКА',
        'домашнее животное',
        'ЁЖИК',
        'колючий зверь',
      ]),
      'xl/worksheets/sheet1.xml': sheetXml(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
          '<row r="2"><c r="A2" t="s"><v>2</v></c><c r="B2" t="s"><v>3</v></c></row>' +
          '<row r="3"><c r="A3" t="s"><v>4</v></c><c r="B3" t="s"><v>5</v></c></row>',
      ),
    });
    await expect(parseXlsxWords(buffer)).resolves.toEqual([
      { answer: 'КОШКА', clue: 'домашнее животное', line: 2 },
      { answer: 'ЕЖИК', clue: 'колючий зверь', line: 3 },
    ]);
  });

  it('reads inline strings from a stored (uncompressed) archive', async () => {
    const buffer = await buildZip(
      {
        'xl/workbook.xml': WORKBOOK_XML,
        'xl/_rels/workbook.xml.rels': WORKBOOK_RELS_XML,
        'xl/worksheets/sheet1.xml': sheetXml(
          '<row r="1"><c r="A1" t="inlineStr"><is><t>КИНО</t></is></c>' +
            '<c r="B1" t="inlineStr"><is><t>фильм</t></is></c></row>',
        ),
      },
      false,
    );
    await expect(parseXlsxWords(buffer)).resolves.toEqual([
      { answer: 'КИНО', clue: 'фильм', line: 1 },
    ]);
  });

  it('reads literal number cells as text', async () => {
    const buffer = await buildZip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': WORKBOOK_RELS_XML,
      'xl/worksheets/sheet1.xml': sheetXml(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>ГОД</t></is></c>' +
          '<c r="B1"><v>1961</v></c></row>',
      ),
    });
    await expect(parseXlsxWords(buffer)).resolves.toEqual([
      { answer: 'ГОД', clue: '1961', line: 1 },
    ]);
  });

  it('joins rich-text shared string runs and skips phonetic hints', async () => {
    const sst =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<si><r><t>ко</t></r><r><t>т</t></r></si>' +
      '<si><t>зверь</t><rPh><r><t>звирь</t></r></rPh></si>' +
      '</sst>';
    const buffer = await buildZip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': WORKBOOK_RELS_XML,
      'xl/sharedStrings.xml': sst,
      'xl/worksheets/sheet1.xml': sheetXml(
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>',
      ),
    });
    await expect(parseXlsxWords(buffer)).resolves.toEqual([
      { answer: 'КОТ', clue: 'зверь', line: 1 },
    ]);
  });

  it('reads the first worksheet and honors empty rows between data', async () => {
    const twoSheets =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<sheets><sheet name="Слова" sheetId="1" r:id="rId1"/>' +
      '<sheet name="Черновик" sheetId="2" r:id="rId2"/></sheets></workbook>';
    const rels =
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>';
    const buffer = await buildZip({
      'xl/workbook.xml': twoSheets,
      'xl/_rels/workbook.xml.rels': rels,
      'xl/worksheets/sheet1.xml': sheetXml(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>КИНО</t></is></c>' +
          '<c r="B1" t="inlineStr"><is><t>фильм</t></is></c></row>' +
          '<row r="4"><c r="A4" t="inlineStr"><is><t>СОК</t></is></c>' +
          '<c r="B4" t="inlineStr"><is><t>напиток</t></is></c></row>',
      ),
      // The second sheet must never be read.
      'xl/worksheets/sheet2.xml': sheetXml(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>МУСОР</t></is></c></row>',
      ),
    });
    await expect(parseXlsxWords(buffer)).resolves.toEqual([
      { answer: 'КИНО', clue: 'фильм', line: 1 },
      { answer: 'СОК', clue: 'напиток', line: 4 },
    ]);
  });

  it('glues extra columns into the clue with spaces', async () => {
    const buffer = await buildZip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': WORKBOOK_RELS_XML,
      'xl/worksheets/sheet1.xml': sheetXml(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>КОТ</t></is></c>' +
          '<c r="B1" t="inlineStr"><is><t>домашний</t></is></c>' +
          '<c r="C1" t="inlineStr"><is><t>зверь</t></is></c></row>',
      ),
    });
    await expect(parseXlsxWords(buffer)).resolves.toEqual([
      { answer: 'КОТ', clue: 'домашний зверь', line: 1 },
    ]);
  });

  it('reports per-row errors with spreadsheet row numbers', async () => {
    const buffer = await buildZip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': WORKBOOK_RELS_XML,
      'xl/worksheets/sheet1.xml': sheetXml(
        '<row r="1"><c r="A1" t="inlineStr"><is><t>КИНО</t></is></c>' +
          '<c r="B1" t="inlineStr"><is><t>фильм</t></is></c></row>' +
          '<row r="5"><c r="A5" t="inlineStr"><is><t>A</t></is></c>' +
          '<c r="B5" t="inlineStr"><is><t>буква</t></is></c></row>' +
          '<row r="6"><c r="A6" t="inlineStr"><is><t>КИНО</t></is></c>' +
          '<c r="B6" t="inlineStr"><is><t>повтор</t></is></c></row>',
      ),
    });
    const issues = await issuesOf(buffer);
    expect(issues[0]).toContain('Строка 5');
    expect(issues[1]).toContain('уже было в строке 1');
  });

  it('rejects a file that is not a ZIP archive', async () => {
    const issues = await issuesOf(new TextEncoder().encode('cat, dog').buffer as ArrayBuffer);
    expect(issues[0]).toContain('не книга Excel');
  });

  it('feeds the generator: parsed words produce a valid puzzle', async () => {
    const words = [
      ['КОСМОНАВТ', 'Летит в космос'],
      ['РАКЕТА', 'Взлетает с космодрома'],
      ['ЛУНА', 'Спутник Земли'],
      ['ЗВЕЗДА', 'Горит в ночном небе'],
      ['ОРБИТА', 'Путь вокруг планеты'],
    ];
    const rowsXml = words
      .map(
        ([w, q], i) =>
          `<row r="${i + 1}"><c r="A${i + 1}" t="inlineStr"><is><t>${w}</t></is></c>` +
          `<c r="B${i + 1}" t="inlineStr"><is><t>${q}</t></is></c></row>`,
      )
      .join('');
    const buffer = await buildZip({
      'xl/workbook.xml': WORKBOOK_XML,
      'xl/_rels/workbook.xml.rels': WORKBOOK_RELS_XML,
      'xl/worksheets/sheet1.xml': sheetXml(rowsXml),
    });
    const parsed = await parseXlsxWords(buffer);
    const { puzzle } = generatePuzzle(parsed, { maxW: 12, maxH: 30, targetRatio: 1.5 });
    const vp = validatePuzzle(puzzle);
    expect(vp.words).toHaveLength(words.length);
    expect(vp.width).toBeLessThanOrEqual(12);
  });
});
