'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { usePwaInstall } from './hooks/usePwaInstall';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Download,
  X,
  Smartphone,
  Loader2,
  MapPin,
  Camera,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// InstallBanner — Shows at top of ESS homepage if app can be installed
// ══════════════════════════════════════════════════════════════

export function InstallBanner({
  onInstall,
  onDismiss,
  isIOS,
}: {
  onInstall: () => Promise<boolean>;
  onDismiss: () => void;
  isIOS: boolean;
}) {
  const [installing, setInstalling] = useState(false);

  const handleInstall = async () => {
    setInstalling(true);
    try {
      const accepted = await onInstall();
      if (!accepted) {
        toast.info('You can install the app later from your browser menu.');
      }
    } catch {
      toast.error('Failed to install. Try again.');
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-50 border border-emerald-200">
      <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-100 shrink-0">
        <Download className="w-5 h-5 text-emerald-600" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-emerald-800">Install RCS ESS App</p>
        <p className="text-xs text-emerald-600 mt-0.5">
          {isIOS
            ? 'Tap Share → Add to Home Screen for quick access'
            : 'Add to home screen for faster access & offline support'}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {!isIOS && (
          <Button
            size="sm"
            className="h-8 px-3 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium gap-1.5"
            onClick={handleInstall}
            disabled={installing}
          >
            {installing ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Download className="w-3.5 h-3.5" />
            )}
            Install
          </Button>
        )}
        <button
          onClick={onDismiss}
          className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-emerald-100 transition-colors"
        >
          <X className="w-4 h-4 text-emerald-600" />
        </button>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
// PermissionDialog — Shown after app install to request camera & GPS
// ══════════════════════════════════════════════════════════════

export function PermissionDialog({
  open,
  onRequest,
  onSkip,
  currentPermissions,
}: {
  open: boolean;
  onRequest: () => Promise<{ camera: boolean; geolocation: boolean }>;
  onSkip: () => void;
  currentPermissions: { camera: PermissionState | 'unavailable'; geolocation: PermissionState | 'unavailable' };
}) {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<{ camera: boolean; geolocation: boolean } | null>(null);

  const handleRequest = async () => {
    setLoading(true);
    try {
      const res = await onRequest();
      setResults(res);
      if (res.geolocation) {
        toast.success('Location access granted');
      } else {
        toast.info('Location access denied. You can enable it in Settings later.');
      }
      if (res.camera) {
        toast.success('Camera access granted');
      } else {
        toast.info('Camera access denied. You can enable it in Settings later.');
      }
    } catch {
      toast.error('Failed to request permissions.');
    } finally {
      setLoading(false);
    }
  };

  const needsCamera = currentPermissions.camera !== 'granted';
  const needsGeo = currentPermissions.geolocation !== 'granted';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onSkip(); }}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <div className="flex flex-col items-center gap-2">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-emerald-100">
              <ShieldCheck className="w-7 h-7 text-emerald-600" />
            </div>
            <div className="text-center">
              <DialogTitle className="text-lg">App Permissions</DialogTitle>
              <DialogDescription className="mt-1">
                RCS ESS needs these permissions to work properly
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-3 py-2">
          {/* GPS / Location */}
          <div className="flex items-start gap-3 p-3 rounded-xl border bg-gray-50">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-sky-100 shrink-0">
              <MapPin className="w-4.5 h-4.5 text-sky-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Location (GPS)</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Required for attendance check-in with location tracking
              </p>
              {results && (
                <p className={`text-xs mt-1 font-medium ${results.geolocation ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {results.geolocation ? (
                    <><CheckCircle2 className="w-3 h-3 inline mr-0.5" /> Granted</>
                  ) : (
                    <><AlertCircle className="w-3 h-3 inline mr-0.5" /> Denied — enable in device settings</>
                  )}
                </p>
              )}
            </div>
          </div>

          {/* Camera */}
          <div className="flex items-start gap-3 p-3 rounded-xl border bg-gray-50">
            <div className="flex items-center justify-center w-9 h-9 rounded-full bg-violet-100 shrink-0">
              <Camera className="w-4.5 h-4.5 text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900">Camera</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Required for employee registration & document uploads
              </p>
              {results && (
                <p className={`text-xs mt-1 font-medium ${results.camera ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {results.camera ? (
                    <><CheckCircle2 className="w-3 h-3 inline mr-0.5" /> Granted</>
                  ) : (
                    <><AlertCircle className="w-3 h-3 inline mr-0.5" /> Denied — enable in device settings</>
                  )}
                </p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col sm:gap-2">
          <Button
            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium"
            onClick={handleRequest}
            disabled={loading || !!results}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-1.5" /> Requesting Permissions...</>
            ) : results ? (
              <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Done</>
            ) : (
              <><ShieldCheck className="w-4 h-4 mr-1.5" /> Allow Permissions</>
            )}
          </Button>
          <Button variant="ghost" className="w-full text-gray-500 hover:text-gray-700" onClick={onSkip}>
            {results ? 'Close' : 'Skip for Now'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
