'use client';

import { ChevronRight } from 'lucide-react';

// ══════════════════════════════════════════════════════════════
// PageHeader Component
// ══════════════════════════════════════════════════════════════

export default function PageHeader({
  title,
  subtitle,
  onBack,
}: {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      {onBack && (
        <button
          onClick={onBack}
          className="flex items-center justify-center w-9 h-9 rounded-lg bg-white border shadow-sm hover:bg-gray-50 shrink-0 mt-0.5"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
        </button>
      )}
      <div>
        <h1 className="text-xl font-bold text-gray-900">{title}</h1>
        {subtitle && <p className="text-sm text-gray-500">{subtitle}</p>}
      </div>
    </div>
  );
}
