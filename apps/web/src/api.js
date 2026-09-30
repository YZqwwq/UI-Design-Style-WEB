export async function request(path, { signal, ...options } = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    signal,
    headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': '1', ...options.headers },
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    if (response.status === 401 && !path.startsWith('/auth/')) window.dispatchEvent(new Event('auth-required'));
    const error = new Error(data.message || (response.status === 404 ? '该设计不存在或已被移除。' : '暂时无法加载，请重试。'));
    error.status = response.status;
    throw error;
  }
  return response.json();
}

let catalogPrefix = '/public';
export function setLibraryScope(user) { catalogPrefix = user ? '' : '/public'; }
export const fetchCatalog = signal => request(`${catalogPrefix}/catalog`, { signal });
export const fetchDesigns = (filters, signal) => request(`${catalogPrefix}/designs?${new URLSearchParams(filters)}`, { signal });
export const fetchDesign = (id, signal) => request(`${catalogPrefix}/designs/${encodeURIComponent(id)}`, { signal });
export const fetchPrompt = (id, purpose = '', signal) => request(`${catalogPrefix}/designs/${encodeURIComponent(id)}/prompt`, {
  method: 'POST', body: JSON.stringify({ purpose }), signal,
});
