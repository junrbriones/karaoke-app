<script setup lang="ts">
import { computed } from "vue"

import {
  type PhrasingScreen,
  type ScreenWindow,
  findActiveToken,
} from "@/lib/phrasing"

const props = defineProps<{
  screen: PhrasingScreen | null
  window?: ScreenWindow | null
  currentTime: number
}>()

const activeToken = computed(() => {
  if (!props.screen || props.screen.instrumental) return null
  return findActiveToken(props.screen, props.currentTime)
})

const restProgress = computed(() => {
  if (!props.screen?.instrumental || !props.window) return null
  const { start, end } = props.window
  if (!Number.isFinite(end)) return null
  const span = end - start
  if (span <= 0) return 1
  return Math.min(1, Math.max(0, (props.currentTime - start) / span))
})

function tokenProgress(lineIndex: number, tokenIndex: number): number {
  const active = activeToken.value
  if (!active) return 0
  if (
    lineIndex < active.lineIndex ||
    (lineIndex === active.lineIndex && tokenIndex < active.tokenIndex)
  ) {
    return 1
  }
  if (lineIndex === active.lineIndex && tokenIndex === active.tokenIndex) {
    return active.progress
  }
  return 0
}
</script>

<template>
  <div
    class="phrasing-screen relative flex min-h-[9rem] w-full flex-col items-center justify-center gap-3 rounded-lg bg-black px-6 py-8 text-center shadow-inner sm:min-h-[11rem]"
  >
    <div
      v-if="screen?.label"
      class="absolute top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-500/20 px-3 py-0.5 text-xs font-semibold tracking-wide text-amber-400 uppercase"
    >
      {{ screen.label }}
    </div>

    <template v-if="!screen">
      <p class="text-sm text-white/40">Nothing to show yet.</p>
    </template>

    <template v-else-if="screen.instrumental">
      <p class="text-lg font-semibold tracking-wide text-white/70 sm:text-2xl">
        &#9834; Instrumental &mdash; take a breath &#9834;
      </p>
      <div
        v-if="restProgress !== null"
        class="h-1.5 w-2/3 max-w-xs overflow-hidden rounded-full bg-white/10"
      >
        <div
          class="h-full rounded-full bg-amber-400 transition-[width] duration-100 ease-linear"
          :style="{ width: restProgress * 100 + '%' }"
        />
      </div>
    </template>

    <template v-else>
      <div
        v-for="(line, lineIndex) in screen.lines"
        :key="lineIndex"
        class="phrasing-line text-2xl leading-snug font-bold text-balance sm:text-4xl"
      >
        <span
          v-for="(token, tokenIndex) in line.tokens"
          :key="tokenIndex"
          class="token inline-block whitespace-pre"
          :class="token.wordStart && tokenIndex > 0 ? 'ml-[0.3em]' : ''"
          :style="{
            '--progress': tokenProgress(lineIndex, tokenIndex) * 100 + '%',
          }"
          >{{ token.text }}</span
        >
      </div>
    </template>
  </div>
</template>

<style scoped>
.token {
  background-image: linear-gradient(
    to right,
    #fbbf24 var(--progress, 0%),
    rgba(255, 255, 255, 0.35) var(--progress, 0%)
  );
  background-clip: text;
  -webkit-background-clip: text;
  color: transparent;
  transition: background-image 0.05s linear;
}
</style>
