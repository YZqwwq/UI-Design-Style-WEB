import { createHmac, randomUUID } from 'node:crypto';

export interface MailConfig {
  accessKeyId: string;
  accessKeySecret: string;
  region: string;
  from: string;
  fromName: string;
  replyTo: boolean;
}
const endpoints: Record<string,string> = {
  'cn-hangzhou':'https://dm.aliyuncs.com/',
  'ap-southeast-1':'https://dm.ap-southeast-1.aliyuncs.com/',
  'ap-southeast-2':'https://dm.ap-southeast-2.aliyuncs.com/',
  'eu-central-1':'https://dm.eu-central-1.aliyuncs.com/',
};
export function readMailConfig(values: Record<string,string>): MailConfig | undefined {
  if (!values.MAIL_PROVIDER) return undefined;
  if (values.MAIL_PROVIDER !== 'aliyun') throw new Error('Unsupported mail provider');
  for (const key of ['ALIBABA_CLOUD_ACCESS_KEY_ID','ALIBABA_CLOUD_ACCESS_KEY_SECRET','ALIYUN_DM_REGION_ID','MAIL_FROM_ADDRESS']) {
    if (!values[key]?.trim()) return undefined;
  }
  if (!endpoints[values.ALIYUN_DM_REGION_ID]) throw new Error('Unsupported mail region');
  if (!/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(values.MAIL_FROM_ADDRESS)) throw new Error('Invalid sender');
  if (values.MAIL_REPLY_TO_ENABLED && !['true','false'].includes(values.MAIL_REPLY_TO_ENABLED)) throw new Error('Invalid reply setting');
  const fromName=values.MAIL_FROM_NAME || '设计图鉴';
  if ([...fromName].length >= 15) throw new Error('Invalid sender name');
  return {accessKeyId:values.ALIBABA_CLOUD_ACCESS_KEY_ID,accessKeySecret:values.ALIBABA_CLOUD_ACCESS_KEY_SECRET,region:values.ALIYUN_DM_REGION_ID,from:values.MAIL_FROM_ADDRESS,fromName,replyTo:values.MAIL_REPLY_TO_ENABLED==='true'};
}
const encode = (value:string) => encodeURIComponent(value).replace(/[!'()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
export type SendRegistrationCode = (email:string, code:string) => Promise<void>;
export function createMailer(config:MailConfig, transport:typeof fetch=fetch): SendRegistrationCode {
  return async (email,code) => {
    const params:Record<string,string>={
      Format:'JSON',Version:'2015-11-23',AccessKeyId:config.accessKeyId,SignatureMethod:'HMAC-SHA1',
      Timestamp:new Date().toISOString().replace(/\.\d{3}Z$/,'Z'),SignatureVersion:'1.0',SignatureNonce:randomUUID(),
      RegionId:config.region,Action:'SingleSendMail',AccountName:config.from,AddressType:'1',ReplyToAddress:String(config.replyTo),
      ToAddress:email,Subject:'设计图鉴｜注册邮箱验证码',FromAlias:config.fromName,
      TextBody:`你的设计图鉴注册验证码是：${code}\n\n验证码在 10 分钟内有效，仅用于本次注册。请勿向他人提供验证码。\n如果不是你本人操作，请忽略这封邮件。`,
    };
    const canonical=Object.keys(params).sort().map(key=>`${encode(key)}=${encode(params[key])}`).join('&');
    params.Signature=createHmac('sha1',config.accessKeySecret+'&').update('POST&%2F&'+encode(canonical)).digest('base64');
    // No automatic retries: a timeout can occur after the provider has accepted the email.
    try {
      const response=await transport(endpoints[config.region],{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),redirect:'error',signal:AbortSignal.timeout(15000)});
      const result=await response.json() as {Code?:string;RequestId?:string;EnvId?:string};
      if(!response.ok || result.Code || !result.RequestId || !result.EnvId) throw new Error('Rejected');
    } catch { throw new Error('邮件发送暂时不可用，请稍后重试。'); }
  };
}
