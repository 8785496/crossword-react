/**
 * Sample crossword generator.
 *
 * Places the words with a backtracking search (only real letter crossings,
 * no touching of parallel words) and writes JSON following the app contract
 * to src/samples/ and public/samples/.
 *
 * Usage: npm run samples
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// ---------- Seeded RNG (deterministic output) ----------
function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Layout generation ----------
function generate(words, { maxWidth, maxHeight, attempts = 900 }, rng) {
  let best = null;
  for (let a = 0; a < attempts; a++) {
    const order = shuffle(words.map((_, i) => i), rng);
    order.sort((x, y) => words[y].answer.length - words[x].answer.length);
    const placements = tryPlace(words, order, rng, maxWidth, maxHeight);
    if (!placements) continue;
    const box = boundingBox(placements);
    const { w, h } = box;
    const score = w * h + Math.max(0, w - h) * 6 + Math.abs(w - h);
    if (!best || score < best.score) {
      best = { placements, box, score };
      if (w <= 14 && h <= 20 && h >= w) break; // a good portrait layout is found
    }
  }
  return best;
}

function tryPlace(words, order, rng, maxW, maxH) {
  const cells = new Map(); // "r,c" -> letter
  const placements = [];

  const letterAt = (r, c) => cells.get(`${r},${c}`);

  function layoutValid() {
    const rowsMap = new Map();
    const colsMap = new Map();
    for (const k of cells.keys()) {
      const [r, c] = k.split(',').map(Number);
      if (!rowsMap.has(r)) rowsMap.set(r, new Set());
      rowsMap.get(r).add(c);
      if (!colsMap.has(c)) colsMap.set(c, new Set());
      colsMap.get(c).add(r);
    }
    const acrossSet = new Set();
    const downSet = new Set();
    for (const p of placements) {
      if (p.dir === 'across') acrossSet.add(`${p.row},${p.col},${p.col + p.answer.length - 1}`);
      else downSet.add(`${p.col},${p.row},${p.row + p.answer.length - 1}`);
    }
    let acrossRuns = 0;
    for (const [r, cs] of rowsMap) {
      const arr = [...cs].sort((x, y) => x - y);
      let i = 0;
      while (i < arr.length) {
        const start = arr[i];
        while (i + 1 < arr.length && arr[i + 1] === arr[i] + 1) i++;
        const end = arr[i];
        i++;
        // A single cell is just a letter of a perpendicular word, not a word.
        if (end - start + 1 < 2) continue;
        acrossRuns++;
        if (!acrossSet.has(`${r},${start},${end}`)) return false;
      }
    }
    let downRuns = 0;
    for (const [c, rs] of colsMap) {
      const arr = [...rs].sort((x, y) => x - y);
      let i = 0;
      while (i < arr.length) {
        const start = arr[i];
        while (i + 1 < arr.length && arr[i + 1] === arr[i] + 1) i++;
        const end = arr[i];
        i++;
        if (end - start + 1 < 2) continue;
        downRuns++;
        if (!downSet.has(`${c},${start},${end}`)) return false;
      }
    }
    return acrossRuns === acrossSet.size && downRuns === downSet.size;
  }

  function canPlace(answer, row, col, dir) {
    if (row < 0 || col < 0) return false;
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    const endR = row + dr * (answer.length - 1);
    const endC = col + dc * (answer.length - 1);
    if (endR > 60 || endC > 60) return false;
    for (let i = 0; i < answer.length; i++) {
      const ch = letterAt(row + dr * i, col + dc * i);
      if (ch !== undefined && ch !== answer[i]) return false;
    }
    return true;
  }

  function commit(answer, row, col, dir) {
    const dr = dir === 'down' ? 1 : 0;
    const dc = dir === 'across' ? 1 : 0;
    const touched = [];
    for (let i = 0; i < answer.length; i++) {
      const r = row + dr * i;
      const c = col + dc * i;
      const k = `${r},${c}`;
      touched.push([k, cells.get(k)]);
      cells.set(k, answer[i]);
    }
    placements.push({ answer, row, col, dir });
    if (!layoutValid()) {
      for (const [k, prev] of touched) {
        if (prev === undefined) cells.delete(k);
        else cells.set(k, prev);
      }
      placements.pop();
      return null;
    }
    return touched;
  }

  function undo(touched) {
    for (const [k, prev] of touched) {
      if (prev === undefined) cells.delete(k);
      else cells.set(k, prev);
    }
    placements.pop();
  }

  function boxAfter(cand, len) {
    let minR = Infinity;
    let maxR = -Infinity;
    let minC = Infinity;
    let maxC = -Infinity;
    for (const p of placements) {
      const pEndR = p.dir === 'down' ? p.row + p.answer.length - 1 : p.row;
      const pEndC = p.dir === 'across' ? p.col + p.answer.length - 1 : p.col;
      minR = Math.min(minR, p.row);
      maxR = Math.max(maxR, pEndR);
      minC = Math.min(minC, p.col);
      maxC = Math.max(maxC, pEndC);
    }
    const endR = cand.dir === 'down' ? cand.row + len - 1 : cand.row;
    const endC = cand.dir === 'across' ? cand.col + len - 1 : cand.col;
    minR = Math.min(minR, cand.row);
    maxR = Math.max(maxR, endR);
    minC = Math.min(minC, cand.col);
    maxC = Math.max(maxC, endC);
    return { w: maxC - minC + 1, h: maxR - minR + 1 };
  }

  function candidates(answer) {
    const list = [];
    for (let i = 0; i < answer.length; i++) {
      for (const [k, ch] of cells) {
        if (ch !== answer[i]) continue;
        const [r, c] = k.split(',').map(Number);
        list.push({ row: r, col: c - i, dir: 'across' });
        list.push({ row: r - i, col: c, dir: 'down' });
      }
    }
    return shuffle(list, rng);
  }

  function solve(idx) {
    if (idx === order.length) return true;
    const w = words[order[idx]];
    for (const cand of candidates(w.answer)) {
      if (!canPlace(w.answer, cand.row, cand.col, cand.dir)) continue;
      const box = boxAfter(cand, w.answer.length);
      if (box.w > maxW || box.h > maxH) continue;
      const touched = commit(w.answer, cand.row, cand.col, cand.dir);
      if (touched) {
        if (solve(idx + 1)) return true;
        undo(touched);
      }
    }
    return false;
  }

  // The first word goes across at (0, 0).
  const first = words[order[0]];
  if (!commit(first.answer, 0, 0, 'across')) return null;
  if (solve(1)) return placements.map((p) => ({ ...p }));
  return null;
}

function boundingBox(placements) {
  let minR = Infinity;
  let maxR = -Infinity;
  let minC = Infinity;
  let maxC = -Infinity;
  for (const p of placements) {
    const endR = p.dir === 'down' ? p.row + p.answer.length - 1 : p.row;
    const endC = p.dir === 'across' ? p.col + p.answer.length - 1 : p.col;
    minR = Math.min(minR, p.row);
    maxR = Math.max(maxR, endR);
    minC = Math.min(minC, p.col);
    maxC = Math.max(maxC, pEndC(p));
  }
  return { minR, minC, w: maxC - minC + 1, h: maxR - minR + 1 };
}
function pEndC(p) {
  return p.dir === 'across' ? p.col + p.answer.length - 1 : p.col;
}

// ---------- Building the final JSON ----------
function buildJson(meta, words, layout) {
  const { placements, box } = layout;
  const shifted = placements.map((p) => ({
    ...p,
    row: p.row - box.minR + 1, // 1-based
    col: p.col - box.minC + 1,
  }));

  // Standard crossword numbering.
  const numbers = new Map();
  let counter = 1;
  for (let r = box.minR; r <= box.minR + box.h - 1; r++) {
    for (let c = box.minC; c <= box.minC + box.w - 1; c++) {
      const starts = shifted.some(
        (p) => p.row === r && p.col === c,
      );
      if (starts) numbers.set(`${r},${c}`, counter++);
    }
  }

  const byId = new Map(words.map((w) => [w.answer, w]));
  const out = shifted
    .map((p) => ({
      answer: p.answer,
      clue: byId.get(p.answer).clue,
      row: p.row,
      col: p.col,
      direction: p.dir,
      number: numbers.get(`${p.row},${p.col}`),
    }))
    .sort((a, b) =>
      a.direction !== b.direction
        ? a.direction === 'across'
          ? -1
          : 1
        : a.number - b.number,
    );

  return {
    version: '1.0',
    meta,
    grid: { width: box.w, height: box.h },
    words: out.map(({ number, ...rest }) => ({ number, ...rest })),
  };
}

function renderAscii(json) {
  const { grid, words } = json;
  const cells = new Map();
  for (const w of words) {
    const dr = w.direction === 'down' ? 1 : 0;
    const dc = w.direction === 'across' ? 1 : 0;
    for (let i = 0; i < w.answer.length; i++) {
      cells.set(`${w.row - 1 + dr * i},${w.col - 1 + dc * i}`, w.answer[i]);
    }
  }
  const lines = [];
  for (let r = 0; r < grid.height; r++) {
    let line = '';
    for (let c = 0; c < grid.width; c++) line += cells.get(`${r},${c}`) ?? '·';
    lines.push(line);
  }
  return lines.join('\n');
}

function writeSample(filename, json) {
  const content = JSON.stringify(json, null, 2) + '\n';
  for (const dir of ['src/samples', 'public/samples']) {
    mkdirSync(resolve(root, dir), { recursive: true });
    writeFileSync(resolve(root, dir, filename), content, 'utf8');
  }
}

// ---------- Samples ----------
const englishWords = [
  { answer: 'COURTHOUSE', clue: 'The place where legal trials take place and a judge works' },
  { answer: 'ENCOUNTER', clue: 'An unexpected meeting, sometimes even a fight or battle' },
  { answer: 'RECOLLECT', clue: 'To remember something from the past after thinking about it' },
  { answer: 'ENFORCE', clue: 'To make sure that a law or rule is obeyed' },
  { answer: 'CROOKED', clue: 'Not straight; bent or twisted in shape' },
  { answer: 'ATTEND', clue: 'To be present at classes, meetings or other events' },
  { answer: 'THREAT', clue: 'A warning that you will hurt someone or cause trouble if they do not obey' },
  { answer: 'SUPPER', clue: 'A light evening meal' },
  { answer: 'RECALL', clue: 'To bring a past memory back into your mind' },
  { answer: 'BROOM', clue: 'A brush with a long handle, used for sweeping floors' },
  { answer: 'AWAKE', clue: 'To rouse somebody from sleep; a literary word' },
  { answer: 'DUMMY', clue: 'A model shaped like a person, or an insult for a stupid person' },
  { answer: 'PORCH', clue: 'A small covered area at the entrance to a house' },
  { answer: 'COUNTY', clue: 'A region of Britain with its own local government' },
  { answer: 'CREEP', clue: 'To move quietly and secretly so that nobody notices you' },
  { answer: 'MORON', clue: 'Old-fashioned, offensive word for a person with very low mental ability' },
  { answer: 'CRUEL', clue: 'Unkind to people and happy to hurt them; not nice' },
  { answer: 'ADMIT', clue: 'To agree, often unwillingly, that something is true; to confess' },
  { answer: 'ARMY', clue: 'A group of soldiers acting or moving together' },
  { answer: 'MOB', clue: 'A large, noisy, uncontrolled crowd of angry people' },
];

const cosmosWords = [
  { answer: 'КОСМОНАВТ', clue: 'Человек, совершающий полёты в космос' },
  { answer: 'СКАФАНДР', clue: 'Специальный герметичный костюм для работы в космосе' },
  { answer: 'ТЕЛЕСКОП', clue: 'Прибор для наблюдения за звёздами и планетами' },
  { answer: 'СПУТНИК', clue: 'Аппарат, выведенный на орбиту вокруг Земли' },
  { answer: 'ПЛАНЕТА', clue: 'Небесное тело, вращающееся вокруг звезды' },
  { answer: 'ОРБИТА', clue: 'Путь, по которому небесное тело или аппарат движется вокруг планеты' },
  { answer: 'КОМЕТА', clue: 'Небесное тело с длинным светящимся хвостом' },
  { answer: 'ЗВЕЗДА', clue: 'Раскалённый шар газа, светящийся в ночном небе' },
  { answer: 'РАКЕТА', clue: 'Летательный аппарат с реактивным двигателем' },
  { answer: 'ЛУНА', clue: 'Естественный спутник Земли' },
];

const rng = mulberry32(20260906);

for (const [name, meta, list, limits] of [
  [
    'english.json',
    { title: 'English Vocabulary', language: 'en', author: 'crossword-react sample' },
    englishWords,
    { maxWidth: 16, maxHeight: 24 },
  ],
  [
    'cosmos.json',
    { title: 'Космос', language: 'ru', author: 'crossword-react sample' },
    cosmosWords,
    { maxWidth: 14, maxHeight: 20 },
  ],
]) {
  const layout = generate(list, { ...limits, attempts: 1200 }, rng);
  if (!layout) {
    console.error(`✗ ${name}: could not place all ${list.length} words into ${limits.maxWidth}×${limits.maxH ?? limits.maxHeight}`);
    process.exit(1);
  }
  const json = buildJson(meta, list, layout);
  writeSample(name, json);
  console.log(`✓ ${name}: ${json.words.length} words, grid ${json.grid.width}×${json.grid.height}`);
  console.log(renderAscii(json));
  console.log();
}
