const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Muhammadamin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
 const context=await browser.newContext({locale:'en-US',viewport:{width:390,height:844}}),p=await context.newPage(),errors=[];
 p.on('pageerror',e=>errors.push(e.message));await p.goto('http://127.0.0.1:4173');await p.waitForURL('**/en.html?lang=en');
 await p.getByRole('button',{name:'New habit',exact:false}).click();await p.locator('[name=name]').fill('Моя привычка');await p.getByRole('button',{name:'Save habit',exact:true}).click();
 await p.getByRole('button',{name:'Complete: Моя привычка',exact:true}).click();assert.match(await p.locator('.summary').innerText(),/1 of 1 completed/);
 const before=await p.evaluate(()=>localStorage.getItem('day-protocol-v1'));
 for(const view of ['stats','habits','today']){await p.locator(`[data-view=${view}]`).click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);const text=await p.locator('main').innerText();assert.equal(/[А-Яа-яЁё]/.test(text.replaceAll('Моя привычка','')),false,text)}
 await p.locator('[data-settings]').click();await p.locator('#app-language').selectOption('ru');await p.waitForURL('**/?lang=ru');await p.locator('[data-settings]').waitFor();assert.match(await p.locator('.summary').innerText(),/1 из 1 выполнено/);assert.equal(await p.evaluate(()=>localStorage.getItem('day-protocol-v1')),before);
 await p.reload();assert.equal(await p.locator('html').getAttribute('lang'),'ru');
 await p.locator('[data-settings]').click();await p.locator('#app-language').selectOption('en');await p.waitForURL('**/en.html?lang=en');
 for(const width of [320,390,768,1440]){await p.setViewportSize({width,height:900});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)}
 await p.screenshot({path:'.sites-runtime/english-desktop.png'});
 const cloud=await browser.newContext({locale:'en-US'});let state={version:2,language:'en',habits:[],logs:{}},revision=0;
 await cloud.addInitScript(()=>{window.Telegram={WebApp:{initData:'test',initDataUnsafe:{user:{language_code:'en'}},ready(){},expand(){},onEvent(){}}}});
 await cloud.route('**/api/state',async route=>{if(route.request().method()==='PUT'){assert.equal(route.request().headers()['accept-language'],'en');state=route.request().postDataJSON().state;revision++}await route.fulfill({json:{state,revision,settings:{enabled:false,time:'20:00',days:[0],timezone:'UTC'},botStarted:true}})});
 const c=await cloud.newPage();await c.goto('http://127.0.0.1:4173/?telegram=1');await c.locator('#cloud-status').filter({hasText:'Synced'}).waitFor();
 await c.locator('[data-template="2"]').click();await c.getByRole('button',{name:'Save habit',exact:true}).click();await c.locator('[data-focus]').click();await c.locator('#focus-toggle').click();assert.equal(await c.locator('#focus-toggle').innerText(),'Resume');await c.locator('#focus-cancel').click();
 await c.locator('[data-settings]').click();await c.locator('#app-language').selectOption('ru');await c.waitForURL('**/?telegram=1&lang=ru');assert.equal(state.language,'ru');await c.locator('#cloud-status').filter({hasText:'Синхронизировано'}).waitFor();assert.equal(state.habits[0].name,'Morning exercise');assert.equal(await c.evaluate(()=>localStorage.getItem('day-protocol-v1')),null);
 assert.deepEqual(errors,[]);console.log('PASS bilingual UI: automatic English, all views, switch/reload, unchanged user data, 4 sizes, cloud language persistence and timer');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
