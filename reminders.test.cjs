const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Muhammadamin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,channel:'msedge'});try{
  const page=await browser.newPage();
  await page.clock.install({time:new Date()});
  await page.addInitScript(()=>{
    window.sentNotifications=[];
    Object.defineProperty(window,'Notification',{value:{permission:'default',requestPermission:async()=>{Notification.permission='granted';return 'granted'}}});
    ServiceWorkerRegistration.prototype.showNotification=async function(title,options){sentNotifications.push({title,...options})};
  });
  await page.goto('http://127.0.0.1:4173');
  await page.locator('[data-template="0"]').click();await page.getByRole('button',{name:'Сохранить привычку',exact:true}).click();
  await page.locator('[data-reminders]').click();
  const now=new Date();const time=String(now.getHours()).padStart(2,'0')+':'+String(now.getMinutes()).padStart(2,'0');
  await page.locator('#reminder-time').fill(time);await page.locator('#enable-reminders').click();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('day-protocol-reminders-v1'))?.enabled===true);
  await page.locator('#test-reminder').click();assert.equal(await page.evaluate(()=>sentNotifications.length),1);
  await page.clock.runFor(30000);await page.waitForFunction(()=>sentNotifications.filter(n=>n.tag!=='day-protocol-test').length===1);
  await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>sentNotifications.filter(n=>n.tag!=='day-protocol-test').length),1,'no duplicates');
  await page.locator('#disable-reminders').click();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('day-protocol-reminders-v1')).enabled),false);
  await page.clock.runFor(60000);assert.equal(await page.evaluate(()=>sentNotifications.length),2);
  await page.evaluate(()=>Notification.permission='denied');await page.locator('[data-close=reminders-dialog]').click();await page.locator('[data-reminders]').click();assert.match(await page.locator('#reminder-status').innerText(),/заблокированы/);
  console.log('PASS: permission gesture, real service worker registration, simulated notification delivery, schedule, deduplication, disable, denied permission. No real OS notifications were sent.');
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
