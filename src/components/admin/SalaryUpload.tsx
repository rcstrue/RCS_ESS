import { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import {
  Download,
  Upload,
  FileSpreadsheet,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Trash2,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { apiRequest } from '@/lib/api/config';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface SalaryRow {
  /** Index from the original upload (1-based, used for display) */
  rowIndex: number;
  employeeId: string;
  employeeName: string;
  amount: number;
  month: number;
  year: number;
  date: string;
  remarks: string;
  /** Auto-calculated: sum of amounts for same employee from previous rows */
  carryForward: number;
  /** Per-row validation errors (empty = valid) */
  errors: string[];
}

interface SummaryStats {
  totalRows: number;
  totalAmount: number;
  errorRows: number;
  validRows: number;
}

const TEMPLATE_HEADERS = [
  'Employee ID',
  'Employee Name',
  'Amount',
  'Month',
  'Year',
  'Date',
  'Remarks',
  'Carry Forward (Auto-calculated)',
] as const;

const MONTH_NAMES = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

/** Normalise a header string to a comparable key (lowercase, no extra spaces) */
function headerToKey(raw: string): string {
  return String(raw).trim().toLowerCase();
}

/** Case-insensitive column mapping */
function buildColumnMap(headers: string[]): Record<string, number> {
  const map: Record<string, number> = {};
  headers.forEach((h, idx) => {
    const key = headerToKey(h);
    if (key.includes('employee') && key.includes('id')) map.employeeId = idx;
    else if (key.includes('employee') && key.includes('name')) map.employeeName = idx;
    else if (key === 'amount') map.amount = idx;
    else if (key === 'month') map.month = idx;
    else if (key === 'year') map.year = idx;
    else if (key === 'date') map.date = idx;
    else if (key === 'remarks' || key === 'remark') map.remarks = idx;
    // carry forward is auto-calculated; we ignore any data in that column
  });
  return map;
}

/** Validate a single parsed row */
function validateRow(
  row: Omit<SalaryRow, 'carryForward' | 'errors' | 'rowIndex'>,
  rowIdx: number
): string[] {
  const errors: string[] = [];

  if (!row.employeeId || String(row.employeeId).trim() === '') {
    errors.push('Employee ID is required');
  }

  if (row.amount === undefined || row.amount === null || isNaN(row.amount)) {
    errors.push('Amount must be a valid number');
  } else if (row.amount <= 0) {
    errors.push('Amount must be a positive number');
  }

  if (row.month === undefined || row.month === null || isNaN(row.month)) {
    errors.push('Month is required');
  } else if (!Number.isInteger(row.month) || row.month < 1 || row.month > 12) {
    errors.push('Month must be 1–12');
  }

  if (row.year === undefined || row.year === null || isNaN(row.year)) {
    errors.push('Year is required');
  } else {
    const y = Number(row.year);
    if (!Number.isInteger(y) || y < 1900 || y > 2100 || String(y).length !== 4) {
      errors.push('Year must be a valid 4-digit number');
    }
  }

  if (!row.date || String(row.date).trim() === '') {
    errors.push('Date is required');
  }

  return errors;
}

/** Parse raw XLSX worksheet into salary rows (with validation & carry-forward) */
function parseSheetToRows(worksheet: XLSX.WorkSheet): SalaryRow[] {
  // Convert sheet to array of arrays (each sub-array is a row)
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(worksheet, {
    header: 1,
    defval: '',
  });

  if (rawData.length < 2) return []; // need at least header + 1 data row

  // First row = headers
  const headerRow = rawData[0].map(String);
  const colMap = buildColumnMap(headerRow);

  // Track cumulative amounts per employee for carry-forward calculation
  const carryForwardMap = new Map<string, number>();

  const rows: SalaryRow[] = [];

  for (let i = 1; i < rawData.length; i++) {
    const raw = rawData[i] as (string | number | boolean | null | undefined)[];
    if (!raw || raw.every((cell) => cell === '' || cell === null || cell === undefined)) {
      continue; // skip completely empty rows
    }

    const getCell = (idx?: number): string => {
      if (idx === undefined) return '';
      const val = raw[idx];
      if (val === null || val === undefined) return '';
      return String(val).trim();
    };

    const rawRow: Omit<SalaryRow, 'carryForward' | 'errors' | 'rowIndex'> = {
      employeeId: getCell(colMap.employeeId),
      employeeName: getCell(colMap.employeeName),
      amount: Number(getCell(colMap.amount)) || 0,
      month: Number(getCell(colMap.month)) || 0,
      year: Number(getCell(colMap.year)) || 0,
      date: getCell(colMap.date),
      remarks: getCell(colMap.remarks),
    };

    const errors = validateRow(rawRow, i);

    // Calculate carry-forward regardless of validation errors (still useful)
    const empId = rawRow.employeeId.trim();
    const prevTotal = carryForwardMap.get(empId) ?? 0;
    const carryForward = prevTotal;
    // Only accumulate if the row has no errors
    if (errors.length === 0) {
      carryForwardMap.set(empId, prevTotal + rawRow.amount);
    }

    rows.push({
      rowIndex: i,
      ...rawRow,
      carryForward,
      errors,
    });
  }

  return rows;
}

function computeSummary(rows: SalaryRow[]): SummaryStats {
  const errorRows = rows.filter((r) => r.errors.length > 0).length;
  const totalAmount = rows.reduce((sum, r) => sum + (r.errors.length === 0 ? r.amount : 0), 0);
  return {
    totalRows: rows.length,
    totalAmount,
    errorRows,
    validRows: rows.length - errorRows,
  };
}

// ──────────────────────────────────────────────
// Template Generation
// ──────────────────────────────────────────────

function downloadTemplate(): void {
  const wb = XLSX.utils.book_new();

  // Header row
  const headers = [...TEMPLATE_HEADERS];
  const sampleData = [
    ['EMP-101', 'Rahul Sharma', 5000, 1, 2025, '2025-01-31', 'January salary', ''],
    ['EMP-101', 'Rahul Sharma', 3000, 2, 2025, '2025-02-28', 'February bonus', ''],
    ['EMP-102', 'Priya Patel', 2000, 1, 2025, '2025-01-31', 'January salary', ''],
  ];

  const wsData = [headers, ...sampleData];
  const ws = XLSX.utils.aoa_to_sheet(wsData);

  // Column widths
  ws['!cols'] = [
    { wch: 16 }, // Employee ID
    { wch: 22 }, // Employee Name
    { wch: 14 }, // Amount
    { wch: 10 }, // Month
    { wch: 10 }, // Year
    { wch: 14 }, // Date
    { wch: 24 }, // Remarks
    { wch: 28 }, // Carry Forward
  ];

  // Freeze top row
  ws['!freeze'] = { xSplit: 0, ySplit: 1 };

  // Style the header row via cell objects (xlsx community edition supports basic props)
  const headerStyle: Partial<XLSX.CellObject> = {
    bold: true,
    fill: { fgColor: { rgb: 'C6EFCE' } }, // light green background
    alignment: { horizontal: 'center', vertical: 'center' },
  };

  for (let c = 0; c < headers.length; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (ws[addr]) {
      ws[addr].s = headerStyle;
    }
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Salary Upload');
  XLSX.writeFile(wb, 'Salary_Upload_Template.xlsx');
}

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function SalaryUpload() {
  // ── State ──────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [parsedRows, setParsedRows] = useState<SalaryRow[]>([]);
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ─────────────────────────
  const processFile = useCallback((file: File) => {
    if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
      toast.error('Invalid file type. Please upload an XLSX file.');
      return;
    }

    setSelectedFile(file);
    setParseError(null);
    setParsedRows([]);
    setSummary(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });

        // Use the first sheet
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const rows = parseSheetToRows(worksheet);
        if (rows.length === 0) {
          setParseError(
            'No valid data rows found. Please check your file uses the correct template format.'
          );
          toast.error('No valid data rows found in the uploaded file.');
          return;
        }

        setParsedRows(rows);
        setSummary(computeSummary(rows));

        const errCount = rows.filter((r) => r.errors.length > 0).length;
        if (errCount > 0) {
          toast.warning(
            `Parsed ${rows.length} rows. ${errCount} row(s) have validation errors.`
          );
        } else {
          toast.success(`Successfully parsed ${rows.length} rows.`);
        }
      } catch (err) {
        console.error('Parse error:', err);
        setParseError('Failed to parse the uploaded file. Please ensure it is a valid XLSX.');
        toast.error('Failed to parse the file.');
      }
    };
    reader.onerror = () => {
      setParseError('Failed to read the file.');
      toast.error('File read error.');
    };
    reader.readAsArrayBuffer(file);
  }, []);

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // Drag & drop handlers
  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragging(false);
      const file = e.dataTransfer.files?.[0];
      if (file) processFile(file);
    },
    [processFile]
  );

  // ── Clear / Reset ─────────────────────────
  const handleClear = useCallback(() => {
    setSelectedFile(null);
    setParsedRows([]);
    setSummary(null);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    toast.info('Upload data cleared.');
  }, []);

  // ── Submit ─────────────────────────────────
  const handleSubmit = useCallback(async () => {
    if (parsedRows.length === 0) {
      toast.error('No data to submit.');
      return;
    }

    const validRows = parsedRows.filter((r) => r.errors.length === 0);
    if (validRows.length === 0) {
      toast.error('Cannot submit — all rows have validation errors.');
      return;
    }

    setIsSubmitting(true);

    try {
      // Build payload: only send valid rows, omitting internal fields
      const payload = validRows.map((r) => ({
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        amount: r.amount,
        month: r.month,
        year: r.year,
        date: r.date,
        remarks: r.remarks,
        carryForward: r.carryForward,
      }));

      const { data, error } = await apiRequest<{ success?: boolean; message?: string }>(
        '/ess/salary-upload.php',
        {
          method: 'POST',
          body: JSON.stringify({ rows: payload }),
        }
      );

      if (error) {
        toast.error(error);
        return;
      }

      toast.success(
        data?.message || `Successfully submitted ${validRows.length} salary records.`
      );
      // Optionally clear after success
      handleClear();
    } catch {
      toast.error('An unexpected error occurred while submitting.');
    } finally {
      setIsSubmitting(false);
    }
  }, [parsedRows, handleClear]);

  // ── Derived booleans ──────────────────────
  const hasData = parsedRows.length > 0;
  const hasErrors = summary ? summary.errorRows > 0 : false;
  const canSubmit = hasData && summary ? summary.validRows > 0 : false;

  // ── Format helpers ───────────────────────
  const formatCurrency = (val: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(
      val
    );

  // ──────────────────────────────────────────
  // Render
  // ──────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
          <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
          Salary Upload
        </h1>
        <p className="text-muted-foreground mt-1">
          Download the template, fill in salary data, and upload to process bulk payments.
        </p>
      </div>

      {/* Template Download Card */}
      <Card className="mb-6">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Step 1 — Download Template</CardTitle>
          <CardDescription>
            Download the Excel template with the required columns, fill in the salary data,
            then upload below.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={downloadTemplate} className="gap-2">
            <Download className="w-4 h-4" />
            Download Template (.xlsx)
          </Button>
        </CardContent>
      </Card>

      {/* Upload Card */}
      <Card className="mb-6 flex-1 flex flex-col">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Step 2 — Upload File</CardTitle>
          <CardDescription>
            Drag & drop or click to select your completed XLSX file.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col">
          {/* Drop Zone */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Upload salary file"
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
            className={`
              relative flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed
              p-8 text-center cursor-pointer transition-all duration-200
              ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30'
                  : 'border-muted-foreground/25 hover:border-emerald-400 hover:bg-muted/50'
              }
            `}
          >
            <Upload
              className={`w-10 h-10 ${isDragging ? 'text-emerald-600' : 'text-muted-foreground/60'}`}
            />
            <div>
              {selectedFile ? (
                <div className="flex flex-col items-center gap-1">
                  <p className="font-medium text-emerald-700 dark:text-emerald-400">
                    {selectedFile.name}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {(selectedFile.size / 1024).toFixed(1)} KB — Click or drop to replace
                  </p>
                </div>
              ) : (
                <>
                  <p className="font-medium">
                    Drag & drop your XLSX file here
                  </p>
                  <p className="text-sm text-muted-foreground">
                    or click to browse — only .xlsx files accepted
                  </p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleFileChange}
              className="hidden"
            />
          </div>

          {/* Parse Error */}
          {parseError && (
            <Alert variant="destructive" className="mt-4">
              <AlertCircle className="w-4 h-4" />
              <AlertTitle>Parse Error</AlertTitle>
              <AlertDescription>{parseError}</AlertDescription>
            </Alert>
          )}

          {/* Summary Stats */}
          {summary && (
            <div className="mt-6">
              <Separator className="mb-4" />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Total Rows
                  </p>
                  <p className="text-xl font-bold mt-1">{summary.totalRows}</p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Total Amount
                  </p>
                  <p className="text-xl font-bold mt-1 text-emerald-600">
                    {formatCurrency(summary.totalAmount)}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Valid Rows
                  </p>
                  <p className="text-xl font-bold mt-1 text-blue-600">
                    {summary.validRows}
                  </p>
                </div>
                <div className="rounded-lg border bg-card p-3 text-center">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    Error Rows
                  </p>
                  <p className={`text-xl font-bold mt-1 ${summary.errorRows > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                    {summary.errorRows}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Preview Table */}
          {hasData && (
            <div className="mt-6 flex-1">
              <Separator className="mb-4" />
              <h3 className="text-base font-semibold mb-3">Data Preview</h3>

              {hasErrors && (
                <Alert variant="destructive" className="mb-4">
                  <AlertCircle className="w-4 h-4" />
                  <AlertTitle>Validation Errors Detected</AlertTitle>
                  <AlertDescription>
                    {summary?.errorRows} row(s) contain errors and will be excluded from
                    submission. Fix the highlighted rows and re-upload, or submit the valid
                    rows only.
                  </AlertDescription>
                </Alert>
              )}

              <div className="rounded-lg border overflow-hidden">
                <div className="max-h-[420px] overflow-y-auto overflow-x-auto custom-scrollbar">
                  <Table>
                    <TableHeader className="sticky top-0 z-10 bg-background">
                      <TableRow>
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead className="min-w-[100px]">Employee ID</TableHead>
                        <TableHead className="min-w-[140px]">Employee Name</TableHead>
                        <TableHead className="min-w-[100px] text-right">Amount</TableHead>
                        <TableHead className="min-w-[80px] text-center">Month</TableHead>
                        <TableHead className="min-w-[70px] text-center">Year</TableHead>
                        <TableHead className="min-w-[110px]">Date</TableHead>
                        <TableHead className="min-w-[140px]">Remarks</TableHead>
                        <TableHead className="min-w-[120px] text-right bg-emerald-100 dark:bg-emerald-950/50">
                          Carry Forward
                        </TableHead>
                        <TableHead className="min-w-[50px] text-center">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {parsedRows.map((row, idx) => {
                        const isErr = row.errors.length > 0;
                        return (
                          <TableRow
                            key={row.rowIndex}
                            className={`
                              ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/40'}
                              ${isErr ? 'bg-red-50 dark:bg-red-950/20' : ''}
                            `}
                          >
                            <TableCell className="text-center text-muted-foreground text-xs">
                              {row.rowIndex}
                            </TableCell>
                            <TableCell className="font-medium">{row.employeeId || '—'}</TableCell>
                            <TableCell>{row.employeeName || '—'}</TableCell>
                            <TableCell className="text-right font-mono">
                              {formatCurrency(row.amount)}
                            </TableCell>
                            <TableCell className="text-center">
                              {row.month >= 1 && row.month <= 12
                                ? MONTH_NAMES[row.month]
                                : String(row.month || '—')}
                            </TableCell>
                            <TableCell className="text-center">{row.year || '—'}</TableCell>
                            <TableCell>{row.date || '—'}</TableCell>
                            <TableCell className="max-w-[180px] truncate">
                              {row.remarks || '—'}
                            </TableCell>
                            <TableCell
                              className="text-right font-mono bg-emerald-100 dark:bg-emerald-950/50 font-semibold"
                              title={`₹${row.carryForward.toLocaleString('en-IN')}`}
                            >
                              {formatCurrency(row.carryForward)}
                            </TableCell>
                            <TableCell className="text-center">
                              {isErr ? (
                                <Badge
                                  variant="destructive"
                                  className="text-[10px] px-1.5"
                                >
                                  Error
                                </Badge>
                              ) : (
                                <Badge className="bg-emerald-600 hover:bg-emerald-700 text-[10px] px-1.5">
                                  <CheckCircle2 className="w-3 h-3 mr-0.5" />
                                  OK
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {/* Row-level errors detail */}
              {hasErrors && (
                <div className="mt-4 space-y-2">
                  <h4 className="text-sm font-semibold text-red-600 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4" />
                    Row-Level Errors
                  </h4>
                  <div className="max-h-48 overflow-y-auto rounded-lg border bg-card p-3 space-y-2">
                    {parsedRows
                      .filter((r) => r.errors.length > 0)
                      .map((r) => (
                        <div
                          key={r.rowIndex}
                          className="flex items-start gap-2 text-sm"
                        >
                          <Badge variant="destructive" className="shrink-0 text-[10px] px-1.5 mt-0.5">
                            Row {r.rowIndex}
                          </Badge>
                          <span className="text-red-700 dark:text-red-400">
                            {r.errors.join(' · ')}
                            {r.employeeId ? ` (Employee ID: ${r.employeeId})` : ''}
                          </span>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>

        {/* Sticky Footer with Actions */}
        {hasData && (
          <CardFooter className="border-t bg-muted/30 px-6 py-4 sticky bottom-0 z-20">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between w-full gap-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {hasErrors && (
                  <span className="text-red-600 font-medium">
                    {summary?.errorRows} row(s) with errors will be skipped.
                  </span>
                )}
                {!hasErrors && (
                  <span className="text-emerald-600 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-4 h-4" />
                    All rows validated — ready to submit.
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" onClick={handleClear} className="gap-2">
                  <Trash2 className="w-4 h-4" />
                  Clear
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={!canSubmit || isSubmitting}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Submitting…
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Submit {summary?.validRows ?? 0} Row(s)
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
