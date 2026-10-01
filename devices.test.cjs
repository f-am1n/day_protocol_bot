const assert=require('node:assert/strict');
process.env.PLAYWRIGHT_BROWSERS_PATH ||= require('node:path').join(__dirname,'.sites-runtime','browsers');
const pw=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/Muhammadamin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const engines=process.argv.slice(2).length?process.argv.slice(2):['chromium','firefox','webkit'];
(async()=>{
  for(const engine of engines){
    const browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});
    try{
      const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:4173');
      await page.locator('[data-template="0"]').click();await page.locator('[name=name]').fill('Очень длинное название привычки для проверки маленьких экранов');await page.locator('[name=target]').fill('100000');await page.getByRole('button',{name:'Сохранить привычку',exact:true}).click();
      for(const [width,height] of [[320,568],[360,800],[390,844],[430,932],[768,1024],[820,1180],[1024,768],[1440,900],[1920,1080],[844,390]]){
        await page.setViewportSize({width,height});
        for(const view of ['today','stats','habits']){
          await page.locator(`[data-view=${view}]`).click();
          assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${engine} overflow ${view} ${width}`);
        }
        await page.locator('[data-reminders]').click();
        const box=await page.locator('#reminders-dialog').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=width+1&&box.y>=0&&box.y+box.height<=height+1,`${engine} dialog clipped ${width}x${height}`);
        assert.equal(await page.locator('#reminders-dialog').evaluate(e=>e.scrollWidth>e.clientWidth+1),false,`${engine} reminder overflow`);
        await page.locator('#reminder-time').fill('19:45');await page.getByRole('button',{name:'Сохранить расписание',exact:true}).click();
        await page.locator('[data-close=reminders-dialog]').click();
      }
      await page.setViewportSize({width:390,height:844});await page.locator('[data-view=today]').click();await page.locator('[data-reminders]').click();
      const downloadPromise=page.waitForEvent('download');await page.locator('#calendar-reminder').click();const download=await downloadPromise;const contents=require('node:fs').readFileSync(await download.path(),'utf8');assert.match(contents,/BEGIN:VALARM/);assert.match(contents,/RRULE:FREQ=WEEKLY/);assert.match(contents,/T194500/);assert.match(contents,/TRIGGER:PT0M/);
      await page.locator('[data-close=reminders-dialog]').click();await page.reload();await page.locator('[data-reminders]').click();assert.equal(await page.locator('#reminder-time').inputValue(),'19:45');
      await page.locator('[data-close=reminders-dialog]').click();
      // Increase actual text sizes to cover users' text enlargement preferences.
      await page.addStyleTag({content:'body{zoom:2}'});await page.setViewportSize({width:1280,height:1000});
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${engine} 200% overflow`);
      assert.deepEqual(errors,[]);console.log(`PASS ${engine}: 10 viewports, 3 views, landscape, dialogs, long names, large targets, calendar export, preferences, 200% zoom`);
    }finally{await browser.close()}
  }
})().catch(e=>{console.error(e);process.exitCode=1});
