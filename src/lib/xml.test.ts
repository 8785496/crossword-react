import { describe, expect, it } from 'vitest';

import { childOf, parseXml } from './xml';

describe('parseXml', () => {
  it('parses elements, attributes and text', () => {
    const root = parseXml('<workbook a="1" b=\'два\'><sheet name="Слова">привет</sheet></workbook>');
    expect(root.name).toBe('workbook');
    expect(root.attrs).toEqual({ a: '1', b: 'два' });
    const sheet = childOf(root, 'sheet');
    expect(sheet?.attrs['name']).toBe('Слова');
    expect(sheet?.text).toBe('привет');
  });

  it('decodes the five predefined entities and numeric ones', () => {
    const root = parseXml('<t v="a&amp;b">1&lt;2 &#1050; &#x44f;</t>');
    expect(root.attrs['v']).toBe('a&b');
    expect(root.text).toBe('1<2 К я');
  });

  it('keeps attribute-name prefixes but strips element-name prefixes', () => {
    const root = parseXml(
      '<x:workbook xmlns:x="urn:x"><x:sheet x:id="rId1"/></x:workbook>',
    );
    expect(root.name).toBe('workbook');
    expect(root.children[0].name).toBe('sheet');
    expect(root.children[0].attrs['x:id']).toBe('rId1');
  });

  it('supports self-closing tags, comments, CDATA and the declaration', () => {
    const root = parseXml(
      '<?xml version="1.0" encoding="UTF-8"?>' +
        '<!-- generated -->' +
        '<root><empty/><![CDATA[<not a tag> & ]]><deep><empty2 /></deep></root>',
    );
    expect(childOf(root, 'empty')).toBeDefined();
    expect(childOf(childOf(root, 'deep')!, 'empty2')).toBeDefined();
    expect(root.text).toBe('<not a tag> & ');
  });

  it('keeps nested text on its direct parent element', () => {
    const root = parseXml('<is><r><t>ко</t></r><r><t>т</t></r></is>');
    expect(root.text).toBe('');
    expect(root.children.map((c) => c.children[0].text)).toEqual(['ко', 'т']);
  });

  it('throws on broken markup', () => {
    expect(() => parseXml('<a><b></a>')).toThrow();
    expect(() => parseXml('no markup at all')).toThrow();
  });
});
