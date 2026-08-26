import { isRTL } from "./languages";

const RTL_RANGES = /[\u0590-\u05FF\u0600-\u06FF\u0700-\u074F\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/;

export function detectDir(text, locale) {
  if (locale) return isRTL(locale) ? "rtl" : "ltr";
  if (!text) return "ltr";
  let rtl = 0;
  let ltr = 0;
  for (const character of text) {
    if (RTL_RANGES.test(character)) rtl += 1;
    else if (/[A-Za-z\u00C0-\u024F]/.test(character)) ltr += 1;
  }
  return rtl > ltr ? "rtl" : "ltr";
}

export async function copyText(text) {
  if (!text) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
