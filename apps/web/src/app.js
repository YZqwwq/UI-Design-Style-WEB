import { setLibraryScope, request, fetchCatalog, fetchDesigns, fetchDesign, fetchPrompt } from './api.js';
import { createSessionState } from './session-state.js';
import { installManagement } from './library-ui.js';

const $ = selector => document.querySelector(selector);
const state = { category: '', tag: '', query: '' };
let catalog = { categories: [], tags: [] };
let items = [];
let total = 0;
let listController;
let listVersion = 0;
let searchTimer;
let detailController;
let detailVersion = 0;
let promptController;
let promptVersion = 0;
let promptTimer;
let toastTimer;
let selectedId;
let detailTrigger;
const tones = new Set(['editorial', 'brutal', 'glass', 'swiss', 'terminal', 'retro', 'bento', 'mono']);
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function displayDesign(raw) {
  const result = Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, escapeHTML(value)]));
  result.colors = raw.colors.map(color => /^#[a-f\d]{6}$/i.test(color) ? color : '#808080');
  result.tone = tones.has(raw.tone) ? raw.tone : 'editorial';
  return result;
}
function preview(raw) {
  const d = displayDesign(raw);
  return `<div class="preview ${d.tone}" aria-hidden="true"><div class="preview-nav"><span>${d.tone === 'terminal' ? '● SYSTEM / ONLINE' : 'STUDIO / ' + d.code}</span><span>↗</span></div><div class="preview-body"><span class="preview-kicker">${d.tone === 'retro' ? 'EST. 1978 · STILL CURIOUS' : 'A DIFFERENT PERSPECTIVE'}</span><strong>${d.label.replace('\n', '<br>')}</strong><p>${d.subtitle}</p><span class="preview-button">${d.tone === 'terminal' ? '> explore' : 'Discover more ↗'}</span></div><div class="preview-bottom"><span>${d.english.toUpperCase()}</span><span>0${d.code}</span></div>${d.tone === 'bento' ? '<div class="bento-blocks"><span>↗<b>24</b></span><span>◒<b>Balance</b></span></div>' : ''}</div>`;
}

function notify(message) {
  const modalStatus = $('#modal-status');
  if ($('#detail').open && modalStatus) { modalStatus.textContent = message; return; }
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 2600);
}

function renderFilters() {
  $('#categories').innerHTML = ['', ...catalog.categories].map(category => `<button class="nav-item ${state.category === category ? 'active' : ''}" data-category="${escapeHTML(category)}" aria-pressed="${state.category === category}">${escapeHTML(category || '全部设计')}</button>`).join('');
  $('#tags').innerHTML = ['', ...catalog.tags].map(tag => `<button data-tag="${escapeHTML(tag)}" class="tag ${state.tag === tag ? 'active' : ''}" aria-pressed="${state.tag === tag}">${escapeHTML(tag || '全部')}</button>`).join('');
  $('#collection-title').textContent = state.category || '全部设计';
  $('#reset').hidden = !state.category && !state.tag && !state.query;
}

function renderCards() {
  $('#grid').innerHTML = items.map(raw => {
    const d = displayDesign(raw);
    return `<article class="design-card ${raw.id === selectedId ? 'selected' : ''}"><button class="preview-trigger" data-open="${d.id}" aria-label="查看${d.name}设计与提示词">${preview(raw)}</button><div class="card-info"><div class="card-heading"><h3><button data-open="${d.id}">${d.name}</button></h3><span class="swatches" aria-label="配色：${d.colors.join('、')}">${d.colors.map(c => `<i style="--swatch:${c}"></i>`).join('')}</span></div><div class="card-bottom"><span>${d.category}<i>·</i>${d.tag}</span></div></div></article>`;
  }).join('');
  $('#count').textContent = `${total} 个设计`;
  $('#empty').hidden = total !== 0;
  $('#load-more').hidden = items.length >= total;
}

function cancelList() {
  clearTimeout(searchTimer);
  listController?.abort();
  listVersion += 1;
}

