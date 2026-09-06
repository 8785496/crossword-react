/**
 * Verification harness for the CSV -> generate -> validate pipeline.
 *
 * Bundles src/lib with esbuild (a Vite dependency) into a temp folder and
 * runs assertions in Node: CSV parsing (delimiters, header, errors),
 * encodings (UTF-8 / Windows-1251), grid generation (profiles, determinism,
 * isolated words, limits) and contract validation of every generated layout.
 *
 * Usage: npm run verify
 */
import assert from 'node:assert';
import { build } from 'esbuild';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = mkdtempSync(join(tmpdir(), 'crossword-verify-'));

await build({
  entryPoints: [
    resolve(root, 'src/lib/csv.ts'),
    resolve(root, 'src/lib/generator.ts'),
    resolve(root, 'src/lib/puzzle.ts'),
  ],
  bundle: true,
  format: 'esm',
  splitting: true,
  outdir: outDir,
});

const { parseCsvWords, readFileText } = await import(pathToFileURL(join(outDir, 'csv.js')));
const { generatePuzzle } = await import(pathToFileURL(join(outDir, 'generator.js')));
const { validatePuzzle, cellKey } = await import(pathToFileURL(join(outDir, 'puzzle.js')));

let passed = 0;
let failed = 0;
const check = (name, fn) => {
  try {
    fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    failed++;
    console.error('  ✗', name, '\n   ', e.message);
  }
};
const checkAsync = async (name, fn) => {
  try {
    await fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    failed++;
    console.error('  ✗', name, '\n   ', e.message);
  }
};
const issuesOf = (fn) => {
  try {
    fn();
  } catch (e) {
    return e.issues ?? [`no issues prop: ${e.message}`];
  }
  return null; // did not throw
};

// cp1251 encoder for the Cyrillic range (test-only).
function toCp1251(str) {
  const bytes = [];
  for (const ch of str) {
    const code = ch.codePointAt(0);
    if (code < 128) bytes.push(code);
    else if (ch === 'Ё') bytes.push(0xa8);
    else if (ch === 'ё') bytes.push(0xb8);
    else if (code >= 0x410 && code <= 0x44f) bytes.push(code - 0x410 + 0xc0);
    else bytes.push(0x3f);
  }
  return Buffer.from(bytes);
}

function renderGrid(puzzle) {
  // validatePuzzle returns words with 0-based row/col.
  const cells = new Map();
  for (const w of puzzle.words) {
    const dr = w.direction === 'down' ? 1 : 0;
    const dc = w.direction === 'across' ? 1 : 0;
    for (let i = 0; i < w.answer.length; i++) {
      cells.set(cellKey(w.row + dr * i, w.col + dc * i), w.answer[i]);
    }
  }
  const lines = [];
  for (let r = 0; r < puzzle.height; r++) {
    let line = '';
    for (let c = 0; c < puzzle.width; c++) line += cells.get(cellKey(r, c)) ?? '·';
    lines.push(line);
  }
  return lines.join('\n');
}

const cosmosWords = [
  ['КОСМОНАВТ', 'Человек, совершающий полёты в космос'],
  ['СКАФАНДР', 'Специальный герметичный костюм'],
  ['ТЕЛЕСКОП', 'Прибор для наблюдения за звёздами'],
  ['СПУТНИК', 'Аппарат на орбите вокруг Земли'],
  ['ПЛАНЕТА', 'Небесное тело вокруг звезды'],
  ['ОРБИТА', 'Путь вокруг планеты'],
  ['КОМЕТА', 'Небесное тело с хвостом'],
  ['ЗВЕЗДА', 'Раскалённый шар газа'],
  ['РАКЕТА', 'Летательный аппарат с двигателем'],
  ['ЛУНА', 'Естественный спутник Земли'],
];
const cosmosCsv = ['Слово;Вопрос', ...cosmosWords.map(([w, q]) => `${w};${q}`)].join('\n');

