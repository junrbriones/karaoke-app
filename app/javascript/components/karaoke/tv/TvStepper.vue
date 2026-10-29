<script setup lang="ts">
import { Minus, Plus } from "lucide-vue-next"

import TvButton from "./TvButton.vue"

// A big "[-]  VALUE  [+]" control: key change, text size, BPM, etc.
withDefaults(
  defineProps<{
    label: string
    value: string
    decLabel?: string
    incLabel?: string
    canDec?: boolean
    canInc?: boolean
    disabled?: boolean
    title?: string
    unit?: string // small suffix after the value, e.g. "bpm"
  }>(),
  {
    decLabel: "Down",
    incLabel: "Up",
    canDec: true,
    canInc: true,
    title: undefined,
    unit: undefined,
  },
)
defineEmits<{ dec: []; inc: [] }>()
</script>

<template>
  <div class="tv-stepper" role="group" :aria-label="label" :title="title">
    <TvButton
      :icon="Minus"
      :label="decLabel"
      hide-label
      narrow
      :title="`${label}: ${decLabel}`"
      :disabled="disabled || !canDec"
      @click="$emit('dec')"
    />
    <div class="tv-stepper__value" :class="{ 'is-disabled': disabled }">
      <span class="tv-stepper__caption">{{ label }}</span>
      <strong aria-live="polite"
        >{{ value
        }}<small v-if="unit" class="tv-stepper__unit">{{ unit }}</small></strong
      >
    </div>
    <TvButton
      :icon="Plus"
      :label="incLabel"
      hide-label
      narrow
      :title="`${label}: ${incLabel}`"
      :disabled="disabled || !canInc"
      @click="$emit('inc')"
    />
  </div>
</template>

<style scoped>
.tv-stepper {
  display: flex;
  flex: none;
  align-items: center;
  /* Room for the focused button's scaled-up focus ring. */
  gap: max(6px, 0.8vh);
}
.tv-stepper__value {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-width: max(58px, 7.5vh);
  padding-inline: max(6px, 0.6vh);
  line-height: 1.1;
}
.tv-stepper__value strong {
  font-size: max(18px, 3.4vh);
  font-weight: 900;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.tv-stepper__unit {
  margin-left: 0.2em;
  color: var(--tv-dim, rgb(255 255 255 / 0.55));
  font-size: 0.5em;
  font-weight: 800;
  text-transform: uppercase;
}
.tv-stepper__caption {
  color: var(--tv-dim, rgb(255 255 255 / 0.55));
  font-size: max(11px, 1.5vh);
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.tv-stepper__value.is-disabled {
  opacity: 0.35;
}
</style>
