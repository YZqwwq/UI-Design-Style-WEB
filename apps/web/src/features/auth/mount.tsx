import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Login03 from '@/components/ui/login-03';
import { request } from '../../api.js';
import './auth.css';

export interface AuthUser { id:string; username:string }
export function mountAuth(container: HTMLElement, options: {onHome:()=>void;onAuthenticated:(user:AuthUser)=>void}) {
  const root=createRoot(container);
  flushSync(()=>root.render(<Login03 onHome={options.onHome} onAuthenticate={async(mode,credentials,signal)=>{
    const data = await request(`/auth/${mode}`,{method:'POST',body:JSON.stringify(credentials),signal});
    if (!signal.aborted) options.onAuthenticated(data.user);
  }}/>));
  return { destroy:()=>root.unmount() };
}
