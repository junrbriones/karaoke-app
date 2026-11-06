// A short, human description of a browser's user-agent string for the
// admin activity log: "Chrome on Windows", "Safari on iPhone", "Samsung TV".
// A rough guide only -- user agents can say anything.

const BROWSERS: [RegExp, string][] = [
  [/Edg(e|A|iOS)?\//, "Edge"],
  [/OPR\/|Opera/, "Opera"],
  [/SamsungBrowser\//, "Samsung Internet"],
  [/Silk\//, "Silk"],
  [/Firefox\/|FxiOS\//, "Firefox"],
  [/Chrome\/|CriOS\//, "Chrome"],
  [/Version\/[\d.]+.*Safari\//, "Safari"],
]

const SYSTEMS: [RegExp, string][] = [
  [/Tizen/i, "Samsung TV"],
  [/Web0S|webOS/i, "LG TV"],
  [/AFT[A-Z]|Fire TV/i, "Fire TV"],
  [/CrKey/, "Chromecast"],
  [/Android TV|GoogleTV|BRAVIA|SMART-TV|SmartTV/i, "smart TV"],
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/CrOS/, "ChromeOS"],
  [/Windows/, "Windows"],
  [/Mac OS X|Macintosh/, "Mac"],
  [/Linux/, "Linux"],
]

export function describeUserAgent(ua: string | null | undefined): string {
  if (!ua) return "Unknown device"
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1]
  const system = SYSTEMS.find(([re]) => re.test(ua))?.[1]
  if (system?.endsWith("TV") || system === "Chromecast") {
    return browser ? `${system} (${browser})` : system
  }
  if (browser && system) return `${browser} on ${system}`
  return browser ?? system ?? "Unknown device"
}

const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" })
const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["week", 7 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
]

// "5 minutes ago", "yesterday", "just now".
export function timeAgo(
  iso: string | null | undefined,
  now = Date.now(),
): string {
  if (!iso) return ""
  const seconds = (new Date(iso).getTime() - now) / 1000
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) {
      return RELATIVE.format(Math.round(seconds / size), unit)
    }
  }
  return "just now"
}
