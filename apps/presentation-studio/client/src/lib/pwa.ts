export type PwaUpdateDetail = {
  registration: ServiceWorkerRegistration;
};

const BASE_URL = import.meta.env.BASE_URL || '/';
let refreshingForUpdate = false;

function staticAssetUrls(): string[] {
  const urls = new Set<string>([
    new URL('index.html', window.location.href).href,
    new URL('manifest.webmanifest', window.location.href).href,
    new URL('icon.svg', window.location.href).href,
    new URL('icon-192.png', window.location.href).href,
    new URL('icon-512.png', window.location.href).href,
    new URL('apple-touch-icon.png', window.location.href).href,
  ]);

  document.querySelectorAll<HTMLScriptElement | HTMLLinkElement>('script[src],link[rel="stylesheet"][href]').forEach((node) => {
    const href = 'src' in node ? node.src : node.href;
    if (href) urls.add(href);
  });

  return [...urls];
}

function notifyUpdate(registration: ServiceWorkerRegistration) {
  window.dispatchEvent(new CustomEvent<PwaUpdateDetail>('citrine:pwa-update', { detail: { registration } }));
}

export function registerCitrineServiceWorker() {
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`${BASE_URL}sw.js`, { scope: BASE_URL })
      .then((registration) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!refreshingForUpdate) return;
          window.location.reload();
        });

        if (registration.waiting && navigator.serviceWorker.controller) {
          notifyUpdate(registration);
        }

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              notifyUpdate(registration);
            }
          });
        });

        navigator.serviceWorker.ready
          .then((readyRegistration) => {
            readyRegistration.active?.postMessage({
              type: 'CACHE_URLS',
              urls: staticAssetUrls(),
            });
          })
          .catch(() => {});
      })
      .catch((err) => {
        console.warn('Citrine PWA registration failed', err);
      });
  });
}

export function applyPwaUpdate(registration: ServiceWorkerRegistration) {
  refreshingForUpdate = true;
  if (registration.waiting) {
    registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  } else {
    window.location.reload();
  }
}
