import { test } from 'node:test';
import assert from 'node:assert/strict';
import { designs } from '../db/seed/designs.js';
import { buildPrompt } from '../src/prompt.js';

test('catalog has unique IDs, valid colors and complete design recipes', () => {
  assert.equal(new Set(designs.map(d => d.id)).size, designs.length);
  for (const d of designs) {
    for (const key of ['id', 'name', 'english', 'category', 'tag', 'tone', 'description', 'layout', 'typography', 'surface', 'interaction', 'use', 'label'] as const) assert.ok(d[key], `${d.id}: ${key}`);
    assert.equal(d.colors.length, 3);
    assert.ok(d.colors.every(c => /^#[a-f\d]{6}$/i.test(c)));
  }
});
test('every generated prompt preserves the selected recipe and user purpose', () => {
  for (const d of designs) {
    const prompt = buildPrompt(d, '摄影作品集');
    for (const text of [d.name, d.english, d.layout, d.typography, d.surface, d.interaction, ...d.colors, '摄影作品集', '键盘导航']) assert.ok(prompt.includes(text), `${d.id}: ${text}`);
    assert.ok(buildPrompt(d, '  ').startsWith('请为我的网站'));
    assert.ok(!prompt.includes('undefined'));
  }
});
