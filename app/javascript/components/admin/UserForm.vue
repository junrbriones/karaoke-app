<script setup lang="ts">
import { Form } from "@inertiajs/vue3"
import { LoaderCircle } from "lucide-vue-next"

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
        <Input
          id="password"
          name="password"
          type="password"
          required
          autocomplete="new-password"
          placeholder="Password"
        />
        <FieldError :errors="errors.password" />
      </Field>

      <Field>
        <FieldLabel for="password_confirmation">Confirm password</FieldLabel>
        <Input
          id="password_confirmation"
          name="password_confirmation"
          type="password"
          required
          autocomplete="new-password"
          placeholder="Confirm password"
        />
        <FieldError :errors="errors.password_confirmation" />
      </Field>
    </FieldGroup>

    <p class="text-muted-foreground text-xs">
      Share this password with them directly &mdash; they can change it later
      from their own account settings. They'll also get an email asking them to
      verify their address.
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
