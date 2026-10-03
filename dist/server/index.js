import './core.mjs';
import {authenticate,safeEqual} from './auth.mjs';
import {Store} from './store.mjs';
import {localDate,validateSettings,nextReminder} from './schedule.mjs';
import {assets} from './assets.mjs';
const R=globalThis.Ritm;
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const settings=a=>({enabled:!!a.enabled,time:a.reminder_time,days:JSON.parse(a.reminder_days),timezone:a.timezone});
const snapshot=a=>({state:JSON.parse(a.state),revision:a.revision,settings:settings(a),botStarted:!!a.chat_id});
export async function botCall(env,method,body){
  const response=await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(10000)});
  const data=await response.json();if(!data.ok)throw Error(`BOT_${data.error_code||response.status}`);return data.result;
}
const openButton=env=>({text:'Открыть Ритм',web_app:{url:env.APP_URL}});
export function todayMessage(a,env,now=Date.now()){
  const state=JSON.parse(a.state),date=localDate(a.timezone,now).date;
  const habits=state.habits.filter(h=>R.scheduled(state,h,date));
  const remaining=habits.filter(h=>!R.done(state,h,date));
  const text=habits.length?`Ваш ритм на ${date}\n\n`+habits.slice(0,25).map(h=>`${R.done(state,h,date)?'✓':'○'} ${h.name}: ${R.value(state,h,date)}/${R.configAt(h,date).target}`).join('\n')+(habits.length>25?'\nОстальные привычки — в приложении.':''):'На сегодня привычек пока нет. Добавьте первую в приложении.';
  const rows=remaining.filter(h=>h.id.length<=51).slice(0,12).map(h=>{const c=R.configAt(h,date);return [{text:(c.type==='check'?'✓ ':`+${c.step} `)+h.name.slice(0,35),callback_data:`${c.type==='check'?'c':'p'}|${date}|${h.id}`}];});
  rows.push([openButton(env)]);return {text,reply_markup:{inline_keyboard:rows}};
}
async function webhook(request,env){
  if(!env.TELEGRAM_WEBHOOK_SECRET||!safeEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.TELEGRAM_WEBHOOK_SECRET))return json({error:'Forbidden'},403);
  const u=await readJSON(request,65536),store=new Store(env.DB);
  const msg=u.message,cb=u.callback_query,from=msg?.from||cb?.from,chat=msg?.chat||cb?.message?.chat;
  if(!from||from.is_bot||chat?.type!=='private'||String(chat.id)!==String(from.id))return json({ok:true});
  const id=String(from.id);let a=await store.account(id);await store.chat(id,id);a.chat_id=id;
  if(cb){
    const [action,date,habitId,...extra]=String(cb.data||'').split('|');
    if(extra.length||!['p','c'].includes(action)||(!R.isDate(date)||date>localDate(a.timezone).date||date<R.shift(localDate(a.timezone).date,-1))){await botCall(env,'answerCallbackQuery',{callback_query_id:cb.id,text:'Откройте актуальный список: /today'});return json({ok:true})}
    for(let attempt=0;attempt<3;attempt++){
      if(await store.seen(id,cb.id))break;
      a=await store.get(id);const s=JSON.parse(a.state),h=s.habits.find(h=>h.id===habitId);
      if(!h||!R.scheduled(s,h,date))break;const c=R.configAt(h,date),v=R.value(s,h,date);
      s.logs[date]??={};s.logs[date][h.id]=action==='c'?Math.max(v,c.target):Math.min(100000,v+c.step);
      if(await store.save(id,s,a.revision,cb.id))break;
      if(attempt===2)throw Error('CONFLICT');
    }
    await botCall(env,'answerCallbackQuery',{callback_query_id:cb.id,text:'Прогресс обновлён'});
    a=await store.get(id);
    try{await botCall(env,'editMessageText',{chat_id:id,message_id:cb.message.message_id,...todayMessage(a,env)})}catch(e){if(e.message!=='BOT_400')throw e}
  }else{
    const command=String(msg.text||'').trim().split(/\s/)[0].split('@')[0];
    if(command==='/stop'){
      const s={...settings(a),enabled:false,nextAt:null};await store.settings(id,s);
      await botCall(env,'sendMessage',{chat_id:id,text:'Напоминания выключены. Прогресс сохранён. Настройки доступны в приложении.',reply_markup:{inline_keyboard:[[openButton(env)]]}});
    }else if(command==='/start'||command==='/today'){
      await botCall(env,'sendMessage',{chat_id:id,...todayMessage(a,env)});
    }else await botCall(env,'sendMessage',{chat_id:id,text:'Привычки на сегодня: /today\nОтключить напоминания: /stop\nЦели, статистика и настройки — в приложении.',reply_markup:{inline_keyboard:[[openButton(env)]]}});
  }
  return json({ok:true});
}
async function readJSON(request,limit=1500000){
  if(Number(request.headers.get('Content-Length'))>limit)throw Error('SIZE');
  const reader=request.body?.getReader();if(!reader)throw Error('BODY');let size=0,chunks=[];
  for(;;){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>limit){await reader.cancel();throw Error('SIZE')}chunks.push(value)}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length}try{return JSON.parse(new TextDecoder().decode(bytes))}catch{throw Error('BODY')}
}
export async function dispatchReminders(env,now=Date.now()){
  if(env.REMINDER_SCHEDULER_ENABLED!=='true')return;
  const store=new Store(env.DB);
  const due=await env.DB.prepare('SELECT * FROM telegram_accounts WHERE enabled=1 AND next_at<=? ORDER BY next_at LIMIT 50').bind(now).all();
  for(const a of due.results){
    const next=nextReminder(settings(a),now),day=localDate(a.timezone,a.next_at).date;
    // Claim before sending: simultaneous runners cannot send duplicates. No blind retries after an ambiguous Telegram timeout.
    const claim=await env.DB.prepare('UPDATE telegram_accounts SET next_at=?,last_delivery=? WHERE id=? AND next_at=? AND enabled=1').bind(next,day,a.id,a.next_at).run();
    if(!claim.meta.changes||!a.chat_id||a.last_delivery===day||now-a.next_at>70*60000)continue;
    const state=JSON.parse(a.state);if(!state.habits.some(h=>R.scheduled(state,h,day)&&!R.done(state,h,day)))continue;
    try{await botCall(env,'sendMessage',{chat_id:a.chat_id,...todayMessage(a,env,a.next_at)})}catch(e){console.warn('Reminder delivery failed',e.message);if(e.message==='BOT_403')await env.DB.prepare('UPDATE telegram_accounts SET enabled=0,next_at=NULL WHERE id=?').bind(a.id).run()}
  }
}
export default {
  async fetch(request,env){
    try{
      const path=new URL(request.url).pathname;
      if(path==='/api/telegram/webhook'&&request.method==='POST')return await webhook(request,env);
      if(path==='/api/reminders/tick'&&request.method==='POST'){
        if(!env.REMINDER_RUNNER_SECRET||!safeEqual(request.headers.get('Authorization'),`Bearer ${env.REMINDER_RUNNER_SECRET}`))return json({error:'Forbidden'},403);
        await dispatchReminders(env);return json({ok:true});
      }
      if(path==='/api/config')return json({botUsername:'day_protocol_bot',configured:!!env.TELEGRAM_BOT_TOKEN,remindersReady:env.REMINDER_SCHEDULER_ENABLED==='true'});
      if(path.startsWith('/api/')){
        if(!env.TELEGRAM_BOT_TOKEN)return json({error:'Telegram ещё подключается. Попробуйте позже.'},503);
        const id=await authenticate(request.headers.get('X-Telegram-Init-Data'),env.TELEGRAM_BOT_TOKEN);
        const store=new Store(env.DB);const a=await store.account(id);
        if(path==='/api/state'&&request.method==='GET')return json(snapshot(a));
        if(path==='/api/state'&&request.method==='PUT'){
          const body=await readJSON(request);if(!Number.isSafeInteger(body.revision)||!R.validate(body.state,localDate(a.timezone).date))return json({error:'Некорректные данные.'},400);
          if(!await store.save(id,body.state,body.revision))return json({error:'Прогресс изменился на другом устройстве. Повторите действие.',...snapshot(await store.get(id))},409);
          return json(snapshot(await store.get(id)));
        }
        if(path==='/api/settings'&&request.method==='PUT'){
          const s=validateSettings(await readJSON(request,4096));
          if(s.enabled&&env.REMINDER_SCHEDULER_ENABLED!=='true')return json({error:'Автоматические напоминания ещё не подключены.'},503);
          if(s.enabled&&!a.chat_id)return json({error:'Сначала нажмите «Старт» в боте.'},400);
          await store.settings(id,{...s,nextAt:nextReminder(s)});return json(snapshot(await store.get(id)));
        }
        return json({error:'Not found'},404);
      }
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      const asset=assets[path==='/'?'/index.html':path];if(!asset)return new Response('Not found',{status:404});
      const binary=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
      return new Response(request.method==='HEAD'?null:binary,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
    }catch(e){
      const status=e.message==='AUTH'?401:e.message==='SIZE'?413:['BODY','SETTINGS'].includes(e.message)?400:503;
      if(status===503)console.warn('Ritm request unavailable',e.message?.replace(/\d{5,}:[A-Za-z0-9_-]+/g,'[redacted]'));
      return json({error:status===401?'Откройте приложение заново через Telegram.':status===400?'Проверьте введённые данные.':'Сервис временно недоступен. Изменения не подтверждены.'},status);
    }
  },
  async scheduled(controller,env,ctx){ctx.waitUntil(dispatchReminders(env))}
};
