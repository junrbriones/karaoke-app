<script setup lang="ts">
import { computed } from "vue"

import type { DisplayCue } from "@/lib/lyricDisplay"

// "Get ready" cue before vocals come back in after an intro or a long
// instrumental: a progress bar across the whole rest, a seconds readout for
// long breaks, then a big 3-2-1 (with matching dots) for the last few
// beats/seconds. `compact` is the slim version shown above the lyrics when
// the next lines are already up.
const props = defineProps<{ cue: DisplayCue; compact?: boolean }>()

const progress = computed(() =>
  props.cue.total > 0
    ? Math.min(1, Math.max(0, 1 - props.cue.remaining / props.cue.total))
    : 1,
)
const seconds = computed(() => Math.ceil(props.cue.remaining))
</script>

<template>
  <div
    class="cue"
    :class="compact ? 'cue--compact' : 'cue--full'"
    role="timer"
    :aria-label="`Vocals in ${seconds} seconds`"
  >
    <div class="cue__count" :class="{ 'is-empty': !cue.count }">
      <span v-if="cue.count" :key="cue.count" class="cue__num">{{
        cue.count
      }}</span>
    </div>
    <div class="cue__dots" aria-hidden="true">
      <span v-for="d in cue.count ?? 0" :key="d" class="cue__dot" />
    </div>
    <div class="cue__bar" aria-hidden="true">
      <div class="cue__fill" :style="{ transform: `scaleX(${progress})` }" />
    </div>
    <div v-if="!compact" class="cue__label">
      {{ cue.count ? "Get ready…" : `Vocals in ${seconds}s` }}
    </div>
  </div>
</template>

<style scoped>
.cue {
  display: flex;
  align-items: center;
  color: var(--line-sung, var(--tv-sung));
}
.cue--full {
  flex-direction: column;
  gap: calc(2 * var(--u));
  width: 100%;
}
.cue--compact {
  gap: calc(2 * var(--u));
}
.cue__count {
  display: grid;
  place-items: center;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.cue--full .cue__count {
  height: calc(16 * var(--u));
  font-size: calc(16 * var(--u));
}
.cue--compact .cue__count {
  min-width: calc(7 * var(--u));
  height: calc(7 * var(--u));
  font-size: calc(7 * var(--u));
}
.cue--compact .cue__count.is-empty {
  visibility: hidden;
}
/* Reserve room for a 4-count so the bar doesn't slide as dots appear. */
.cue--compact .cue__dots {
  justify-content: flex-start;
  min-width: calc(17.6 * var(--u));
}
.cue__num {
  text-shadow: 0 0 0.12em var(--line-glow, var(--tv-sung-glow));
  animation: cue-pop 0.35s ease-out;
}
.cue__dots {
  display: flex;
  gap: calc(1.4 * var(--u));
  min-height: calc(3 * var(--u));
}
.cue__dot {
  width: calc(3 * var(--u));
  height: calc(3 * var(--u));
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 calc(1 * var(--u)) var(--line-glow, var(--tv-sung-glow));
}
.cue__bar {
  overflow: hidden;
  border-radius: 999px;
  background: rgb(255 255 255 / 0.16);
}
.cue--full .cue__bar {
  width: min(70%, calc(120 * var(--u)));
  height: calc(2.4 * var(--u));
}
.cue--compact .cue__bar {
  width: calc(36 * var(--u));
  height: calc(1.6 * var(--u));
}
.cue__fill {
  width: 100%;
  height: 100%;
  border-radius: inherit;
  background: currentColor;
  transform-origin: left center;
}
.cue__label {
  color: var(--tv-dim);
  font-size: calc(4 * var(--u));
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
@keyframes cue-pop {
  from {
    opacity: 0.3;
    transform: scale(1.4);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cue__num {
    animation: none;
  }
}
</style>
