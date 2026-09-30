import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("vf-input", className)} {...props} />;
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("vf-select", className)} {...props}>{children}</select>;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("vf-input", className)} style={{ height: "auto", minHeight: "88px", padding: "10px 11px", resize: "vertical" }} {...props} />;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="vf-field"><span className="vf-field-label">{label}</span>{children}</label>;
}
