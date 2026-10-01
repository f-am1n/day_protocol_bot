const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/Muhammadamin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const R=require('./dist/core.js');
(async()=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{document.modelContext={registerTool:tool=>{window.registeredTool=tool}}});
    await page.goto('http://127.0.0.1:4173');
    await page.locator('[data-template="0"]').click();
    await page.getByRole('button',{name:'Сохранить привычку',exact:true}).click();
    await page.getByRole('button',{name:'Добавить: Читать книгу',exact:true}).click();
    assert.equal(await page.locator('.value-button').innerText(),'5');
    await page.locator('#undo').click();
    assert.equal(await page.locator('.value-button').innerText(),'0');
    await page.locator('[data-value]').click();await page.locator('#amount').fill('20');await page.getByRole('button',{name:'Сохранить прогресс',exact:true}).click();
    assert.match(await page.locator('.summary').innerText(),/1 из 1 выполнено/);
    await page.reload();assert.match(await page.locator('.summary').innerText(),/1 из 1 выполнено/);
    await page.locator('[data-edit]').click();await page.locator('[name=target]').fill('40');await page.getByRole('button',{name:'Сохранить привычку',exact:true}).click();
    assert.match(await page.locator('.summary').innerText(),/1 из 1 выполнено/);
    assert.match(await page.locator('.upcoming').innerText(),/Новая цель/);
    await page.locator('#add').click();await page.locator('[name=name]').fill('Тренировка');await page.locator('[name=schedule]').selectOption('weekly');await page.getByRole('button',{name:'Сохранить привычку',exact:true}).click();
    assert.match(await page.locator('.summary').innerText(),/1 из 1 выполнено/);
    assert.equal(await page.locator('.weekly-heading').count(),1);
    await page.getByRole('button',{name:'Выполнить: Тренировка',exact:true}).click();
    assert.equal(await page.evaluate(()=>window.registeredTool.execute().habits.length),2);
    await page.locator('[data-view=habits]').click();await page.locator('[data-archive]').first().click();
    await page.locator('[data-archive-view=true]').click();assert.equal(await page.locator('.habit').count(),1);
    await page.locator('[data-archive]').click();await page.locator('[data-archive-view=false]').click();assert.equal(await page.locator('.habit').count(),2);
    await page.locator('[data-view=stats]').click();assert.ok(await page.locator('.calendar button').count()>=28);
    await page.locator('#stats-habit').selectOption({label:'Читать книгу'});assert.equal(await page.locator('.streak-row').count(),1);
    await page.locator('[data-view=today]').click();await page.screenshot({path:'desktop.png',fullPage:true});
    for(const width of [390,320,768]){await page.setViewportSize({width,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow ${width}`);if(width===390)await page.screenshot({path:'mobile.png',fullPage:true})}
    const saved=await page.evaluate(()=>localStorage.getItem('ritm-v1'));
    await page.locator('#import-file').setInputFiles({name:'broken.json',mimeType:'application/json',buffer:Buffer.from('{"habits":[null],"logs":{}}')});
    assert.equal(await page.evaluate(()=>localStorage.getItem('ritm-v1')),saved);
    const legacy={habits:[{id:'old',name:'Старая привычка',icon:'☀',period:'morning',type:'check',target:1,schedule:'days',days:[0,1,2,3,4,5,6],frequency:3,created:R.today(),archivedAt:null}],logs:{[R.today()]:{old:1}}};
    await page.locator('#import-file').setInputFiles({name:'old.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await page.locator('#confirm-import').click();
    assert.match(await page.locator('.summary').innerText(),/1 из 1 выполнено/);assert.equal(await page.evaluate(()=>localStorage.getItem('ritm-before-import')),saved);
    // Existing v1 installations migrate automatically, including migration backup.
    await page.evaluate(data=>localStorage.setItem('ritm-v1',JSON.stringify(data)),legacy);await page.reload();assert.equal(await page.evaluate(()=>!!localStorage.getItem('ritm-before-v2')),true);
    const other=await context.newPage();await other.goto('http://127.0.0.1:4173');await page.getByRole('button',{name:'Отменить: Старая привычка',exact:true}).click();await other.waitForFunction(()=>document.querySelector('.summary').innerText.includes('0 из 1'));
    // Recovery must not destroy corrupt storage.
    await page.evaluate(()=>localStorage.setItem('ritm-v1','{corrupt'));await page.reload();assert.equal(await page.locator('#storage-warning').isVisible(),true);assert.equal(await page.evaluate(()=>localStorage.getItem('ritm-v1')),'{corrupt');
    assert.deepEqual(errors,[]);console.log('PASS: templates, custom increments, direct input, undo, goal history, weekly separation, archive/restore, calendar filtering, 3 viewport sizes, import rejection, legacy migration, backups, cross-tab updates, corruption recovery, WebMCP read-back, no runtime errors');
  } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
