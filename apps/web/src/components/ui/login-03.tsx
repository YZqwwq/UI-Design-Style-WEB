// Login 3 from Hirael <https://hirael.com/blocks/auth/login-03>
// MIT · Mohammad Shehadeh · https://github.com/MohammadShehadeh/hirael

"use client";

import * as React from "react";
import { X, Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const ENTER = "auth-enter";

const stagger = (index: number, step = 60): React.CSSProperties => ({
  animationDelay: `${index * step}ms`,
});

const GithubIcon = (props: React.SVGProps<SVGSVGElement>) => {
  return (
    <svg viewBox="0 0 24 24" aria-hidden {...props}>
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.58 2 12.22c0 4.5 2.87 8.32 6.84 9.67.5.1.68-.22.68-.49 0-.24-.01-.87-.01-1.7-2.78.61-3.37-1.36-3.37-1.36-.45-1.18-1.11-1.49-1.11-1.49-.91-.63.07-.62.07-.62 1 .07 1.53 1.05 1.53 1.05.9 1.56 2.35 1.11 2.92.85.09-.66.35-1.11.63-1.37-2.22-.26-4.55-1.13-4.55-5.04 0-1.11.39-2.02 1.03-2.74-.1-.26-.45-1.3.1-2.7 0 0 .84-.27 2.75 1.04A9.4 9.4 0 0 1 12 7.04c.85 0 1.7.12 2.5.34 1.9-1.31 2.74-1.04 2.74-1.04.55 1.4.2 2.44.1 2.7.64.72 1.03 1.63 1.03 2.74 0 3.92-2.34 4.78-4.57 5.03.36.32.68.94.68 1.9 0 1.37-.01 2.47-.01 2.81 0 .27.18.6.69.49A10.04 10.04 0 0 0 22 12.22C22 6.58 17.52 2 12 2Z"
      />
    </svg>
  );
};

const jitter = (i: number) => {
  const value = Math.sin(i + 1) * 10_000;
  return value - Math.floor(value);
};

const FloatingPaths = React.memo(({ position }: { position: number }) => {
  const reduceMotion = useReducedMotion();
  const paths = Array.from({ length: 36 }, (_, i) => ({
    id: i,
    d: `M-${380 - i * 5 * position} -${189 + i * 6}C-${
      380 - i * 5 * position
    } -${189 + i * 6} -${312 - i * 5 * position} ${216 - i * 6} ${
      152 - i * 5 * position
    } ${343 - i * 6}C${616 - i * 5 * position} ${470 - i * 6} ${
      684 - i * 5 * position
    } ${875 - i * 6} ${684 - i * 5 * position} ${875 - i * 6}`,
    width: 0.5 + i * 0.03,
  }));

  return (
    <div className="pointer-events-none absolute inset-0">
      <svg
        className="h-full w-full text-primary"
        fill="none"
        viewBox="0 0 696 316"
      >
        {paths.map((path) => (
          <motion.path
            key={path.id}
            d={path.d}
            initial={{ pathLength: 1 }}
            animate={
              reduceMotion
                ? undefined
                : { pathLength: 1, pathOffset: [0, 1, 0] }
            }
            stroke="currentColor"
            className="opacity-60"
            strokeOpacity={0.1 + path.id * 0.03}
            strokeWidth={path.width}
            transition={{
              duration: 20 + jitter(path.id) * 10,
              repeat: Number.POSITIVE_INFINITY,
              ease: "linear",
            }}
          />
        ))}
      </svg>
    </div>
  );
});

export type AuthMode = 'login' | 'register';
export interface Login03Props {
  onHome: () => void;
  onAuthenticate: (mode: AuthMode, credentials: {username:string;password:string;confirmation?:string;email?:string;code?:string}, signal: AbortSignal) => Promise<void>;
  onSendCode: (email:string, signal:AbortSignal) => Promise<{retryAfter:number}>;
  // Only render the provider button when a real integration is supplied.
  onGithub?: () => Promise<void>;
}

export default function Login03({onHome,onAuthenticate,onSendCode,onGithub}: Login03Props) {
  const [mode,setMode] = React.useState<AuthMode>('login');
  const [busy,setBusy] = React.useState(false);
  const [error,setError] = React.useState('');
  const [sending,setSending] = React.useState(false);
  const [cooldown,setCooldown] = React.useState(0);
  const [notice,setNotice] = React.useState('');
  const codeRequest = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => codeRequest.current?.abort(), []);
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value=>Math.max(0,value-1)),1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);
  async function sendCode() {
    if (codeRequest.current || pending.current || cooldown > 0) return;
    const email = String(new FormData(formRef.current!).get('email') || '').trim();
    const controller = new AbortController(); codeRequest.current=controller;
    setSending(true);setError('');setNotice('');
    try {
      const result = await onSendCode(email,controller.signal);
      if (!controller.signal.aborted) {setCooldown(result.retryAfter);setNotice('验证码已发送，10 分钟内有效，请查看邮箱。');}
    } catch(cause) {
      if (!controller.signal.aborted) {
        setError(cause instanceof Error ? cause.message : '验证码发送失败，请稍后重试。');
        const wait = Number((cause as {retryAfter?:number})?.retryAfter);
        if (Number.isFinite(wait) && wait>0) setCooldown(Math.min(wait,600));
      }
    } finally {if (!controller.signal.aborted) {codeRequest.current=null;setSending(false);}}
  }
  const pending = React.useRef<AbortController | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const register = mode === 'register';
  React.useEffect(() => () => pending.current?.abort(), []);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current || codeRequest.current) return;
    const data = new FormData(event.currentTarget);
    const username = String(data.get('username') || '');
    const password = String(data.get('password') || '');
    const controller = new AbortController();
    pending.current = controller; setBusy(true); setError('');
    try { await onAuthenticate(mode,{username,password,...(register?{confirmation:String(data.get('confirmation') || ''),email:String(data.get('email') || '').trim(),code:String(data.get('code') || '').trim()}:{})},controller.signal); }
    catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : '暂时无法登录，请重试。'); }
    finally { if (!controller.signal.aborted) { pending.current=null; setBusy(false); } }
  }
  function changeMode() {
    if (busy || sending) return;
    formRef.current?.reset(); setError('');setNotice(''); setMode(register ? 'login':'register');
  }
  return (
    <section data-slot="login" className="auth-page relative min-h-svh overflow-hidden bg-background lg:grid lg:grid-cols-2">
      <aside data-slot="login-aside" className="auth-art relative hidden flex-col overflow-hidden border-e border-border bg-card p-10 lg:flex">
        <div className="absolute inset-0" aria-hidden="true"><FloatingPaths position={1}/><FloatingPaths position={-1}/></div>
        <div className={cn(ENTER,'auth-brand relative z-10')}>设计图鉴<span>DESIGN ATLAS</span></div>
        <div className={cn(ENTER,'auth-statement relative z-10 mt-auto')} style={stagger(3)}>
          <p className="auth-eyebrow">A SPACE FOR YOUR IDEAS</p>
          <h2>收集灵感，<br/><em>构建自己的设计。</em></h2>
          <p>从一份参考开始，让喜欢的设计成为你的下一次创作。</p>
        </div>
      </aside>
      <div data-slot="login-main" className="auth-main relative flex min-h-svh flex-col justify-center">
        <div className="auth-glow" aria-hidden="true"/>
        <Button id="close-auth" type="button" variant="ghost" className="auth-home" aria-label="关闭登录弹窗" title="关闭" onClick={onHome}><X size={18} aria-hidden="true"/></Button>
        <div data-slot="login-panel" className="auth-panel relative z-10 mx-auto w-full">
          <div className="auth-mobile-brand lg:hidden">设计图鉴 / DESIGN ATLAS</div>
          <div className={ENTER} style={stagger(1)}>
            <p className="auth-eyebrow">YOUR PERSONAL DESIGN LIBRARY</p>
            <h1 id="auth-title">{register ? 'Make it yours.' : 'Welcome back.'}</h1>
            <p className="auth-intro">{register ? '创建账号，开始整理属于你的设计收藏。' : '登录设计图鉴，继续你的灵感收藏。'}</p>
          </div>
          <form id="auth-form" noValidate ref={formRef} onSubmit={submit} className={cn(ENTER,'auth-fields')} style={stagger(2)} aria-busy={busy}>
            <label htmlFor="username">{register ? '显示名称' : '邮箱'}</label>
            <input id="username" name="username" autoComplete={register ? 'nickname' : 'username'} autoFocus required minLength={1} maxLength={register ? 32 : 254} placeholder={register ? '输入显示名称' : '输入邮箱（旧账号可使用用户名）'} aria-describedby={register ? 'username-help':undefined} disabled={busy}/>
            {register ? <small id="username-help">1–32 个字符，名称可以重复；邮箱用于登录。</small> : null}
            {register ? <>
              <label htmlFor="email">邮箱</label>
              <input id="email" name="email" type="email" autoComplete="email" maxLength={254} placeholder="用于验证注册邮箱" disabled={busy || sending} onChange={()=>{setNotice('');const field=formRef.current?.elements.namedItem('code') as HTMLInputElement|null;if(field)field.value='';}}/>
              <label htmlFor="email-code">邮箱验证码</label>
              <div className="auth-code-row">
                <input id="email-code" name="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="6 位验证码" disabled={busy} aria-describedby="email-code-notice"/>
                <Button id="send-email-code" type="button" variant="outline" className="auth-code-send" onClick={()=>void sendCode()} disabled={busy || sending || cooldown>0}>{sending?'发送中…':cooldown>0?`${cooldown}s 后重发`:'发送验证码'}</Button>
              </div>
              <p id="email-code-notice" className="auth-code-notice" role="status">{notice}</p>
            </> : null}
            <label htmlFor="password">密码</label>
            <input id="password" name="password" type="password" autoComplete={register?'new-password':'current-password'} required minLength={10} maxLength={128} placeholder="输入密码（10–128 位）" disabled={busy}/>
            {register ? <><label htmlFor="confirm-password">确认密码</label><input id="confirm-password" name="confirmation" type="password" autoComplete="new-password" required minLength={10} maxLength={128} placeholder="再次输入密码" disabled={busy}/></> : null}
            <p id="auth-status" role="status" aria-live="polite">{error || (busy ? (register?'正在创建你的设计库…':'正在登录…'):'')}</p>
            <Button id="auth-submit" type="submit" size="lg" disabled={busy || sending} className="auth-submit w-full gap-2">{busy ? <Loader2 className="animate-spin" size={16} aria-hidden="true"/>:null}{register?'创建账号':'Sign in'}</Button>
          </form>
          {onGithub ? <Button type="button" variant="outline" className="w-full gap-2" disabled={busy} onClick={async()=>{setBusy(true);setError('');try{await onGithub();}catch(cause){setError(cause instanceof Error?cause.message:'GitHub 登录失败。');}finally{setBusy(false);}}}><GithubIcon width={18} height={18}/>Continue with GitHub</Button>:null}
          <p className="auth-switch">{register?'已有账号？':'还没有账号？'}<button id={register?'login-tab':'register-tab'} type="button" onClick={changeMode} disabled={busy || sending}>{register?'立即登录':'创建账号'}</button></p>
          <p className="auth-note">{register?'注册后，你将获得一份独立的初始设计库。':'也可以返回设计库，继续浏览公开设计。'}</p>
        </div>
      </div>
    </section>
  );
}
