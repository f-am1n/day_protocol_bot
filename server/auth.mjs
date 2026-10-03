const encoder=new TextEncoder();
export function safeEqual(a,b){if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0}
export async function hmac(key,data){const k=await crypto.subtle.importKey('raw',typeof key==='string'?encoder.encode(key):key,{name:'HMAC',hash:'SHA-256'},false,['sign']);return new Uint8Array(await crypto.subtle.sign('HMAC',k,encoder.encode(data)))}
export const hex=bytes=>Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
export async function authenticate(raw,token,now=Date.now()){
  if(!token||typeof raw!=='string'||raw.length>16384)throw Error('AUTH');
  const params=new URLSearchParams(raw),keys=[...params.keys()];
  if(new Set(keys).size!==keys.length)throw Error('AUTH');
  const hash=params.get('hash');params.delete('hash');
  const expected=hex(await hmac(await hmac('WebAppData',token),[...params.entries()].sort(([a],[b])=>a<b?-1:a>b?1:0).map(([k,v])=>`${k}=${v}`).join('\n')));
  const time=Number(params.get('auth_date'));
  if(!safeEqual(hash,expected)||!Number.isInteger(time)||time>now/1000+60||now/1000-time>86400)throw Error('AUTH');
  const user=JSON.parse(params.get('user')||'null');
  if(!user||!Number.isSafeInteger(user.id)||user.id<=0||user.is_bot)throw Error('AUTH');
  return String(user.id);
}
