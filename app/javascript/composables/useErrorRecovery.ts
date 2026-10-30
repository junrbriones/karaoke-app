import { router } from "@inertiajs/vue3"
import { onMounted, onUnmounted } from "vue"
import { toast } from "vue-sonner"

// App-wide safety net for requests that fail without reaching one of the
// app's own error pages:
//
// - No connection, or the server can't be reached at all: a toast instead
//   of nothing happening. A page load gets a "Try again" button; a form
//   that didn't save says so, so nobody assumes their change went through.
// - Going offline / back online: a lasting "You're offline" notice that
//   turns into "Back online" when the connection returns.
// - A response that isn't from the app (a proxy's "502 Bad Gateway", a
//   maintenance page): in production, a toast with a way to retry rather
//   than Inertia's raw-HTML popup. In development the popup stays -- it
//   shows Rails' error details.
//
// Everything the app itself answers with an error status already renders
// as the friendly error page (pages/errors/show.vue), and is left alone.
export function useErrorRecovery() {
  const removers: (() => void)[] = []
  let lastVisit: { method: string; url: string } | null = null

  const savingChange = () => !!lastVisit && lastVisit.method !== "get"

  const retryLastVisit = () => {
    if (lastVisit && lastVisit.method === "get") router.visit(lastVisit.url)
    else window.location.reload()
  }

  const showOffline = (description?: string) =>
    toast.warning("You're offline", {
      id: "connection",
      description:
        description ?? "Changes won't save until you're back online.",
      duration: Infinity,
    })

  const onNetworkError = () => {
    const saving = savingChange()
    if (!navigator.onLine) {
      // One offline notice, not two.
      showOffline(
        saving
          ? "Your change wasn't saved. Try it again once you're back online."
          : undefined,
      )
      return
    }
    toast.error("Couldn't reach JBKaraoke", {
      id: "network",
      description: saving
        ? "Your change wasn't saved. Check your connection, then try it again."
        : "Check your connection and try again.",
      action: saving
        ? undefined
        : { label: "Try again", onClick: retryLastVisit },
      duration: 10000,
    })
  }

  const onForeignErrorResponse = (status: number) => {
    const saving = savingChange()
    const unsaved = saving ? "Your change wasn't saved. " : ""
    let title = "That didn't work"
    let description = `${unsaved}Try again.`
    let canRetry = true
    if (status >= 500) {
      title = "JBKaraoke is having trouble right now"
      description = `${unsaved}Try again in a moment.`
    } else if (status === 404) {
      title = "That page wasn't found"
      description = "The link may be broken."
      canRetry = false
    } else if (status === 419 || status === 422) {
      title = "Your session needs a refresh"
      description = `${unsaved}Reload the page, then try again.`
    }
    toast.error(title, {
      id: "http",
      description,
      action: canRetry
        ? {
            label: saving ? "Reload" : "Try again",
            onClick: saving ? () => window.location.reload() : retryLastVisit,
          }
        : undefined,
      duration: 10000,
    })
  }

  onMounted(() => {
    removers.push(
      router.on("start", (event) => {
        const visit = event.detail.visit
        lastVisit = { method: visit.method, url: visit.url.href }
      }),
    )

    removers.push(
      router.on("networkError", (event) => {
        event.preventDefault()
        onNetworkError()
      }),
    )

    removers.push(
      router.on("httpException", (event) => {
        const response = event.detail.response
        // The app's own error pages render normally.
        if (response.headers?.["x-inertia"] !== undefined) return
        if (import.meta.env.DEV) return
        event.preventDefault()
        onForeignErrorResponse(response.status)
      }),
    )

    const offline = () => showOffline()
    const online = () =>
      toast.success("Back online", {
        id: "connection",
        description: "You're connected again.",
        duration: 3000,
      })
    window.addEventListener("offline", offline)
    window.addEventListener("online", online)
    removers.push(() => {
      window.removeEventListener("offline", offline)
      window.removeEventListener("online", online)
    })
    if (!navigator.onLine) offline()
  })

  onUnmounted(() => removers.forEach((remove) => remove()))
}
