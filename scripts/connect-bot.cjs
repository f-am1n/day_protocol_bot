// Run interactively; receive credentials over hidden stdin, never shell arguments.
const fs=require('node:fs');
if(process.stdin.isTTY)process.stdin.setRawMode(true);
process.stdin.setEncoding('utf8');process.stdout.write('Ready for hidden setup JSON.\n');let input='';
process.stdin.on('data',chunk=>{input+=chunk;if(input.includes('\n')||input.includes('\r')){process.stdin.pause();if(process.stdin.isTTY)process.stdin.setRawMode(false);run().catch(()=>{console.error('Telegram setup failed. Credentials were not logged.');process.exit(1)})}});
async function run(){
  const config=JSON.parse(input.trim()),{token}=JSON.parse(fs.readFileSync('.sites-runtime/telegram-secret.json','utf8'));
  async function call(method,body){const r=await fetch('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!j.ok)throw Error('Bot API failed');return j.result}
  const me=await call('getMe',{});if(me.username!=='day_protocol_bot')throw Error('Unexpected bot');
  const origin='https://ritm-habits-amin.asilbekumirov355.chatgpt.site',url=origin+'/?telegram=1';
  const old=await call('getWebhookInfo',{});if(old.url&&old.url!==origin+'/api/telegram/webhook')throw Error('Existing webhook changed');
  await call('setWebhook',{url:origin+'/api/telegram/webhook',secret_token:config.webhookSecret,allowed_updates:['message','callback_query'],drop_pending_updates:false});
  await call('setChatMenuButton',{menu_button:{type:'web_app',text:'Открыть Ритм',web_app:{url}}});
  await call('setMyCommands',{commands:[{command:'start',description:'Открыть трекер привычек'},{command:'today',description:'Привычки на сегодня'},{command:'stop',description:'Выключить напоминания'}]});
  await call('setMyDescription',{description:'Ритм — привычки на каждый день. Откройте приложение, создайте цели и отмечайте прогресс прямо в Telegram. Команда /today покажет план на сегодня.'});
  const hook=await call('getWebhookInfo',{}),menu=await call('getChatMenuButton',{});
  console.log(JSON.stringify({bot:me.username,webhook:hook.url,menu:menu.text,app:menu.web_app?.url,pending:hook.pending_update_count,lastError:hook.last_error_message||null}));process.exit(0);
}