async function loadList(append = false) {
  cancelList();
  const version = listVersion;
  const controller = listController = new AbortController();
  $('#load-status').hidden = false;
  $('#load-error').hidden = true;
  $('#empty').hidden = true;
  $('#grid').setAttribute('aria-busy', 'true');
  $('#load-more').disabled = true;
  if (!append) { items = []; $('#grid').replaceChildren(); $('#load-more').hidden = true; }
  $('#count').textContent = '加载中';
  try {
    const [metadata, page] = await Promise.all([
      fetchCatalog(controller.signal),
      fetchDesigns({ ...state, limit: 24, offset: append ? items.length : 0 }, controller.signal),
    ]);
    if (version !== listVersion) return;
    catalog = metadata;
    items = append ? [...items, ...page.items] : page.items;
    total = page.total;
    const focused = document.activeElement;
    const categoryFocus = focused?.hasAttribute('data-category');
    const tagFocus = focused?.hasAttribute('data-tag');
    renderFilters();
    if (categoryFocus) $('#categories [aria-pressed="true"]')?.focus();
    if (tagFocus) $('#tags [aria-pressed="true"]')?.focus();
    renderCards();
  } catch (error) {
    if (version !== listVersion || error.name === 'AbortError') return;
    controller.abort();
    $('#load-error').hidden = false;
    $('#count').textContent = '加载失败';
    $('#load-more').hidden = true;
  } finally {
    if (version === listVersion) {
      $('#load-status').hidden = true;
      $('#grid').setAttribute('aria-busy', 'false');
      $('#load-more').disabled = false;
    }
  }
}

function stopPrompt() {
  clearTimeout(promptTimer);
  promptController?.abort();
  promptVersion += 1;
}

async function updatePrompt(id, purpose) {
  const version = promptVersion;
  const dialogVersion = detailVersion;
  const controller = promptController = new AbortController();
  try {
    const data = await fetchPrompt(id, purpose, controller.signal);
    if (version !== promptVersion || dialogVersion !== detailVersion || !$('#detail').open) return;
    $('#prompt').value = data.prompt;
    $('#copy-prompt').disabled = false;
    $('#prompt').disabled = false;
    $('#modal-status').textContent = '';
  } catch (error) {
    if (error.name === 'AbortError' || version !== promptVersion || dialogVersion !== detailVersion) return;
    $('#modal-status').innerHTML = '提示词加载失败。<button id="retry-prompt" class="text-button">重试</button>';
    $('#retry-prompt').addEventListener('click', () => updatePrompt(id, purpose));
  }
}

async function openDetail(id, fallbackText) {
  detailTrigger = document.activeElement;
  selectedId = id;
  renderCards();
  document.body.classList.add('detail-open');
  detailController?.abort();
  stopPrompt();
  const version = ++detailVersion;
  const controller = detailController = new AbortController();
  $('#detail-content').innerHTML = '<div class="detail-loading"><h2 id="detail-title">加载设计中…</h2></div>';
  if (!$('#detail').open) {
    if (window.matchMedia('(max-width: 1000px)').matches) $('#detail').showModal();
    else $('#detail').show();
  }
  $('#close').focus();
  try {
    const [raw, data] = await Promise.all([fetchDesign(id, controller.signal), fetchPrompt(id, '', controller.signal)]);
    if (version !== detailVersion || !$('#detail').open) return;
    const d = displayDesign(raw);
    $('#detail-content').innerHTML = `<div class="detail-layout"><div><div class="design-description"><span class="eyebrow">${d.english}</span><h2 id="detail-title">${d.name}</h2><p>${d.description}</p><h3>设计语言</h3><dl><dt>适用场景</dt><dd>${d.use}</dd><dt>布局</dt><dd>${d.layout}</dd><dt>字体</dt><dd>${d.typography}</dd><dt>色彩</dt><dd class="palette">${d.colors.map(c => `<span><i style="--swatch:${c}"></i>${c}</span>`).join('')}</dd></dl></div></div><section class="prompt-panel"><div class="prompt-heading"><h3>设计提示词</h3></div><label for="purpose">用在什么项目？<span>选填</span></label><input id="purpose" maxlength="160" placeholder="例如：独立摄影师的作品集网站"><label for="prompt">设计提示词<span>可直接编辑</span></label><textarea id="prompt" spellcheck="false"></textarea><button id="copy-prompt" class="primary">复制提示词</button></section></div>`;
    $('#prompt').value = fallbackText ?? data.prompt;
    const status = document.createElement('p');
    status.id = 'modal-status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');
    $('#copy-prompt').after(status);
    $('#purpose').addEventListener('input', event => {
      stopPrompt();
      const purpose = event.target.value;
      $('#copy-prompt').disabled = true;
      $('#prompt').disabled = true;
      $('#modal-status').textContent = '正在更新提示词…';
      promptTimer = setTimeout(() => updatePrompt(id, purpose), 250);
    });
    $('#copy-prompt').addEventListener('click', () => copyText($('#prompt').value));
    if (currentUser) {
      const edit=document.createElement('button');edit.className='shell-button';edit.textContent='编辑设计';
      edit.addEventListener('click',()=>void management.editor(id));
      $('#detail-content .design-description').append(edit);
    }
    if (fallbackText !== undefined) {
      $('#prompt').focus(); $('#prompt').select();
      notify('浏览器未允许自动复制。已选中提示词，请按 Ctrl+C / ⌘C 或长按复制。');
    }
  } catch (error) {
    if (version !== detailVersion || error.name === 'AbortError' || !$('#detail').open) return;
    controller.abort();
    $('#detail-content').innerHTML = '<div class="detail-loading"><h2 id="detail-title">暂时无法加载设计</h2><button id="retry-detail" class="primary">重试</button></div>';
    $('#retry-detail').addEventListener('click', () => openDetail(id, fallbackText));
  }
}

