import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";
type Props = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary"|"secondary"|"ghost"|"danger"; size?: "default"|"sm"; children: ReactNode };
export function Button({variant="primary",size="default",className,children,...props}:Props){return <button className={cn("vf-button",variant,size==="sm"&&"sm",className)} {...props}>{children}</button>}
