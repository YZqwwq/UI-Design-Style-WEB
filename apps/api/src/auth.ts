import { createHash } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { sessionSeconds, type AuthStore, type User } from './auth-store.js';

declare module 'fastify' { interface FastifyRequest { user: User | null } }
export interface AuthOptions { auth?: AuthStore; origins?: string[]; secureCookie?: boolean }
function tokenFrom(cookie?: string) {
  const values = (cookie || '').split(';').map(part => part.trim()).filter(part => part.startsWith('atlas_session='));
  return values.length === 1 ? values[0].slice('atlas_session='.length) : '';
}
export function installAuth(app: FastifyInstance, options: AuthOptions) {
  const origins = new Set(options.origins || ['http://localhost:4173','http://127.0.0.1:4173']);
  const cookie = (token: string, age = sessionSeconds) => `atlas_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${options.secureCookie ? '; Secure' : ''}`;
  app.decorateRequest('user', null);
  // Single-process deployment: bounded fixed-window attempts plus an explicit KDF concurrency cap.
  const attempts = new Map<string, { count: number; until: number }>();
  let hashing = 0;
  function allowed(key: string, limit: number) {
    const now = Date.now();
    for (const [id, entry] of attempts) if (entry.until <= now) attempts.delete(id);
    const entry = attempts.get(key);
    if (!entry && attempts.size >= 10000) return false;
    const next = entry || { count: 0, until: now + 10 * 60 * 1000 };
    next.count++; attempts.set(key,next);
    return next.count <= limit;
  }
  app.addHook('onRequest', async (request, reply) => {
    const route = request.routeOptions.url || '';
    if (!route.startsWith('/api/')) return;
    if (!['GET','HEAD','OPTIONS'].includes(request.method)) {
      // A custom header forces cross-origin browsers through preflight; no CORS is enabled.
      if (request.headers['x-atlas-request'] !== '1' || (request.headers.origin && !origins.has(request.headers.origin))) {
        return reply.code(403).send({ error:'FORBIDDEN',message:'请求来源无效，请从网站页面操作。' });
      }
    }
    if (route === '/api/auth/register' || route === '/api/auth/login' || route === '/api/health' || route.startsWith('/api/public/')) return;
    request.user = await options.auth?.session(tokenFrom(request.headers.cookie)) || null;
    if (route === '/api/auth/me' || route === '/api/auth/logout') return;
    if (!request.user) return reply.code(401).send({ error:'UNAUTHORIZED',message:'请先登录。' });
  });
  app.get('/api/auth/me', async request => ({ user: request.user }));
  const credentials = {
    type:'object', additionalProperties:false, required:['username','password'],
    properties: {
      username: { type:'string',pattern:'^[a-zA-Z0-9_]{3,32}$' },
      password: { type:'string',minLength:10,maxLength:128 },
    },
  };
  for (const action of ['register','login'] as const) {
    const body = action === 'register' ? { ...credentials, required:[...credentials.required,'confirmation'], properties:{...credentials.properties,confirmation:{type:'string',maxLength:128}} } : credentials;
    app.post<{ Body: { username:string; password:string; confirmation?:string } }>(`/api/auth/${action}`, { schema: { body } }, async (request,reply) => {
      if (!options.auth) return reply.code(503).send({error:'SERVICE_UNAVAILABLE',message:'账号服务暂时不可用。'});
      const username = request.body.username.toLowerCase();
      const key = createHash('sha256').update(username).digest('hex');
      if (!allowed(`ip:${request.ip}`,30) || !allowed(`user:${action}:${key}`,10)) {
        return reply.header('Retry-After','600').code(429).send({ error:'TOO_MANY_ATTEMPTS',message:'尝试过于频繁，请稍后再试。' });
      }
      if (hashing >= 2) return reply.header('Retry-After','2').code(503).send({error:'BUSY',message:'账号服务繁忙，请稍后重试。'});
      hashing++;
      try {
        if (action === 'register' && request.body.password !== request.body.confirmation) return reply.code(400).send({error:'PASSWORD_MISMATCH',message:'两次输入的密码不一致。'});
        const result = await options.auth[action](username,request.body.password,tokenFrom(request.headers.cookie));
        if (!result) return reply.code(action === 'register' ? 409 : 401).send({error:action === 'register' ? 'USERNAME_TAKEN':'INVALID_CREDENTIALS',message:action === 'register' ? '这个用户名已被使用。':'用户名或密码不正确。'});
        const { user, token } = result;
        return reply.header('Set-Cookie',cookie(token)).code(action === 'register' ? 201 : 200).send({ user });
      } finally { hashing--; }
    });
  }
  app.post('/api/auth/logout', async (request,reply) => {
    const token = tokenFrom(request.headers.cookie);
    if (token && options.auth) await options.auth.revoke(token);
    return reply.header('Set-Cookie',cookie('',0)).send({ ok:true });
  });
  app.post('/api/auth/logout-all', { schema: { body: { type:'object', additionalProperties:false, properties:{} } } }, async (request,reply) => {
    await options.auth!.revokeAll(request.user!.id);
    return reply.header('Set-Cookie',cookie('',0)).send({ok:true});
  });
  app.post<{Body:{currentPassword:string;password:string;confirmation:string}}>('/api/auth/password', {
    schema: { body: {type:'object',additionalProperties:false,required:['currentPassword','password','confirmation'],properties:{
      currentPassword:{type:'string',minLength:1,maxLength:128}, password:{type:'string',minLength:10,maxLength:128}, confirmation:{type:'string',maxLength:128},
    }} },
  }, async (request,reply) => {
    if (!allowed(`password:${request.user!.id}`,10) || !allowed(`ip:${request.ip}`,30)) return reply.header('Retry-After','600').code(429).send({error:'TOO_MANY_ATTEMPTS',message:'尝试过于频繁，请稍后再试。'});
    if (request.body.password !== request.body.confirmation) return reply.code(400).send({error:'PASSWORD_MISMATCH',message:'两次输入的密码不一致。'});
    if (hashing >= 2) return reply.header('Retry-After','2').code(503).send({error:'BUSY',message:'账号服务繁忙，请稍后重试。'});
    hashing++;
    try {
      if (!await options.auth!.changePassword(request.user!.id,request.body.currentPassword,request.body.password)) return reply.code(400).send({error:'INVALID_CREDENTIALS',message:'当前密码不正确。'});
      return reply.header('Set-Cookie',cookie('',0)).send({ok:true});
    } finally { hashing--; }
  });
}
