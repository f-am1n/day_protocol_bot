/* Select presentation language only. Telegram identity is still verified server-side. */
(() => {
  // Preserve existing browser data when upgrading from the previous product name.
  try {
    for (const suffix of ['v1', 'before-v2', 'before-import', 'reminders-v1', 'reminder-last']) {
      const next = 'day-protocol-' + suffix, previous = 'ritm-' + suffix;
      if (localStorage.getItem(next) === null && localStorage.getItem(previous) !== null)
        localStorage.setItem(next, localStorage.getItem(previous));
    }
  } catch {}

  const supported = value => value === 'ru' || value === 'en';
  const url = new URL(location.href), explicit = url.searchParams.get('lang');
  let saved;
  try { saved = localStorage.getItem('day-protocol-language'); } catch {}
  const hint = window.Telegram?.WebApp?.initDataUnsafe?.user?.language_code || navigator.language || 'en';
  const language = supported(explicit) ? explicit : supported(saved) ? saved : hint.toLowerCase().startsWith('ru') ? 'ru' : 'en';
  const current = document.documentElement.lang;
  function remember(value) { try { localStorage.setItem('day-protocol-language', value); } catch {} }
  function navigate(value) {
    remember(value);
    const next = new URL(location.href);
    next.pathname = value === 'en' ? '/en.html' : '/';
    next.searchParams.set('lang', value);
    location.replace(next.href);
  }
  window.DayLanguage = { current, navigate, remember };
  if (supported(explicit)) remember(explicit);
  if (language !== current) navigate(language);
})();
