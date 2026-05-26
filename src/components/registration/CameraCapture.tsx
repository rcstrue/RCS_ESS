import { useState, useRef, useCallback } from 'react';
import { Camera, RotateCcw, FlipHorizontal, Loader2, ImagePlus, X, ShieldAlert, Settings, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getFileUrl } from '@/lib/api/config';

type PermissionState = 'idle' | 'prompt' | 'denied' | 'granted' | 'unavailable';

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  capturedImage: string | null;
  onRetake: () => void;
  documentType: 'aadhaar-front' | 'aadhaar-back' | 'bank-document' | 'profile';
  instruction: string;
}

const DOCUMENT_LABELS: Record<string, { en: string; hi: string }> = {
  'aadhaar-front': { en: 'Aadhaar Card (Front)', hi: 'आधार कार्ड (सामने)' },
  'aadhaar-back': { en: 'Aadhaar Card (Back)', hi: 'आधार कार्ड (पीछे)' },
  'bank-document': { en: 'Bank Passbook / Cheque', hi: 'बैंक पासबुक / चेक' },
  'profile': { en: 'Profile Photo', hi: 'फोटो' },
};

export function CameraCapture({
  onCapture,
  capturedImage,
  onRetake,
  documentType,
  instruction,
}: CameraCaptureProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [permissionState, setPermissionState] = useState<PermissionState>('idle');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const docLabel = DOCUMENT_LABELS[documentType] || { en: 'Document', hi: 'दस्तावेज़' };

  // Check if camera API is available
  const checkCameraAvailable = useCallback((): boolean => {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }, []);

  // Open app settings (works on Android/iOS)
  const openAppSettings = useCallback(() => {
    // Try the Settings API (limited support but works on some Android browsers)
    if ('permissions' in navigator) {
      // Direct approach - just tell user to go to settings
    }
    // Fallback: navigate to settings URL scheme (works on Android Chrome)
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    if (isIOS) {
      window.open('app-settings:', '_blank');
    } else {
      // Android: the user needs to go to Chrome Settings > Site Settings > Camera
      // We can't open this directly, so we show clear instructions
    }
  }, []);

  const startCamera = useCallback(async () => {
    if (!checkCameraAvailable()) {
      setPermissionState('unavailable');
      return;
    }

    setIsLoading(true);
    setPermissionState('prompt');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode,
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;

        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsStreaming(true);
            setIsLoading(false);
            setPermissionState('granted');
          }).catch((err) => {
            console.error('Error playing video:', err);
            setIsLoading(false);
            setPermissionState('denied');
          });
        };
      }
    } catch (error: any) {
      console.error('Error accessing camera:', error);
      setIsLoading(false);

      // Determine the type of error
      if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
        setPermissionState('denied');
      } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
        setPermissionState('unavailable');
      } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
        setPermissionState('unavailable');
      } else {
        setPermissionState('denied');
      }
    }
  }, [facingMode, checkCameraAvailable]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const captureImage = useCallback(() => {
    if (videoRef.current && canvasRef.current && cropCanvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const cropCanvas = cropCanvasRef.current;
      const context = canvas.getContext('2d');
      const cropContext = cropCanvas.getContext('2d');

      if (context && cropContext) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);

        const containerWidth = video.offsetWidth;
        const containerHeight = video.offsetHeight;
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        const borderInset = 12;

        const containerAspect = containerWidth / containerHeight;
        const videoAspect = videoWidth / videoHeight;

        let scale: number;
        let offsetX = 0;
        let offsetY = 0;

        if (videoAspect > containerAspect) {
          scale = containerHeight / videoHeight;
          const scaledVideoWidth = videoWidth * scale;
          offsetX = (containerWidth - scaledVideoWidth) / 2;
        } else {
          scale = containerWidth / videoWidth;
          const scaledVideoHeight = videoHeight * scale;
          offsetY = (containerHeight - scaledVideoHeight) / 2;
        }

        const borderX = borderInset;
        const borderY = borderInset;
        const borderWidth = containerWidth - (borderInset * 2);
        const borderHeight = containerHeight - (borderInset * 2);

        const cropX = Math.max(0, (borderX - offsetX) / scale);
        const cropY = Math.max(0, (borderY - offsetY) / scale);
        const cropWidth = Math.min(videoWidth - cropX, borderWidth / scale);
        const cropHeight = Math.min(videoHeight - cropY, borderHeight / scale);

        if (cropWidth <= 0 || cropHeight <= 0 || cropX >= videoWidth || cropY >= videoHeight) {
          cropCanvas.width = canvas.width;
          cropCanvas.height = canvas.height;
          cropContext.drawImage(canvas, 0, 0);
        } else {
          cropCanvas.width = Math.floor(cropWidth);
          cropCanvas.height = Math.floor(cropHeight);
          cropContext.drawImage(canvas, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
        }

        const imageData = cropCanvas.toDataURL('image/jpeg', 1.0);
        stopCamera();
        onCapture(imageData);
      }
    }
  }, [stopCamera, onCapture]);

  const switchCamera = useCallback(async () => {
    stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    setPermissionState('idle');
    setTimeout(startCamera, 100);
  }, [stopCamera, startCamera]);

  const handleRetake = () => {
    onRetake();
    setPermissionState('idle');
    startCamera();
  };

  const handleGalleryUpload = () => {
    fileInputRef.current?.click();
  };

  const compressImage = (dataUrl: string, maxSizeKB: number = 700): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let quality = 1.0;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(dataUrl); return; }
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        let result = canvas.toDataURL('image/jpeg', quality);
        let sizeKB = (result.length * 3) / 4 / 1024;
        while (sizeKB > maxSizeKB && quality > 0.1) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
          sizeKB = (result.length * 3) / 4 / 1024;
        }
        resolve(result);
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      return;
    }
    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      if (file.type.startsWith('image/')) {
        const compressedImage = await compressImage(result, 700);
        onCapture(compressedImage);
      } else {
        onCapture(result);
      }
    };
    reader.onerror = () => {
      // Silently fail
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const getOverlayGuide = () => {
    switch (documentType) {
      case 'aadhaar-front': return 'Position Aadhaar card front within frame';
      case 'aadhaar-back': return 'Position Aadhaar card back within frame';
      case 'bank-document': return 'Position passbook/cheque within frame';
      case 'profile': return 'Position your face in the center';
    }
  };

  // ─── Permission Denied Screen ──────────────────────────────────────────────
  const renderPermissionDenied = () => (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col items-center text-center p-4 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
        <div className="w-14 h-14 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center mb-3">
          <ShieldAlert className="w-7 h-7 text-amber-600 dark:text-amber-400" />
        </div>
        <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200">
          Camera Permission Required
        </h3>
        <p className="text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
          We need camera access to take a photo of your<br />
          <span className="font-medium">{docLabel.en}</span>
        </p>
        <p className="text-xs text-amber-600 dark:text-amber-400 leading-relaxed">
          📷 {docLabel.hi} की फोटो लेने के लिए कैमरा अनुमति ज़रूरी है
        </p>
      </div>

      {/* Instructions */}
      <div className="text-left text-xs text-muted-foreground space-y-2 bg-muted/50 rounded-lg p-3">
        <p className="font-semibold text-foreground">📱 How to enable camera / कैमरा कैसे चालू करें:</p>
        <ol className="space-y-1.5 list-decimal list-inside">
          <li>Tap the <strong>"Open Settings"</strong> button below / <strong>"Open Settings"</strong> बटन दबाएं</li>
          <li>Find <strong>"Camera"</strong> permission / <strong>"Camera"</strong> अनुमति खोजें</li>
          <li>Set to <strong>"Allow"</strong> / <strong>"Allow"</strong> पर सेट करें</li>
          <li>Come back and tap <strong>"Camera"</strong> button / वापस आएं और <strong>"Camera"</strong> बटन दबाएं</li>
        </ol>
      </div>

      <div className="flex flex-col gap-2">
        <Button onClick={openAppSettings} variant="outline" className="w-full" size="default">
          <Settings className="w-4 h-4 mr-2" />
          Open Settings / सेटिंग खोलें
        </Button>
        <Button onClick={startCamera} className="w-full" size="default">
          <Camera className="w-4 h-4 mr-2" />
          Try Camera Again / कैमरा फिर से कोशिश करें
        </Button>
        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-background px-2 text-muted-foreground">or / या</span>
          </div>
        </div>
        <Button onClick={handleGalleryUpload} variant="secondary" className="w-full" size="default">
          <Upload className="w-4 h-4 mr-2" />
          Upload from Gallery / गैलरी से अपलोड करें
        </Button>
        <p className="text-[10px] text-muted-foreground text-center">
          You can also upload a previously taken photo.<br />
          आप पहले से ली गई फोटो भी अपलोड कर सकते हैं।{' '}
        </p>
      </div>
    </div>
  );

  // ─── Camera Unavailable Screen ─────────────────────────────────────────────
  const renderCameraUnavailable = () => (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col items-center text-center p-4 rounded-xl bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800">
        <div className="w-14 h-14 rounded-full bg-blue-100 dark:bg-blue-900/50 flex items-center justify-center mb-3">
          <Camera className="w-7 h-7 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200">
          Camera Not Available
        </h3>
        <p className="text-xs text-blue-700 dark:text-blue-300">
          Your device doesn't have a camera, or it's being used by another app.<br />
          आपके डिवाइस में कैमरा नहीं है या दूसरी ऐप इस्तेमाल कर रही है।
        </p>
      </div>
      <Button onClick={handleGalleryUpload} className="w-full" size="default">
        <Upload className="w-4 h-4 mr-2" />
        Upload from Gallery / गैलरी से अपलोड करें
      </Button>
    </div>
  );

  // ─── Captured Image Preview ────────────────────────────────────────────────
  if (capturedImage) {
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="document-preview aspect-[16/10] relative overflow-hidden rounded-lg bg-muted">
          <img
            src={getFileUrl(capturedImage) || undefined}
            alt="Captured document"
            className="w-full h-full object-contain"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleRetake} className="flex-1" size="sm">
            <RotateCcw className="w-4 h-4 mr-1" />
            Retake / दोबारा
          </Button>
          <Button onClick={handleGalleryUpload} variant="outline" className="flex-1" size="sm">
            <ImagePlus className="w-4 h-4 mr-1" />
            Change / बदलें
          </Button>
        </div>
      </div>
    );
  }

  // ─── Permission Denied or Unavailable ──────────────────────────────────────
  if (permissionState === 'denied') return renderPermissionDenied();
  if (permissionState === 'unavailable') return renderCameraUnavailable();

  // ─── Camera / Gallery UI ──────────────────────────────────────────────────
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,application/pdf"
      onChange={handleFileChange}
      className="hidden"
    />
  );

  const getOverlayShape = () => (
    <div className="absolute inset-3 border-2 border-primary/50 rounded-lg" />
  );

  return (
    <div className="space-y-3">
      {fileInput}
      <div className="camera-frame aspect-[16/10] relative overflow-hidden">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={cn(
            "absolute inset-0 w-full h-full object-cover transition-opacity",
            isStreaming ? "opacity-100" : "opacity-0"
          )}
        />

        {isStreaming ? (
          <>
            <div className="camera-overlay pointer-events-none">
              {getOverlayShape()}
              <div className="absolute bottom-3 left-0 right-0 text-center">
                <span className="bg-foreground/80 text-background px-3 py-1.5 rounded-full text-xs font-medium">
                  {getOverlayGuide()}
                </span>
              </div>
            </div>
            <div className="absolute top-2 right-2 flex gap-1.5">
              <Button variant="camera" size="icon" onClick={switchCamera} className="h-8 w-8">
                <FlipHorizontal className="w-3.5 h-3.5" />
              </Button>
              <Button variant="camera" size="icon" onClick={stopCamera} className="h-8 w-8">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          </>
        ) : (
          <div
            className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:bg-primary/5 transition-colors"
            onClick={!isLoading ? startCamera : undefined}
          >
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
              {isLoading ? (
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-primary" />
              )}
            </div>
            <p className="text-muted-foreground text-xs mb-1">{instruction}</p>
            <p className="text-[10px] text-muted-foreground/70">
              {isLoading ? 'Starting camera...' : 'Tap here or use buttons below'}
            </p>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
        <canvas ref={cropCanvasRef} className="hidden" />
      </div>

      <div className="flex gap-2">
        {isStreaming ? (
          <Button onClick={captureImage} className="flex-1" size="default">
            <Camera className="w-4 h-4 mr-2" />
            Capture
          </Button>
        ) : (
          <>
            <Button
              onClick={startCamera}
              disabled={isLoading}
              className="flex-1"
              size="default"
            >
              {isLoading ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Camera className="w-4 h-4 mr-2" />
              )}
              {isLoading ? 'Starting...' : 'Camera'}
            </Button>
            <Button
              onClick={handleGalleryUpload}
              variant="outline"
              className="flex-1"
              size="default"
            >
              <ImagePlus className="w-4 h-4 mr-2" />
              Gallery
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
