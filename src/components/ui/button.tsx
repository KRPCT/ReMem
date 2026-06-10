"use client"

import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // base: `transition-all` (was `transition-colors`) so the :active
  // translate-y-px feels tactile. The :active 1px push is applied
  // uniformly to every variant so every button has a consistent
  // "press" feedback regardless of color/glass treatment.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Primary: solid brand. Selected (aria-pressed=true) state
        // switches to a frosted glass surface — gives the user a
        // strong "I picked this" affordance, and keeps the text
        // crisp (foreground color) instead of dropping contrast on
        // a darker pressed brand.
        default: cn(
          "bg-primary text-primary-foreground shadow",
          "hover:bg-primary/90 hover:shadow-md",
          "aria-[pressed=true]:glass-card aria-[pressed=true]:text-foreground aria-[pressed=true]:border aria-[pressed=true]:border-brand aria-[pressed=true]:shadow-inner"
        ),
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90",
        outline: cn(
          "border border-input bg-background shadow-sm",
          "hover:bg-accent hover:text-accent-foreground"
        ),
        // Secondary: glassy by default — more subtle than the solid
        // primary, used for in-form secondary actions.
        secondary: cn(
          "glass-card text-foreground",
          "hover:bg-card/60"
        ),
        ghost: "hover:bg-accent hover:text-accent-foreground active:bg-accent/60",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2",
        sm: "h-8 rounded-xl px-3 text-xs",
        // `lg` bumped to 44px so hero CTAs / primary submit buttons
        // meet the WCAG / Apple HIG tap-target minimum on every
        // viewport (no need to override with `h-11` in form code).
        lg: "h-11 rounded-xl px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
