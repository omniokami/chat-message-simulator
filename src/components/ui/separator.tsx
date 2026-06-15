import * as React from "react"
import { cn } from "@/utils/cn"

const Separator = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("h-px w-full bg-[hsl(var(--border))]", className)} {...props} />
  ),
)
Separator.displayName = "Separator"

export { Separator }
