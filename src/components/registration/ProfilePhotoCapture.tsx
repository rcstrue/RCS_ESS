import { useState, useRef, useCallback } from 'react';
import { Camera, RotateCcw, FlipHorizontal, Loader2, ImagePlus, X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getFileUrl } from '@/lib/api/config';

interface ProfilePhotoCaptureProps {
  onCapture: (imageData: string) => void;
  capturedImage: string | null;
  onRetake: () => void;
}

export function ProfilePhotoCapture({
  onCapture,
  capturedImage,
  onRetake,
}: ProfilePhotoCaptureProps) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user'); // Default to front camera for selfie
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async (mode?: 'user' | 'environment') => {
    setIsLoading(true);
    const currentMode = mode || facingMode;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: currentMode,
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsStreaming(true);
            setIsLoading(false);
          }).catch((err) => {
            console.error('Error playing video:', err);
            setIsLoading(false);
          });
        };
      }
    } catch (error) {
      console.error('Error accessing camera:', error);
      alert('Unable to access camera. Please ensure camera permissions are granted.');
      setIsLoading(false);
    }
  }, [facingMode]);

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setIsStreaming(false);
  }, []);

  const captureImage = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      if (context) {
        // Create a square crop from center (for round profile photo)
        const size = Math.min(video.videoWidth, video.videoHeight);
        const offsetX = (video.videoWidth - size) / 2;
        const offsetY = (video.videoHeight - size) / 2;
        
        canvas.width = size;
        canvas.height = size;
        
        // Draw the cropped square
        context.drawImage(video, offsetX, offsetY, size, size, 0, 0, size, size);
        
        // Use maximum quality (1.0) for best image quality
        const imageData = canvas.toDataURL('image/jpeg', 1.0);
        stopCamera();
        onCapture(imageData);
      }
    }
  }, [stopCamera, onCapture]);

  const switchCamera = useCallback(async () => {
    const newMode = facingMode === 'user' ? 'environment' : 'user';
    stopCamera();
    setFacingMode(newMode);
    // Start camera immediately with the new mode (don't wait for state update)
    setIsLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: newMode,
          width: { ideal: 640 },
          height: { ideal: 640 },
        },
      });
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        
        videoRef.current.onloadedmetadata = () => {
          videoRef.current?.play().then(() => {
            setIsStreaming(true);
            setIsLoading(false);
          }).catch((err) => {
            console.error('Error playing video:', err);
            setIsLoading(false);
          });
        };
      }
    } catch (error) {
      console.error('Error switching camera:', error);
      setIsLoading(false);
    }
  }, [facingMode, stopCamera]);

  const handleRetake = () => {
    onRetake();
    startCamera();
  };

  const handleGalleryUpload = () => {
    fileInputRef.current?.click();
  };

  // Compress image to target size (around 700KB max)
  const compressImage = (dataUrl: string, maxSizeKB: number = 700): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        // Start with high quality
        let quality = 1.0;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        
        // Set canvas size to image size
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        // Check initial size
        let result = canvas.toDataURL('image/jpeg', quality);
        let sizeKB = (result.length * 3) / 4 / 1024;
        
        // Reduce quality if too large
        while (sizeKB > maxSizeKB && quality > 0.1) {
          quality -= 0.1;
          result = canvas.toDataURL('image/jpeg', quality);
          sizeKB = (result.length * 3) / 4 / 1024;
        }
        
        console.log(`Profile image compressed: ${Math.round(sizeKB)}KB at quality ${quality.toFixed(1)}`);
        resolve(result);
      };
      img.onerror = () => {
        console.error('Failed to load image for compression');
        resolve(dataUrl);
      };
      img.src = dataUrl;
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      // Compress image to keep under 700KB
      const compressedImage = await compressImage(result, 700);
      onCapture(compressedImage);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // Captured image preview
  if (capturedImage) {
    return (
      <div className="space-y-3 animate-fade-in">
        <div className="flex flex-col items-center">
          {/* Round Profile Preview */}
          <div className="w-48 h-48 rounded-full overflow-hidden bg-muted border-4 border-primary/20 shadow-lg">
            <img
              src={getFileUrl(capturedImage) || undefined}
              alt="Profile"
              className="w-full h-full object-cover"
            />
          </div>
          <p className="mt-2 text-sm text-muted-foreground">Profile Photo</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handleRetake}
            className="flex-1"
            size="sm"
          >
            <RotateCcw className="w-4 h-4 mr-1" />
            Retake
          </Button>
          <Button
            variant="outline"
            onClick={handleGalleryUpload}
            className="flex-1"
            size="sm"
          >
            <ImagePlus className="w-4 h-4 mr-1" />
            Gallery
          </Button>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Round Camera Frame */}
      <div className="flex flex-col items-center">
        <div className="relative w-64 h-64 rounded-full overflow-hidden bg-muted border-4 border-primary/30 shadow-xl">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={cn(
              "absolute inset-0 w-full h-full object-cover transition-opacity",
              isStreaming ? "opacity-100" : "opacity-0"
            )}
            style={{ transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }}
          />

          {isStreaming ? (
            <>
              {/* Face Guide Overlay */}
              <div className="absolute inset-0 pointer-events-none">
                {/* Oval face guide */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-52 border-2 border-dashed border-primary/50 rounded-full" />
              </div>
              {/* Camera Controls */}
              <div className="absolute top-2 right-2 flex gap-1">
                <Button 
                  variant="camera" 
                  size="icon" 
                  onClick={switchCamera} 
                  className="h-7 w-7 bg-black/50 hover:bg-black/70"
                >
                  <FlipHorizontal className="w-3 h-3" />
                </Button>
                <Button 
                  variant="camera" 
                  size="icon" 
                  onClick={stopCamera} 
                  className="h-7 w-7 bg-black/50 hover:bg-black/70"
                >
                  <X className="w-3 h-3" />
                </Button>
              </div>
              {/* Instruction */}
              <div className="absolute bottom-2 left-0 right-0 text-center">
                <span className="bg-black/60 text-white px-2 py-1 rounded-full text-[10px] font-medium">
                  Position face in oval
                </span>
              </div>
            </>
          ) : (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center cursor-pointer hover:bg-primary/5 transition-colors"
              onClick={!isLoading ? startCamera : undefined}
            >
              <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center mb-2">
                {isLoading ? (
                  <Loader2 className="w-7 h-7 text-primary animate-spin" />
                ) : (
                  <Camera className="w-7 h-7 text-primary" />
                )}
              </div>
              <p className="text-muted-foreground text-xs font-medium">
                {isLoading ? 'Starting camera...' : 'Tap to capture photo'}
              </p>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {isStreaming ? 'Align your face in the circle' : 'Profile Photo'}
        </p>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2">
        {isStreaming ? (
          <Button 
            onClick={captureImage} 
            className="flex-1 bg-success hover:bg-success/90" 
            size="default"
          >
            <Check className="w-4 h-4 mr-2" />
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

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
}
