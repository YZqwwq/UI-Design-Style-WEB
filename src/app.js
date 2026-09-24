import { designs, filterDesigns, buildPrompt } from './catalog.js';

const $ = selector => document.querySelector(selector);
const state = { category: '全部设计', tag: '全部', query: '' };
const categories = ['全部设计', ...new Set(designs.map(d => d.category))];
const symbols = ['◈', '◻', '✳', '◉', '⌘', '◷', '▦'];
let selected;
let toastTimer;

function preview(d) {
  return `<div class="preview ${d.tone}" aria-hidden="true"><div class="preview-nav"><span>${d.tone === 'terminal' ? '● SYSTEM / ONLINE' : 'STUDIO / ' + d.code}</span><span>↗</span></div><div class="preview-body"><span class="preview-kicker">${d.tone === 'retro' ? 'EST. 1978 · STILL CURIOUS' : 'A DIFFERENT PERSPECTIVE'}</span><strong>${d.label.replace('\n', '<br>')}</strong><p>${d.subtitle}</p><span class="preview-button">${d.tone === 'terminal' ? '> explore' : 'Discover more ↗'}</span></div><div class="preview-bottom"><span>${d.english.toUpperCase()}</span><span>0${d.code}</span></div>${d.tone === 'bento' ? '<div class="bento-blocks"><span>↗<b>24</b></span><span>◒<b>Balance</b></span></div>' : ''}</div>`;
}

function notify(message) {
  const modalStatus = $('#modal-status');
  if ($('#detail').open && modalStatus) {
    modalStatus.textContent = message;
    return;
  }
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2600);
}

function render() {
  $('#categories').innerHTML = categories.map((category, index) => `<button class="nav-item ${state.category === category ? 'active' : ''}" data-category="${category}" aria-pressed="${state.category === category}"><span class="nav-symbol">${symbols[index]}</span>${category}<small>${category === '全部设计' ? designs.length : designs.filter(d => d.category === category).length}</small></button>`).join('');
  $('#tags').innerHTML = ['全部', '简洁', '大胆', '通透', '理性', '暗色', '复古'].map(tag => `<button data-tag="${tag}" class="tag ${state.tag === tag ? 'active' : ''}" aria-pressed="${state.tag === tag}">${tag}</button>`).join('');
  const filtered = filterDesigns(state);
  $('#collection-title').textContent = state.category;
  $('#count').textContent = `${filtered.length} 个设计`;
  $('#empty').hidden = filtered.length !== 0;
  $('#grid').innerHTML = filtered.map(d => `<article class="design-card"><button class="preview-trigger" data-open="${d.id}" aria-label="查看${d.name}设计与提示词">${preview(d)}<span class="preview-overlay">探索设计 ↗</span></button><div class="card-info"><div class="card-heading"><h3><button data-open="${d.id}">${d.name}</button></h3><span class="swatches" aria-label="配色：${d.colors.join('、')}">${d.colors.map(c => `<i style="--swatch:${c}"></i>`).join('')}</span></div><p>${d.english}</p><div class="card-bottom"><span>${d.category}<i>·</i>${d.tag}</span><button data-copy="${d.id}" aria-label="复制${d.name}提示词">复制提示词 <span aria-hidden="true">↗</span></button></div></div></article>`).join('');
}

function openDetail(id) {
  selected = designs.find(d => d.id === id);
  if (!selected) return;
  const d = selected;
  $('#detail-content').innerHTML = `<div class="detail-layout"><div>${preview(d)}<div class="design-description"><span class="eyebrow">${d.english}</span><h2 id="detail-title">${d.name}</h2><p>${d.description}</p><h3>设计语言</h3><dl><dt>适用场景</dt><dd>${d.use}</dd><dt>布局</dt><dd>${d.layout}</dd><dt>字体</dt><dd>${d.typography}</dd><dt>色彩</dt><dd class="palette">${d.colors.map(c => `<span><i style="--swatch:${c}"></i>${c}</span>`).join('')}</dd></dl></div></div><section class="prompt-panel"><div class="prompt-heading"><h3>带走这个风格</h3><span>AI PROMPT</span></div><p>补充用途，让 AI 更懂你想做什么。</p><label for="purpose">用在什么项目？<span>选填</span></label><input id="purpose" maxlength="160" placeholder="例如：独立摄影师的作品集网站"><label for="prompt">设计提示词<span>可直接编辑</span></label><textarea id="prompt" spellcheck="false"></textarea><button id="copy-prompt" class="primary">复制完整提示词 <span>↗</span></button><p class="prompt-help">复制后粘贴到你使用的 AI 编程或设计工具。</p></section></div>`;
  $('#prompt').value = buildPrompt(d);
  const status = document.createElement('p');
  status.id = 'modal-status';
  status.setAttribute('role', 'status');
  status.setAttribute('aria-live', 'polite');
  $('#copy-prompt').after(status);
  $('#purpose').addEventListener('input', event => { $('#prompt').value = buildPrompt(d, event.target.value); });
  $('#copy-prompt').addEventListener('click', () => copyText($('#prompt').value));
  if (!$('#detail').open) $('#detail').showModal();
}

async function copyText(text, fallbackDesign) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    notify('提示词已复制，去创造你的设计吧。');
  } catch {
    if (!$('#detail').open && fallbackDesign) openDetail(fallbackDesign.id);
    const field = $('#prompt');
    if (field) { field.value = text; field.focus(); field.select(); }
    notify('浏览器未允许自动复制。已选中提示词，请按 Ctrl+C 或长按复制。');
  }
}

function reset() { Object.assign(state, { category: '全部设计', tag: '全部', query: '' }); $('#search').value = ''; render(); }
$('#categories').addEventListener('click', event => { const target = event.target.closest('[data-category]'); if (target) { state.category = target.dataset.category; render(); $('#categories [aria-pressed="true"]').focus(); } });
$('#tags').addEventListener('click', event => { const target = event.target.closest('[data-tag]'); if (target) { state.tag = target.dataset.tag; render(); $('#tags [aria-pressed="true"]').focus(); } });
$('#search').addEventListener('input', event => { state.query = event.target.value; render(); });
$('#reset').addEventListener('click', reset);
$('#empty-reset').addEventListener('click', reset);
$('#grid').addEventListener('click', event => {
  const open = event.target.closest('[data-open]');
  const copy = event.target.closest('[data-copy]');
  if (open) openDetail(open.dataset.open);
  if (copy) { const d = designs.find(d => d.id === copy.dataset.copy); if (d) copyText(buildPrompt(d), d); }
});
$('#close').addEventListener('click', () => $('#detail').close());
$('#detail').addEventListener('click', event => { if (event.target === $('#detail')) { const r = $('#detail').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#detail').close(); } });
document.addEventListener('keydown', event => { if (event.key === '/' && !$('#detail').open && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); } });
render();
