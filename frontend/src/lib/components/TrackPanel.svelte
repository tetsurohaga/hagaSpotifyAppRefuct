<script lang="ts">
  import type { Track } from "$lib/types";

  let {
    track,
    loading = false,
    onrefresh,
  }: {
    track: Track | null;
    loading?: boolean;
    onrefresh: () => void;
  } = $props();
</script>

<div class="left-panel">
  <div id="currently-playing-title">Now Playing</div>
  <button id="get-track" onclick={onrefresh}>Get Currently Playing Track</button>

  <div id="track-info">
    {#if loading}
      <p>Searching...</p>
    {:else if track}
      <p>Artist: <span id="artist">{track.artists.join(", ")}</span></p>
      <p>Track: <span id="track">{track.track}</span></p>
      {#if track.image}
        <img id="album-image" src={track.image} alt="Album Art" />
      {/if}
    {:else}
      <p>No Music Currently Playing.</p>
    {/if}
  </div>
</div>
