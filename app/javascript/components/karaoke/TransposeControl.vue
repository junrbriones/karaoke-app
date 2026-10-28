<script setup lang="ts">
import { Minus, Plus } from "lucide-vue-next"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"

const semitones = defineModel<number>("semitones", { default: 0 })
const preferFlat = defineModel<boolean>("preferFlat", { default: false })

function shift(delta: number) {
  semitones.value = Math.max(-11, Math.min(11, semitones.value + delta))
}
function reset() {
  semitones.value = 0
}
</script>

<template>
  <div
    class="bg-card flex items-center gap-1.5 rounded-lg border px-2 py-1 text-sm"
  >
    <span class="text-muted-foreground mr-1">Transpose</span>
    <Button
      variant="outline"
      size="icon-sm"
      type="button"
      aria-label="Transpose down a semitone"
      @click="shift(-1)"
    >
      <Minus class="size-3.5" />
    </Button>
    <span class="w-6 text-center font-semibold">{{
      semitones > 0 ? "+" + semitones : semitones
    }}</span>
    <Button
      variant="outline"
      size="icon-sm"
      type="button"
      aria-label="Transpose up a semitone"
      @click="shift(1)"
    >
      <Plus class="size-3.5" />
    </Button>
    <Button
      v-if="semitones !== 0"
      variant="ghost"
      size="sm"
      type="button"
      class="text-primary"
      @click="reset"
    >
      reset
    </Button>
    <label
      class="text-muted-foreground ml-1 flex items-center gap-1.5"
      title="Prefer flats (Bb) over sharps (A#)"
    >
      <Checkbox v-model="preferFlat" />
      <span>&flat;</span>
    </label>
  </div>
</template>
