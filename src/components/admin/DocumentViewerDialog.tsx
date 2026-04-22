import { useState, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ZoomIn, ZoomOut, RotateCw, Download, Upload, Loader2 } from 'lucide-react';
import { uploadFile } from '@/lib/api/config';
import { updateEmployee } from '@/lib/api/employees';
import { toast } from 'sonner';

interface DocumentViewerDialogProps {
  imageUrl: string | null;
  title: string;
  isOpen: boolean;
  onClose: () => void;
  canUpload?: boolean;
  employeeId?: string | number;
  documentType?: 'aadhaar_front' | 'aadhaar_back' | 'bank_document' | 'profile_pic';
  onDocumentUpdated?: (newUrl: string) => void;
}

export function DocumentViewerDialog({
  imageUrl,
  title,
  isOpen,
  onClose,
  canUpload = false,
  employeeId,
  documentType,
  onDocumentUpdated,
}: DocumentViewerDialogProps) {
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleZoomIn = () => setZoom(prev => Math.min(prev + 0.25, 3));
  const handleZoomOut = () => setZoom(prev => Math.max(prev - 0.25, 0.5));
  const handleRotate = () => setRotation(prev => (prev + 90) % 360);

  const handleDownload = () => {
    if (imageUrl) {
      const link = document.createElement('a');
      link.href = imageUrl;
      link.download = `${title.replace(/\s+/g, '_')}.jpg`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !employeeId || !documentType) return;

    setIsUploading(true);
    try {
      // Upload file to server
      const { url: newUrl, error: uploadError } = await uploadFile(file, `employees/${employeeId}`);

      if (uploadError || !newUrl) {
        console.error('Upload error:', uploadError);
        toast.error('Failed to upload document');
        return;
      }

      // Update employee record
      const fieldMap: Record<string, string> = {
        'aadhaar_front': 'aadhaar_front_url',
        'aadhaar_back': 'aadhaar_back_url',
        'bank_document': 'bank_document_url',
        'profile_pic': 'profile_pic_url',
      };

      const { error: updateError } = await updateEmployee(Number(employeeId), { 
        [fieldMap[documentType]]: newUrl 
      });

      if (updateError) {
        console.error('Update error:', updateError);
        toast.error('Failed to update record');
        return;
      }

      toast.success('Document updated successfully');
      onDocumentUpdated?.(newUrl);
    } catch (error) {
      console.error('Error uploading:', error);
      toast.error('Upload failed');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleClose = () => {
    setZoom(1);
    setRotation(0);
    onClose();
  };

  if (!imageUrl) return null;

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[95vh] p-0">
        <DialogHeader className="p-4 border-b flex flex-row items-center justify-between">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon" onClick={handleZoomOut} title="Zoom Out">
              <ZoomOut className="w-4 h-4" />
            </Button>
            <span className="text-sm text-muted-foreground min-w-[3rem] text-center">
              {Math.round(zoom * 100)}%
            </span>
            <Button variant="outline" size="icon" onClick={handleZoomIn} title="Zoom In">
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleRotate} title="Rotate">
              <RotateCw className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="icon" onClick={handleDownload} title="Download">
              <Download className="w-4 h-4" />
            </Button>
            {canUpload && (
              <Button 
                variant="default" 
                size="icon" 
                onClick={handleUploadClick} 
                title="Replace Document"
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4" />
                )}
              </Button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>
        </DialogHeader>
        
        <div className="overflow-auto max-h-[calc(95vh-80px)] flex items-center justify-center bg-muted/50 p-4">
          <img
            src={imageUrl}
            alt={title}
            className="transition-transform duration-200"
            style={{
              transform: `scale(${zoom}) rotate(${rotation}deg)`,
              maxWidth: zoom > 1 ? 'none' : '100%',
              maxHeight: zoom > 1 ? 'none' : 'calc(95vh - 120px)',
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}