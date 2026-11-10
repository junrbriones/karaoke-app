<script setup lang="ts">
import { Check, Copy, Dices, Eye, EyeOff } from "lucide-vue-next"
import { ref } from "vue"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  type PasswordStyle,
  generatePassword,
  passwordStrengthBits,
} from "@/lib/passwordGenerator"

// A password box for an admin setting someone's password: type one, or
// generate a random one (shown in plain text, so it can be read out or
// copied and passed on).
const props = withDefaults(
  defineProps<{
    id?: string
    name?: string
    required?: boolean
    autofocus?: boolean
  }>(),
  { id: "password", name: "password", required: false, autofocus: false },
)
const password = defineModel<string>({ default: "" })
const emit = defineEmits<{ generated: [password: string] }>()

const style = ref<PasswordStyle>("shareable")
const visible = ref(false)
const copied = ref(false)

function generate() {
  // (Read back, the model would still hold the old value until the parent
  // re-renders -- so pass on the new one directly.)
  const fresh = generatePassword(style.value, 16)
  password.value = fresh
  visible.value = true
  emit("generated", fresh)
}

function setStyle(value: PasswordStyle) {
  style.value = value
  generate()
}

let copiedTimer: ReturnType<typeof setTimeout> | undefined
async function copy() {
  if (!password.value) return
  try {
    await navigator.clipboard.writeText(password.value)
    copied.value = true
    clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => (copied.value = false), 1500)
  } catch {
    // No clipboard access (not https): it's on screen to copy by hand.
    visible.value = true
  }
}

defineExpose({ generate })
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="flex gap-2">
      <div class="relative flex-1">
        <Input
          :id="props.id"
          v-model="password"
          :name="props.name"
          :type="visible ? 'text' : 'password'"
          :required="props.required"
          :autofocus="props.autofocus"
          autocomplete="new-password"
          spellcheck="false"
          placeholder="Type one, or generate it"
          class="pr-9 font-mono"
        />
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
          :aria-label="visible ? 'Hide password' : 'Show password'"
          :title="visible ? 'Hide password' : 'Show password'"
          @click="visible = !visible"
        >
          <EyeOff v-if="visible" class="size-4" />
          <Eye v-else class="size-4" />
        </button>
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon"
        :disabled="!password"
        :aria-label="copied ? 'Copied' : 'Copy password'"
        :title="copied ? 'Copied' : 'Copy password'"
        @click="copy"
      >
        <Check v-if="copied" class="size-4 text-green-600" />
        <Copy v-else class="size-4" />
      </Button>
    </div>
    <div class="flex flex-wrap items-center gap-2 text-xs">
      <Button type="button" variant="secondary" size="sm" @click="generate">
        <Dices class="size-4" />
        Generate password
      </Button>
      <span
        class="bg-muted inline-flex items-center gap-0.5 rounded-md p-0.5"
        role="group"
        aria-label="Kind of password"
      >
        <button
          v-for="opt in [
            { value: 'shareable', label: 'Easy to share' },
            { value: 'strong', label: 'Strong' },
          ] as const"
          :key="opt.value"
          type="button"
          class="rounded px-2 py-1 transition-colors"
          :class="
            style === opt.value
              ? 'bg-background text-foreground shadow-sm'
              : 'text-muted-foreground hover:text-foreground'
          "
          :aria-pressed="style === opt.value"
          @click="setStyle(opt.value)"
        >
          {{ opt.label }}
        </button>
      </span>
      <span class="text-muted-foreground">
        {{
          style === "shareable"
            ? "Letters and numbers in groups of four, easy to read out"
            : "16 characters with symbols"
        }}
        &middot; ~{{ passwordStrengthBits(style, 16) }} bits
      </span>
    </div>
  </div>
</template>
