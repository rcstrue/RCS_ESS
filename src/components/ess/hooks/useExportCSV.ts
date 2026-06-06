'use client';

import { useCallback } from 'react';

export function useExportCSV() {
  const exportCSV = useCallback(
    (filename: string, headers: string[], rows: string[][]) => {
      const BOM = '\uFEFF';
      const headerRow = headers.map((h) => `"${h.replace(/"/g, '""')}"`).join(',');
      const dataRows = rows.map((row) =>
        row.map((cell) => `"${(cell ?? '').replace(/"/g, '""')}"`).join(',')
      );
      const csvContent = BOM + [headerRow, ...dataRows].join('\r\n');

      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    },
    []
  );

  return { exportCSV };
}

export default useExportCSV;
