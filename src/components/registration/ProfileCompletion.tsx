import { cn } from '@/lib/utils';

interface ProfileCompletionProps {
  percentage: number;
  className?: string;
}

export function ProfileCompletion({ percentage, className }: ProfileCompletionProps) {
  const getColor = () => {
    if (percentage >= 80) return 'text-green-500';
    if (percentage >= 50) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getBgColor = () => {
    if (percentage >= 80) return 'bg-green-500';
    if (percentage >= 50) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <div className="relative w-10 h-10">
        <svg className="w-10 h-10 transform -rotate-90">
          <circle
            cx="20"
            cy="20"
            r="16"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            className="text-muted/30"
          />
          <circle
            cx="20"
            cy="20"
            r="16"
            stroke="currentColor"
            strokeWidth="3"
            fill="none"
            strokeDasharray={100}
            strokeDashoffset={100 - percentage}
            className={cn('transition-all duration-500', getColor())}
            strokeLinecap="round"
          />
        </svg>
        <span className={cn('absolute inset-0 flex items-center justify-center text-xs font-bold', getColor())}>
          {percentage}%
        </span>
      </div>
      <div className="hidden sm:block">
        <p className="text-xs text-muted-foreground">Profile</p>
        <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className={cn('h-full transition-all duration-500', getBgColor())}
            style={{ width: `${percentage}%` }}
          />
        </div>
      </div>
    </div>
  );
}
