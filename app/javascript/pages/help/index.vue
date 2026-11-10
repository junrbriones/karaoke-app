<script setup lang="ts">
import { Head, Link, usePage } from "@inertiajs/vue3"
import { Search, X } from "lucide-vue-next"
import { computed, nextTick, onMounted, ref } from "vue"

import { Input } from "@/components/ui/input"
import AppLayout from "@/layouts/AppLayout.vue"
import {
  chords,
  help,
  mySetlists,
  settingsPasswords,
  songImports,
  songs,
} from "@/routes"
import type { BreadcrumbItem, User } from "@/types"

const breadcrumbs: BreadcrumbItem[] = [
  { title: "How to", href: help.index().url },
]

const page = usePage()
const isAdmin = computed(
  () => (page.props.auth as { user: User | null }).user?.admin === true,
)

const SECTIONS = [
  { id: "getting-around", title: "Getting around" },
  { id: "songs", title: "Adding and editing songs" },
  { id: "chord-sheets", title: "Writing a chord sheet" },
  { id: "import", title: "Importing many songs" },
  { id: "chords", title: "Looking up chords" },
  { id: "setlists", title: "Setlists and stars" },
  { id: "groups", title: "Groups and sharing" },
  { id: "live-sync", title: "Live Sync with your band" },
  { id: "stage-mode", title: "Stage Mode" },
  { id: "line-timing", title: "Line timing" },
  { id: "karaoke-sync", title: "Karaoke sync" },
  { id: "timing-marks", title: "Timing marks" },
  { id: "vocals", title: "Vocals and minus-one tracks" },
  { id: "account", title: "Your account" },
  { id: "admin", title: "For admins", admin: true },
]
const sections = computed(() =>
  SECTIONS.filter((s) => !s.admin || isAdmin.value),
)

/* ---- search: shows only the sections that mention every word ---- */
const query = ref("")
const content = ref<HTMLElement | null>(null)
const texts = ref<Record<string, string>>({})
const words = computed(() =>
  query.value.toLowerCase().split(/\s+/).filter(Boolean),
)
function visible(id: string): boolean {
  if (!words.value.length) return true
  const text = texts.value[id] ?? ""
  return words.value.every((w) => text.includes(w))
}
const shown = computed(() => sections.value.filter((s) => visible(s.id)))

onMounted(() => {
  const found: Record<string, string> = {}
  content.value
    ?.querySelectorAll<HTMLElement>("section[id]")
    .forEach((el) => (found[el.id] = (el.textContent ?? "").toLowerCase()))
  texts.value = found
  // Opened with a #section link: go there.
  const hash = decodeURIComponent(window.location.hash.slice(1))
  if (hash) void nextTick(() => document.getElementById(hash)?.scrollIntoView())
})

function go(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
  window.history.replaceState(window.history.state, "", `#${id}`)
}
</script>

