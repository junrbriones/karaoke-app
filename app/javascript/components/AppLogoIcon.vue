<script setup lang="ts">
import { type HTMLAttributes, useId } from "vue"

// The app's mark: a guitar pick with a microphone cut out of it -- chords
// and singing, the two halves of the app -- with the mic's head strung like
// a guitar. "color" fills it with the stage's neon cyan-to-magenta (the same
// colors as the TV display's sung lyrics and duet parts); "mono" uses the
// current text color, for places that need a single flat color.
defineOptions({
  inheritAttrs: false,
})

withDefaults(
  defineProps<{
    className?: HTMLAttributes["class"]
    variant?: "color" | "mono"
  }>(),
  { className: undefined, variant: "color" },
)

// Unique per instance, so several logos on one page don't share a mask.
const id = useId()
</script>

<template>
  <svg
    viewBox="0 0 32 32"
    width="32"
    height="32"
    xmlns="http://www.w3.org/2000/svg"
    aria-hidden="true"
    :class="className"
    v-bind="$attrs"
  >
    <defs>
      <linearGradient
        :id="`${id}-fill`"
        x1="4"
        y1="2"
        x2="27"
        y2="30"
        gradientUnits="userSpaceOnUse"
      >
        <stop offset="0" stop-color="#00e5ff" />
        <stop offset="0.55" stop-color="#7c6bff" />
        <stop offset="1" stop-color="#ff3df2" />
      </linearGradient>
      <mask
        :id="`${id}-cut`"
        maskUnits="userSpaceOnUse"
        x="0"
        y="0"
        width="32"
        height="32"
      >
        <!-- the pick -->
        <path
          fill="#fff"
          d="M16 30.6C12.4 30.6 3.1 19.9 2.2 11.7 1.5 5.5 8.2 1.4 16 1.4s14.5 4.1 13.8 10.3c-.9 8.2-10.2 18.9-13.8 18.9z"
        />
        <!-- the mic, cut out of it -->
        <rect x="12.4" y="4.6" width="7.2" height="11.2" rx="3.6" fill="#000" />
        <path
          d="M10.25 12.6a5.75 5.75 0 0 0 11.5 0M16 18.35v4.4M13.2 23.1h5.6"
          fill="none"
          stroke="#000"
          stroke-width="1.7"
          stroke-linecap="round"
        />
        <!-- strings across the mic's head -->
        <path
          d="M14.2 7v6.4M16 7v6.4M17.8 7v6.4"
          stroke="#fff"
          stroke-width="0.8"
          stroke-linecap="round"
        />
      </mask>
    </defs>
    <rect
      width="32"
      height="32"
      :fill="variant === 'color' ? `url(#${id}-fill)` : 'currentColor'"
      :mask="`url(#${id}-cut)`"
    />
  </svg>
</template>
