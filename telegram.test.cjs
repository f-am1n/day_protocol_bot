const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {DatabaseSync}=require('node:sqlite');
const R=require('./dist/core.js');
function database(){
  const sqlite=new DatabaseSync(':memory:');for(const file of fs.readdirSync('drizzle').filter(f=>f.endsWith('.sql')))sqlite.exec(fs.readFileSync('drizzle/'+file,'utf8'));
  const db={prepare(sql){return {bind(...args){return {async run(){const r=sqlite.prepare(sql).run(...args);return {meta:{changes:Number(r.changes)}}},async first(){return sqlite.prepare(sql).get(...args)||null},async all(){return {results:sqlite.prepare(sql).all(...args)}}}},async run(){return {meta:{changes:Number(sqlite.prepare(sql).run().changes)}}}}},async batch(stmts){sqlite.exec('BEGIN');try{const r=[];for(const s of stmts)r.push(await s.run());sqlite.exec('COMMIT');return r}catch(e){sqlite.exec('ROLLBACK');throw e}}};return db;
}
const secret='123456:TEST_ONLY_TOKEN',hook='TEST_WEBHOOK';
async function signed(id,age=0){const {hmac,hex}=await import('./server/auth.mjs');const p=new URLSearchParams({auth_date:String(Math.floor(Date.now()/1000)-age),user:JSON.stringify({id,first_name:'Test'})});p.set('hash',hex(await hmac(await hmac('WebAppData',secret),[...p.entries()].sort().map(([k,v])=>`${k}=${v}`).join('\n'))));return p.toString()}
function habit(type='check'){const h={id:'test-habit',name:'Чтение',icon:'📖',type,target:type==='check'?1:20,unit:'мин.',step:5,period:'day',schedule:'days',frequency:3,days:[0,1,2,3,4,5,6],created:R.today(),archivedAt:null,pauses:[]};h.revisions=[{from:h.created,...R.config(h)}];return h}
test('Telegram signatures reject tampering, duplicate parameters and expired sessions',async()=>{const {authenticate}=await import('./server/auth.mjs');const auth=await signed(101);assert.equal(await authenticate(auth,secret),'101');await assert.rejects(authenticate(auth.replace('Test','Other'),secret));await assert.rejects(authenticate(auth+'&user={}',secret));await assert.rejects(authenticate(await signed(101,90000),secret));});
test('API enforces user isolation, validation, atomic revision checks and webhook secret',async()=>{
  const {default:worker}=await import('./dist/server/index.js');const env={DB:database(),TELEGRAM_BOT_TOKEN:secret,TELEGRAM_WEBHOOK_SECRET:hook,APP_URL:'https://example.com/?telegram=1'};
  const auth=await signed(101),other=await signed(202);
  const req=(path,method='GET',body,token=auth)=>worker.fetch(new Request('https://example.com'+path,{method,headers:{'X-Telegram-Init-Data':token,'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)}),env);
  assert.equal((await req('/api/state','GET',undefined,'')).status,401);
  assert.equal((await req('/api/telegram/webhook','POST',{})).status,403);
  const initial=await (await req('/api/state')).json();assert.equal(initial.revision,0);
  const state={version:2,habits:[habit()],logs:{}};
  assert.equal((await req('/api/state','PUT',{state,revision:0})).status,200);
  assert.equal((await req('/api/state','PUT',{state,revision:0})).status,409);
  assert.equal((await (await req('/api/state','GET',undefined,other)).json()).state.habits.length,0);
  assert.equal((await req('/api/state','PUT',{state:{...state,habits:[{...habit(),name:''}]},revision:1})).status,400);
  assert.equal((await req('/api/settings','PUT',{enabled:true,time:'20:00',timezone:'Asia/Tashkent',days:[0]})).status,503);
});
test('bot repeated callback counts once and rejects old-day clicks',async()=>{
  const {default:worker}=await import('./dist/server/index.js');const {Store}=await import('./server/store.mjs');const env={DB:database(),TELEGRAM_BOT_TOKEN:secret,TELEGRAM_WEBHOOK_SECRET:hook,APP_URL:'https://example.com'};
  const store=new Store(env.DB);await store.account('101');await store.settings('101',{timezone:'UTC',time:'20:00',days:[0],enabled:false,nextAt:null});await store.save('101',{version:2,habits:[habit('minutes')],logs:{}},0);
  const original=global.fetch;global.fetch=async()=>new Response(JSON.stringify({ok:true,result:true}));
  try{const date=new Date().toISOString().slice(0,10);const update={callback_query:{id:'same-click',from:{id:101},message:{message_id:1,chat:{id:101,type:'private'}},data:`p|${date}|test-habit`}};
    const call=()=>worker.fetch(new Request('https://example.com/api/telegram/webhook',{method:'POST',headers:{'X-Telegram-Bot-Api-Secret-Token':hook},body:JSON.stringify(update)}),env);
    assert.equal((await call()).status,200);assert.equal((await call()).status,200);assert.equal(JSON.parse((await store.get('101')).state).logs[date]['test-habit'],5);
    update.callback_query.id='old';update.callback_query.data='p|2001-01-01|test-habit';await call();assert.equal(JSON.parse((await store.get('101')).state).logs[date]['test-habit'],5);
  }finally{global.fetch=original}
});
test('reminder schedule respects timezone and selected weekdays',async()=>{const {nextReminder,localDate}=await import('./server/schedule.mjs');const now=Date.parse('2026-10-02T14:00:00Z');const next=nextReminder({enabled:true,time:'20:00',timezone:'Asia/Tashkent',days:[4]},now);assert.equal(new Date(next).toISOString(),'2026-10-02T15:00:00.000Z');assert.equal(localDate('Asia/Tashkent',next).time,'20:00');assert.equal(nextReminder({enabled:false},now),null)});
test('overlapping reminder runners deliver once, completed days stay quiet',async()=>{
  const {dispatchReminders}=await import('./dist/server/index.js');const {Store}=await import('./server/store.mjs');const env={DB:database(),TELEGRAM_BOT_TOKEN:secret,APP_URL:'https://example.com',REMINDER_SCHEDULER_ENABLED:'true'};const store=new Store(env.DB),now=Date.now();await store.account('101');await store.chat('101','101');await store.save('101',{version:2,habits:[habit()],logs:{}},0);await store.settings('101',{timezone:'UTC',time:'20:00',days:[0,1,2,3,4,5,6],enabled:true,nextAt:now-60000});
  const original=global.fetch;let sends=0;global.fetch=async()=>{sends++;return new Response(JSON.stringify({ok:true,result:true}))};try{await dispatchReminders(env,now);await dispatchReminders(env,now);assert.equal(sends,1)}finally{global.fetch=original}
});
