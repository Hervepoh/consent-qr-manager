import * as React from "react"
import { cn } from "../../lib/utils"
import { Check } from "lucide-react"

export interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  checked?: boolean;
  onCheckedChange?: (checked: boolean) => void;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, checked, onCheckedChange, children, ...props }, ref) => {
    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      onCheckedChange?.(e.target.checked);
    };

    return (
      <div className="flex items-center gap-3 group cursor-pointer">
        <div className="relative flex items-center justify-center">
          <input
            type="checkbox"
            ref={ref}
            checked={checked}
            onChange={handleChange}
            className={cn(
              "peer h-5 w-5 appearance-none rounded border-2 border-primary bg-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 checked:bg-primary",
              className
            )}
            {...props}
          />
          <Check 
            className="absolute h-3.5 w-3.5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100 pointer-events-none" 
            strokeWidth={4}
          />
        </div>
        {children && (
          <span className="text-xs font-semibold text-muted-foreground group-hover:text-foreground transition-colors select-none">
            {children}
          </span>
        )}
      </div>
    );
  }
)
Checkbox.displayName = "Checkbox"

export { Checkbox }
