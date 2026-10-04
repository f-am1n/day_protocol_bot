const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Muhammadamin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
  const context=await browser.newContext({locale:'ru-RU',viewport:{width:390,height:844}});let state={version:2,habits:[],logs:{}},revision=0,conflict=false;const errors=[];
  await context.route('https://telegram.org/js/telegram-web-app.js',r=>r.fulfill({body:'',contentType:'text/javascript'}));
  await context.addInitScript(()=>{window.Telegram={WebApp:{initData:'simulated-test-session',ready(){},expand(){},onEvent(){},isVersionAtLeast(){return false},HapticFeedback:{notificationOccurred(){}}}}});
  await context.route('**/api/state',async route=>{const req=route.request();if(req.method()==='PUT'){const body=req.postDataJSON();if(conflict){conflict=false;return route.fulfill({status:409,json:{error:'Прогресс изменился на другом устройстве. Повторите действие.',state,revision}})}assert.equal(body.revision,revision);state=body.state;revision++}await route.fulfill({json:{state,revision,settings:{enabled:false,time:'20:00',timezone:'Asia/Tashkent',days:[0,1,2,3,4,5,6]},botStarted:true}})});
  await context.route('**/api/config',r=>r.fulfill({json:{botUsername:'day_protocol_bot',configured:true,remindersReady:false}}));
  const p=await context.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4173/?telegram=1');await p.locator('#cloud-status').filter({hasText:'Синхронизировано'}).waitFor();
  await p.locator('[data-template="2"]').click();await p.getByRole('button',{name:'Сохранить привычку',exact:true}).click();await p.locator('.habit').waitFor();assert.equal(state.habits.length,1);
  await p.locator('[data-focus]').click();await p.locator('#focus-toggle').click();assert.equal(await p.locator('#focus-toggle').innerText(),'Продолжить');await p.locator('#focus-cancel').click();
  conflict=true;await p.locator('[data-plus]').click();await p.locator('#toast').filter({hasText:'другом устройстве'}).waitFor();assert.equal(await p.locator('.value-button').innerText(),'0');
  await p.locator('[data-plus]').click();await p.waitForFunction(()=>document.querySelector('.value-button')?.textContent==='5');assert.equal(state.logs[Object.keys(state.logs)[0]][state.habits[0].id],5);
  await p.locator('[data-reminders]').click();await p.locator('#telegram-settings[open]').waitFor();assert.equal(await p.locator('#reminders-dialog').getAttribute('open'),null);await p.locator('[data-close=telegram-settings]').click();
  await p.reload();await p.waitForFunction(()=>document.querySelector('.value-button')?.textContent==='5');assert.equal(await p.evaluate(()=>localStorage.getItem('ritm-v1')),null);
  for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false)}
  await p.setViewportSize({width:390,height:844});await p.screenshot({path:'.sites-runtime/telegram-mobile.png',fullPage:true});assert.deepEqual(errors,[]);console.log('PASS Telegram UI: cloud-only saves, conflict recovery, reload, timer controls, settings, 4 viewports');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
