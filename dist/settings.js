/* Keep secondary data actions one step away from the daily workspace. */
(() => {
  const settings = document.querySelector('#app-settings');
  document.querySelector('[data-settings]').addEventListener('click', () => {
    document.querySelector('#settings-storage').textContent = window.RitmCloud?.launched
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