async function copyText(text, fallbackId) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('Clipboard unavailable');
    await navigator.clipboard.writeText(text);
    notify('提示词已复制。');
  } catch {
    if (fallbackId) { await openDetail(fallbackId, text); return; }
    const field = $('#prompt');
    if (field) { field.focus(); field.select(); }
    notify('浏览器未允许自动复制。已选中提示词，请按 Ctrl+C / ⌘C 或长按复制。');
  }
}

function reset() {
  Object.assign(state, { category: '', tag: '', query: '' });
  $('#search').value = '';
  renderFilters();
  void loadList();
}
$('#categories').addEventListener('click', event => {
  const target = event.target.closest('[data-category]');
  if (target) { if (window.matchMedia('(max-width: 760px)').matches) setSidebar(false); state.category = target.dataset.category; renderFilters(); $('#categories [aria-pressed="true"]').focus(); void loadList(); }
});
$('#tags').addEventListener('click', event => {
  const target = event.target.closest('[data-tag]');
  if (target) { if (window.matchMedia('(max-width: 760px)').matches) setSidebar(false); state.tag = target.dataset.tag; renderFilters(); $('#tags [aria-pressed="true"]').focus(); void loadList(); }
});
$('#search').addEventListener('input', event => {
  state.query = event.target.value;
  cancelList();
  $('#reset').hidden = !state.category && !state.tag && !state.query;
  $('#load-more').hidden = true;
  searchTimer = setTimeout(() => loadList(), 200);
});
$('#reset').addEventListener('click', reset);
$('#empty-reset').addEventListener('click', reset);
$('#retry-load').addEventListener('click', () => loadList());
$('#load-more').addEventListener('click', () => loadList(true));
$('#grid').addEventListener('click', event => {
  const open = event.target.closest('[data-open]');
  if (open) void openDetail(open.dataset.open);
});
$('#close').addEventListener('click', () => $('#detail').close());
$('#detail').addEventListener('close', () => {
  detailVersion += 1; detailController?.abort(); stopPrompt();
  document.body.classList.remove('detail-open');
  const previous = selectedId; selectedId = undefined; renderCards();
  const trigger = [...document.querySelectorAll('[data-open]')].find(button => button.dataset.open === previous);
  (trigger || (detailTrigger?.isConnected ? detailTrigger : $('#search'))).focus();
});
$('#detail').addEventListener('click', event => {
  if (event.target === $('#detail')) {
    const r = $('#detail').getBoundingClientRect();
    if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) $('#detail').close();
  }
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && $('#detail').open) { $('#detail').close(); return; }
  if (event.key === '/' && !$('#auth-gate').open && !$('#detail').open && !['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)) { event.preventDefault(); $('#search').focus(); }
});
// The library is loaded only after the server confirms the current user.

