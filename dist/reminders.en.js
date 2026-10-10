/* Device-local reminder preferences. Closed-page alarms are delegated to the calendar. */
(() => {
  'use strict';
  if(window.DayProtocolCloud?.launched)return;
  const PREF_KEY = 'day-protocol-reminders-v1';
  const LAST_KEY = 'day-protocol-reminder-last';
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
    catch { status('Could not save settings. Check access to browser storage.'); return false; }
  }
  function status(text) { $('#reminder-status').textContent = text; }
  async function worker() {
    if (!supported()) throw Error('Notifications are not available in this browser.');
    registration ||= await navigator.serviceWorker.register('./sw.js', {scope:'./'});
    return Promise.race([
      navigator.serviceWorker.ready,
      new Promise((_,reject)=>setTimeout(()=>reject(Error('Could not prepare notifications. Try opening the site in a regular browser.')),8000))
    ]);
  }
  if ('serviceWorker' in navigator && window.isSecureContext) {
    navigator.serviceWorker.register('./sw.js', {scope:'./'}).then(r=>{registration=r}).catch(()=>{});
  }
  function renderSettings() {
    readPrefs();
    $('#reminder-time').value=prefs.time;
    $('#reminder-days').innerHTML='<legend>Reminder days</legend>'+names.map((n,i)=>`<label><input type="checkbox" value="${i}" ${prefs.days.includes(i)?'checked':''}><span>${n}</span></label>`).join('');
    $('#reminder-timezone').textContent=`Device time zone: ${Intl.DateTimeFormat().resolvedOptions().timeZone || 'local time'}`;
    const allowed=supported()&&Notification.permission==='granted';
    $('#enable-reminders').hidden=allowed&&prefs.enabled;
    $('#disable-reminders').hidden=!prefs.enabled;
    $('#test-reminder').disabled=!allowed;
    if (ios&&!standalone()) status('On iPhone and iPad first open the website in Safari → «Share» → «Add to Home Screen». Then launch Day Protocol from its icon.');
    else if (!supported()) status('This browser does not support system notifications. Open the website in Safari, Chrome or Edge or use your calendar.');
    else if (Notification.permission==='denied') status('Notifications are blocked. Allow them in your browser’s site settings.');
    else if (allowed&&prefs.enabled) status(`Enabled on this device: ${prefs.time}. Keep the website open and active.`);
    else status('Notifications are off. Permission is requested only after you choose to enable them.');
    $('#install-app').hidden=standalone();
  }
  function formPrefs(enabled=prefs.enabled) {
    const time=$('#reminder-time').value,days=[...$('#reminder-days').querySelectorAll('input:checked')].map(e=>Number(e.value));
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)||!days.length) {status('Choose a time and at least one weekday.');return null;}
    return {enabled,time,days};
  }
  function openSettings() {renderSettings();$('#reminders-dialog').showModal();}
  document.addEventListener('click',e=>{if(e.target.closest('[data-reminders]'))openSettings()});
  $('#reminder-form').onsubmit=e=>{e.preventDefault();const next=formPrefs();if(next&&savePrefs(next)){renderSettings();status('Schedule saved. '+(next.enabled?'We can remind you while the website is open and active.':'To receive notifications, select Enable.'))}};
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
      if(savePrefs(next)){renderSettings();status('Notifications enabled. Select Test to see an example.');}
    } catch(e) {status(e.message || 'Could not enable notifications.');}
    finally{button.disabled=false;}
  };
  $('#disable-reminders').onclick=()=>{if(savePrefs({...prefs,enabled:false})){renderSettings();status('Browser reminders are off. If you imported a calendar event, delete it in your calendar.')}};
  async function show(body,tag) {
    const reg=await worker();
    await reg.showNotification('Day Protocol · time for yourself', {body,tag,icon:'./icon-192.png',badge:'./icon-192.png',data:{url:new URL('./',location.href).href}});
  }
  $('#test-reminder').onclick=async()=>{
    $('#test-reminder').disabled=true;
    try {await show('This is what your habit reminder will look like.','day-protocol-test');status('Test sent to your device. If it does not appear, check browser permissions and Do Not Disturb settings.');}
    catch(e){status(e.message||'Could not show the notification.')}
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
      try {await show(`Still remaining today: ${pending.length}. Open Day Protocol and take one small step.`,`day-protocol-${date}`);}
      catch {try{if(localStorage.getItem(LAST_KEY)===marker){if(before)localStorage.setItem(LAST_KEY,before);else localStorage.removeItem(LAST_KEY)}}catch{}}
    };
    try {if(navigator.locks?.request)await navigator.locks.request('day-protocol-reminder',send);else await send();}finally{running=false;}
  }
  function calendarText(p) {
    const now=new Date(),start=new Date(now),[hour,minute]=p.time.split(':').map(Number);
    start.setHours(hour,minute,0,0);
    for(let i=0;i<8;i++){if(start>now&&p.days.includes((start.getDay()+6)%7))break;start.setDate(start.getDate()+1);}
    const local=d=>R.key(d).replaceAll('-','')+'T'+String(d.getHours()).padStart(2,'0')+String(d.getMinutes()).padStart(2,'0')+'00';
    const stamp=now.toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
    const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//DayProtocol//Habit reminders//RU','CALSCALE:GREGORIAN','BEGIN:VEVENT',`UID:day-protocol-daily-${p.time.replace(':','')}-${p.days.join('')}@${location.hostname}`,`DTSTAMP:${stamp}`,`DTSTART:${local(start)}`,'DURATION:PT10M',`RRULE:FREQ=WEEKLY;BYDAY=${p.days.map(d=>['MO','TU','WE','TH','FR','SA','SU'][d]).join(',')}`,'SUMMARY:Time for your habits · Day Protocol',`DESCRIPTION:Open the tracker and record your progress. ${new URL('./',location.href).href}`,`URL:${new URL('./',location.href).href}`,'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Time for your habits','TRIGGER:PT0M','END:VALARM','END:VEVENT','END:VCALENDAR'];
    // RFC 5545: fold by UTF-8 octets without splitting Unicode characters.
    return lines.map(line=>{let result='',bytes=0;for(const ch of line){const n=new TextEncoder().encode(ch).length;if(bytes+n>75){result+='\r\n ';bytes=1;}result+=ch;bytes+=n;}return result;}).join('\r\n')+'\r\n';
  }
  $('#calendar-reminder').onclick=()=>{
    const next=formPrefs();if(!next)return;
    const url=URL.createObjectURL(new Blob([calendarText(next)],{type:'text/calendar;charset=utf-8'})),a=document.createElement('a');
    a.href=url;a.download='day-protocol-reminder.ics';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
    status('File downloaded. Import it into your calendar and check the event time and notification. Importing again may create a duplicate. Edit or delete this reminder in your calendar.');
  };
  window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();installPrompt=e;});
  $('#install-app').onclick=async()=>{
    if(installPrompt){const event=installPrompt;installPrompt=null;await event.prompt();await event.userChoice;}
    else status(ios?'Safari → «Share» → «Add to Home Screen». Launch Day Protocol from the new icon.':'Open your browser menu and choose Install app or Add to Home Screen if available.');
  };
  window.addEventListener('appinstalled',()=>{$('#install-app').hidden=true;});
  window.addEventListener('storage',e=>{if(e.key===PREF_KEY){readPrefs();if($('#reminders-dialog').open)renderSettings()}});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkDue()});
  setInterval(checkDue,30000);readPrefs();checkDue();
})();
