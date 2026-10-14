import type {Pool} from 'pg';
import {createEmailRegistration} from '../../src/email-registration.js';
export const testEmailSecret='integration-test-email-secret-not-for-production';
export async function registrationVerification(pool:Pool,username:string) {
  const email=`${username}@example.com`;
  let code='';
  await createEmailRegistration(pool,testEmailSecret,async(_email,value)=>{code=value;}).requestCode(email);
  return {email,code};
}
export async function cleanupCodes(pool:Pool,names:string[]) {
  await pool.query('DELETE FROM design_atlas.registration_codes WHERE email=ANY($1::text[])',[names.map(name=>`${name}@example.com`)]);
}
