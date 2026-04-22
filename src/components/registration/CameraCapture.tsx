import { useState, useRef, useCallback } from 'react';
import { Camera, RotateCcw, FlipHorizontal, Loader2, ImagePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getFileUrl } from '@/lib/api/config';

interface CameraCaptureProps {
  onCapture: (imageData: string) => void;
  capturedImage: string | null;
  onRetake: () => void;
  documentType: 'aadhaar-front' | 'aadhaar-back' | 'bank-document' | 'profile';
  instruction: string;
}

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cropCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const startCamera = useCallback(async () => {
    setIsLoading(true);
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
    if (videoRef.current && canvasRef.current && cropCanvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const cropCanvas = cropCanvasRef.current;
      const context = canvas.getContext('2d');
      const cropContext = cropCanvas.getContext('2d');

      if (context && cropContext) {
        // First, capture full frame at video resolution
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        
        // ✅ PROPER CROP: Map display coordinates to video coordinates
        // The border overlay shows what should be captured
        // We need to convert container pixels → video pixels
        
        const containerWidth = video.offsetWidth;
        const containerHeight = video.offsetHeight;
        const videoWidth = video.videoWidth;
        const videoHeight = video.videoHeight;
        
        // Border overlay is inset-3 (12px from each side of CONTAINER)
        const borderInset = 12;
        
        // Calculate how object-cover scales the video inside the container
        const containerAspect = containerWidth / containerHeight;
        const videoAspect = videoWidth / videoHeight;
        
        let scale: number;
        let offsetX = 0;
        let offsetY = 0;
        
        if (videoAspect > containerAspect) {
          // Video is wider - fills height, sides cropped
          scale = containerHeight / videoHeight;
          const scaledVideoWidth = videoWidth * scale;
          offsetX = (containerWidth - scaledVideoWidth) / 2;
        } else {
          // Video is taller - fills width, top/bottom cropped
          scale = containerWidth / videoWidth;
          const scaledVideoHeight = videoHeight * scale;
          offsetY = (containerHeight - scaledVideoHeight) / 2;
        }
        
        // Border overlay position in CONTAINER coordinates
        const borderX = borderInset;
        const borderY = borderInset;
        const borderWidth = containerWidth - (borderInset * 2);
        const borderHeight = containerHeight - (borderInset * 2);
        
        // Convert to VIDEO coordinates
        const cropX = Math.max(0, (borderX - offsetX) / scale);
        const cropY = Math.max(0, (borderY - offsetY) / scale);
        const cropWidth = Math.min(videoWidth - cropX, borderWidth / scale);
        const cropHeight = Math.min(videoHeight - cropY, borderHeight / scale);
        
        // Validate crop dimensions
        if (cropWidth <= 0 || cropHeight <= 0 || cropX >= videoWidth || cropY >= videoHeight) {
          console.error('Invalid crop dimensions:', { cropX, cropY, cropWidth, cropHeight });
          // Fallback: capture full image
          cropCanvas.width = canvas.width;
          cropCanvas.height = canvas.height;
          cropContext.drawImage(canvas, 0, 0);
        } else {
          // Create cropped image
          cropCanvas.width = Math.floor(cropWidth);
          cropCanvas.height = Math.floor(cropHeight);
          
          cropContext.drawImage(
            canvas,
            cropX,
            cropY,
            cropWidth,
            cropHeight,
            0,
            0,
            cropWidth,
            cropHeight
          );
        }
        
        // Use maximum quality (1.0) for best image quality
        // Images can be up to 700KB which is acceptable
        const imageData = cropCanvas.toDataURL('image/jpeg', 1.0);
        stopCamera();
        onCapture(imageData);
      }
    }
  }, [stopCamera, onCapture]);

  const switchCamera = useCallback(async () => {
    stopCamera();
    setFacingMode(prev => prev === 'environment' ? 'user' : 'environment');
    setTimeout(startCamera, 100);
  }, [stopCamera, startCamera]);

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
        
        console.log(`Image compressed: ${Math.round(sizeKB)}KB at quality ${quality.toFixed(1)}`);
        resolve(result);
      };
      img.onerror = () => {
        console.error('Failed to load image for compression');
        resolve(dataUrl);
      };
      img.src = dataUrl;
    });
  };

  // Process gallery image - compress to keep under 700KB
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
      alert('Please select an image or PDF file');
      return;
    }

    const reader = new FileReader();
    reader.onload = async (event) => {
      const result = event.target?.result as string;
      
      // For images, compress to keep under 700KB
      if (file.type.startsWith('image/')) {
        const img = new Image();
        img.onload = async () => {
          // Compress image to target size
          const compressedImage = await compressImage(result, 700);
          onCapture(compressedImage);
        };
        img.onerror = () => {
          console.error('Failed to load image');
          onCapture(result);
        };
        img.src = result;
      } else {
        onCapture(result);
      }
    };
    reader.onerror = () => {
      console.error('Failed to read file');
      alert('Failed to read file. Please try again.');
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const getOverlayGuide = () => {
    switch (documentType) {
      case 'aadhaar-front':
        return 'Position Aadhaar card front within frame';
      case 'aadhaar-back':
        return 'Position Aadhaar card back within frame';
      case 'bank-document':
        return 'Position passbook/cheque within frame';
      case 'profile':
        return 'Position your face in the center';
    }
  };

  // Captured image preview
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
        <Button
          variant="outline"
          onClick={handleRetake}
          className="w-full"
          size="sm"
        >
          <RotateCcw className="w-4 h-4 mr-1" />
          Retake
        </Button>
      </div>
    );
  }

  // Hidden file input
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept="image/*,application/pdf"
      onChange={handleFileChange}
      className="hidden"
    />
  );

  // Get overlay shape based on document type - same for all (large landscape rectangle)
  const getOverlayShape = () => {
    return (
      <div className="absolute inset-3 border-2 border-primary/50 rounded-lg" />
    );
  };

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
