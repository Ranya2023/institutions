// ============================================================
// PWA install banner (Android beforeinstallprompt + iOS hint)
// and Web Push subscription. Call initPWA(containerId, profileId)
// once you know who's logged in.
// ============================================================
let deferredInstallPrompt = null;
let activePromoContainerId = null;
let activeProfileId = null;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  if (activePromoContainerId) renderPromoBanner();
});

function isIOS() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) && !window.MSStream;
}
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

function initPWA(containerId, profileId) {
  activePromoContainerId = containerId;
  activeProfileId = profileId;
  registerServiceWorker();
  renderPromoBanner();
}

function renderPromoBanner() {
  const el = document.getElementById(activePromoContainerId);
  if (!el) return;
  let html = '';

  if (!isStandalone()) {
    if (isIOS()) {
      html += `<div class="install-banner"><span>${t('ios_install_hint')}</span></div>`;
    } else if (deferredInstallPrompt) {
      html += `<div class="install-banner"><span>${t('install_banner_text')}</span><button class="btn-outline" id="installBtn">${t('install_btn')}</button></div>`;
    }
  }

  if ('PushManager' in window && typeof Notification !== 'undefined' && Notification.permission === 'default') {
    html += `<div class="install-banner"><span>${t('enable_notifications_text')}</span><button class="btn-outline" id="enablePushBtn">${t('enable_notifications_btn')}</button></div>`;
  }

  el.innerHTML = html;

  const installBtn = document.getElementById('installBtn');
  if (installBtn) {
    installBtn.addEventListener('click', async () => {
      if (!deferredInstallPrompt) return;
      deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
      deferredInstallPrompt = null;
      renderPromoBanner();
    });
  }

  const pushBtn = document.getElementById('enablePushBtn');
  if (pushBtn) {
    pushBtn.addEventListener('click', async () => {
      const ok = await enablePushNotifications(activeProfileId);
      if (ok) toast(t('toast_updated'));
      renderPromoBanner();
    });
  }
}

// ---------- Web Push subscription ----------
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function enablePushNotifications(profileId) {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) return false;
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return false;

    const registration = await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(window.APP_CONFIG.VAPID_PUBLIC_KEY),
      });
    }
    const raw = subscription.toJSON();
    await sb.from('push_subscriptions').upsert({
      profile_id: profileId,
      endpoint: raw.endpoint,
      p256dh: raw.keys.p256dh,
      auth_key: raw.keys.auth,
    }, { onConflict: 'profile_id,endpoint' });
    return true;
  } catch (err) {
    console.error('push subscribe failed', err);
    return false;
  }
}
