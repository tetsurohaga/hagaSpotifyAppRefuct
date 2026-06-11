<script lang="ts">
  import type { Artist } from "$lib/types";
  import Markdown from "./Markdown.svelte";
  import { regenerateBiography } from "$lib/api";

  let { artist }: { artist: Artist } = $props();

  // 解説はローカル state として保持し、再生成時に差し替える。
  // 初期値をプロップから取り込むのは意図的（カードは artist.id でキー付けされ identity 安定）。
  // svelte-ignore state_referenced_locally
  let description = $state(artist.description);
  let regenerating = $state(false);

  function knowMore() {
    window.open(artist.knowmore, "_blank");
  }

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
  {#if artist.image}
    <img src={artist.image} alt={`${artist.name} Image`} />
  {/if}
  <span class="artist-genre">Genres: "{artist.genres.join(", ")}"</span>

  <div class="artist-description">
    {#if regenerating}
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
