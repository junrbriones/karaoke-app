<script setup lang="ts">
import { Head, Link, useForm } from "@inertiajs/vue3"
import { Check, Copy, KeyRound, LoaderCircle } from "lucide-vue-next"
import { computed, onMounted, ref } from "vue"

import PasswordGenerator from "@/components/admin/PasswordGenerator.vue"
import { Button } from "@/components/ui/button"
import { Field, FieldError, FieldLabel } from "@/components/ui/field"
import AppLayout from "@/layouts/AppLayout.vue"
import { adminUserPasswords, adminUsers, signIn } from "@/routes"
import type { BreadcrumbItem } from "@/types"

interface TargetUser {
  id: number
  name: string
  email: string
  admin: boolean
  must_change_password: boolean
  sessions_count: number
}

const props = defineProps<{ user: TargetUser; is_self: boolean }>()

const breadcrumbs: BreadcrumbItem[] = [
  { title: "Admin", href: adminUsers.index().url },
  { title: "Users", href: adminUsers.index().url },
  {
    title: `${props.user.name}: password`,
    href: adminUserPasswords.edit({ user_id: props.user.id }).url,
  },
]

const form = useForm({
  password: "",
  must_change_password: !props.is_self,
})

const generator = ref<InstanceType<typeof PasswordGenerator> | null>(null)
// Start with a fresh random one, ready to use (it can be replaced).
onMounted(() => generator.value?.generate())

// After saving: what to pass on (kept only on this screen).
const done = ref<{ password: string; mustChange: boolean } | null>(null)

function submit() {
  const password = form.password
  const mustChange = form.must_change_password
  form.patch(adminUserPasswords.update({ user_id: props.user.id }).url, {
    preserveScroll: true,
    preserveState: true,
    onSuccess: () => {
      done.value = { password, mustChange }
      form.reset("password")
    },
  })
}

const signInUrl = computed(() =>
  typeof window === "undefined"
    ? signIn().url
    : new URL(signIn().url, window.location.origin).toString(),
)
const message = computed(() => {
  if (!done.value) return ""
  return [
    `Hi ${props.user.name}, your JBKaraoke password has been reset.`,
    `Sign in at ${signInUrl.value}`,
    `Email: ${props.user.email}`,
    `Password: ${done.value.password}`,
    done.value.mustChange
      ? "You'll be asked to choose your own password right after signing in."
      : "",
  ]
    .filter(Boolean)
    .join("\n")
})

const copied = ref<"password" | "message" | null>(null)
async function copy(what: "password" | "message") {
  const text = what === "password" ? done.value?.password : message.value
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    copied.value = what
    setTimeout(() => (copied.value = null), 1500)
  } catch {
    // No clipboard here: it's on screen to copy by hand.
  }
}
</script>

<template>
  <Head :title="`Password for ${user.name}`" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="flex max-w-xl flex-col gap-5 p-4">
      <div>
        <h1 class="flex items-center gap-2 text-2xl font-bold">
          <KeyRound class="size-6" />
          Set a new password
        </h1>
        <p class="text-muted-foreground mt-1">
          for
          <span class="text-foreground font-medium">{{ user.name }}</span>
          &middot; {{ user.email }}
        </p>
      </div>

      <!-- saved: what to pass on -->
      <section
        v-if="done"
        class="flex flex-col gap-3 rounded-xl border border-green-600/40 bg-green-600/5 p-4"
        aria-live="polite"
      >
        <p class="text-sm font-medium">
          Done &mdash; {{ user.name }}'s password has been changed<template
            v-if="!is_self"
          >
            and they've been signed out everywhere</template
          >. Give them this password:
        </p>
        <div class="flex items-center gap-2">
          <code
            class="bg-background flex-1 rounded-md border px-3 py-2 font-mono text-lg tracking-wide break-all select-all"
            >{{ done.password }}</code
          >
          <Button
            type="button"
            variant="outline"
            size="icon"
            :aria-label="copied === 'password' ? 'Copied' : 'Copy password'"
            @click="copy('password')"
          >
            <Check v-if="copied === 'password'" class="size-4 text-green-600" />
            <Copy v-else class="size-4" />
          </Button>
        </div>
        <details class="text-sm">
          <summary class="cursor-pointer select-none">
            A message to send them
          </summary>
          <pre
            class="bg-background mt-2 rounded-md border p-3 font-sans text-sm whitespace-pre-wrap"
            >{{ message }}</pre>
          <Button
            type="button"
            variant="outline"
            size="sm"
            class="mt-2"
            @click="copy('message')"
          >
            <Check v-if="copied === 'message'" class="size-4 text-green-600" />
            <Copy v-else class="size-4" />
            {{ copied === "message" ? "Copied" : "Copy message" }}
          </Button>
        </details>
        <p class="text-muted-foreground text-xs">
          This password isn't shown again once you leave this page. Send it
          somewhere only they will see it.
        </p>
        <div class="flex gap-2">
          <Link :href="adminUsers.index()">
            <Button type="button">Back to users</Button>
          </Link>
          <Button
            type="button"
            variant="outline"
            @click="
              () => {
                done = null
                generator?.generate()
              }
            "
          >
            Set another
          </Button>
        </div>
      </section>

      <form v-show="!done" class="flex flex-col gap-5" @submit.prevent="submit">
        <p class="text-muted-foreground text-sm">
          For when someone has forgotten their password and there's no email to
          send a reset link with. Set a new one here &mdash; a random one is
          ready below &mdash; then pass it on to them yourself.
        </p>

        <Field>
          <FieldLabel for="password">New password</FieldLabel>
          <PasswordGenerator
            id="password"
            ref="generator"
            v-model="form.password"
            required
          />
          <FieldError :errors="form.errors.password" />
        </Field>

        <label
          v-if="!is_self"
          for="must_change_password"
          class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
          :class="
            form.must_change_password ? 'border-primary bg-primary/5' : ''
          "
        >
          <input
            id="must_change_password"
            v-model="form.must_change_password"
            type="checkbox"
            class="accent-primary mt-0.5 size-4"
          />
          <span>
            <span class="font-medium"
              >Ask them to choose their own password</span
            >
            <span class="text-muted-foreground block text-xs">
              Right after they sign in with this one, before they can do
              anything else &mdash; so only they know their password.
            </span>
          </span>
        </label>

        <p class="text-muted-foreground text-xs">
          <template v-if="is_self">
            This is your own account: your other devices are signed out; this
            one stays signed in.
          </template>
          <template v-else-if="user.sessions_count">
            They're signed in on {{ user.sessions_count }} device{{
              user.sessions_count === 1 ? "" : "s"
            }}
            &mdash; all of them will be signed out, so the old password stops
            working everywhere.
          </template>
          <template v-else>The old password stops working right away.</template>
        </p>

        <div class="flex gap-3">
          <Button type="submit" :disabled="form.processing || !form.password">
            <LoaderCircle v-if="form.processing" class="size-4 animate-spin" />
            Set password
          </Button>
          <Link :href="adminUsers.index()">
            <Button type="button" variant="outline">Cancel</Button>
          </Link>
        </div>
      </form>
    </div>
  </AppLayout>
</template>