<template>
  <Head title="How to" />

  <AppLayout :breadcrumbs="breadcrumbs">
    <div class="help-layout p-4">
      <!-- contents -->
      <nav class="help-toc" aria-label="Contents">
        <div class="relative mb-3">
          <Search
            class="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
          />
          <Input
            v-model="query"
            type="search"
            placeholder="Search the guide"
            aria-label="Search the guide"
            class="pl-8"
          />
          <button
            v-if="query"
            type="button"
            class="text-muted-foreground hover:text-foreground absolute top-1/2 right-2 -translate-y-1/2 rounded p-1"
            aria-label="Clear search"
            @click="query = ''"
          >
            <X class="size-4" />
          </button>
        </div>
        <ul class="flex flex-col text-sm">
          <li v-for="s in shown" :key="s.id">
            <a
              :href="`#${s.id}`"
              class="text-muted-foreground hover:text-foreground hover:bg-muted block rounded px-2 py-1"
              @click.prevent="go(s.id)"
              >{{ s.title }}</a
            >
          </li>
        </ul>
        <p v-if="!shown.length" class="text-muted-foreground px-2 text-sm">
          Nothing matches &ldquo;{{ query }}&rdquo;.
        </p>
      </nav>

      <!-- the guide -->
      <div ref="content" class="help-content">
        <header>
          <h1 class="text-3xl font-bold">How to use JBKaraoke</h1>
          <p class="text-muted-foreground mt-1">
            Everything the app does, step by step, with every keyboard shortcut.
            Use the search box to jump to what you need &mdash; try
            <button type="button" class="link" @click="query = 're-tap'">
              re-tap</button
            >,
            <button type="button" class="link" @click="query = 'transpose'">
              transpose
            </button>
            or
            <button type="button" class="link" @click="query = 'minus-one'">
              minus-one</button
            >.
          </p>
        </header>

        <p v-if="!shown.length" class="text-muted-foreground">
          Nothing in the guide matches &ldquo;{{ query }}&rdquo;.
          <button type="button" class="link" @click="query = ''">
            Show everything
          </button>
        </p>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('getting-around')" id="getting-around">
          <h2>Getting around</h2>
          <p>The sidebar on the left takes you to each part of the app:</p>
          <dl class="defs">
            <dt>Songs</dt>
            <dd>
              Your songbook: the songs you've added and the ones shared with
              your groups. Search, star, open, add or import songs here.
            </dd>
            <dt>Setlists</dt>
            <dd>Your own running orders for performing solo.</dd>
            <dt>Groups</dt>
            <dd>Your bands: shared songs, group setlists and Live Sync.</dd>
            <dt>Chords</dt>
            <dd>A chord dictionary with fingering charts for guitar.</dd>
            <dt>How to</dt>
            <dd>This guide.</dd>
          </dl>
          <p>
            Your name at the bottom of the sidebar opens
            <strong>Settings</strong> (profile, email, password, signed-in
            devices, light/dark appearance) and <strong>Log out</strong>.
          </p>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('songs')" id="songs">
          <h2>Adding and editing songs</h2>
          <ol>
            <li>
              Go to <Link :href="songs.index()" class="link">Songs</Link> and
              click <strong>+ New song</strong>.
            </li>
            <li>
              Fill in the title and artist, and if you know them the key, capo
              and tempo (BPM). The tempo paces Stage Mode's guide.
            </li>
            <li>
              Type or paste the chords and lyrics into the big box (see
              <a
                href="#chord-sheets"
                class="link"
                @click.prevent="go('chord-sheets')"
                >Writing a chord sheet</a
              >). Lines the app can't read as chords are listed under the box so
              you can fix them.
            </li>
            <li>Click <strong>Save</strong>.</li>
          </ol>
          <p>On a song's page you can:</p>
          <ul>
            <li>
              <strong>Transpose</strong> with &minus;/+ (and &#9837; to show
              flats instead of sharps). The chord charts follow the new key.
            </li>
            <li>
              Open the <strong>Chord charts</strong> panel to see a diagram of
              every chord in the song; tap one for other ways to play it.
            </li>
            <li>
              <strong>Star</strong> it for your quick list, or add it to one of
              your setlists with <strong>Add to setlist&hellip;</strong>
            </li>
            <li>
              <strong>Stage Mode</strong> shows it on a TV;
              <strong>Karaoke sync</strong> and <strong>Line timing</strong>
              time it to the music.
            </li>
            <li>
              <strong>Edit</strong> or <strong>Delete</strong> it (your own
              songs only), and share it with your groups.
            </li>
          </ul>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('chord-sheets')" id="chord-sheets">
          <h2>Writing a chord sheet</h2>
          <p>
            Put each line of chords right above the lyric line it goes with,
            each chord over the syllable where it changes. Chord sheets copied
            from elsewhere usually work as they are.
          </p>
          <pre class="sample">
