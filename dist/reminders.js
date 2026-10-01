/* Device-local reminder preferences. Closed-page alarms are delegated to the calendar. */
(() => {
  'use strict';
  const PREF_KEY = 'ritm-reminders-v1';
  const LAST_KEY = 'ritm-reminder-last';
  const defaults = {enabled:false, time:'20:00', days:[0,1,2,3,4,5,6]};
  let prefs = {...defaults}, registration = null, installPrompt = null, running = false;
  const supported = () => window.isSecureContext && 'Notification' in window && 'serviceWorker' in navigator;
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  function readPrefs() {
    try {
      const p = JSON.parse(localStorage.getItem(PREF_KEY));
      if (p && typeof p.enabled === 'boolean' && /^([01]\d|2[0-3]):[0-5]\d$/.test(p.time) && Array.isArray(p.days) && p.days.length && p.days.every(d=>Number.isInteger(d)&&d>=0&&d<=6)) prefs = p;
    } catch { /* Keep safe, disabled defaults. */ }
    return prefs;
  }
  function savePrefs(p) {
    try { localStorage.setItem(PREF_KEY, JSON.stringify(p)); prefs=p; return true; }
    catch { status('Не удалось сохранить настройки. Проверьте доступ к хранилищу браузера.'); return false; }
  }
  function status(text) { $('#reminder-status').textContent = text; }
  async function worker() {
    if (!supported()) throw Error('Уведомления в этом браузере недоступны.');
    registration ||= await navigator.serviceWorker.register('./sw.js', {scope:'./'});
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_,reject)=>setTimeout(()=>reject(Error('Не удалось подготовить уведомления. Попробуйте открыть сайт в обычном браузере.')),8000))
    ]);
  }
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js', {scope:'./'}).then(r=>{registration=r}).catch(()=>{});
  }
  function renderSettings() {
    readPrefs();
    $('#reminder-time').value=prefs.time;
    $('#reminder-days').innerHTML='<legend>Дни напоминаний</legend>'+names.map((n,i)=>`<label><input type="checkbox" value="${i}" ${prefs.days.includes(i)?'checked':''}><span>${n}</span></label>`).join('');
    $('#reminder-timezone').textContent=`По времени устройства: ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'местное время'}`;
    const allowed=supported()&&Notification.permission==='granted';
    $('#enable-reminders').hidden=allowed&&prefs.enabled;
    $('#disable-reminders').hidden=!prefs.enabled;
    $('#test-reminder').disabled=!allowed;
    if (ios&&!standalone()) status('На iPhone и iPad сначала откройте сайт в Safari → «Поделиться» → «На экран Домой». Затем запустите Ритм с иконки.');
    else if (!supported()) status('Этот браузер не поддерживает системные уведомления. Откройте сайт в Safari, Chrome или Edge либо используйте календарь.');
    else if (Notification.permission==='denied') status('Уведомления заблокированы. Разрешите их в настройках сайта в браузере.');
    else if (allowed&&prefs.enabled) status(`Включено на этом устройстве: ${prefs.time}. Сайт должен оставаться открытым и активным.`);
    else status('Уведомления выключены. Разрешение запрашивается только после вашего нажатия.');
    $('#install-app').hidden=standalone();
  }
  function formPrefs(enabled=prefs.enabled) {
    const time=$('#reminder-time').value,days=[...$('#reminder-days').querySelectorAll('input:checked')].map(e=>Number(e.value));
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!days.length) {status('Укажите время и хотя бы один день недели.');return null;}
    return {enabled,time,days};
  }
  function openSettings() {renderSettings();$('#reminders-dialog').showModal();}
  document.addEventListener('click',e=>{if(e.target.closest('[data-reminders]'))openSettings()});
  $('#reminder-form').onsubmit=e=>{e.preventDefault();const next=formPrefs();if(next&&savePrefs(next)){renderSettings();status('Расписание сохранено. '+(next.enabled?'Напомним, пока сайт открыт и активен.':'Чтобы получать уведомления, нажмите «Включить».'))}};
  $('#enable-reminders').onclick=async()=>{
    const next=formPrefs(true);if(!next)return;
    if(ios&&!standalone()){renderSettings();return;}
    if(!supported()){renderSettings();return;}
    const button=$('#enable-reminders');button.disabled=true;
    try {
      // Keep this request directly in the user's click, before any other await.
      const permission=await Notification.requestPermission();
      if(permission!=='granted'){renderSettings();return;}
      await worker();
      if(savePrefs(next)){renderSettings();status('Уведомления включены. Нажмите «Проверить», чтобы увидеть пример.');}
    } catch(e) {status(e.message || 'Не удалось включить уведомления.');}
    finally{button.disabled=false;}
  };
  $('#disable-reminders').onclick=()=>{if(savePrefs({...prefs,enabled:false})){renderSettings();status('Напоминания браузера выключены. Событие календаря, если вы его импортировали, удаляется в самом календаре.')}};
  async function show(body,tag) {
    const reg=await worker();
    await reg.showNotification('Ритм · время для себя', {body,tag,icon:'./icon-192.png',badge:'./icon-192.png',data:{url:new URL('./',location.href).href}});
  }
  $('#test-reminder').onclick=async()=>{
    $('#test-reminder').disabled=true;
    try {await show('Так будет выглядеть напоминание о ваших привычках.','ritm-test');status('Тест передан системе. Если он не виден, проверьте разрешения браузера и режим «Не беспокоить».');}
    catch(e){status(e.message||'Не удалось показать уведомление.')}
    finally{$('#test-reminder').disabled=!(supported()&&Notification.permission==='granted')}
  };
  function remaining(date) {
    return state.habits.filter(h=>R.scheduled(state,h,date)&&!R.done(state,h,date)&&(R.configAt(h,date).schedule!=='weekly'||!R.weekly(state,h,date).met));
  }
  async function checkDue() {
    if(running||document.hidden||blocked||!supported()||Notification.permission!=='granted')return;
    readPrefs();if(!prefs.enabled)return;
    const now=new Date(),date=R.key(now),minutes=now.getHours()*60+now.getMinutes(),[h,m]=prefs.time.split(':').map(Number),delta=minutes-h*60-m;
    if(!prefs.days.includes(R.weekday(date))||delta<0||delta>=15)return;
    const pending=remaining(date);if(!pending.length)return;
    running=true;
    const send=async()=>{
      const marker=`${date}:${prefs.time}`;
      let before;
      try {before=localStorage.getItem(LAST_KEY);if(before===marker)return;localStorage.setItem(LAST_KEY,marker);}
      catch {return;}
      try {await show(`Сегодня ещё осталось: ${pending.length}. Откройте Ритм и сделайте один маленький шаг.`,`ritm-${date}`);}
      catch {try{if(localStorage.getItem(LAST_KEY)===marker){if(before)localStorage.setItem(LAST_KEY,before);else localStorage.removeItem(LAST_KEY)}}catch{}}
    };
    try {if(navigator.locks?.request)await navigator.locks.request('ritm-reminder',send);else await send();}finally{running=false;}
  }
  function calendarText(p) {
    const now=new Date(),start=new Date(now),[hour,minute]=p.time.split(':').map(Number);
    start.setHours(hour,minute,0,0);
    for(let i=0;i<8;i++){if(start>now&&p.days.includes((start.getDay()+6)%7))break;start.setDate(start.getDate()+1);}
    const local=d=>R.key(d).replaceAll('-','')+'T'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+'00';
    const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Ritm//Habit reminders//RU','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:ritm-daily-${p.time.replace(':','')}-${p.days.join('')}@${location.hostname}`,`DTSTAMP:${stamp}`,`DTSTART:${local(start)}`,'DURATION:PT10M',`RRULE:FREQ=WEEKLY;BYDAY=${p.days.map(d=>['MO','TU','WE','TH','FR','SA','SU'][d]).join(',')}`,'SUMMARY:Время для привычек · Ритм',`DESCRIPTION:Откройте трекер и отметьте прогресс. ${new URL('./',location.href).href}`,`URL:${new URL('./',location.href).href}`,'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Время для привычек','TRIGGER:PT0M','END:VALARM','END:VEVENT','END:VCALENDAR'];
    // RFC 5545: fold by UTF-8 octets without splitting Unicode characters.
    return lines.map(line=>{let result='',bytes=0;for(const ch of line){const n=new TextEncoder().encode(ch).length;if(bytes+n>75){result+='\r\n ';bytes=1;}result+=ch;bytes+=n;}return result;}).join('\r\n')+'\r\n';
  }
  $('#calendar-reminder').onclick=()=>{
    const next=formPrefs();if(!next)return;
    const url=URL.createObjectURL(new Blob([calendarText(next)],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download='ritm-reminder.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('Файл скачан. Импортируйте его в календарь и проверьте время и уведомление события. Повторный импорт может создать дубликат. Изменять или удалять это напоминание нужно в календаре.');
  };
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
  $('#install-app').onclick=async()=>{
    if(installPrompt){const event=installPrompt;installPrompt=null;await event.prompt();await event.userChoice;}
    else status(ios?'Safari → «Поделиться» → «На экран Домой». Запускайте Ритм с новой иконки.':'Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран», если этот пункт доступен.');
  };
  window.addEventListener('appinstalled',()=>{$('#install-app').hidden=true;});
  window.addEventListener('storage',e=>{if(e.key===PREF_KEY){readPrefs();if($('#reminders-dialog').open)renderSettings()}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDue()});
  setInterval(checkDue,30000);readPrefs();checkDue();
})();
