import { installAuth, type AuthOptions } from './auth.js';
import Fastify, { LogController, type FastifyError } from 'fastify';
import fastifyStatic from '@fastify/static';
import { buildPrompt } from './prompt.js';
import type { CatalogRepository, Filters } from './types.js';

const idSchema = {
  type: 'object', additionalProperties: false, required: ['id'],
  properties: { id: { type: 'string', pattern: '^[a-zA-Z0-9_-]{1,80}$' } },
};

export function createApp(repository: CatalogRepository, options: AuthOptions & { publicRoot?: string; logger?: boolean; publicRepository?: CatalogRepository } = {}) {
  const app = Fastify({
    logger: options.logger ?? false,
    logController: new LogController({ disableRequestLogging: true }),
    bodyLimit: 16 * 1024,
    ajv: { customOptions: { removeAdditional: false } },
  });
  app.addHook('onRequest', async (_request, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('Cache-Control', 'no-store');
  });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error.validation || (error.statusCode && error.statusCode >= 400 && error.statusCode < 500)) {
      return reply.code(error.statusCode || 400).send({ error: 'INVALID_REQUEST', message: '请求参数或格式无效。' });
    }
    // Never serialize a PostgreSQL error: it may contain credentials or SQL values.
    request.log.error({ requestId: request.id }, '请求失败，请检查数据库连接、迁移和服务配置。');
    return reply.code(503).send({ error: 'SERVICE_UNAVAILABLE', message: '服务暂时不可用，请稍后重试。' });
  });
  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'NOT_FOUND', message: '未找到请求的内容。' }));

  installAuth(app, options);

  app.get('/api/health', async () => {
    await repository.check();
    return { status: 'ok', database: 'connected' };
  });
  for (const {prefix,source,isPublic} of [
    {prefix:'/api',source:repository,isPublic:false},
    ...(options.publicRepository ? [{prefix:'/api/public',source:options.publicRepository,isPublic:true}] : []),
  ]) {
  app.get(`${prefix}/catalog`, async request => source.metadata(isPublic ? '' : request.user!.id));
  app.get<{ Querystring: Filters }>(`${prefix}/designs`, {
    schema: {
      querystring: {
        type: 'object', additionalProperties: false,
        properties: {
          category: { type: 'string', maxLength: 80 },
          tag: { type: 'string', maxLength: 80 },
          query: { type: 'string', maxLength: 200 },
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 24 },
          offset: { type: 'integer', minimum: 0, maximum: 1000000, default: 0 },
        },
      },
    },
  }, async request => source.list(request.query, isPublic ? '' : request.user!.id));

  app.get<{ Params: { id: string } }>(`${prefix}/designs/:id`, { schema: { params: idSchema } }, async (request, reply) => {
    const design = await source.get(request.params.id, isPublic ? '' : request.user!.id);
    if (!design) return reply.code(404).send({ error: 'NOT_FOUND', message: '该设计不存在。' });
    return design;
  });
  app.post<{ Params: { id: string }; Body: { purpose?: string } }>(`${prefix}/designs/:id/prompt`, {
    schema: {
      params: idSchema,
      body: { type: 'object', additionalProperties: false, properties: { purpose: { type: 'string', maxLength: 160 } } },
    },
  }, async (request, reply) => {
    const design = await source.get(request.params.id, isPublic ? '' : request.user!.id);
    if (!design) return reply.code(404).send({ error: 'NOT_FOUND', message: '该设计不存在。' });
    return { prompt: buildPrompt(design, request.body.purpose) };
  });

  }

  if (options.publicRoot) {
    // Serve only the web workspace's build output. API and repository files remain outside this root.
    app.register(fastifyStatic, {
      root: options.publicRoot,
      dotfiles: 'deny',
      index: ['index.html'],
      cacheControl: false,
    });
  }
  return app;
}
