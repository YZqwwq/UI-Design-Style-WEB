import type { Pool } from 'pg';
import type { FastifyInstance } from 'fastify';
import type { Design } from './types.js';
import { randomUUID } from 'node:crypto';

type DesignInput = Omit<Design, 'id'>;
type Kind = 'categories' | 'tags';
const tables = { categories:'user_categories', tags:'user_tags' } as const;
export function createLibraryStore(pool: Pool) {
  return {
    async save(owner: string, input: DesignInput, id?: string) {
      const {category,tag,...content} = input;
      const values = [owner,category,tag,JSON.stringify(content)];
      const references = `FROM design_atlas.user_categories c, design_atlas.user_tags t
        WHERE c.owner_id=$1 AND t.owner_id=$1 AND c.name=$2 AND t.name=$3`;
      const result = id
        ? await pool.query(`UPDATE design_atlas.user_designs d SET content=$4::jsonb, category_id=c.id, tag_id=t.id, updated_at=now()
            ${references} AND d.owner_id=$1 AND d.id=$5 RETURNING d.id`, [...values,id])
        : await pool.query(`INSERT INTO design_atlas.user_designs(owner_id,category_id,tag_id,content)
            SELECT $1,c.id,t.id,$4::jsonb ${references} RETURNING id`,values);
      return result.rows[0];
    },
    async remove(owner: string, id: string) {
      return (await pool.query('DELETE FROM design_atlas.user_designs WHERE owner_id=$1 AND id=$2 RETURNING id',[owner,id])).rowCount !== 0;
    },
    async terms(owner: string, kind: Kind) {
      return (await pool.query(`SELECT id,name FROM design_atlas.${tables[kind]} WHERE owner_id=$1 ORDER BY position,id`,[owner])).rows;
    },
    async saveTerm(owner: string, kind: Kind, name: string, id?: string) {
      const table = tables[kind]; // SQL identifiers only come from the server's fixed route table.
      return (await (id
        ? pool.query(`UPDATE design_atlas.${table} SET name=$3 WHERE owner_id=$1 AND id=$2 RETURNING id,name`,[owner,id,name])
        : pool.query(`INSERT INTO design_atlas.${table}(owner_id,id,name) VALUES ($1,$2,$3) RETURNING id,name`,[owner,randomUUID(),name]))).rows[0];
    },
    async removeTerm(owner: string, kind: Kind, id: string) {
      return (await pool.query(`DELETE FROM design_atlas.${tables[kind]} WHERE owner_id=$1 AND id=$2 RETURNING id`,[owner,id])).rowCount !== 0;
    },
  };
}
export type LibraryStore = ReturnType<typeof createLibraryStore>;
const text = (maxLength = 1200) => ({type:'string',maxLength,default:''});
const name = {type:'string',minLength:1,maxLength:80,pattern:'\\S'};
const designBody = {
  type:'object',additionalProperties:false,required:['name','category','tag'],
  properties:{
    name,category:name,tag:name,english:text(120),
    tone:{type:'string',enum:['editorial','brutal','glass','swiss','terminal','retro','bento','mono'],default:'editorial'},
    colors:{type:'array',minItems:1,maxItems:8,items:{type:'string',pattern:'^#[a-fA-F0-9]{6}$'},default:['#ffffff','#111111']},
    description:text(),layout:text(),typography:text(),surface:text(),interaction:text(),use:text(),
    label:text(160),subtitle:text(240),code:text(40),
  },
};
const params = {type:'object',additionalProperties:false,required:['id'],properties:{id:{type:'string',pattern:'^[a-zA-Z0-9_-]{1,80}$'}}};
const querystring = {type:'object',additionalProperties:false,properties:{}};
const missing = {error:'NOT_FOUND',message:'该资源或所选分类、标签不存在。'};
export function installLibrary(app: FastifyInstance, store: LibraryStore) {
  // Authentication and CSRF hooks run before every route. No owner/role input is accepted.
  app.post<{Body:DesignInput}>('/api/designs',{schema:{body:designBody,querystring}},async (request,reply) => {
    const result = await store.save(request.user!.id,request.body);
    return result ? reply.code(201).send(result) : reply.code(400).send(missing);
  });
  app.put<{Body:DesignInput;Params:{id:string}}>('/api/designs/:id',{schema:{body:designBody,params,querystring}},async (request,reply) => {
    const result = await store.save(request.user!.id,request.body,request.params.id);
    return result || reply.code(404).send(missing);
  });
  app.delete<{Params:{id:string}}>('/api/designs/:id',{schema:{params,querystring}},async (request,reply) => {
    return await store.remove(request.user!.id,request.params.id) ? {ok:true} : reply.code(404).send(missing);
  });
  for (const kind of ['categories','tags'] as const) {
    app.get(`/api/${kind}`,{schema:{querystring}},async request => store.terms(request.user!.id,kind));
    app.post<{Body:{name:string}}>(`/api/${kind}`,{schema:{querystring,body:{type:'object',additionalProperties:false,required:['name'],properties:{name}}}},async (request,reply) => {
      return reply.code(201).send(await store.saveTerm(request.user!.id,kind,request.body.name));
    });
    app.put<{Params:{id:string};Body:{name:string}}>(`/api/${kind}/:id`,{schema:{params,querystring,body:{type:'object',additionalProperties:false,required:['name'],properties:{name}}}},async (request,reply) => {
      return await store.saveTerm(request.user!.id,kind,request.body.name,request.params.id) || reply.code(404).send(missing);
    });
    app.delete<{Params:{id:string}}>(`/api/${kind}/:id`,{schema:{params,querystring}},async (request,reply) => {
      return await store.removeTerm(request.user!.id,kind,request.params.id) ? {ok:true} : reply.code(404).send(missing);
    });
  }
}
