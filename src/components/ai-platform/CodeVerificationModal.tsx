import React, { useState, useRef, useEffect } from 'react';
import { ShieldCheck, X, AlertTriangle, Lock } from 'lucide-react';
import { useTheme } from 'next-themes';
import { cn } from '@/lib/utils';

interface CodeVerificationModalProps {
  accessCode: string;
  onVerified: () => void;
  onClose: () => void;
}

const CodeVerificationModal: React.FC<CodeVerificationModalProps> = ({ accessCode, onVerified, onClose }) => {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const [digits, setDigits] = useState(['', '', '', '']);
  const [attempts, setAttempts] = useState(0);
  const [error, setError] = useState('');
  const [locked, setLocked] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    if (locked) return;
    if (!/^\d*$/.test(value)) return;
    const newDigits = [...digits];
    newDigits[index] = value.slice(-1);
    setDigits(newDigits);
    setError('');

    if (value && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Auto-submit when all 4 digits are entered
    if (newDigits.every(d => d !== '') && value) {
      const code = newDigits.join('');
      if (code === accessCode) {
        onVerified();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 3) {
          setLocked(true);
          setError('Too many attempts. Please contact your admin.');
        } else {
          setError(`Incorrect code. ${3 - newAttempts} attempt${3 - newAttempts > 1 ? 's' : ''} remaining.`);
          setDigits(['', '', '', '']);
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    if (locked) return;
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 4);
    if (pasted.length === 4) {
      const newDigits = pasted.split('');
      setDigits(newDigits);
      inputRefs.current[3]?.focus();
      // Trigger verification
      if (pasted === accessCode) {
        onVerified();
      } else {
        const newAttempts = attempts + 1;
        setAttempts(newAttempts);
        if (newAttempts >= 3) {
          setLocked(true);
          setError('Too many attempts. Please contact your admin.');
        } else {
          setError(`Incorrect code. ${3 - newAttempts} attempt${3 - newAttempts > 1 ? 's' : ''} remaining.`);
          setDigits(['', '', '', '']);
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className={cn("relative w-full max-w-sm rounded-2xl shadow-2xl border p-8",
        isDark ? "bg-slate-800 border-slate-700" : "bg-white border-slate-200"
      )}>
        <button onClick={onClose} className={cn("absolute top-4 right-4 p-1 rounded-lg transition-colors",
          isDark ? "text-slate-400 hover:text-white hover:bg-slate-700" : "text-slate-400 hover:text-slate-600 hover:bg-slate-100"
        )}>
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-6">
          <div className={cn("inline-flex items-center justify-center w-14 h-14 rounded-full mb-4",
            locked ? "bg-red-100 dark:bg-red-900/30" : "bg-blue-100 dark:bg-blue-900/30"
          )}>
            {locked ? <Lock className="w-7 h-7 text-red-600 dark:text-red-400" /> : <ShieldCheck className="w-7 h-7 text-blue-600 dark:text-blue-400" />}
          </div>
          <h2 className={cn("text-xl font-bold mb-1", isDark ? "text-white" : "text-slate-800")}>Enter Access Code</h2>
          <p className={cn("text-sm", isDark ? "text-slate-400" : "text-slate-500")}>
            Enter the 4-digit code assigned to this work
          </p>
        </div>

        <div className="flex justify-center space-x-3 mb-6" onPaste={handlePaste}>
          {digits.map((digit, idx) => (
            <input key={idx} ref={el => { inputRefs.current[idx] = el; }}
              type="text" inputMode="numeric" maxLength={1} value={digit}
              onChange={(e) => handleChange(idx, e.target.value)}
              onKeyDown={(e) => handleKeyDown(idx, e)}
              disabled={locked}
              className={cn("w-14 h-16 text-center text-2xl font-bold rounded-xl border-2 outline-none transition-all",
                locked
                  ? "border-red-300 bg-red-50 text-red-400 cursor-not-allowed dark:border-red-800 dark:bg-red-900/20 dark:text-red-500"
                  : error
                    ? "border-red-300 dark:border-red-700 text-red-600 dark:text-red-400 bg-white dark:bg-slate-700 focus:ring-2 focus:ring-red-200 dark:focus:ring-red-900"
                    : isDark
                      ? "border-slate-600 bg-slate-700 text-white focus:border-blue-500 focus:ring-2 focus:ring-blue-900"
                      : "border-slate-300 bg-white text-slate-800 focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              )}
            />
          ))}
        </div>

        {error && (
          <div className={cn("flex items-center justify-center space-x-2 text-sm py-2 px-3 rounded-lg",
            locked ? "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-400" : "text-red-600 dark:text-red-400"
          )}>
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default CodeVerificationModal;
