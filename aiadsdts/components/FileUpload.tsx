import React, { useRef, useState } from 'react';
import { Upload, X, FileAudio, FileText, Image as ImageIcon } from 'lucide-react';
import { clsx } from 'clsx';
import { useTheme } from '../contexts/ThemeContext';

interface FileUploadProps {
  label: string;
  accept: string;
  multiple?: boolean;
  onChange: (file: File | File[] | null) => void;
  required?: boolean;
  helperText?: string;
}

export const FileUpload: React.FC<FileUploadProps> = ({ 
  label, 
  accept, 
  multiple = false, 
  onChange, 
  required,
  helperText
}) => {
  const { resolvedTheme } = useTheme();
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const newFiles = Array.from(e.target.files);
      setFiles(newFiles);
      onChange(multiple ? newFiles : newFiles[0]);
    }
  };

  const removeFile = (index: number) => {
    const updatedFiles = files.filter((_, i) => i !== index);
    setFiles(updatedFiles);
    onChange(multiple ? updatedFiles : (updatedFiles[0] || null));
    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const getIcon = () => {
    if (accept.includes('audio')) return <FileAudio className="w-8 h-8 text-purple-500" />;
    if (accept.includes('text') || accept.includes('pdf')) return <FileText className="w-8 h-8 text-blue-500" />;
    return <ImageIcon className="w-8 h-8 text-green-500" />;
  };

  return (
    <div className="mb-4">
      <label className={clsx(
        "block text-sm font-semibold mb-2",
        resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-700"
      )}>
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      
      {files.length === 0 ? (
        <div 
          onClick={() => inputRef.current?.click()}
          className={clsx(
            "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center cursor-pointer transition-colors",
            resolvedTheme === 'dark'
              ? "border-slate-600 bg-slate-700/50 hover:bg-slate-700 hover:border-blue-500"
              : "border-slate-300 bg-white hover:bg-slate-50 hover:border-blue-400"
          )}
        >
          <div className="mb-2">{getIcon()}</div>
          <p className={clsx(
            "text-sm font-medium",
            resolvedTheme === 'dark' ? "text-slate-300" : "text-slate-500"
          )}>Click to upload or drag & drop</p>
          <p className={clsx(
            "text-xs mt-1",
            resolvedTheme === 'dark' ? "text-slate-500" : "text-slate-400"
          )}>{helperText || accept}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file, idx) => (
            <div key={idx} className={clsx(
              "flex items-center justify-between p-3 border rounded-lg shadow-sm",
              resolvedTheme === 'dark'
                ? "bg-slate-700 border-slate-600"
                : "bg-white border-slate-200"
            )}>
              <div className="flex items-center space-x-3 overflow-hidden">
                <div className="flex-shrink-0">{getIcon()}</div>
                <div className="truncate">
                  <p className={clsx(
                    "text-sm font-medium truncate max-w-[200px]",
                    resolvedTheme === 'dark' ? "text-slate-200" : "text-slate-700"
                  )}>{file.name}</p>
                  <p className={clsx(
                    "text-xs",
                    resolvedTheme === 'dark' ? "text-slate-400" : "text-slate-500"
                  )}>{(file.size / 1024).toFixed(1)} KB</p>
                </div>
              </div>
              <button 
                onClick={() => removeFile(idx)}
                className={clsx(
                  "p-1 rounded-full transition-colors",
                  resolvedTheme === 'dark'
                    ? "text-slate-400 hover:text-red-400 hover:bg-red-900/30"
                    : "text-slate-400 hover:text-red-500 hover:bg-red-50"
                )}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleFileChange}
        className="hidden"
      />
    </div>
  );
};
