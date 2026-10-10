/* Keep secondary data actions one step away from the daily workspace. */
(() => {
  const settings = document.querySelector('#app-settings');
  const language = document.querySelector('#app-language');
  language.value = DayLanguage.current;
  language.addEventListener('change', async () => {
    const next = language.value;
    language.disabled = true;
    try {
      if (window.DayProtocolCloud?.launched && !await transact(s => { s.language = next; })) { language.value = DayLanguage.current; return; }
      DayLanguage.navigate(next);
    } finally { language.disabled = false; }
  });
  document.querySelector('[data-settings]').addEventListener('click', () => {
    document.querySelector('#settings-storage').textContent = window.DayProtocolCloud?.launched
      ? 'Прогресс сохраняется в вашем Telegram-аккаунте. Копию можно скачать в любое время.'
      : 'Прогресс хранится в этом браузере. Копия поможет перенести его на другое устройство.';
    settings.showModal();
  });
  settings.addEventListener('click', event => {
    if (event.target.closest('#import')) settings.close();
    if (event.target === settings) {
      const rect = settings.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) settings.close();
    }
  });
})();
