<script setup lang="ts">
import { Link } from "@inertiajs/vue3"

import AppLogoIcon from "@/components/AppLogoIcon.vue"
import { home } from "@/routes"

defineProps<{
  title?: string
  description?: string
}>()

const appName = import.meta.env.VITE_APP_NAME ?? "JBKaraoke"
</script>

<template>
  <div
    class="relative grid h-dvh flex-col items-center justify-center px-8 sm:px-0 lg:max-w-none lg:grid-cols-2 lg:px-0"
  >
    <div
      class="bg-muted relative hidden h-full flex-col p-10 text-white lg:flex dark:border-r"
    >
      <div class="absolute inset-0 bg-zinc-900" />
      <Link
        :href="home.index()"
        class="relative z-20 flex items-center text-lg font-medium"
      >
        <AppLogoIcon class="mr-2 size-8" />
        {{ appName }}
      </Link>
      <div class="relative z-20 mt-auto">
        <div class="space-y-2">
          <p class="text-lg">
            Lyrics and guitar chords on one big screen &mdash; sing along, play
            along, and keep the whole band in time.
          </p>
          <p class="text-sm text-neutral-300">
            Your songbook, stage-ready for karaoke nights and live gigs.
          </p>
        </div>
      </div>
    </div>
    <div class="lg:p-8">
      <div
        class="mx-auto flex w-full flex-col justify-center space-y-6 sm:w-[350px]"
      >
        <div class="flex flex-col space-y-2 text-center">
          <h1 class="text-xl font-medium tracking-tight" v-if="title">
            {{ title }}
          </h1>
          <p class="text-muted-foreground text-sm" v-if="description">
            {{ description }}
          </p>
        </div>
        <slot />
      </div>
    </div>
  </div>
</template>
