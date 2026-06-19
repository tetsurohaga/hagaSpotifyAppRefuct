<script lang="ts">
  // アーティスト情報（名前・画像・ジャンル）。Biography は ArtistBio に分離した。
  import type { Artist } from "$lib/types";

  let { artist }: { artist: Artist } = $props();
</script>

<div class="artist-card">
  <h3>{artist.name}</h3>
  {#if artist.image}
    <img src={artist.image} alt={`${artist.name} Image`} />
  {/if}
  <span class="artist-genre">Genres: "{artist.genres.join(", ")}"</span>
</div>
