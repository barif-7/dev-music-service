const LANGUAGES = [
  ["en", "English", "ltr"],
  ["es", "Español", "ltr"],
  ["fr", "Français", "ltr"],
  ["pt", "Português", "ltr"],
  ["de", "Deutsch", "ltr"],
  ["it", "Italiano", "ltr"],
  ["nl", "Nederlands", "ltr"],
  ["pl", "Polski", "ltr"],
  ["ru", "Русский", "ltr"],
  ["tr", "Türkçe", "ltr"],
  ["id", "Bahasa Indonesia", "ltr"],
  ["ms", "Bahasa Melayu", "ltr"],
  ["sw", "Kiswahili", "ltr"],
  ["zh", "中文", "ltr"],
  ["ja", "日本語", "ltr"],
  ["ko", "한국어", "ltr"],
  ["hi", "हिन्दी", "ltr"],
  ["bn", "বাংলা", "ltr"],
  ["pa", "ਪੰਜਾਬੀ", "ltr"],
  ["ar", "العربية", "rtl"],
  ["he", "עברית", "rtl"],
  ["fa", "فارسی", "rtl"],
  ["ur", "اردو", "rtl"],
].map(([code, name, dir]) => ({ code, name, dir }));

const BY_CODE = Object.fromEntries(LANGUAGES.map((language) => [language.code, language]));

function baseCode(locale) {
  return String(locale || "").trim().toLowerCase().split("-")[0];
}

export function getLanguage(locale, fallbackName = "Original") {
  const code = baseCode(locale);
  return BY_CODE[code] || { code: code || "und", name: fallbackName, dir: "ltr" };
}

export function isRTL(locale) {
  return getLanguage(locale).dir === "rtl";
}

export { LANGUAGES };
