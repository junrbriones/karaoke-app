<script setup lang="ts">
import { Form } from "@inertiajs/vue3"
import { CircleAlert, LoaderCircle, Repeat } from "lucide-vue-next"
import { computed, nextTick, ref, watch } from "vue"

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
import { analyzeBody } from "@/lib/chordSheet"
import type { RouteDefinition } from "@/routes/runtime"
import type { Song } from "@/types"

const props = defineProps<{
  song?: Partial<Song>
  action: RouteDefinition<"post"> | RouteDefinition<"patch">
  submitLabel: string
}>()

const body = ref(
  props.song?.body ??
    "[Intro]\nG   D   Em   C\n\n[Verse 1]\nG           D            Em          C\nPut your lyrics under a line of chords, just like this\n",
)
const analysis = computed(() => analyzeBody(body.value))
const preview = computed(() => analysis.value.blocks)
const issues = computed(() => analysis.value.issues)

/* ---- insert a [Repeat ...] line instead of retyping a section ---- */
const editorWrap = ref<HTMLElement | null>(null)
const repeatTarget = ref("")
const repeatTimes = ref(1)
const sections = computed(() => analysis.value.sections)
watch(
  sections,
  (names) => {
    if (!names.includes(repeatTarget.value)) {
      repeatTarget.value = names[names.length - 1] ?? ""
    }
  },
  { immediate: true },
)

function textarea(): HTMLTextAreaElement | null {
  return editorWrap.value?.querySelector("textarea") ?? null
}

async function insertRepeat() {
  if (!repeatTarget.value) return
  const directive = `[Repeat ${repeatTarget.value}${
    repeatTimes.value > 1 ? ` ${repeatTimes.value}x` : ""
  }]`
  const el = textarea()
  const text = body.value
  // At the cursor, on a line of its own, with a blank line before it.
  let at = el ? el.selectionEnd : text.length
  const lineEnd = text.indexOf("\n", at)
  at = lineEnd === -1 ? text.length : lineEnd
  const before = text.slice(0, at)
  const after = text.slice(at)
  const lead =
    before.length === 0
      ? ""
      : before.endsWith("\n\n")
        ? ""
        : before.endsWith("\n")
          ? "\n"
          : "\n\n"
  const insert = `${lead}${directive}\n`
  body.value =
    before + insert + (after.startsWith("\n") ? after.slice(1) : after)
  await nextTick()
  if (el) {
    const caret = before.length + insert.length
    el.focus()
    el.setSelectionRange(caret, caret)
  }
}

// Jump to a problem line in the editor.
async function goToLine(line: number) {
  const el = textarea()
  if (!el) return
  const lines = body.value.split("\n")
  const start = lines.slice(0, line - 1).reduce((n, l) => n + l.length + 1, 0)
  const end = start + (lines[line - 1]?.length ?? 0)
  el.focus()
  el.setSelectionRange(start, end)
  // Scroll it roughly into view.
  const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20
  el.scrollTop = Math.max(0, (line - 3) * lineHeight)
}
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
          <div
            class="bg-muted/40 flex flex-wrap items-center gap-2 rounded-md border px-2 py-1.5 text-sm"
          >
            <Repeat class="text-muted-foreground size-4" aria-hidden="true" />
            <label for="repeat-target" class="text-muted-foreground"
              >Repeat</label
            >
            <select
              id="repeat-target"
              v-model="repeatTarget"
              class="bg-background h-8 min-w-32 rounded-md border px-2 py-0 text-sm"
              :disabled="!sections.length"
            >
              <option v-if="!sections.length" value="">
                (add a [Section] first)
              </option>
              <option v-for="name in sections" :key="name" :value="name">
                {{ name }}
              </option>
            </select>
            <select
              v-model.number="repeatTimes"
              aria-label="How many times"
              class="bg-background h-8 rounded-md border px-2 py-0 text-sm"
            >
              <option v-for="n in 4" :key="n" :value="n">{{ n }}&times;</option>
            </select>
            <Button
              type="button"
              size="sm"
              variant="outline"
              :disabled="!repeatTarget"
              @click="insertRepeat"
            >
              Insert at cursor
            </Button>
          </div>
          <div ref="editorWrap">
            <Textarea
              id="body"
              name="body"
              v-model="body"
              class="min-h-80 font-mono whitespace-pre"
              spellcheck="false"
            />
          </div>
          <ul
            v-if="issues.length"
            class="flex flex-col gap-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs"
            aria-label="Problems"
          >
            <li v-for="(issue, i) in issues" :key="i">
              <button
                type="button"
                class="flex w-full items-start gap-1.5 text-left hover:underline"
                @click="goToLine(issue.line)"
              >
                <CircleAlert
                  class="mt-px size-3.5 shrink-0 text-amber-600 dark:text-amber-500"
                  aria-hidden="true"
                />
                <span
                  ><strong>Line {{ issue.line }}:</strong>
                  {{ issue.message }}</span
                >
              </button>
            </li>
          </ul>
          <div class="text-muted-foreground flex flex-col gap-1.5 text-xs">
            <p>
              Put a line of chords directly above the lyric line it belongs to
              &mdash; each chord over the syllable where it changes. Wrap
              section names in brackets, like
              <code class="bg-muted rounded px-1">[Chorus 1]</code>. Chords
              played within one bar can be joined with dashes, like
              <code class="bg-muted rounded px-1">Dm-G7sus-G7</code>; slash
              chords (<code class="bg-muted rounded px-1">D/F#</code>) and
              extensions (<code class="bg-muted rounded px-1">7sus</code>,
              <code class="bg-muted rounded px-1">maj7</code>,
              <code class="bg-muted rounded px-1">m7b5</code>,
              <code class="bg-muted rounded px-1">add9</code>&hellip;) all work.
            </p>
            <p>
              A chord line with no lyrics under it is instrumental &mdash; an
              intro, interlude, solo &mdash; and each chord (or dashed group) is
              one bar, so
              <code class="bg-muted rounded px-1">F Em Dm-G7sus-G7</code> is
              three bars. Add <code class="bg-muted rounded px-1">x2</code> at
              the end to play it twice.
            </p>
            <p>
              Don&rsquo;t retype a section that comes back: a line like
              <code class="bg-muted rounded px-1">[Repeat Chorus 1]</code>,
              <code class="bg-muted rounded px-1">[Repeat Refrain 2x]</code>, or
              <code class="bg-muted rounded px-1"
                >[Repeat Chorus 2 2x, fade]</code
              >
              plays it again (&ldquo;Ulitin&rdquo; works too) &mdash; or use the
              Repeat bar above. If a line is ever misread, force it with a
              leading <code class="bg-muted rounded px-1">| </code> for chords
              or <code class="bg-muted rounded px-1">&gt; </code> for lyrics.
            </p>
          </div>
          <FieldError :errors="errors.body" />
        </Field>
      </FieldGroup>

      <div>
        <p
          class="text-muted-foreground mb-2 text-xs font-medium tracking-wide uppercase"
        >
          Preview &mdash; as it&rsquo;ll be played, repeats included
        </p>
        <div
          class="bg-card max-h-[75vh] overflow-y-auto rounded-xl border p-4 lg:sticky lg:top-4"
        >
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
