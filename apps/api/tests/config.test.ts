import test, {type TestContext} from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,writeFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { loadConfig,safeDatabaseError } from '../src/config.js';

const settings = {
 PGHOST:'localhost',PGPORT:'5432',PGSSLMODE:'disable',
 PGDATABASE:'production_fixture',PGUSER:'production_user',PGPASSWORD:'production-secret-fixture',
 'PGDATABASE-test':'test_fixture','PGUSER-test':'test_user','PGPASSWORD-test':'test-secret-fixture',
};
async function fixture(t:TestContext, values:Record<string,string>, filename='.env') {
 const root=await mkdtemp(path.join(tmpdir(),'atlas-config-'));
 t.after(()=>rm(root,{recursive:true,force:true}));
 await writeFile(path.join(root,filename),Object.entries(values).map(([key,value])=>`${key}=${JSON.stringify(value)}`).join('\n'));
 return root;
}
test('development selects only test credentials; production selects only production credentials',async t=>{
 const root=await fixture(t,settings);
 const dev=await loadConfig(root),prod=await loadConfig(root,'production');
 assert.equal(dev.environment,'development');assert.equal(dev.db.database,'test_fixture');assert.equal(dev.db.user,'test_user');assert.equal(dev.db.password,'test-secret-fixture');
 assert.equal(prod.environment,'production');assert.equal(prod.db.database,'production_fixture');assert.equal(prod.db.user,'production_user');assert.equal(prod.db.password,'production-secret-fixture');
});
test('missing or empty test credentials fail closed instead of using production',async t=>{
 for(const key of ['PGDATABASE-test','PGUSER-test','PGPASSWORD-test']){
  for(const missing of [true,false]){
   const values:Record<string,string>={...settings};if(missing)delete values[key];else values[key]='';
   const root=await fixture(t,values);
   await assert.rejects(loadConfig(root),error=>safeDatabaseError(error).includes(key)&&!safeDatabaseError(error).includes('secret-fixture'));
   assert.equal((await loadConfig(root,'production')).db.database,'production_fixture');
  }
 }
});
test('development rejects the production database name',async t=>{
 const root=await fixture(t,{...settings,'PGDATABASE-test':settings.PGDATABASE});
 await assert.rejects(loadConfig(root),/测试库与正式库名称相同/);
});
test('test-only config and uppercase .ENV work, optional test connection settings override shared values',async t=>{
 const values:Record<string,string>={...settings,'PGHOST-test':'test-host','PGPORT-test':'5433','PGSSLMODE-test':'verify-full'};
 delete values.PGDATABASE;delete values.PGUSER;delete values.PGPASSWORD;
 const root=await fixture(t,values,'.ENV');
 const config=await loadConfig(root);
 assert.equal(config.db.host,'test-host');assert.equal(config.db.port,5433);assert.deepEqual(config.db.ssl,{rejectUnauthorized:true});
 await assert.rejects(loadConfig(root,'production'),/PGDATABASE/);
});
