import { Check } from 'lucide-react';
import { STEPS, type RegistrationStep } from '@/types/registration';
import { cn } from '@/lib/utils';

interface StepIndicatorProps {
  currentStep: RegistrationStep;
  completedSteps: Set<number>;
}

export function StepIndicator({ currentStep, completedSteps }: StepIndicatorProps) {
  return (
    <div className="w-full px-3 py-2">
      {/* Mobile view - compact */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-medium text-foreground">
            Step {currentStep}/{STEPS.length}
          </span>
          <span className="text-xs text-muted-foreground">
            {STEPS[currentStep - 1].shortTitle}
          </span>
        </div>
        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
            style={{ width: `${(currentStep / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop view - full steps */}
      <div className="hidden md:flex items-center justify-between">
        {STEPS.map((step, index) => {
          const isCompleted = completedSteps.has(step.id);
          const isCurrent = currentStep === step.id;
          const isPending = !isCompleted && !isCurrent;

          return (
            <div key={step.id} className="flex items-center flex-1">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'step-indicator',
                    isCompleted && 'step-indicator-completed',
                    isCurrent && 'step-indicator-active',
                    isPending && 'step-indicator-pending'
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    step.id
                  )}
                </div>
                <span
                  className={cn(
                    'mt-2 text-xs font-medium text-center',
                    isCurrent ? 'text-primary' : 'text-muted-foreground'
                  )}
                >
                  {step.shortTitle}
                </span>
              </div>
              {index < STEPS.length - 1 && (
                <div
                  className={cn(
                    'flex-1 h-0.5 mx-2 transition-colors duration-300',
                    completedSteps.has(step.id) ? 'bg-success' : 'bg-muted'
                  )}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
