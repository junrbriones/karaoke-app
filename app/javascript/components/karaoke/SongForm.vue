<script setup lang="ts">
import { Form } from "@inertiajs/vue3"
import { LoaderCircle } from "lucide-vue-next"
import { computed, ref } from "vue"

import SongBody from "@/components/karaoke/SongBody.vue"
import { Button } from "@/components/ui/button"
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { parseBody } from "@/lib/chordSheet"
import type { RouteDefinition } from "@/routes/runtime"
import type { Song } from "@/types"

const props = defineProps<{
  song?: Partial<Song>
  action: RouteDefinition<"post"> | RouteDefinition<"patch">
  submitLabel: string
}>()

const body = ref(
  props.song?.body ??
    "[Intro]\nG   D   Em   C   x4\n\n[Verse 1]\nG           D            Em          C\nPut your lyrics under a line of chords, just like this\n",
)
const preview = computed(() => parseBody(body.value))
</script>

<template>
  <Form
    :action="action"
    :options="{ preserveScroll: true }"
    class="flex flex-col gap-6"
    #default="{ errors, processing }"
  >
    <div class="grid grid-cols-2 gap-4 sm:grid-cols-5">
      <Field class="col-span-2 sm:col-span-1">
        <FieldLabel for="title">Title</FieldLabel>
        <Input
          id="title"
          name="title"
          :default-value="song?.title"
          required
          autofocus
          placeholder="Amazing Grace"
        />
        <FieldError :errors="errors.title" />
      </Field>
      <Field class="col-span-2 sm:col-span-1">
        <FieldLabel for="artist">Artist</FieldLabel>
        <Input
          id="artist"
          name="artist"
          :default-value="song?.artist ?? undefined"
          placeholder="Traditional"
        />
      </Field>
      <Field>
        <FieldLabel for="key">Key</FieldLabel>
        <Input
          id="key"
          name="key"
          :default-value="song?.key ?? undefined"
          placeholder="G"
        />
      </Field>
      <Field>
        <FieldLabel for="capo">Capo</FieldLabel>
        <Input
          id="capo"
          name="capo"
          :default-value="song?.capo ?? undefined"
          placeholder="0"
        />
      </Field>
      <Field>
        <FieldLabel for="tempo">Tempo (BPM)</FieldLabel>
        <Input
          id="tempo"
          name="tempo"
          type="number"
          :default-value="song?.tempo ?? undefined"
          placeholder="80"
        />
      </Field>
    </div>

    <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <FieldGroup>
        <Field>
          <FieldLabel for="body">Lyrics &amp; chords</FieldLabel>
          <Textarea
            id="body"
            name="body"
            v-model="body"
            class="min-h-80 font-mono whitespace-pre"
            spellcheck="false"
          />
          <p class="text-muted-foreground text-xs">
            Put a line of chords directly above the lyric line it belongs to
            &mdash; they're lined up automatically. Wrap section names in
            brackets, like <code class="bg-muted rounded px-1">[Chorus]</code>.
            A chord line with no lyrics under it is instrumental &mdash; an
            intro, ad lib, solo, etc. &mdash; and by default takes up one bar,
            same as a verse line. Add
            <code class="bg-muted rounded px-1">x4</code> after the chords to
            make it span more bars, like
            <code class="bg-muted rounded px-1">G D Em C x4</code> for a 4-bar
            intro. If a line is ever misread, force it with a leading marker:
            <code class="bg-muted rounded px-1">| G D C</code> for chords,
            <code class="bg-muted rounded px-1">&gt; spoken line</code>
            for lyrics.
          </p>
          <FieldError :errors="errors.body" />
        </Field>
      </FieldGroup>

      <div>
        <p
          class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase"
        >
          Preview
        </p>
        <div class="bg-card rounded-xl border p-4">
          <SongBody :blocks="preview" />
        </div>
      </div>
    </div>

    <div class="flex gap-3">
      <Button type="submit" :disabled="processing">
        <LoaderCircle v-if="processing" class="size-4 animate-spin" />
        {{ submitLabel }}
      </Button>
      <slot name="extra-actions" />
    </div>
  </Form>
</template>
