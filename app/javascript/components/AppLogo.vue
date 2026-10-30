<script setup lang="ts">
import AppLogoIcon from "@/components/AppLogoIcon.vue"

const appName = import.meta.env.VITE_APP_NAME ?? "JBKaraoke"
</script>

<template>
  <div
    class="flex aspect-square size-8 items-center justify-center rounded-md bg-[#0b0b10] ring-1 ring-white/10"
  >
    <AppLogoIcon class="size-6" />
  </div>
  <div class="ml-1 grid flex-1 text-left text-sm">
    <span class="mb-0.5 truncate leading-tight font-semibold">
      {{ appName }}
    </span>
  </div>
</template>
