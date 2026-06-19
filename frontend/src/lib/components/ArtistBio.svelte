<script lang="ts">
  // アーティストの解説（Biography）。未生成ならマウント時に1人ぶん生成する。
  import { onMount } from "svelte";
  import type { Artist } from "$lib/types";
  import Markdown from "./Markdown.svelte";
  import { generateBiography, regenerateBiography } from "$lib/api";

  let { artist }: { artist: Artist } = $props();

  // 解説はローカル state として保持し、（再）生成時に差し替える。
  // 初期値をプロップから取り込むのは意図的（カードは artist.id でキー付けされ identity 安定）。
  // svelte-ignore state_referenced_locally
  let description = $state<string | null>(artist.description);
  let regenerating = $state(false);

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
</script>

<div class="artist-card">
  <h3>{artist.name}</h3>

  <div class="artist-description">
    {#if regenerating || description === null}
      Searching...
    {:else}
      <Markdown source={description} />
    {/if}
  </div>

  <button class="know-more-button" onclick={knowMore}>
    Know More "{artist.name}"
  </button>
  <button class="regenerate-button" onclick={regenerate} disabled={regenerating}>
    Regenerate biography "{artist.name}"
  </button>
</div>
