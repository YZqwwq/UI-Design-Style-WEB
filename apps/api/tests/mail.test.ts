import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createMailer,readMailConfig,type MailConfig} from '../src/mail.js';
const config:MailConfig={accessKeyId:'test-key',accessKeySecret:'test-secret',region:'cn-hangzhou',from:'noreply@example.com',fromName:'设计图鉴',replyTo:false};
test('mail sends one signed HTTPS request with no secrets in content or response',async()=>{
 let calls=0;
 await createMailer(config,async(url,options)=>{
  calls++;assert.equal(url,'https://dm.aliyuncs.com/');assert.equal(options?.method,'POST');assert.equal(options?.redirect,'error');
  const p=new URLSearchParams(options?.body as URLSearchParams);
  assert.equal(p.get('Action'),'SingleSendMail');assert.equal(p.get('ToAddress'),'user@example.com');assert.equal(p.get('ReplyToAddress'),'false');
  assert.match(p.get('TextBody')!,/123456/);assert.ok(!p.get('TextBody')!.includes(config.accessKeySecret));
  const signature=p.get('Signature');p.delete('Signature');
  const enc=(s:string)=>encodeURIComponent(s).replace(/[!'()*]/g,x=>'%'+x.charCodeAt(0).toString(16).toUpperCase());
  const canonical=[...p.keys()].sort().map(key=>`${enc(key)}=${enc(p.get(key)!)}`).join('&');
  assert.equal(signature,createHmac('sha1','test-secret&').update('POST&%2F&'+enc(canonical)).digest('base64'));
  return new Response(JSON.stringify({RequestId:'request',EnvId:'event'}),{status:200});
 })('user@example.com','123456');
 assert.equal(calls,1);
});
test('mail provider errors and network failures are sanitized and never retried',async()=>{
 for(const transport of [async()=>{throw new Error('test-secret');},async()=>new Response(JSON.stringify({Code:'Denied',Message:'test-secret'}),{status:403})]){
  let calls=0;await assert.rejects(createMailer(config,async()=>{calls++;return transport();})('user@example.com','123456'),error=>error instanceof Error&&!error.message.includes('test-secret'));
  assert.equal(calls,1);
 }
});
test('mail config requires complete credentials and an allowlisted endpoint',()=>{
 assert.equal(readMailConfig({}),undefined);assert.equal(readMailConfig({MAIL_PROVIDER:'aliyun'}),undefined);
 const values={MAIL_PROVIDER:'aliyun',ALIBABA_CLOUD_ACCESS_KEY_ID:'id',ALIBABA_CLOUD_ACCESS_KEY_SECRET:'secret',ALIYUN_DM_REGION_ID:'cn-hangzhou',MAIL_FROM_ADDRESS:'noreply@example.com'};
 assert.equal(readMailConfig(values)?.region,'cn-hangzhou');
 assert.throws(()=>readMailConfig({...values,ALIYUN_DM_REGION_ID:'https://other.example'}));
});
