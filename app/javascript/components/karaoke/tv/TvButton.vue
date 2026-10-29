<script setup lang="ts">
import type { Component } from "vue"

// A remote/air-mouse sized button: at least ~1in square on a 70" TV, with a
// thick, high-contrast focus ring for D-pad navigation.
withDefaults(
  defineProps<{
    label: string
    icon?: Component
    primary?: boolean
    // A toggle button: `active` is announced via aria-pressed.
    toggle?: boolean
    active?: boolean
    disabled?: boolean
    title?: string
    // Icon-only: the label is still there for screen readers.
    hideLabel?: boolean
    // Narrower (same height) -- the -/+ halves of a stepper.
    narrow?: boolean
  }>(),
  { icon: undefined, title: undefined },
)
defineEmits<{ click: [event: MouseEvent] }>()
</script>

<template>
  <button
    type="button"
    class="tv-btn"
    :class="{
      'is-primary': primary,
      'is-active': active,
      'is-narrow': narrow,
    }"
    :disabled="disabled"
    :aria-pressed="toggle ? active : undefined"
    :data-tv-primary="primary || undefined"
    :title="title ?? label"
    @click="$emit('click', $event)"
  >
    <component :is="icon" v-if="icon" class="tv-btn__icon" aria-hidden="true" />
    <span class="tv-btn__label" :class="{ 'sr-only': hideLabel }">{{
      label
    }}</span>
  </button>
</template>

<style scoped>
.tv-btn {
  /* --h: height, --size: minimum width. ~3in square on a 70" TV. */
  --h: clamp(72px, 9.6vh, 190px);
  --size: clamp(66px, 8.8vh, 176px);
  display: inline-flex;
  flex: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: max(4px, 0.7vh);
  min-width: var(--size);
  height: var(--h);
  padding: 0 max(6px, 0.8vh);
  border: max(2px, 0.3vh) solid rgb(255 255 255 / 0.24);
  border-radius: max(12px, 1.8vh);
  background: rgb(255 255 255 / 0.1);
  color: var(--tv-ink, #fff);
  font: inherit;
  font-weight: 800;
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition:
    transform 0.12s ease,
    background-color 0.12s ease,
    border-color 0.12s ease;
}
.tv-btn__icon {
  width: calc(var(--h) * 0.4);
  height: calc(var(--h) * 0.4);
  stroke-width: 2.5;
}
.tv-btn__label {
  font-size: max(12px, 1.6vh);
  line-height: 1;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  white-space: nowrap;
}
.tv-btn:hover:not(:disabled) {
  background: rgb(255 255 255 / 0.2);
  border-color: rgb(255 255 255 / 0.5);
}
.tv-btn:focus-visible {
  z-index: 1;
  outline: max(4px, 0.6vh) solid var(--tv-focus, #ffe600);
  outline-offset: max(3px, 0.4vh);
  background: rgb(255 255 255 / 0.22);
  transform: scale(1.08);
}
.tv-btn:active:not(:disabled) {
  transform: scale(0.95);
}
.tv-btn.is-narrow {
  --size: clamp(56px, 7vh, 140px);
}
.tv-btn.is-primary {
  --h: clamp(88px, 12vh, 230px);
  --size: clamp(84px, 11vh, 214px);
  border-color: transparent;
  background: var(--tv-sung, #00e5ff);
  color: #000;
}
.tv-btn.is-primary:hover:not(:disabled),
.tv-btn.is-primary:focus-visible {
  background: #6ff2ff;
}
.tv-btn.is-active {
  border-color: var(--tv-sung, #00e5ff);
  color: var(--tv-sung, #00e5ff);
}
.tv-btn:disabled {
  cursor: default;
  opacity: 0.3;
}
@media (prefers-reduced-motion: reduce) {
  .tv-btn,
  .tv-btn:focus-visible,
  .tv-btn:active:not(:disabled) {
    transform: none;
    transition: none;
  }
}
</style>
