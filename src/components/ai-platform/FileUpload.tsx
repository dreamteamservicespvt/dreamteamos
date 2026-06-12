import React, { useRef, useState, useMemo, useEffect } from 'react';
import { X, FileAudio, FileText, Image as ImageIcon, Plus } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface FileUploadProps {
  label: string;
  accept: string;
  multiple?: boolean;
  maxFiles?: number;
  onChange: (file: File | File[] | null) => void;
  required?: boolean;
  helperText?: string;
  value?: File | File[] | null;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  label, 
  accept, 
  multiple = false, 
  maxFiles,
  onChange, 
  required,
  helperText,
  value
}) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const inputRef = useRef<HTMLInputElement>(null);
  const appendModeRef = useRef(false);

  const canAddMore = multiple || (maxFiles !== undefined && maxFiles > 1);

  // Derive files from value prop if provided, otherwise use internal state
  const getFilesFromValue = (): File[] => {
    if (value === undefined || value === null) return [];
    if (Array.isArray(value)) return value;
    return [value];
  };
  const [internalFiles, setInternalFiles] = useState<File[]>(getFilesFromValue);
  const files = value !== undefined ? getFilesFromValue() : internalFiles;

  const hasReachedMax = maxFiles !== undefined && files.length >= maxFiles;

  // Image preview thumbnails (object URLs), cleaned up when files change/unmount
  const isImageFile = (f: File) => f.type.startsWith('image/');
  const previewUrls = useMemo(
    () => files.map((f) => (isImageFile(f) ? URL.createObjectURL(f) : null)),
    [files]
  );
  useEffect(() => {
    return () => { previewUrls.forEach((u) => u && URL.revokeObjectURL(u)); };
  }, [previewUrls]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const incoming = Array.from(e.target.files);
      
      if (appendModeRef.current && canAddMore) {
        // Append mode: add new files to existing list
        let merged = [...files, ...incoming];
        if (maxFiles !== undefined) merged = merged.slice(0, maxFiles);
        setInternalFiles(merged);
        onChange(merged);
      } else if (canAddMore) {
        // Replace mode for multi-file
        let newFiles = incoming;
        if (maxFiles !== undefined) newFiles = newFiles.slice(0, maxFiles);
        setInternalFiles(newFiles);
        onChange(newFiles);
      } else {
        // Single file mode
        setInternalFiles([incoming[0]]);
        onChange(incoming[0]);
      }
      appendModeRef.current = false;
    }
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setInternalFiles(updatedFiles);
    if (canAddMore) {
      onChange(updatedFiles.length > 0 ? updatedFiles : null);
    } else {
      onChange(updatedFiles[0] || null);
    }
    if (inputRef.current) inputRef.current.value = '';
  };

  const triggerAddAnother = () => {
    appendModeRef.current = true;
    inputRef.current?.click();
  };

  const triggerChangeFile = () => {
    appendModeRef.current = false;
    inputRef.current?.click();
  };

  const getIcon = () => {
    if (accept.includes('audio')) return <FileAudio className="w-8 h-8 text-purple-500" />;
    if (accept.includes('text') || accept.includes('pdf')) return <FileText className="w-8 h-8 text-blue-500" />;
    return <ImageIcon className="w-8 h-8 text-green-500" />;
  };

  return (
    <div className="mb-4">
      {label && (
        <label className={cn("block text-sm font-semibold mb-2", isDark ? "text-slate-300" : "text-slate-700")}>
          {label} {required && <span className="text-red-500">*</span>}
        </label>
      )}
      <input ref={inputRef} type="file" accept={accept} multiple={canAddMore && !maxFiles} onChange={handleFileChange} className="hidden" />
      {files.length === 0 ? (
        <div
          onClick={() => inputRef.current?.click()}
          className={cn(
            "group border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all",
            isDark
              ? "border-slate-700 bg-slate-800/50 hover:bg-slate-800 hover:border-blue-500/70 hover:shadow-lg hover:shadow-blue-900/20"
              : "border-slate-300 bg-white hover:bg-blue-50/40 hover:border-blue-400 hover:shadow-lg hover:shadow-blue-100"
          )}
        >
          <div className="mb-2">{getIcon()}</div>
          <p className={cn("text-sm font-medium", isDark ? "text-slate-300" : "text-slate-500")}>Click to upload or drag & drop</p>
          <p className={cn("text-xs mt-1", isDark ? "text-slate-500" : "text-slate-400")}>{helperText || accept}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file, idx) => {
            const previewUrl = previewUrls[idx];
            return (
            <div key={idx} className={cn(
              "flex items-center justify-between p-2.5 border rounded-lg shadow-sm",
              isDark ? "bg-slate-700 border-slate-600" : "bg-white border-slate-200"
            )}>
              <div className="flex items-center space-x-3 overflow-hidden">
                {previewUrl ? (
                  <button
                    type="button"
                    onClick={() => window.open(previewUrl, '_blank', 'noopener,noreferrer')}
                    title="Click to view full image"
                    className="flex-shrink-0 w-12 h-12 rounded-md overflow-hidden border border-slate-300/60 dark:border-slate-500/60 hover:ring-2 hover:ring-blue-400 transition-all"
                  >
                    <img src={previewUrl} alt={file.name} className="w-full h-full object-cover" />
                  </button>
                ) : (
                  <div className="flex-shrink-0 w-12 h-12 flex items-center justify-center rounded-md bg-slate-100 dark:bg-slate-600/40">{getIcon()}</div>
                )}
                <div className="truncate">
                  <p className={cn("text-sm font-medium truncate max-w-[180px]", isDark ? "text-slate-200" : "text-slate-700")}>{file.name}</p>
                  <p className={cn("text-xs", isDark ? "text-slate-400" : "text-slate-500")}>
                    {(file.size / 1024).toFixed(1)} KB{previewUrl ? ' · tap thumbnail to preview' : ''}
                  </p>
                </div>
              </div>
              <button onClick={() => removeFile(idx)} className="p-1 rounded-full hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors flex-shrink-0">
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
            );
          })}
          {canAddMore && !hasReachedMax ? (
            <button
              onClick={triggerAddAnother}
              className={cn("w-full text-xs text-center py-2 rounded-lg border border-dashed transition-colors flex items-center justify-center gap-1",
                isDark ? "border-blue-500/50 text-blue-400 hover:border-blue-400 hover:bg-blue-900/20" : "border-blue-300 text-blue-500 hover:border-blue-400 hover:bg-blue-50"
              )}
            >
              <Plus className="w-3 h-3" /> Add another
            </button>
          ) : (
            <button
              onClick={triggerChangeFile}
              className={cn("w-full text-xs text-center py-2 rounded-lg border border-dashed transition-colors",
                isDark ? "border-slate-600 text-slate-400 hover:border-blue-500" : "border-slate-300 text-slate-500 hover:border-blue-400"
              )}
            >
              Change file
            </button>
          )}
        </div>
      )}
    </div>
  );
};
