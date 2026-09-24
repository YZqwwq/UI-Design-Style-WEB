import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designs, filterDesigns, buildPrompt } from '../src/catalog.js';

test('catalog has unique IDs, valid colors and complete design recipes', () => {
  assert.equal(new Set(designs.map(d => d.id)).size, designs.length);
  for (const d of designs) {
    for (const key of ['id', 'name', 'english', 'category', 'tag', 'tone', 'description', 'layout', 'typography', 'surface', 'interaction', 'use', 'label']) assert.ok(d[key], `${d.id}: ${key}`);
    assert.equal(d.colors.length, 3);
    assert.ok(d.colors.every(c => /^#[a-f\d]{6}$/i.test(c)));
  }
});
test('category, tag and search intersect rather than override each other', () => {
  assert.deepEqual(filterDesigns({ category: '极简主义', tag: '暗色', query: 'STUDIO' }).map(d => d.id), ['mono']);
  assert.deepEqual(filterDesigns({ category: '玻璃拟态', query: '复古' }), []);
  assert.equal(filterDesigns({ query: '   ' }).length, designs.length);
  assert.deepEqual(filterDesigns({ query: '  swiss  极简 ' }).map(d => d.id), ['swiss']);
  assert.deepEqual(filterDesigns({ query: '#dfff00' }).map(d => d.id), ['brutal']);
});
test('every generated prompt preserves the selected recipe and user purpose', () => {
  for (const d of designs) {
    const prompt = buildPrompt(d, '摄影作品集');
    for (const text of [d.name, d.english, d.layout, d.typography, d.surface, d.interaction, ...d.colors, '摄影作品集', '键盘导航']) assert.ok(prompt.includes(text), `${d.id}: ${text}`);
    assert.ok(buildPrompt(d, '  ').startsWith('请为我的网站'));
    assert.ok(!prompt.includes('undefined'));
  }
});
