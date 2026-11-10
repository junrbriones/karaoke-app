<script setup lang="ts">
import { Form } from "@inertiajs/vue3"
import { LoaderCircle } from "lucide-vue-next"
import { ref } from "vue"

import PasswordGenerator from "@/components/admin/PasswordGenerator.vue"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import type { RouteDefinition } from "@/routes/runtime"

defineProps<{
  action: RouteDefinition<"post">
  submitLabel: string
}>()

// Vouching for the address skips the verification email.
const verified = ref(false)
const password = ref("")
const passwordConfirmation = ref("")
// The admin knows this password: by default they choose their own on
// first sign-in.
const mustChange = ref(true)
</script>

<template>
  <Form
    :action="action"
    :options="{ preserveScroll: true }"
    :resetOnSuccess="['password', 'password_confirmation']"
    class="flex max-w-sm flex-col gap-6"
    #default="{ errors, processing }"
  >
    <FieldGroup>
      <Field>
        <FieldLabel for="name">Name</FieldLabel>
        <Input
          id="name"
          name="name"
          type="text"
          required
          autofocus
          autocomplete="name"
          placeholder="Full name"
        />
        <FieldError :errors="errors.name" />
      </Field>

      <Field>
        <FieldLabel for="email">Email address</FieldLabel>
        <Input
          id="email"
          name="email"
          type="email"
          required
          autocomplete="email"
          placeholder="email@example.com"
        />
        <FieldError :errors="errors.email" />
      </Field>

      <Field>
        <FieldLabel for="password">Password</FieldLabel>
        <PasswordGenerator
          id="password"
          v-model="password"
          name="password"
          required
          @generated="(p) => (passwordConfirmation = p)"
        />
        <FieldError :errors="errors.password" />
      </Field>

      <Field>
        <FieldLabel for="password_confirmation">Confirm password</FieldLabel>
        <Input
          id="password_confirmation"
          v-model="passwordConfirmation"
          name="password_confirmation"
          type="password"
          required
          autocomplete="new-password"
          placeholder="Confirm password"
        />
        <FieldError :errors="errors.password_confirmation" />
      </Field>

      <Field>
        <label
          for="must_change_password"
          class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
          :class="mustChange ? 'border-primary bg-primary/5' : ''"
        >
          <input
            id="must_change_password"
            v-model="mustChange"
            name="must_change_password"
            type="checkbox"
            value="1"
            class="accent-primary mt-0.5 size-4"
          />
          <span>
            <span class="font-medium"
              >Ask them to choose their own password</span
            >
            <span class="text-muted-foreground block text-xs">
              When they first sign in &mdash; so only they know it.
            </span>
          </span>
        </label>
      </Field>

      <Field>
        <label
          for="verified"
          class="flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-sm"
          :class="verified ? 'border-primary bg-primary/5' : ''"
        >
          <input
            id="verified"
            v-model="verified"
            name="verified"
            type="checkbox"
            value="1"
            class="accent-primary mt-0.5 size-4"
          />
          <span>
            <span class="font-medium">Mark as verified</span>
            <span class="text-muted-foreground block text-xs">
              You know this email address is theirs, so they don&rsquo;t need to
              confirm it &mdash; no verification email is sent.
            </span>
          </span>
        </label>
      </Field>
    </FieldGroup>

    <p class="text-muted-foreground text-xs">
      Share this password with them directly<template v-if="mustChange">
        &mdash; they'll choose their own when they first sign in.</template
      ><template v-else>
        &mdash; they can change it later from their account settings.</template
      >
      <template v-if="verified"
        >Their account is verified from the start.</template
      >
      <template v-else
        >They'll also get an email asking them to verify their
        address.</template
      >
    </p>

    <div class="flex gap-3">
      <Button type="submit" :disabled="processing">
        <LoaderCircle v-if="processing" class="size-4 animate-spin" />
        {{ submitLabel }}
      </Button>
      <slot name="extra-actions" />
    </div>
  </Form>
</template>
