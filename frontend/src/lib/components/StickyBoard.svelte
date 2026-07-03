<script lang="ts">
  // 付箋ボード（今回の主役機能）。アーティスト単位。
  // - 複数色から選んで 80 文字以内のメッセージを貼れる。
  // - 貼った付箋は DynamoDB（spotiapp_artists.sticky_notes）に永続化する。
  // - 付箋エリアは横スクロール（画面に入りきらない数を貼れる）。
  import type { Artist, StickyNote } from "$lib/types";
  import { addStickyNote, deleteStickyNote } from "$lib/api";

  let { artist }: { artist: Artist } = $props();

  // 選択可能な付箋カラー（バックエンドの ALLOWED_COLORS と一致）。
  const COLORS = [
    { name: "yellow", value: "#ffe14d" },
    { name: "pink", value: "#f7c5e0" },
    { name: "purple", value: "#e3c8f5" },
    { name: "green", value: "#c8f0d8" },
    { name: "blue", value: "#c5e3f7" },
    { name: "orange", value: "#ffd6a8" },
  ];

  const MAX_LEN = 80;

  // DB から渡された付箋を初期値に取り込む（カードは artist.id でキー付けされ identity 安定）。
  // svelte-ignore state_referenced_locally
  let notes = $state<StickyNote[]>([...artist.stickyNotes]);

  let draft = $state("");
  let selectedColor = $state(COLORS[0].value);
  let saving = $state(false);

  const remaining = $derived(MAX_LEN - draft.length);

  async function addNote() {
    const text = draft.trim();
    if (!text || saving) return;
    saving = true;
    try {
      const note = await addStickyNote(artist.id, text.slice(0, MAX_LEN), selectedColor);
      if (note) {
        notes = [...notes, note];
        draft = "";
      }
    } catch (e) {
      console.error(e);
    } finally {
      saving = false;
    }
  }

  async function removeNote(id: string) {
    const prev = notes;
    notes = notes.filter((n) => n.id !== id); // 楽観的に削除
    try {
      await deleteStickyNote(artist.id, id);
    } catch (e) {
      console.error(e);
      notes = prev; // 失敗したら戻す
    }
  }
</script>

<div class="sticky-artist">
  <div class="sticky-composer">
    <textarea
      class="sticky-input"
      bind:value={draft}
      maxlength={MAX_LEN}
      rows="2"
      placeholder="80文字以内でメッセージを入力して付箋を貼る"
    ></textarea>

    <div class="sticky-controls">
      <div class="sticky-colors" role="radiogroup" aria-label="付箋の色">
        {#each COLORS as c (c.value)}
          <button
            type="button"
            class="sticky-swatch"
            class:selected={selectedColor === c.value}
            style={`background:${c.value}`}
            aria-label={c.name}
            aria-pressed={selectedColor === c.value}
            onclick={() => (selectedColor = c.value)}
          ></button>
        {/each}
      </div>

      <span class="sticky-counter" class:over={remaining < 0}>残り {remaining}</span>

      <button
        type="button"
        class="sticky-add"
        onclick={addNote}
        disabled={draft.trim().length === 0 || saving}
      >
        {saving ? "貼っています…" : "付箋を貼る"}
      </button>
    </div>
  </div>

  <div class="sticky-scroll">
    {#each notes as note (note.id)}
      <div class="sticky-note" style={`background:${note.color}`}>
        <button
          type="button"
          class="sticky-remove"
          aria-label="付箋を削除"
          onclick={() => removeNote(note.id)}>×</button
        >
        <p class="sticky-note-text">{note.text}</p>
      </div>
    {/each}
  </div>
</div>
