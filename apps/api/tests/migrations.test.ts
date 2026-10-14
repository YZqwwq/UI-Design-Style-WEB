import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {migrationChecksums} from '../db/migrate.js';
test('migration checksums accept LF/CRLF history but reject SQL content changes',()=>{
 const lf='CREATE TABLE example (id text);\n',crlf=lf.replace(/\n/g,'\r\n');
 const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
 for(const sql of [lf,crlf]){
  const checks=migrationChecksums(sql);
  assert.equal(checks.canonical,hash(lf));assert.ok(checks.accepted.has(hash(lf)));assert.ok(checks.accepted.has(hash(crlf)));
  assert.equal(checks.accepted.has(hash(lf.replace('text','integer'))),false);
 }
});
