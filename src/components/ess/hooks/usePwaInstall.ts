'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

// ══════════════════════════════════════════════════════════════
// usePwaInstall — Detects PWA installability, handles install
// and post-install permission requests
// ══════════════════════════════════════════════════════════════

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaInstallState {
  canInstall: boolean;      // Native install prompt available (Chrome)
  isInstalled: boolean;     // Running in standalone mode
  isIOS: boolean;           // iOS Safari (no native prompt)
  isInStandaloneMode: boolean;
  dismissed: boolean;       // User dismissed the banner
  permissions: {
    camera: PermissionState | 'unavailable';
    geolocation: PermissionState | 'unavailable';
  };
}

const DISMISSED_KEY = 'ess_install_dismissed';
const PERMISSIONS_REQUESTED_KEY = 'ess_permissions_requested';

export function usePwaInstall() {
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  const [state, setState] = useState<PwaInstallState>({
    canInstall: false,
    isInstalled: false,
    isIOS: false,
    isInStandaloneMode: false,
    dismissed: false,
    permissions: {
      camera: 'unavailable',
      geolocation: 'unavailable',
    },
  });

  const [permissionsRequested, setPermissionsRequested] = useState(() => {
    try {
      return localStorage.getItem(PERMISSIONS_REQUESTED_KEY) === 'true';
    } catch { return false; }
  });

  // ── Detect if running in standalone mode (already installed) ──
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches
      || (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as unknown as { MSStream?: boolean }).MSStream;

    setState((prev) => ({
      ...prev,
      isInStandaloneMode: standalone,
      isInstalled: standalone,
      isIOS: isIOS && !standalone,
    }));
  }, []);

  // ── Detect dismissed ──
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY) === 'true';
      setState((prev) => ({ ...prev, dismissed }));
    } catch { /* ignore */ }
  }, []);

  // ── Listen for beforeinstallprompt ──
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      deferredPromptRef.current = e as BeforeInstallPromptEvent;
      setState((prev) => ({ ...prev, canInstall: true }));
    };
    window.addEventListener('beforeinstallprompt', handler);

    // Detect if app was installed
    window.addEventListener('appinstalled', () => {
      deferredPromptRef.current = null;
      setState((prev) => ({ ...prev, canInstall: false, isInstalled: true }));
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  // ── Check permission states ──
  const checkPermissions = useCallback(async () => {
    const perms = { camera: 'unavailable' as const, geolocation: 'unavailable' as const };
    try {
      if (navigator.permissions) {
        const [cam, geo] = await Promise.all([
          navigator.permissions.query({ name: 'camera' as PermissionName }).catch(() => null),
          navigator.permissions.query({ name: 'geolocation' as PermissionName }).catch(() => null),
        ]);
        if (cam) perms.camera = cam.state;
        if (geo) perms.geolocation = geo.state;
      }
    } catch { /* ignore */ }
    setState((prev) => ({ ...prev, permissions: perms }));
    return perms;
  }, []);

  useEffect(() => {
    if (state.isInstalled || state.isInStandaloneMode) {
      checkPermissions();
    }
  }, [state.isInstalled, state.isInStandaloneMode, checkPermissions]);

  // ── Install PWA (Chrome native prompt) ──
  const install = useCallback(async () => {
    const prompt = deferredPromptRef.current;
    if (prompt) {
      await prompt.prompt();
      const result = await prompt.userChoice;
      deferredPromptRef.current = null;

      if (result.outcome === 'accepted') {
        setState((prev) => ({ ...prev, canInstall: false, isInstalled: true }));
        return true;
      }
      return false;
    }
    // No native prompt available — show manual instructions
    return false;
  }, []);

  // ── Dismiss banner ──
  const dismiss = useCallback(() => {
    try { localStorage.setItem(DISMISSED_KEY, 'true'); } catch { /* ignore */ }
    setState((prev) => ({ ...prev, dismissed: true }));
  }, []);

  // ── Reset dismissed state (so banner shows again) ──
  const resetDismiss = useCallback(() => {
    try { localStorage.removeItem(DISMISSED_KEY); } catch { /* ignore */ }
    setState((prev) => ({ ...prev, dismissed: false }));
  }, []);

  // ── Request permissions after install ──
  const requestPermissions = useCallback(async () => {
    const results: { camera: boolean; geolocation: boolean } = {
      camera: false,
      geolocation: false,
    };

    // Request geolocation
    try {
      results.geolocation = await new Promise<boolean>((resolve) => {
        navigator.geolocation.getCurrentPosition(
          () => resolve(true),
          () => resolve(false),
          { enableHighAccuracy: true, timeout: 10000 },
        );
      });
    } catch { results.geolocation = false; }

    // Request camera
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach((t) => t.stop());
        results.camera = true;
      }
    } catch { results.camera = false; }

    // Mark as requested so we don't ask again (persisted across sessions)
    try { localStorage.setItem(PERMISSIONS_REQUESTED_KEY, 'true'); } catch { /* ignore */ }
    setPermissionsRequested(true);

    await checkPermissions();
    return results;
  }, [checkPermissions]);

  // ── Show permission dialog? ──
  // Only show if installed AND not already asked AND at least one permission is not yet granted
  const needsAnyPermission =
    state.permissions.camera !== 'granted' || state.permissions.geolocation !== 'granted';
  const shouldShowPermissions = state.isInstalled && !permissionsRequested && needsAnyPermission;

  // ── Show install banner?
  // Always show unless dismissed or already installed in standalone mode
  const shouldShowInstall = !state.dismissed && !state.isInStandaloneMode;

  return {
    state,
    shouldShowInstall,
    shouldShowPermissions,
    install,
    dismiss,
    resetDismiss,
    requestPermissions,
    checkPermissions,
  };
}
