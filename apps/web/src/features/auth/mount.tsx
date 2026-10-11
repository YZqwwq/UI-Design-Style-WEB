import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Login03 from '@/components/ui/login-03';
import './auth.css';

export interface AuthUser { id:string; username:string }
export function mountAuth(container: HTMLElement, options: {onHome:()=>void;authenticate:(mode:string,credentials:{username:string;password:string;confirmation?:string})=>Promise<void>}) {
  const root=createRoot(container);
  flushSync(()=>root.render(<Login03 onHome={options.onHome} onAuthenticate={async(mode,credentials,signal)=>{
    // Closing the view cannot undo a server mutation. Always reconcile its final session.
    await options.authenticate(mode,credentials);
  }}/>));
  return { destroy:()=>root.unmount() };
}
