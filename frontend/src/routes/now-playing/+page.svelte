<script lang="ts">
  // 再生中画面。縦1カラム構成（上から順に）:
  //   Now Playing → Artist Info → Sticky Note（主役機能）→ Biography
  import { onMount } from "svelte";
  import { getCurrentlyPlaying, getArtistProfiles } from "$lib/api";
  import type { Track, Artist } from "$lib/types";
  import TrackPanel from "$lib/components/TrackPanel.svelte";
  import ArtistInfoCard from "$lib/components/ArtistInfoCard.svelte";
  import ArtistBio from "$lib/components/ArtistBio.svelte";
  import StickyBoard from "$lib/components/StickyBoard.svelte";

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
          <ArtistInfoCard {artist} />
        {/each}
      {/if}
    </div>
  </div>

  <!-- 主役機能：付箋ボード。Biography より上に、目立つ形で配置する。アーティスト単位。 -->
  <section class="sticky-board">
    <h2 class="sticky-title">Sticky Note</h2>
    {#if artists.length === 0}
      <p class="sticky-empty">再生中のアーティストがいません。</p>
    {:else}
      {#each artists as artist (artist.id)}
        <StickyBoard {artist} showLabel={artists.length > 1} />
      {/each}
    {/if}
  </section>

  <div class="bio-panel">
    <div id="bio-title">Biography</div>
    <div id="bio-info">
      {#if artistsLoading}
        <p>Searching...</p>
      {:else if artistsError}
        <p>{artistsError}</p>
      {:else if artists.length === 0}
        <p>No artist info.</p>
      {:else}
        {#each artists as artist (artist.id)}
          <ArtistBio {artist} />
        {/each}
      {/if}
    </div>
  </div>
</div>
