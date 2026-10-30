<script setup lang="ts">
import { Toaster } from "@/components/ui/sonner"
import { useErrorRecovery } from "@/composables/useErrorRecovery"
import { useFlash } from "@/composables/useFlash"
import "vue-sonner/style.css"

useFlash()
useErrorRecovery()
</script>

<template>
  <slot />
  <Toaster richColors position="bottom-right" />
</template>
