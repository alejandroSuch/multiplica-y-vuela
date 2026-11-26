import { registerSW } from 'virtual:pwa-register';

// Installed apps can remain open for days. Check on return and while visible.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return;

    const checkForUpdate = (): void => {
      if (document.visibilityState !== 'visible' || !navigator.onLine || registration.installing) return;
      void registration.update().catch(() => { /* Try again when connectivity returns. */ });
    };

    document.addEventListener('visibilitychange', checkForUpdate);
    window.addEventListener('online', checkForUpdate);
    window.setInterval(checkForUpdate, 60 * 60 * 1000);
  },
});
