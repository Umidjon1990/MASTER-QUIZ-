import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

const RTL_REGEX = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;
const LTR_REGEX = /[A-Za-z\u0400-\u04FF]/;

export function getTextDir(text: string): "ltr" | "rtl" {
  const hasRtl = RTL_REGEX.test(text);
  const hasLtr = LTR_REGEX.test(text);
  if (hasRtl && hasLtr) return "ltr";
  if (hasRtl) return "rtl";
  return "ltr";
}
