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
import type { Setlist } from "@/types"

defineProps<{
  setlist?: Partial<Setlist>
  action: RouteDefinition<"post"> | RouteDefinition<"patch">
  submitLabel: string
}>()
</script>

<template>
  <Form
    :action="action"
    :options="{ preserveScroll: true }"
    class="flex max-w-sm flex-col gap-6"
    #default="{ errors, processing }"
  >
    <FieldGroup>
      <Field>
        <FieldLabel for="name">Setlist name</FieldLabel>
        <Input
          id="name"
          name="name"
          :default-value="setlist?.name"
          required
          autofocus
          placeholder="Saturday night at The Grove"
        />
        <FieldError :errors="errors.name" />
      </Field>
    </FieldGroup>

    <div class="flex gap-3">
      <Button type="submit" :disabled="processing">
        <LoaderCircle v-if="processing" class="size-4 animate-spin" />
        {{ submitLabel }}
      </Button>
      <slot name="extra-actions" />
    </div>
  </Form>
</template>
