<script lang="ts">
  // 再生中画面（旧 /currently_playing_page）。2 パネル構成。
  // ロード時に currently-playing と artist-profile を並行取得する。
  import { onMount } from "svelte";
  import { getCurrentlyPlaying, getArtistProfiles } from "$lib/api";
  import type { Track, Artist } from "$lib/types";
  import TrackPanel from "$lib/components/TrackPanel.svelte";
  import ArtistCard from "$lib/components/ArtistCard.svelte";

  let track = $state<Track | null>(null);
  let artists = $state<Artist[]>([]);
  let trackLoading = $state(false);
  let artistsLoading = $state(false);
  let artistsError = $state("");

  async function loadTrack() {
    trackLoading = true;
    try {
      track = await getCurrentlyPlaying();
    } catch (e) {
      console.error(e);
      track = null;
    } finally {
      trackLoading = false;
    }
  }

  async function loadArtists() {
    artistsLoading = true;
    artistsError = "";
    try {
      artists = await getArtistProfiles();
    } catch (e) {
      console.error(e);
      artists = [];
      artistsError = "No Music Currently Playing. Please try again later.";
    } finally {
      artistsLoading = false;
    }
  }

  function refresh() {
    void loadTrack();
    void loadArtists();
  }

  onMount(() => {
    refresh();
  });
</script>

<svelte:head>
  <title>Currently Playing Track</title>
</svelte:head>

<div class="container">
  <TrackPanel {track} loading={trackLoading} onrefresh={refresh} />

  <div class="right-panel">
    <div id="artist-title">Artist Info</div>
    <div id="artist-info">
      {#if artistsLoading}
        <p>Searching...</p>
      {:else if artistsError}
        <p>{artistsError}</p>
      {:else if artists.length === 0}
        <p>No artist info.</p>
      {:else}
        {#each artists as artist (artist.id)}
          <ArtistCard {artist} />
        {/each}
      {/if}
    </div>
  </div>
</div>