[Verse 1]
     C           Em          F           G
   Walking slow beneath the paper moon tonight</pre>
          <ul>
            <li>
              <strong>Sections</strong>: put names in square brackets &mdash;
              <code>[Verse 1]</code>, <code>[Chorus]</code>,
              <code>[Bridge]</code>. Blank lines are kept as space.
            </li>
            <li>
              <strong>Chords</strong>: anything a band writes &mdash;
              <code>Am</code>, <code>Bb</code>, <code>Cmaj7</code>,
              <code>G7sus</code>, <code>Fadd9</code>, <code>C7(b9)</code>, slash
              chords like <code>D/F#</code>, and <code>N.C.</code> (no chord).
              Bar lines <code>|</code> and hold dashes are fine.
            </li>
            <li>
              <strong>Several chords in one bar</strong>: join them with dashes
              &mdash; <code>Dm-G7sus-G7</code>.
            </li>
            <li>
              <strong>Instrumentals</strong>: a chord line with no lyrics under
              it is an intro, solo or interlude. Each chord (or dash-joined
              group) is one bar. Add <code>x2</code> at the end to play it
              twice.
            </li>
            <li>
              <strong>Repeats</strong>: don't retype a chorus &mdash; write
              <code>[Repeat Chorus]</code>, <code>[Repeat Chorus 1 2x]</code> or
              <code>[Repeat Chorus 2, fade]</code>. <code>Ulit</code>,
              <code>Ulitin</code> and <code>Rpt</code> work too. The
              <strong>Repeat</strong> bar in the editor adds one for you.
            </li>
            <li>
              <strong>A line read the wrong way?</strong> Start it with
              <code>|</code> to make it a chord line, or <code>&gt;</code> to
              make it lyrics.
            </li>
          </ul>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('import')" id="import">
          <h2>Importing many songs</h2>
          <ol>
            <li>
              Go to
              <Link :href="songImports.new()" class="link"
                >Songs &rarr; Import</Link
              >.
            </li>
            <li>
              Drop in files &mdash; plain text with chords over lyrics, ChordPro
              (<code>.cho</code>, <code>.chopro</code>,
              <code>.pro</code>&hellip;), or a <code>.zip</code> of them &mdash;
              or paste several songs into the box with a line of
              <code>---</code> between each.
            </li>
            <li>
              Check the list: fix titles and artists (&#8644; swaps them),
              <strong>Preview</strong> each sheet, and untick anything you don't
              want. Songs you already have are pointed out and left unticked.
            </li>
            <li>
              Click <strong>Import</strong> (up to 200 at a time). If one can't
              be saved, nothing is, and the reason shows next to it.
            </li>
          </ol>
          <p class="note">
            Only import chord sheets you have the right to use &mdash; your own
            arrangements, public-domain songs, or ones you have permission for.
          </p>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('chords')" id="chords">
          <h2>Looking up chords</h2>
          <p>
            <Link :href="chords.index()" class="link">Chords</Link> shows how to
            play any chord on guitar. Type its name &mdash;
            <Link
              :href="chords.index({ query: { q: 'C#m7' } })"
              class="link font-mono"
              >C#m7</Link
            >, <code>Bbmaj7</code>, <code>G/B</code>, <code>F#7b9</code>
            &mdash; or a kind of chord such as &ldquo;minor seventh&rdquo;.
          </p>
          <ul>
            <li>
              You get the chord's full name, its notes (the root in orange), its
              formula and its other name (C#m7 is also Dbm7).
            </li>
            <li>
              Up to six fingerings, most common first. On each chart the low E
              string is on the left; a number on a dot is the finger to use (1
              index, 2 middle, 3 ring, 4 little); a bar is one finger across
              several strings; &times; means don't play that string and &#9675;
              means play it open.
            </li>
            <li>
              The note buttons and the grid below let you browse every chord on
              a note. The address follows your search, so you can bookmark a
              chord or send it to someone.
            </li>
          </ul>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('setlists')" id="setlists">
          <h2>Setlists and stars</h2>
          <ul>
            <li>
              <strong>Star</strong> a song to put it on your quick list
              (alphabetical). <strong>Start Stage Mode</strong> on the Songs
              page plays your starred songs one after another.
            </li>
            <li>
              <strong>Your own setlists</strong> are for performing solo:
              <Link :href="mySetlists.index()" class="link">Setlists</Link>
              &rarr; <strong>+ New setlist</strong>, add any song you can open,
              put them in order with &#9650;/&#9660;, then
              <strong>Start Stage Mode</strong> to play them in that order.
            </li>
            <li>
              From a song's page, <strong>Add to setlist&hellip;</strong> adds
              it to one of your setlists (or starts a new one).
            </li>
          </ul>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('groups')" id="groups">
          <h2>Groups and sharing</h2>
          <p>
            A group is a shared songbook for a band. An admin creates it; its
            owner adds members by their email address.
          </p>
          <ul>
            <li>
              <strong>Share a song</strong>: on your song's page, tick the
              groups to share it with. Members can open it and use it in Stage
              Mode; only you can edit it.
            </li>
            <li>
              <strong>Let members help with the timing</strong>: tick &ldquo;Let
              group members edit its karaoke sync and line timing&rdquo; on the
              song's page and they can do the syncing too. The lyrics and chords
              stay yours.
            </li>
            <li>
              <strong>Group setlists</strong>: the group's owner makes them from
              the group page &rarr; <strong>Setlists</strong>, using songs
              shared with the group. Everyone in the group can run them in Stage
              Mode.
            </li>
            <li>Anyone who isn't the owner can leave a group from its page.</li>
          </ul>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('live-sync')" id="live-sync">
          <h2>Live Sync with your band</h2>
          <p>
            Everyone follows the same song on their own phone, tablet or laptop,
            highlighted together.
          </p>
          <ol>
            <li>
              Open the group and choose a song, then
              <strong>Start live session</strong> &mdash; or open a group
              setlist and click <strong>Go Live with the group</strong>.
            </li>
            <li>
              Everyone else opens the group's page, sees
              <strong>Live now</strong>, and clicks
              <strong>Join live session</strong>.
            </li>
            <li>
              Whoever started it leads: Play/Pause, Restart, Next/Previous song
              and Tempo, and in Settings the count-in and
              <strong>End session</strong>.
            </li>
          </ol>
          <p>
            The song, the place in it and the tempo are shared. The key, text
            size, view and chords on/off are each person's own &mdash; so a
            guitarist with a capo and the singer can each pick their key.
          </p>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('stage-mode')" id="stage-mode">
          <h2>Stage Mode</h2>
          <p>
            Stage Mode is the big-screen display for singing on a TV. Open a
            song and click <strong>Stage Mode</strong>, or play a setlist.
          </p>
          <ul>
            <li>
              <strong>Karaoke view</strong>: two lines at a time, lighting up as
              they're sung, with the next line below. A countdown shows before
              the vocals come back in after an intro or break.
            </li>
            <li>
              <strong>Sheet view</strong>: the whole chord sheet, scrolling past
              a reading line like a teleprompter.
            </li>
            <li>
              A song with a finished <strong>karaoke sync</strong> plays its
              recording in the karaoke view. Other songs follow a
              <strong>tempo guide</strong> paced by the song's BPM (and its line
              timing, if it has some).
            </li>
            <li>
              The buttons along the bottom hide while the song plays; move the
              mouse, touch the screen or press any key to bring them back. With
              a TV remote, use the arrows and OK.
            </li>
            <li>
              <strong>Settings</strong> has beats per line, count-in, flats or
              sharps, how early lines arrive in the sheet view, and full screen.
              Your choices are remembered on each device.
            </li>
          </ul>
          <h3>Keyboard shortcuts</h3>
          <table class="keys">
            <tbody>
              <tr>
                <td><kbd>Space</kbd> or <kbd>P</kbd></td>
                <td>Play / pause</td>
              </tr>
              <tr>
                <td><kbd>R</kbd> or <kbd>Home</kbd></td>
                <td>Restart the song</td>
              </tr>
              <tr>
                <td><kbd>N</kbd> or <kbd>Page Down</kbd></td>
                <td>Next song</td>
              </tr>
              <tr>
                <td><kbd>Page Up</kbd></td>
                <td>Previous song</td>
              </tr>
              <tr>
                <td><kbd>,</kbd> / <kbd>.</kbd></td>
                <td>Slower / faster (tempo, or scroll speed)</td>
              </tr>
              <tr>
                <td><kbd>[</kbd> / <kbd>]</kbd></td>
                <td>Key down / up</td>
              </tr>
              <tr>
                <td><kbd>-</kbd> / <kbd>+</kbd></td>
                <td>Smaller / bigger text</td>
              </tr>
              <tr>
                <td><kbd>K</kbd> or <kbd>V</kbd></td>
                <td>Switch between karaoke and sheet view</td>
              </tr>
              <tr>
                <td><kbd>C</kbd></td>
                <td>Chords on / off (karaoke view)</td>
              </tr>
              <tr>
                <td><kbd>M</kbd></td>
                <td>Vocals on / guide / off (synced songs)</td>
              </tr>
              <tr>
                <td><kbd>S</kbd></td>
                <td>Scrolling on / off (sheet view)</td>
              </tr>
              <tr>
                <td><kbd>F</kbd></td>
                <td>Full screen</td>
              </tr>
              <tr>
                <td><kbd>Esc</kbd></td>
                <td>Hide the controls</td>
              </tr>
            </tbody>
          </table>
          <p class="note">
            Changing the key of a recording needs the app to be opened over
            <code>https</code> (or on the computer it runs on).
          </p>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('line-timing')" id="line-timing">
          <h2>Line timing</h2>
          <p>
            Real songs don't give every line the same length. Line timing tells
            the tempo guide how long each line really lasts, so the highlight
            and the sheet's scrolling keep the singer's pace. Open a song and
            click <strong>Line timing</strong>.
          </p>
          <ol>
            <li>
              Click <strong>Tap along from the top</strong> (or
              <strong>Tap from here</strong> on any line).
            </li>
            <li>
              After the count-in, sing or play along and press
              <kbd>Space</kbd> (or <strong>Next line</strong>) the moment each
              next line begins.
            </li>
            <li>
              Or set lengths by hand in beats with &minus;/+.
              <strong>Preview</strong> plays it as the TV will show it.
            </li>
            <li>Save.</li>
          </ol>
          <table class="keys">
            <tbody>
              <tr>
                <td><kbd>Space</kbd></td>
                <td>Next line starts</td>
              </tr>
              <tr>
                <td><kbd>Backspace</kbd></td>
                <td>Undo the last tap and back up</td>
              </tr>
              <tr>
                <td><kbd>Esc</kbd></td>
                <td>Stop</td>
              </tr>
            </tbody>
          </table>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('karaoke-sync')" id="karaoke-sync">
          <h2>Karaoke sync</h2>
          <p>
            A karaoke sync lights up the lyrics in step with the song's real
            recording, like a karaoke player. Open a song and click
            <strong>Karaoke sync</strong>.
          </p>
          <ol>
            <li>
              <strong>Upload the audio</strong> (mp3, wav, m4a&hellip; up to 30
              MB). It's saved with the song, so you only do this once.
            </li>
            <li>
              Check the lyrics in the text box: a single line break makes the
              second line of a screen, a blank line starts a new screen.
              <code>[Instrumental]</code> marks a break; <code>[Male]</code>,
              <code>[Female]</code>, <code>[All]</code> mark duet parts. Click
              <strong>Build screens</strong> after adding or removing lines.
            </li>
            <li>
              Under <strong>How to sync</strong>, choose
              <strong>Tap each line</strong> (easiest) or
              <strong>Tap each word</strong> (exact).
            </li>
            <li>
              Press <kbd>Enter</kbd> to start, then <kbd>Space</kbd> the moment
              each line starts. Tap at the start of each instrumental break too.
              To mark where a line ends, hold <kbd>Space</kbd> while it's sung
              and let go when it ends.
            </li>
            <li>
              Made a mistake? Press <kbd>R</kbd> to back up and tap the last
              line again (press it again to go back further).
            </li>
            <li>
              Press <kbd>Ctrl</kbd>+<kbd>S</kbd> (or
              <strong>Save sync</strong>). You can save a half-done sync and
              finish it later &mdash; <strong>Tap the rest</strong> taps only
              the lines still missing.
            </li>
          </ol>
          <p>
            The practice screen and the <strong>Line taps</strong> list sit side
            by side, so you can watch both while you tap. The list follows the
            line you're about to tap. In line mode the app works out the tempo
            from your taps and places the words on the beat for you; pick
            another tempo from <strong>Best matches</strong>, or change the
            <strong>Syllable pace</strong>, if the highlight runs ahead or
            behind.
          </p>
          <h3>Keyboard shortcuts &mdash; tap each line</h3>
          <table class="keys">
            <tbody>
              <tr>
                <td><kbd>Enter</kbd></td>
                <td>Start / stop tapping</td>
              </tr>
              <tr>
                <td><kbd>Space</kbd></td>
                <td>
                  Tap as a line starts (hold it while the line is sung to mark
                  where it ends)
                </td>
              </tr>
              <tr>
                <td><kbd>R</kbd></td>
                <td>
                  Re-tap: back up and tap the last line again; press again to go
                  back one more line. When stopped, re-taps from the line picked
                  in the list.
                </td>
              </tr>
              <tr>
                <td><kbd>Backspace</kbd></td>
                <td>Undo the last tap</td>
              </tr>
              <tr>
                <td><kbd>&uarr;</kbd> / <kbd>&darr;</kbd></td>
                <td>
                  Pick a line in the list (when stopped) &mdash; or click it
                </td>
              </tr>
              <tr>
                <td><kbd>P</kbd></td>
                <td>Play from the picked line; again to pause</td>
              </tr>
              <tr>
                <td><kbd>[</kbd> / <kbd>]</kbd></td>
                <td>
                  Move the picked line's tap 0.05 s earlier / later (hold
                  <kbd>Shift</kbd> for 0.01 s)
                </td>
              </tr>
              <tr>
                <td><kbd>Esc</kbd></td>
                <td>Stop</td>
              </tr>
              <tr>
                <td><kbd>Ctrl</kbd>+<kbd>S</kbd></td>
                <td>Save (<kbd>&#8984;</kbd>+<kbd>S</kbd> on a Mac)</td>
              </tr>
            </tbody>
          </table>
          <h3>Keyboard shortcuts &mdash; tap each word</h3>
          <table class="keys">
            <tbody>
              <tr>
                <td><kbd>Enter</kbd></td>
                <td>Start / stop tapping</td>
              </tr>
              <tr>
                <td><kbd>Space</kbd></td>
                <td>Tap as each word (or syllable) starts</td>
              </tr>
              <tr>
                <td><kbd>R</kbd></td>
                <td>Back up and tap the last word again</td>
              </tr>
              <tr>
                <td><kbd>Backspace</kbd> or <kbd>&larr;</kbd></td>
                <td>Undo the last tap</td>
              </tr>
              <tr>
                <td><kbd>&rarr;</kbd></td>
                <td>Skip a word</td>
              </tr>
              <tr>
                <td><kbd>Esc</kbd></td>
                <td>Stop</td>
              </tr>
            </tbody>
          </table>
          <p class="note">
            The Line taps list also has &#9654; (play from just before a line),
            &minus;/+ (move its tap) and <strong>Re-tap</strong> buttons on
            every line. In word mode, click a word in
            <strong>Tapped times</strong> to re-tap from there.
          </p>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('timing-marks')" id="timing-marks">
          <h2>Timing marks</h2>
          <p>
            In line mode, small marks typed into the sync's lyrics fine-tune how
            the highlight moves from word to word. They never show on screen,
            and they apply as you type &mdash; no re-tapping needed.
          </p>
          <table class="keys">
            <tbody>
              <tr>
                <td><code>~</code></td>
                <td>
                  Hold a word one syllable longer per <code>~</code>:
                  <code>ma-hal~~ kita</code>
                </td>
              </tr>
              <tr>
                <td><code>/</code></td>
                <td>
                  A pause; the highlight waits:
                  <code>ikaw / at ako</code>. At the start of a line it delays
                  the first word: <code>// Oh</code>
                </td>
              </tr>
              <tr>
                <td><code>^</code></td>
                <td>
                  Quick: half as long per <code>^</code>, so the highlight moves
                  on sooner: <code>Si^ Annie</code>, <code>Si^^</code>,
                  <code>Si^^^</code>
                </td>
              </tr>
              <tr>
                <td><code>|</code></td>
                <td>
                  Split a long word into syllables that light up one by one:
                  <code>a|ma|zing</code>
                </td>
              </tr>
            </tbody>
          </table>
          <p class="note">
            Hyphenated words (<code>Gabi-gabi</code>) keep their hyphen and each
            part is timed as its own word.
          </p>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('vocals')" id="vocals">
          <h2>Vocals and minus-one tracks</h2>
          <p>
            For a song with a finished karaoke sync, Stage Mode's karaoke view
            has a <strong>Vocals</strong> button (or <kbd>M</kbd>) that switches
            between:
          </p>
          <dl class="defs">
            <dt>On</dt>
            <dd>The original recording.</dd>
            <dt>Guide</dt>
            <dd>The lead vocal turned well down, to follow the melody.</dd>
            <dt>Off</dt>
            <dd>
              Just the band: the song's minus-one track if it has one, otherwise
              the lead vocal masked out of the recording.
            </dd>
          </dl>
          <ul>
            <li>
              Upload a <strong>minus-one</strong> on the Karaoke sync page.
              <strong>Auto-align</strong> lines it up with the original; nudge
              it if needed.
            </li>
            <li>
              Masking works best on studio recordings with the voice in the
              middle. It can't remove the voice from a mono recording &mdash;
              use a minus-one for those.
            </li>
            <li>
              On the Karaoke sync page, <strong>Listen to</strong> lets you hear
              the original, the masked version or the minus-one while you work.
            </li>
          </ul>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-show="visible('account')" id="account">
          <h2>Your account</h2>
          <ul>
            <li>
              <strong>Change your password</strong>:
              <Link :href="settingsPasswords.show()" class="link"
                >Settings &rarr; Password</Link
              >. Type your current password, then the new one twice (at least 12
              characters).
            </li>
            <li>
              <strong>Forgot your password?</strong> Ask an admin to set a new
              one for you. You'll sign in with it and then be asked to choose
              your own right away.
            </li>
            <li>
              <strong>Signed in somewhere you shouldn't be?</strong> Settings
              &rarr; Sessions lists your signed-in devices; log any of them out
              there.
            </li>
            <li>
              Settings &rarr; Profile, Email and Appearance (light or dark) are
              there too.
            </li>
          </ul>
        </section>

        <!-- ------------------------------------------------------------ -->
        <section v-if="isAdmin" v-show="visible('admin')" id="admin">
          <h2>For admins</h2>
          <ul>
            <li>
              <strong>Add a user</strong>: Admin &rarr; Users &rarr;
              <strong>+ New user</strong>. <strong>Generate password</strong>
              makes a random one. Tick &ldquo;Mark as verified&rdquo; if you
              know the email is theirs, and leave &ldquo;Ask them to choose
              their own password&rdquo; on.
            </li>
            <li>
              <strong>Reset a forgotten password</strong>: Admin &rarr; Users
              &rarr; <strong>Reset password</strong> next to their name. A
              random password is ready (<strong>Easy to share</strong> or
              <strong>Strong</strong>); click <strong>Set password</strong>,
              then copy the password or the ready-made message and send it to
              them privately. They're signed out everywhere and choose their own
              password when they next sign in.
            </li>
            <li>
              <strong>Make a group</strong>: Groups &rarr;
              <strong>+ New group</strong>. You become its owner and can add
              members by email.
            </li>
            <li>
              <strong>Activity</strong>: Admin &rarr; Activity shows sign-ins,
              failed sign-ins and changes, by person, kind and date.
            </li>
          </ul>
        </section>
      </div>
    </div>
  </AppLayout>
</template>

<style scoped>
.help-layout {
  display: grid;
  gap: 1.5rem;
  align-items: start;
}
@media (min-width: 1024px) {
  .help-layout {
    grid-template-columns: 15rem minmax(0, 1fr);
  }
  .help-toc {
    position: sticky;
    top: 0.75rem;
    max-height: calc(100dvh - 1.5rem);
    overflow-y: auto;
  }
}
.help-content {
  display: flex;
  flex-direction: column;
  gap: 2rem;
  max-width: 48rem;
  min-width: 0;
  line-height: 1.6;
}
.help-content section {
  scroll-margin-top: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}
.help-content h2 {
  font-size: 1.35rem;
  font-weight: 700;
  padding-bottom: 0.25rem;
  border-bottom: 1px solid var(--border);
}
.help-content h3 {
  font-size: 1rem;
  font-weight: 600;
  margin-top: 0.5rem;
}
.help-content ul {
  list-style: disc;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.help-content ol {
  list-style: decimal;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}
.help-content code {
  background: var(--muted);
  border-radius: 0.25rem;
  padding: 0 0.3rem;
  font-size: 0.875em;
}
.help-content kbd {
  display: inline-block;
  min-width: 1.6em;
  padding: 0 0.35rem;
  border: 1px solid var(--border);
  border-bottom-width: 2px;
  border-radius: 0.3rem;
  background: var(--muted);
  font-family: inherit;
  font-size: 0.8em;
  line-height: 1.6;
  text-align: center;
  white-space: nowrap;
}
.sample {
  overflow-x: auto;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--muted);
  font-size: 0.85rem;
  line-height: 1.5;
}
.keys {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}
.keys td {
  padding: 0.4rem 0.6rem;
  border-top: 1px solid var(--border);
  vertical-align: top;
}
.keys tr:first-child td {
  border-top: none;
}
.keys td:first-child {
  width: 1%;
  white-space: nowrap;
}
.defs {
  display: grid;
  grid-template-columns: auto 1fr;
  gap: 0.35rem 1rem;
}
.defs dt {
  font-weight: 600;
}
.note {
  padding: 0.6rem 0.8rem;
  border-left: 3px solid var(--border);
  background: color-mix(in oklab, var(--muted) 60%, transparent);
  border-radius: 0 0.4rem 0.4rem 0;
  font-size: 0.875rem;
  color: var(--muted-foreground);
}
.link {
  text-decoration: underline;
  text-underline-offset: 2px;
}
.link:hover {
  color: var(--foreground);
}
</style>
