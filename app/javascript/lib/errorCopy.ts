// What the error page says for each status, and which nearby pages to offer
// as a way back -- worked out from the address that failed, so a missing
// song points back to the songs list, a missing setlist to its group, etc.

export interface ErrorCopy {
  title: string
  message: string
}

export interface RecoveryLink {
  label: string
  href: string
}

const GENERIC: Record<number, ErrorCopy> = {
  400: {
    title: "That request didn't work",
    message:
      "Something about that link or form wasn't quite right. Go back and try it again.",
  },
  401: {
    title: "Please sign in",
    message: "You need to be signed in to see this page.",
  },
  403: {
    title: "You don't have access to this",
    message:
      "It may belong to a group you're not in, or need an admin. Ask the group's owner or an admin to add you.",
  },
  404: {
    title: "We couldn't find that page",
    message:
      "The link may be broken, or the page may have been moved or deleted.",
  },
  406: {
    title: "Your browser isn't supported",
    message:
      "JBKaraoke needs an up-to-date browser. Update this one, or open the app in a newer browser.",
  },
  408: {
    title: "That took too long",
    message: "The server didn't answer in time. Try again.",
  },
  409: {
    title: "That changed while you were working",
    message:
      "Someone else may have updated it. Go back, refresh, and try your change again.",
  },
  413: {
    title: "That file is too big",
    message: "Try a smaller file — audio uploads can be up to 30MB.",
  },
  422: {
    title: "That change couldn't be saved",
    message:
      "The form may have been out of date, or your session expired. Go back, refresh the page, and try again.",
  },
  429: {
    title: "Slow down a moment",
    message:
      "That was a lot of requests in a short time. Wait a few seconds and try again.",
  },
  500: {
    title: "Something went wrong on our side",
    message:
      "It's not you. Try again — and if it keeps happening, send the error reference below to your admin.",
  },
  502: {
    title: "JBKaraoke is taking a short break",
    message:
      "The server is restarting or busy. This usually clears up in a moment.",
  },
  503: {
    title: "JBKaraoke is taking a short break",
    message:
      "The server is restarting, updating, or busy. This usually clears up in a moment.",
  },
  504: {
    title: "JBKaraoke is taking a short break",
    message:
      "The server didn't answer in time. This usually clears up in a moment.",
  },
}

function fallback(status: number): ErrorCopy {
  return status >= 500
    ? GENERIC[500]
    : {
        title: "That didn't work",
        message:
          "Something went wrong with that request. Go back and try again.",
      }
}

function segments(path: string): string[] {
  return path.split(/[?#]/)[0].split("/").filter(Boolean)
}

// A 404 says what's probably missing, based on the address.
export function errorCopy(status: number, path: string): ErrorCopy {
  const base = GENERIC[status] ?? fallback(status)
  if (status !== 404) return base
  const [first, , third, , fifth] = segments(path)
  if (first === "songs") {
    return {
      title: "We couldn't find that song",
      message:
        "It may have been deleted or renamed, or it hasn't been shared with you.",
    }
  }
  if (first === "groups" && third === "setlists" && fifth !== undefined) {
    return {
      title: "We couldn't find that page",
      message: "That setlist page doesn't exist, or the setlist was deleted.",
    }
  }
  if (first === "groups" && third === "setlists") {
    return {
      title: "We couldn't find that setlist",
      message:
        "It may have been deleted, or it's in a group you're not part of.",
    }
  }
  if (first === "groups") {
    return {
      title: "We couldn't find that group",
      message: "It may have been deleted, or you're not a member of it.",
    }
  }
  return base
}

// Nearby pages that most likely still exist, most specific first.
export function recoveryLinks(path: string): RecoveryLink[] {
  const [first, second, third, fourth] = segments(path)
  const links: RecoveryLink[] = []
  if (first === "songs") {
    links.push({ label: "All songs", href: "/songs" })
  } else if (first === "groups" && second) {
    if (third === "setlists" && fourth) {
      links.push({ label: "Setlists", href: `/groups/${second}/setlists` })
    }
    links.push({ label: "Group page", href: `/groups/${second}` })
    links.push({ label: "All groups", href: "/groups" })
  } else if (first === "groups") {
    links.push({ label: "Songs", href: "/songs" })
  } else if (first === "settings") {
    links.push({ label: "Settings", href: "/settings/profile" })
  } else if (first === "admin") {
    links.push({ label: "Admin", href: "/admin/users" })
  }
  // Never offer the page that just failed.
  const here = `/${segments(path).join("/")}`
  return links.filter((link) => link.href !== here)
}

export function isRetryable(status: number): boolean {
  return status >= 500 || status === 408 || status === 429
}

// Server restarting/busy: worth retrying on its own.
export function autoRetrySeconds(status: number): number | null {
  return status === 502 || status === 503 || status === 504 ? 20 : null
}
