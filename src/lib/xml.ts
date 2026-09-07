/**
 * Minimal XML parser for the machine-generated parts inside an .xlsx file
 * (workbook, relationships, shared strings, worksheet). The project has no
 * runtime dependencies and DOMParser is not available in Node (unit tests),
 * so this small hand-rolled parser keeps browser and test behavior identical.
 *
 * It supports everything Excel writes: the XML declaration, comments, CDATA,
 * attributes in single or double quotes, self-closing tags and the five
 * predefined entities plus numeric ones. Namespace prefixes are stripped from
 * element names («x:sheet» is reported as «sheet»); attribute names keep
 * their prefix as written («r:id» stays «r:id»).
 */

export interface XmlNode {
  /** Element name without a namespace prefix. */
  name: string;
  /** Attributes keyed exactly as written in the file. */
  attrs: Record<string, string>;
  children: XmlNode[];
  /** Concatenated direct text content (entity-decoded). */
  text: string;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeEntities(text: string): string {
  if (!text.includes('&')) return text;
  return text.replace(/&(#[0-9]+|#x[0-9a-fA-F]+|[a-zA-Z]+);/g, (all, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : all;
    }
    return ENTITIES[body] ?? all;
  });
}

/** Name of the first unquoted '>' at or after `start`, or -1. */
function tagEnd(src: string, start: number): number {
  let quote = '';
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (quote) {
      if (ch === quote) quote = '';
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
  }
  return -1;
}

function parseStartTag(tag: string): { name: string; attrs: Record<string, string>; selfClosing: boolean } | null {
  // tag is the inner text of '<…>' without the angle brackets.
  const nameMatch = /^[^\s/>]+/.exec(tag);
  if (!nameMatch) return null;
  const attrs: Record<string, string> = {};
  const attrRe = /([^\s=/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(tag))) attrs[m[1]] = decodeEntities(m[2] ?? m[3] ?? '');
  return {
    name: nameMatch[0],
    attrs,
    selfClosing: tag.endsWith('/'),
  };
}

function localName(name: string): string {
  const i = name.indexOf(':');
  return i >= 0 ? name.slice(i + 1) : name;
}

/** Parse an XML document and return its root element. */
export function parseXml(src: string): XmlNode {
  let pos = 0;
  let root: XmlNode | null = null;
  const stack: XmlNode[] = [];

  // A function declaration, not a `const` arrow: only an explicitly typed
  // never-returning name narrows `parsed`/`root` after `if (!x) fail(...)`.
  function fail(message: string): never {
    throw new Error(`${message} at byte ${pos}`);
  }
  const top = (): XmlNode | undefined => stack[stack.length - 1];

  while (pos < src.length) {
    const lt = src.indexOf('<', pos);
    if (lt < 0) break;
    const parent = top();
    if (lt > pos && parent) parent.text += decodeEntities(src.slice(pos, lt));
    pos = lt;

    if (src.startsWith('<!--', pos)) {
      const end = src.indexOf('-->', pos + 4);
      if (end < 0) fail('unclosed comment');
      pos = end + 3;
    } else if (src.startsWith('<![CDATA[', pos)) {
      const end = src.indexOf(']]>', pos + 9);
      if (end < 0) fail('unclosed CDATA');
      if (parent) parent.text += src.slice(pos + 9, end);
      pos = end + 3;
    } else if (src.startsWith('<?', pos)) {
      const end = src.indexOf('?>', pos + 2);
      if (end < 0) fail('unclosed processing instruction');
      pos = end + 2;
    } else if (src.startsWith('<!DOCTYPE', pos) || src.startsWith('<!', pos)) {
      const end = src.indexOf('>', pos);
      if (end < 0) fail('unclosed declaration');
      pos = end + 1;
    } else if (src[pos + 1] === '/') {
      const end = src.indexOf('>', pos);
      if (end < 0) fail('unclosed end tag');
      const closing = top();
      if (!closing || closing.name !== localName(src.slice(pos + 2, end).trim())) {
        fail('mismatched end tag');
      }
      stack.pop();
      pos = end + 1;
    } else {
      const end = tagEnd(src, pos);
      if (end < 0) fail('unclosed start tag');
      const parsed = parseStartTag(src.slice(pos + 1, end));
      if (!parsed) fail('malformed start tag');
      const node: XmlNode = {
        name: localName(parsed.name),
        attrs: parsed.attrs,
        children: [],
        text: '',
      };
      if (root === null) root = node;
      const parent2 = top();
      if (parent2) parent2.children.push(node);
      if (!parsed.selfClosing) stack.push(node);
      pos = end + 1;
    }
  }

  if (root === null) fail('no root element');
  return root;
}

/** First child element with the given (local) name, or undefined. */
export function childOf(node: XmlNode, name: string): XmlNode | undefined {
  return node.children.find((c) => c.name === name);
}
