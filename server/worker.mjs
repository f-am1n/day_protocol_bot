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
const languageOf=a=>JSON.parse(a.state).language==='en'?'en':'ru';
const textFor=(a,ru,en)=>languageOf(a)==='en'?en:ru;
const openButton=(env,a)=>({text:textFor(a,'Открыть Day Protocol','Open Day Protocol'),web_app:{url:env.APP_URL}});
const languageButtons={inline_keyboard:[[{text:'Русский',callback_data:'language|ru'},{text:'English',callback_data:'language|en'}]]};
export function todayMessage(a,env,now=Date.now()){
  const state=JSON.parse(a.state),date=localDate(a.timezone,now).date;
  const habits=state.habits.filter(h=>R.scheduled(state,h,date));
  const remaining=habits.filter(h=>!R.done(state,h,date));
  const text=habits.length?(textFor(a,'Ваш ритм на ','Your habits for ')+date+'\n\n')+habits.slice(0,25).map(h=>`${R.done(state,h,date)?'✓':'○'} ${h.name}: ${R.value(state,h,date)}/${R.configAt(h,date).target}`).join('\n')+(habits.length>25?textFor(a,'\nОстальные привычки — в приложении.','\nView your other habits in the app.'):''):textFor(a,'На сегодня привычек пока нет. Добавьте первую в приложении.','No habits planned for today. Add your first habit in the app.');
  const rows=remaining.filter(h=>h.id.length<=51).slice(0,12).map(h=>{const c=R.configAt(h,date);return [{text:(c.type==='check'?'✓ ':`+${c.step} `)+h.name.slice(0,35),callback_data:`${c.type==='check'?'c':'p'}|${date}|${h.id}`}];});
  rows.push([openButton(env,a)]);return {text,reply_markup:{inline_keyboard:rows}};
}
async function webhook(request,env){
  if(!env.TELEGRAM_WEBHOOK_SECRET||!safeEqual(request.headers.get('X-Telegram-Bot-Api-Secret-Token'),env.TELEGRAM_WEBHOOK_SECRET))return json({error:'Forbidden'},403);
  const u=await readJSON(request,65536),store=new Store(env.DB);
  const msg=u.message,cb=u.callback_query,from=msg?.from||cb?.from,chat=msg?.chat||cb?.message?.chat;
  if(!from||from.is_bot||chat?.type!=='private'||String(chat.id)!==String(from.id))return json({ok:true});
  const id=String(from.id);let a=await store.account(id);await store.chat(id,id);a.chat_id=id;
  if(!JSON.parse(a.state).language){const state=JSON.parse(a.state);state.language=String(from.language_code||'ru').startsWith('ru')?'ru':'en';await store.save(id,state,a.revision);a=await store.get(id)}
  if(cb?.data?.startsWith('language|')){
    const language=cb.data.slice(9);if(!['ru','en'].includes(language))return json({ok:true});
    if(await store.seen(id,cb.id)){await botCall(env,'answerCallbackQuery',{callback_query_id:cb.id});return json({ok:true})}
    let saved=false;
    for(let attempt=0;attempt<3;attempt++){a=await store.get(id);const state=JSON.parse(a.state);state.language=language;if(await store.save(id,state,a.revision,cb.id)){saved=true;break}}
    a=await store.get(id);
    await botCall(env,'answerCallbackQuery',{callback_query_id:cb.id,text:saved?textFor(a,'Язык сохранён','Language saved'):textFor(a,'Повторите действие','Please try again')});
    if(saved)await botCall(env,'sendMessage',{chat_id:id,...todayMessage(a,env)});
    return json({ok:true});
  }
  if(cb){
    const [action,date,habitId,...extra]=String(cb.data||'').split('|');
    if(extra.length||!['p','c'].includes(action)||(!R.isDate(date)||date>localDate(a.timezone).date||date<R.shift(localDate(a.timezone).date,-1))){await botCall(env,'answerCallbackQuery',{callback_query_id:cb.id,text:textFor(a,'Откройте актуальный список: /today','Open the latest list: /today')});return json({ok:true})}
    for(let attempt=0;attempt<3;attempt++){
      if(await store.seen(id,cb.id))break;
      a=await store.get(id);const s=JSON.parse(a.state),h=s.habits.find(h=>h.id===habitId);
      if(!h||!R.scheduled(s,h,date))break;const c=R.configAt(h,date),v=R.value(s,h,date);
      s.logs[date]??={};s.logs[date][h.id]=action==='c'?Math.max(v,c.target):Math.min(100000,v+c.step);
      if(await store.save(id,s,a.revision,cb.id))break;
      if(attempt===2)throw Error('CONFLICT');
    }
    await botCall(env,'answerCallbackQuery',{callback_query_id:cb.id,text:textFor(a,'Прогресс обновлён','Progress updated')});
    a=await store.get(id);
    try{await botCall(env,'editMessageText',{chat_id:id,message_id:cb.message.message_id,...todayMessage(a,env)})}catch(e){if(e.message!=='BOT_400')throw e}
  }else{
    const command=String(msg.text||'').trim().split(/\s/)[0].split('@')[0];
    if(command==='/language'){await botCall(env,'sendMessage',{chat_id:id,text:'Язык / Language',reply_markup:languageButtons});
    }else if(command==='/stop'){
      const s={...settings(a),enabled:false,nextAt:null};await store.settings(id,s);
      await botCall(env,'sendMessage',{chat_id:id,text:textFor(a,'Напоминания выключены. Прогресс сохранён. Настройки доступны в приложении.','Reminders are off. Your progress is saved. You can change settings in the app.'),reply_markup:{inline_keyboard:[[openButton(env,a)]]}});
    }else if(command==='/start'||command==='/today'){
      await botCall(env,'sendMessage',{chat_id:id,...todayMessage(a,env)});
    }else await botCall(env,'sendMessage',{chat_id:id,text:textFor(a,'Привычки на сегодня: /today\nОтключить напоминания: /stop\nЯзык: /language\nЦели, статистика и настройки — в приложении.','Today’s habits: /today\nTurn off reminders: /stop\nLanguage: /language\nGoals, statistics and settings are available in the app.'),reply_markup:{inline_keyboard:[[openButton(env,a)]]}});
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
    const english=request.headers.get('Accept-Language')?.startsWith('en');
    const errors={
      'Telegram ещё подключается. Попробуйте позже.':'Telegram is being connected. Please try again later.',
      'Некорректные данные.':'Invalid data.',
      'Прогресс изменился на другом устройстве. Повторите действие.':'Your progress changed on another device. Please try again.',
      'Автоматические напоминания ещё не подключены.':'Automatic reminders are not connected yet.',
      'Сначала нажмите «Старт» в боте.':'First press Start in the bot.',
      'Откройте приложение заново через Telegram.':'Reopen the app from Telegram.',
      'Проверьте введённые данные.':'Check the information you entered.',
      'Сервис временно недоступен. Изменения не подтверждены.':'The service is temporarily unavailable. Your changes have not been confirmed.'
    };
    const reply=(data,status)=>json(english&&data.error?{...data,error:errors[data.error]||data.error}:data,status);
    try{
      const path=new URL(request.url).pathname;
      if(path==='/api/admin/telegram-brand'&&request.method==='POST'){
        if(!env.REMINDER_RUNNER_SECRET||!safeEqual(request.headers.get('Authorization'),`Bearer ${env.REMINDER_RUNNER_SECRET}`))return reply({error:'Forbidden'},403);
        await botCall(env,'setMyName',{name:'Day Protocol'});
        await botCall(env,'setChatMenuButton',{menu_button:{type:'web_app',text:'Day Protocol',web_app:{url:env.APP_URL}}});
        await botCall(env,'setMyDescription',{description:'Day Protocol — your daily plan. Track habits, focus with a timer and see your progress in Telegram. Open the app or use /today. Choose your language with /language.'});
        await botCall(env,'setMyDescription',{language_code:'ru',description:'Day Protocol — ваш план на каждый день. Привычки, таймер и статистика внутри Telegram. Откройте приложение или используйте /today. Выбор языка: /language.'});
        await botCall(env,'setMyShortDescription',{short_description:'Small steps, every day. Habits, focus and progress. English / Русский.'});
        await botCall(env,'setMyShortDescription',{language_code:'ru',short_description:'Маленькие шаги каждый день. Привычки, таймер и прогресс. Русский / English.'});
        await botCall(env,'setMyCommands',{commands:[{command:'today',description:'Your habits for today'},{command:'language',description:'Choose language / Выбрать язык'},{command:'stop',description:'Turn off reminders'}]});
        await botCall(env,'setMyCommands',{language_code:'ru',commands:[{command:'today',description:'Привычки на сегодня'},{command:'language',description:'Выбрать язык / Choose language'},{command:'stop',description:'Выключить напоминания'}]});
        return reply({ok:true,name:'Day Protocol'});
      }
      if(path==='/api/telegram/webhook'&&request.method==='POST')return await webhook(request,env);
      if(path==='/api/reminders/tick'&&request.method==='POST'){
        if(!env.REMINDER_RUNNER_SECRET||!safeEqual(request.headers.get('Authorization'),`Bearer ${env.REMINDER_RUNNER_SECRET}`))return reply({error:'Forbidden'},403);
        await dispatchReminders(env);return reply({ok:true});
      }
      if(path==='/api/config')return reply({botUsername:'day_protocol_bot',configured:!!env.TELEGRAM_BOT_TOKEN,remindersReady:env.REMINDER_SCHEDULER_ENABLED==='true'});
      if(path.startsWith('/api/')){
        if(!env.TELEGRAM_BOT_TOKEN)return reply({error:'Telegram ещё подключается. Попробуйте позже.'},503);
        const id=await authenticate(request.headers.get('X-Telegram-Init-Data'),env.TELEGRAM_BOT_TOKEN);
        const store=new Store(env.DB);const a=await store.account(id);
        if(path==='/api/state'&&request.method==='GET')return reply(snapshot(a));
        if(path==='/api/state'&&request.method==='PUT'){
          const body=await readJSON(request);if(!Number.isSafeInteger(body.revision)||!R.validate(body.state,localDate(a.timezone).date))return reply({error:'Некорректные данные.'},400);
          if(!await store.save(id,body.state,body.revision))return reply({error:'Прогресс изменился на другом устройстве. Повторите действие.',...snapshot(await store.get(id))},409);
          return reply(snapshot(await store.get(id)));
        }
        if(path==='/api/settings'&&request.method==='PUT'){
          const s=validateSettings(await readJSON(request,4096));
          if(s.enabled&&env.REMINDER_SCHEDULER_ENABLED!=='true')return reply({error:'Автоматические напоминания ещё не подключены.'},503);
          if(s.enabled&&!a.chat_id)return reply({error:'Сначала нажмите «Старт» в боте.'},400);
          await store.settings(id,{...s,nextAt:nextReminder(s)});return reply(snapshot(await store.get(id)));
        }
        return reply({error:'Not found'},404);
      }
      if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
      const asset=assets[path==='/'?'/index.html':path];if(!asset)return new Response('Not found',{status:404});
      const binary=Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0));
      return new Response(request.method==='HEAD'?null:binary,{headers:{'Content-Type':asset.type,'Cache-Control':'no-cache','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});
    }catch(e){
      const status=e.message==='AUTH'?401:e.message==='SIZE'?413:['BODY','SETTINGS'].includes(e.message)?400:503;
      if(status===503)console.warn('Ritm request unavailable',e.message?.replace(/\d{5,}:[A-Za-z0-9_-]+/g,'[redacted]'));
      return reply({error:status===401?'Откройте приложение заново через Telegram.':status===400?'Проверьте введённые данные.':'Сервис временно недоступен. Изменения не подтверждены.'},status);
    }
  },
  async scheduled(controller,env,ctx){ctx.waitUntil(dispatchReminders(env))}
};
