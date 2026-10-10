/* Telegram identity is verified by the server. initDataUnsafe is never used for access. */
window.DayProtocolCloud=(()=>{
  const tg=window.Telegram?.WebApp;
  const active=!!tg?.initData;
  const launched=active||new URLSearchParams(location.search).has('telegram')||location.hash.includes('tgWebApp');
  let revision=0,ready=false,busy=false,preferences=null,draft=null,config=null;
  const status=message=>{const el=document.querySelector('#cloud-status');if(el)el.textContent=message};
  async function request(path,method='GET',body){
    const r=await fetch(path,{method,headers:{'X-Telegram-Init-Data':tg?.initData||'','Content-Type':'application/json','Accept-Language':document.documentElement.lang},body:body===undefined?undefined:JSON.stringify(body),cache:'no-store',signal:AbortSignal.timeout(15000)});
    let data;try{data=await r.json()}catch{throw Error('Сервер пока недоступен. Попробуйте ещё раз.')}
    if(!r.ok){const e=Error(data.error||'Не удалось связаться с сервером.');e.status=r.status;e.data=data;throw e}return data;
  }
  function accept(data){revision=data.revision;preferences=data.settings;ready=true;return data.state}
  async function load(){
    if(!active)throw Error('Откройте «Day Protocol» кнопкой в @day_protocol_bot.');
    status('Загружаем ваш прогресс…');
    const data=await request('/api/state');status('Синхронизировано с Telegram');return accept(data);
  }
  async function save(next){
    if(!ready)throw Error('Дождитесь загрузки прогресса.');busy=true;draft=structuredClone(next);status('Сохраняем…');
    try{const data=await request('/api/state','PUT',{state:next,revision,operation:crypto.randomUUID()});draft=null;status('Сохранено в Telegram');tg?.HapticFeedback?.notificationOccurred('success');return accept(data)}
    catch(e){if(e.status===409&&e.data.state){accept(e.data);window.dispatchEvent(new CustomEvent('day-protocol:cloud-conflict',{detail:e.data.state}))}status('Изменение не сохранено. Повторите действие.');throw e}
    finally{busy=false}
  }
  async function refresh(){if(!active||!ready||busy||document.hidden||document.querySelector('dialog[open]')||window.DayProtocolWriting)return;try{const data=await request('/api/state');if(!busy&&!window.DayProtocolWriting&&data.revision!==revision){window.dispatchEvent(new CustomEvent('day-protocol:cloud-update',{detail:accept(data)}));status('Синхронизировано с Telegram')}}catch{status('Нет связи. Новые отметки требуют интернета.')}}
  function boot(){
    if(!launched)return;
    document.documentElement.classList.add('telegram-app');
    const banner=document.createElement('section');banner.className='cloud-bar';banner.innerHTML='<span id="cloud-status" role="status">Подключаем Telegram…</span><button id="cloud-retry" class="text-button">Обновить</button><button id="cloud-draft" class="text-button" hidden>Скачать несохранённое</button>';
    document.querySelector('main').prepend(banner);
    banner.querySelector('#cloud-retry').onclick=()=>window.dispatchEvent(new Event('day-protocol:cloud-retry'));
    banner.querySelector('#cloud-draft').onclick=()=>{if(draft)download(draft,'day-protocol-unsaved.json')};
    document.querySelectorAll('.aside-bottom small').forEach(e=>e.textContent='Прогресс в вашем Telegram-аккаунте.');
    tg?.ready();tg?.expand();
    if(tg?.isVersionAtLeast?.('6.1')){tg.setHeaderColor('#202827');tg.setBackgroundColor('#f3f5f3')}
    const insets=()=>document.documentElement.style.setProperty('--telegram-top',`${(tg?.contentSafeAreaInset?.top||0)+(tg?.safeAreaInset?.top||0)}px`);
    insets();tg?.onEvent('safeAreaChanged',insets);tg?.onEvent('contentSafeAreaChanged',insets);
    document.addEventListener('visibilitychange',refresh);tg?.onEvent('activated',refresh);setInterval(refresh,15000);
    document.addEventListener('click',async e=>{
      if(!e.target.closest('[data-reminders]'))return;
      const dialog=document.querySelector('#telegram-settings');dialog.showModal();
      try{
        config??=await fetch('/api/config').then(r=>r.json());
        const data=await request('/api/state');preferences=data.settings;
        dialog.querySelector('[name=time]').value=preferences.time;
        dialog.querySelector('[name=timezone]').value=preferences.timezone;
        dialog.querySelector('[name=enabled]').checked=preferences.enabled;
        dialog.querySelector('[name=enabled]').disabled=!config.remindersReady;
        dialog.querySelector('#telegram-reminder-info').textContent=!config.remindersReady?'Автоматическая отправка ещё подключается. Список привычек уже доступен в боте по команде /today.':!data.botStarted?'Нажмите «Старт» в боте, чтобы он мог присылать напоминания.':'Бот напомнит, даже когда приложение закрыто. Проверка раз в час: доставка может задержаться до часа после выбранного времени.';
        dialog.querySelector('#telegram-days').innerHTML=['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((name,i)=>`<label><input type="checkbox" value="${i}" ${preferences.days.includes(i)?'checked':''}><span>${name}</span></label>`).join('');
      }catch(err){dialog.querySelector('#telegram-reminder-info').textContent=err.message}
    });
    document.querySelector('#telegram-settings-form').onsubmit=async e=>{
      e.preventDefault();const f=e.target,b=f.querySelector('[type=submit]');b.disabled=true;
      try{const data=await request('/api/settings','PUT',{time:f.elements.time.value,timezone:f.elements.timezone.value,enabled:f.elements.enabled.checked,days:[...f.querySelectorAll('#telegram-days input:checked')].map(x=>Number(x.value))});preferences=data.settings;document.querySelector('#telegram-settings').close();notify('Настройки сохранены')}
      catch(err){document.querySelector('#telegram-reminder-info').textContent=err.message}finally{b.disabled=false}
    };
  }
  return {active,launched,load,save,boot,status,refresh,get ready(){return ready},get draft(){return draft},get busy(){return busy}};
})();
