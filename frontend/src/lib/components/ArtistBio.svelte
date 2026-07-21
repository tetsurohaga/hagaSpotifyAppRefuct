<script lang="ts">
  // アーティストの解説（Biography）。未生成ならマウント時に1人ぶん生成する。
  import { onMount } from "svelte";
  import type { Artist } from "$lib/types";
  import Markdown from "./Markdown.svelte";
  import { generateBiography, regenerateBiography, saveBiography } from "$lib/api";

  let { artist }: { artist: Artist } = $props();

  // 解説はローカル state として保持し、（再）生成時に差し替える。
  // 初期値をプロップから取り込むのは意図的（カードは artist.id でキー付けされ identity 安定）。
  // svelte-ignore state_referenced_locally
  let description = $state<string | null>(artist.description);
  let regenerating = $state(false);

  // 編集モード。draft は編集中の本文、saveError は保存失敗時の表示用。
  let editing = $state(false);
  let draft = $state("");
  let saving = $state(false);
  let saveError = $state<string | null>(null);

  function knowMore() {
    window.open(artist.knowmore, "_blank");
  }

  // 未生成（null）ならマウント時に1人ぶん生成する（async 化）。
  onMount(async () => {
    if (description !== null) return;
    regenerating = true;
    try {
      description = await generateBiography(artist.id);
    } catch (e) {
      console.error(e);
    } finally {
      regenerating = false;
    }
  });

  async function regenerate() {
    regenerating = true;
    try {
      const next = await regenerateBiography(artist.id, artist.name);
      if (next) description = next;
    } catch (e) {
      console.error(e);
    } finally {
      regenerating = false;
    }
  }

  function startEdit() {
    draft = description ?? "";
    saveError = null;
    editing = true;
  }

  function cancelEdit() {
    editing = false;
    saveError = null;
  }

  async function save() {
    if (draft.trim() === "") {
      saveError = "本文が空です";
      return;
    }
    saving = true;
    saveError = null;
    try {
      const saved = await saveBiography(artist.id, draft);
      if (saved) description = saved;
      editing = false;
    } catch (e) {
      console.error(e);
      saveError = "保存に失敗しました";
    } finally {
      saving = false;
    }
  }
</script>

<div class="artist-card">
  <h3>{artist.name}</h3>

  <div class="artist-description">
    {#if regenerating || description === null}
      Searching...
    {:else if editing}
      <textarea class="bio-editor" bind:value={draft} rows="16" disabled={saving}
      ></textarea>
      {#if saveError}
        <p class="bio-error">{saveError}</p>
      {/if}
    {:else}
      <Markdown source={description} />
    {/if}
  </div>

  {#if editing}
    <button class="save-button" onclick={save} disabled={saving}>
      {saving ? "Saving..." : "Save"}
    </button>
    <button class="cancel-button" onclick={cancelEdit} disabled={saving}>
      Cancel
    </button>
  {:else}
    <button class="know-more-button" onclick={knowMore}>
      Chat About "{artist.name}"
    </button>
    <button class="edit-button" onclick={startEdit} disabled={regenerating || description === null}>
      Edit biography "{artist.name}"
    </button>
    <button class="regenerate-button" onclick={regenerate} disabled={regenerating}>
      Regenerate biography "{artist.name}"
    </button>
  {/if}
</div>