const narrowScreen = window.matchMedia('(max-width: 760px)');
function setSidebar(open) {
  if (!open && $('#sidebar').contains(document.activeElement)) $('#toggle-sidebar').focus();
  $('#sidebar-content').hidden = !open;
  document.body.classList.toggle('sidebar-collapsed', !open);
  $('#toggle-sidebar').setAttribute('aria-expanded', String(open));
  $('#toggle-sidebar').setAttribute('aria-label', open ? '收起分类' : '展开分类');
  $('#toggle-sidebar').title = open ? '收起分类' : '展开分类';
}
$('#toggle-sidebar').addEventListener('click', () => setSidebar($('#sidebar-content').hidden));
narrowScreen.addEventListener('change', () => {
  setSidebar(!narrowScreen.matches);
  if ($('#detail').open) $('#detail').close();
});
setSidebar(!narrowScreen.matches);

window.matchMedia('(max-width: 1000px)').addEventListener('change', () => {
  if ($('#detail').open) $('#detail').close();
});



const authChannel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('atlas-auth') : null;
let currentUser = null;
let sessionInitialized = false;
const sessionState = createSessionState(() => request('/auth/me'), showUser);
const management=installManagement({request,getUser:()=>currentUser,refresh:()=>{Object.assign(state,{category:'',tag:'',query:''});$('#search').value='';return loadList();},openDetail,mutateAuth,escapeHTML});
let authView;
let authModule;
let openingAuth = false;
const loadAuthComponent = () => authModule ||= import('./features/auth/mount.tsx').catch(error => { authModule = undefined; throw error; });
async function openAuth() {
  if (openingAuth || sessionState.busy || currentUser || $('#auth-gate').open) return;
  openingAuth = true;
  $('#account').setAttribute('aria-busy', 'true');
  try {
    const { mountAuth } = await loadAuthComponent();
    if (currentUser) return;
    if ($('#detail').open) $('#detail').close();
    authView = mountAuth($('#auth-root'), {
      onHome: () => $('#auth-gate').close(),
      authenticate: (mode,credentials) => mutateAuth(`/auth/${mode}`,credentials),
    });
    $('#auth-gate').showModal();
    $('#username')?.focus();
  } catch { notify('登录组件加载失败，请重试。'); }
  finally { openingAuth = false; $('#account').removeAttribute('aria-busy'); }
}
function showUser(user) {
  if (sessionInitialized && currentUser?.id === user?.id) return;
  sessionInitialized = true;
  management.close();
  cancelList(); detailVersion++; detailController?.abort(); stopPrompt();
  if ($('#detail').open) $('#detail').close();
  currentUser = user;
  setLibraryScope(user);
  items = []; total = 0; selectedId = undefined;
  catalog = {categories:[],tags:[]};
  Object.assign(state, {category:'',tag:'',query:''});
  $('#search').value = '';
  $('#grid').replaceChildren(); $('#categories').replaceChildren(); $('#tags').replaceChildren();
  $('#reset').hidden = true; $('#count').textContent = '';
  if ($('#auth-gate').open) $('#auth-gate').close();
  $('#search').disabled = false; $('#logout').hidden = !user;
  $('#new-design').hidden=!user;$('.library-management').hidden=!user;
  $('#account').textContent = user ? user.username : 'Sign in';
  $('#account').disabled = false;
  $('#account').title = user ? user.username : 'Sign in';
  void loadList();
}
$('#account').addEventListener('click', () => currentUser ? management.account() : void openAuth());
$('#account').addEventListener('pointerenter', () => { if (!currentUser) void loadAuthComponent().catch(() => {}); });
$('#logout').addEventListener('click', async () => {
  $('#logout').disabled = true;
  try { await mutateAuth('/auth/logout',{}); $('#account').focus(); }
  catch(error) { notify(error.message); }
  finally { $('#logout').disabled = false; }
});
window.addEventListener('auth-required', () => {
  if (!currentUser) return;
  sessionState.invalidate();
  showUser(null); notify('登录已过期，已返回公开设计。');
});
async function restoreUser() {
  await sessionState.restore();
}
async function mutateAuth(path, body) {
  try { await sessionState.mutate(() => request(path,{method:'POST',body:JSON.stringify(body)})); }
  finally { authChannel?.postMessage('changed'); }
}
void restoreUser();
if (authChannel) authChannel.onmessage = () => { showUser(null); void restoreUser(); };
window.addEventListener('focus', () => { if (!sessionState.busy) void restoreUser(); });
$('#auth-gate').addEventListener('close', () => { authView?.destroy(); authView = undefined; });
