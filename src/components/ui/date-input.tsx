import { useRef, useCallback, useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface SplitDateInputProps {
  value: string; // Format: YYYY-MM-DD (for storage)
  onChange: (value: string) => void; // Returns YYYY-MM-DD
  label?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  minYear?: number;
  maxYear?: number;
  className?: string;
}

export function SplitDateInput({
  value,
  onChange,
  label,
  required = false,
  error,
  disabled = false,
  minYear = 1950,
  maxYear = new Date().getFullYear(),
  className,
}: SplitDateInputProps) {
  const dayRef = useRef<HTMLInputElement>(null);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  // Internal state for immediate UI updates
  const [dayVal, setDayVal] = useState('');
  const [monthVal, setMonthVal] = useState('');
  const [yearVal, setYearVal] = useState('');

  // Parse value (YYYY-MM-DD) into components when external value changes
  useEffect(() => {
    if (!value) {
      setDayVal('');
      setMonthVal('');
      setYearVal('');
      return;
    }
    const parts = value.split('-');
    if (parts.length === 3 && parts[0].length === 4) {
      setDayVal(parts[2]);
      setMonthVal(parts[1]);
      setYearVal(parts[0]);
    }
  }, [value]);

  // Update parent when all fields are filled
  const updateParent = useCallback((newDay: string, newMonth: string, newYear: string) => {
    if (newDay.length === 2 && newMonth.length === 2 && newYear.length === 4) {
      // Validate date
      const d = parseInt(newDay);
      const m = parseInt(newMonth);
      const y = parseInt(newYear);
      
      const maxDay = new Date(y, m, 0).getDate();
      if (d >= 1 && d <= maxDay && m >= 1 && m <= 12 && y >= minYear && y <= maxYear) {
        onChange(`${newYear}-${newMonth.padStart(2, '0')}-${newDay.padStart(2, '0')}`);
      }
    } else if (!newDay && !newMonth && !newYear) {
      onChange('');
    }
  }, [onChange, minYear, maxYear]);

  // Handle day input
  const handleDayChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    setDayVal(val);
    
    // Auto-advance to month when 2 digits entered
    if (val.length === 2) {
      const d = parseInt(val);
      if (d >= 1 && d <= 31) {
        monthRef.current?.focus();
      }
    }
    
    updateParent(val, monthVal, yearVal);
  };

  // Handle month input
  const handleMonthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 2);
    setMonthVal(val);
    
    // Auto-advance to year when 2 digits entered
    if (val.length === 2) {
      const m = parseInt(val);
      if (m >= 1 && m <= 12) {
        yearRef.current?.focus();
      }
    }
    
    updateParent(dayVal, val, yearVal);
  };

  // Handle year input
  const handleYearChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 4);
    setYearVal(val);
    updateParent(dayVal, monthVal, val);
  };

  // Handle backspace to go back
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, field: 'day' | 'month' | 'year') => {
    const target = e.target as HTMLInputElement;
    
    if (e.key === 'Backspace' && target.value === '') {
      if (field === 'month') {
        dayRef.current?.focus();
      } else if (field === 'year') {
        monthRef.current?.focus();
      }
    }
    
    // Arrow keys navigation
    if (e.key === 'ArrowLeft') {
      if (field === 'month') dayRef.current?.focus();
      if (field === 'year') monthRef.current?.focus();
    }
    if (e.key === 'ArrowRight') {
      if (field === 'day') monthRef.current?.focus();
      if (field === 'month') yearRef.current?.focus();
    }
  };

  // Handle paste
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedText = e.clipboardData.getData('text');
    // Try to parse various date formats
    const cleaned = pastedText.replace(/[^\d]/g, '');
    
    if (cleaned.length >= 6) {
      // Could be DDMMYYYY or YYYYMMDD
      if (cleaned.length === 8) {
        // Try DDMMYYYY first
        const d = cleaned.slice(0, 2);
        const m = cleaned.slice(2, 4);
        const y = cleaned.slice(4, 8);
        
        const dayInt = parseInt(d);
        const monthInt = parseInt(m);
        const yearInt = parseInt(y);
        
        if (dayInt >= 1 && dayInt <= 31 && monthInt >= 1 && monthInt <= 12) {
          setDayVal(d);
          setMonthVal(m);
          setYearVal(y);
          updateParent(d, m, y);
          yearRef.current?.focus();
          return;
        }
        
        // Try YYYYMMDD
        const y2 = cleaned.slice(0, 4);
        const m2 = cleaned.slice(4, 6);
        const d2 = cleaned.slice(6, 8);
        
        const dayInt2 = parseInt(d2);
        const monthInt2 = parseInt(m2);
        const yearInt2 = parseInt(y2);
        
        if (dayInt2 >= 1 && dayInt2 <= 31 && monthInt2 >= 1 && monthInt2 <= 12) {
          setDayVal(d2);
          setMonthVal(m2);
          setYearVal(y2);
          updateParent(d2, m2, y2);
          yearRef.current?.focus();
          return;
        }
      }
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      {label && (
        <Label className="flex items-center gap-2">
          {label}
          {required && <span className="text-destructive">*</span>}
        </Label>
      )}
      
      <div className="flex items-center gap-2" onPaste={handlePaste}>
        {/* Day */}
        <div className="relative">
          <Input
            ref={dayRef}
            type="text"
            inputMode="numeric"
            placeholder="DD"
            value={dayVal}
            onChange={handleDayChange}
            onKeyDown={(e) => handleKeyDown(e, 'day')}
            disabled={disabled}
            maxLength={2}
            className={cn(
              "w-16 text-center text-lg font-medium",
              error && "border-destructive"
            )}
          />
        </div>
        
        <span className="text-xl font-bold text-muted-foreground">/</span>
        
        {/* Month */}
        <div className="relative">
          <Input
            ref={monthRef}
            type="text"
            inputMode="numeric"
            placeholder="MM"
            value={monthVal}
            onChange={handleMonthChange}
            onKeyDown={(e) => handleKeyDown(e, 'month')}
            disabled={disabled}
            maxLength={2}
            className={cn(
              "w-16 text-center text-lg font-medium",
              error && "border-destructive"
            )}
          />
        </div>
        
        <span className="text-xl font-bold text-muted-foreground">/</span>
        
        {/* Year */}
        <div className="relative">
          <Input
            ref={yearRef}
            type="text"
            inputMode="numeric"
            placeholder="YYYY"
            value={yearVal}
            onChange={handleYearChange}
            onKeyDown={(e) => handleKeyDown(e, 'year')}
            disabled={disabled}
            maxLength={4}
            className={cn(
              "w-24 text-center text-lg font-medium",
              error && "border-destructive"
            )}
          />
        </div>
      </div>
      
      {error && (
        <p className="text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
