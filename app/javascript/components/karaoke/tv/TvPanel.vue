<script setup lang="ts">
import { Check } from "lucide-vue-next"
import { nextTick, onMounted, ref } from "vue"

import TvButton from "./TvButton.vue"

// A full-screen-overlay settings sheet for the TV views. Arrow keys move
// through its controls (TvShell handles that for any [data-tv-nav] group),
// Escape or "Done" closes it.
defineProps<{ title: string }>()
const emit = defineEmits<{ close: [] }>()

const root = ref<HTMLElement | null>(null)

onMounted(async () => {
  await nextTick()
  root.value
    ?.querySelector<HTMLElement>("button:not([disabled]), [tabindex='0']")
    ?.focus()
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Escape") {
    e.preventDefault()
    e.stopPropagation()
    emit("close")
  }
}
</script>

<template>
  <div
    ref="root"
    class="tv-panel"
    role="dialog"
    aria-modal="true"
    :aria-label="title"
    data-tv-nav
    @keydown="onKeydown"
  >
    <h2 class="tv-panel__title">{{ title }}</h2>
    <div class="tv-panel__body">
      <slot />
    </div>
    <div class="tv-panel__footer">
      <TvButton :icon="Check" label="Done" primary @click="emit('close')" />
    </div>
  </div>
</template>

<style scoped>
.tv-panel {
  display: flex;
  flex-direction: column;
  gap: max(16px, 3vh);
  width: min(94vw, 150vh);
  max-height: 90vh;
  overflow: auto;
  padding: max(20px, 4vh);
  border: max(2px, 0.3vh) solid rgb(255 255 255 / 0.2);
  border-radius: max(16px, 3vh);
  background: #0a0a0a;
}
.tv-panel__title {
  font-size: max(22px, 4vh);
  font-weight: 900;
}
.tv-panel__body {
  display: flex;
  flex-wrap: wrap;
  gap: max(16px, 3vh) max(24px, 5vh);
  align-items: center;
}
.tv-panel__footer {
  display: flex;
  justify-content: flex-end;
}
</style>