const englishWords = [
  ['COURTHOUSE', 'The place where legal trials take place'],
  ['ENCOUNTER', 'An unexpected meeting'],
  ['RECOLLECT', 'To remember something from the past'],
  ['ENFORCE', 'To make sure a law is obeyed'],
  ['CROOKED', 'Not straight; bent'],
  ['ATTEND', 'To be present at classes'],
  ['THREAT', 'A warning to cause trouble'],
  ['SUPPER', 'A light evening meal'],
  ['RECALL', 'To bring a memory back'],
  ['BROOM', 'A brush for sweeping floors'],
  ['AWAKE', 'Roused from sleep'],
  ['DUMMY', 'A model shaped like a person'],
  ['PORCH', 'A covered area at an entrance'],
  ['COUNTY', 'A region with local government'],
  ['CREEP', 'To move quietly and secretly'],
  ['MORON', 'A very foolish person'],
  ['CRUEL', 'Unkind and happy to hurt'],
  ['ADMIT', 'To agree unwillingly; confess'],
  ['ARMY', 'A group of soldiers'],
  ['MOB', 'A noisy uncontrolled crowd'],
];
const englishCsv = [
  'word,question',
  ...englishWords.map(([w, q]) => `"${w}","${q}, sometimes with a comma"`),
].join('\n');

const PHONE = { maxW: 12, maxH: 30, targetRatio: 1.5 };
const TABLET = { maxW: 16, maxH: 32, targetRatio: 1.2 };

console.log('\n== CSV parsing ==');
check('semicolon + header + Ё→Е normalization', () => {
  const words = parseCsvWords(cosmosCsv);
  assert.equal(words.length, 10);
  assert.equal(words[0].answer, 'КОСМОНАВТ');
});
check('comma + quoted clues containing commas + EN header', () => {
  const words = parseCsvWords(englishCsv);
  assert.equal(words.length, 20);
  assert.equal(words[0].clue, 'The place where legal trials take place, sometimes with a comma');
});
check('unquoted delimiter inside question is glued back', () => {
  const words = parseCsvWords('КОШКА,домашнее животное, с усами\nСОБАКА,друг человека');
  assert.equal(words.length, 2);
  assert.equal(words[0].clue, 'домашнее животное, с усами');
});
check('tab-delimited file', () => {
  const words = parseCsvWords('слово\tвопрос\nКИНО\tфильм');
  assert.equal(words.length, 1);
  assert.equal(words[0].answer, 'КИНО');
});
check('header with no letters (№) is skipped', () => {
  const words = parseCsvWords('№;Слово;Вопрос\nКИНО;фильм');
  assert.equal(words.length, 1);
});
check('real data row that looks like a header name is kept', () => {
  const words = parseCsvWords('ГРОМ;вопрос');
  assert.equal(words.length, 1);
  assert.equal(words[0].answer, 'ГРОМ');
});
check('blank lines are skipped', () => {
  const words = parseCsvWords('КИНО;фильм\n\n\nСОК;напиток\n');
  assert.equal(words.length, 2);
});
check('empty file -> error', () => {
  assert.ok(issuesOf(() => parseCsvWords('')));
});
check('single-column file -> error', () => {
  const issues = issuesOf(() => parseCsvWords('СЛОВО\nДРУГОЕ'));
  assert.ok(issues && issues.some((i) => i.includes('вопроса')), JSON.stringify(issues));
});
check('short word -> per-line error', () => {
  const issues = issuesOf(() => parseCsvWords('КИНО;фильм\nA;буква'));
  assert.ok(issues && issues[0].includes('Строка 2'), JSON.stringify(issues));
});
check('missing clue -> error', () => {
  const issues = issuesOf(() => parseCsvWords('КИНО;'));
  assert.ok(issues && issues[0].includes('нет вопроса'), JSON.stringify(issues));
});
check('duplicate word -> error', () => {
  const issues = issuesOf(() => parseCsvWords('КИНО;фильм\nкино;сеанс'));
  assert.ok(issues && issues[0].includes('уже было в строке 1'), JSON.stringify(issues));
});
check('word with spaces/hyphens normalizes', () => {
  const words = parseCsvWords('нью йорк;город\n'); // letters only after normalize
  assert.equal(words[0].answer, 'НЬЮЙОРК');
});

console.log('\n== Encoding ==');
await checkAsync('Windows-1251 file decodes', async () => {
  const bytes = toCp1251('КОШКА;домашнее животное\r\nЁЖИК;колючий зверь');
  const file = new File([bytes], 'pets.csv');
  const text = await readFileText(file);
  const words = parseCsvWords(text);
  assert.equal(words.length, 2);
  assert.equal(words[1].answer, 'ЕЖИК');
});
await checkAsync('UTF-8 with BOM decodes', async () => {
  const file = new File(
    [Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('ЛИСА;зверь', 'utf8')])],
    'a.csv',
  );
  const words = parseCsvWords(await readFileText(file));
  assert.equal(words[0].answer, 'ЛИСА');
});

