// PWA Install Prompt Manager
let deferredPrompt: any = null;

export function isInstallable(): boolean {
  return deferredPrompt !== null;
}

export function initPWAInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredPrompt = e;
  });

  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
  });
}

export async function promptInstall(): Promise<boolean> {
  if (!deferredPrompt) return false;

  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null;

  return outcome === 'accepted';
}

export function getDismissedInstall(): boolean {
  return localStorage.getItem('ess_install_dismissed') === 'true';
}

export function dismissInstall() {
  localStorage.setItem('ess_install_dismissed', 'true');
}

export function shouldShowInstallBanner(): boolean {
  if (getDismissedInstall()) return false;
  // Only show on mobile
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if (!isMobile) return false;
  // Check if already installed (standalone mode)
  if (window.matchMedia('(display-mode: standalone)').matches) return false;
  return isInstallable();
}