console.log('\n== Generation ==');
const fullPipeline = (csv, profile) => {
  const words = parseCsvWords(csv);
  const t0 = Date.now();
  const { puzzle, isolated } = generatePuzzle(words, profile, { title: 'test' });
  const ms = Date.now() - t0;
  const vp = validatePuzzle(puzzle);
  const placed = new Set(vp.words.map((w) => w.answer));
  assert.equal(vp.words.length, words.length, 'all words placed');
  assert.deepEqual(
    words.filter((w) => !placed.has(w.answer)).map((w) => w.answer),
    [],
  );
  return { vp, isolated, ms };
};

check('cosmos list, phone profile -> valid, vertical grid', () => {
  const { vp, ms } = fullPipeline(cosmosCsv, PHONE);
  const ratio = vp.height / vp.width;
  console.log(`    grid ${vp.width}×${vp.height}, ratio ${ratio.toFixed(2)}, ${ms} ms`);
  assert.ok(ratio >= 1.1 && ratio <= 2.0, `ratio ${ratio}`);
  assert.ok(ms < 3000, `too slow: ${ms} ms`);
});
check('english list, tablet profile -> valid', () => {
  const { vp, ms } = fullPipeline(englishCsv, TABLET);
  const ratio = vp.height / vp.width;
  console.log(`    grid ${vp.width}×${vp.height}, ratio ${ratio.toFixed(2)}, ${ms} ms`);
  assert.ok(ratio >= 0.8 && ratio <= 2.0, `ratio ${ratio}`);
  assert.ok(ms < 3000, `too slow: ${ms} ms`);
});
check('same file -> same grid (deterministic)', () => {
  const a = generatePuzzle(parseCsvWords(cosmosCsv), PHONE);
  const b = generatePuzzle(parseCsvWords(cosmosCsv), PHONE);
  assert.deepEqual(a.puzzle, b.puzzle);
});
check('no shared letters -> isolated placement + warning list', () => {
  const csv = 'СТОЛ;мебель\nМЯЧ;игрушка';
  const { puzzle, isolated } = generatePuzzle(parseCsvWords(csv), PHONE);
  const vp = validatePuzzle(puzzle);
  assert.equal(vp.words.length, 2);
  assert.deepEqual([...isolated].sort(), ['МЯЧ', 'СТОЛ']);
});
check('single word -> 2×2 minimal grid, valid', () => {
  const { puzzle } = generatePuzzle(parseCsvWords('КИНО;фильм'), PHONE);
  const vp = validatePuzzle(puzzle);
  assert.ok(vp.width >= 2 && vp.height >= 2);
});
check('45-letter word goes down and fits, valid', () => {
  const long = 'А'.repeat(20) + 'Б'.repeat(25);
  const { puzzle } = generatePuzzle(parseCsvWords(`${long};test\nКОТ;зверь`), PHONE);
  const vp = validatePuzzle(puzzle);
  const longWord = vp.words.find((w) => w.answer.length === 45);
  assert.ok(longWord, 'long word placed');
  assert.equal(longWord.direction, 'down');
  assert.ok(vp.width <= 12, `grid width ${vp.width} should stay near the phone cap`);
});
check('61-letter word -> clear error', () => {
  const issues = issuesOf(() => generatePuzzle([{ answer: 'А'.repeat(61), clue: 'x' }], PHONE));
  assert.ok(issues && issues[0].includes('61'), JSON.stringify(issues));
});
check('empty list -> error', () => {
  const issues = issuesOf(() => generatePuzzle([], PHONE));
  assert.ok(issues && issues.length === 1);
});
check('phone grid is more vertical than tablet grid', () => {
  const phone = generatePuzzle(parseCsvWords(cosmosCsv), PHONE).puzzle;
  const tablet = generatePuzzle(parseCsvWords(cosmosCsv), TABLET).puzzle;
  const rp = phone.grid.height / phone.grid.width;
  const rt = tablet.grid.height / tablet.grid.width;
  console.log(
    `    phone ${phone.grid.width}×${phone.grid.height} (${rp.toFixed(2)}), tablet ${tablet.grid.width}×${tablet.grid.height} (${rt.toFixed(2)})`,
  );
  assert.ok(rp > rt, `phone ${rp} !> tablet ${rt}`);
});

console.log('\n== Sample grids ==');
for (const [name, csv, profile] of [
  ['cosmos / phone', cosmosCsv, PHONE],
  ['cosmos / tablet', cosmosCsv, TABLET],
  ['english / phone', englishCsv, PHONE],
]) {
  const { vp } = fullPipeline(csv, profile);
  console.log(`\n  --- ${name}: ${vp.width}×${vp.height} ---\n${renderGrid(vp)}`);
}

rmSync(outDir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
