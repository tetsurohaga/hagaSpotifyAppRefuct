<script lang="ts">
  // 再生中画面。縦1カラム構成。先頭に Now Playing、以降はアーティスト単位で
  //   Artist Info → Sticky Note（主役機能）→ Biography のブロックを繰り返す。
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

  {#if artistsLoading}
    <p class="artists-status">Searching...</p>
  {:else if artistsError}
    <p class="artists-status">{artistsError}</p>
  {:else if artists.length === 0}
    <p class="artists-status">No artist info.</p>
  {:else}
    <!-- アーティスト単位で Artist Info → Sticky Note → Biography をひとまとまりに表示する。 -->
    {#each artists as artist (artist.id)}
      <section class="artist-block">
        <div class="right-panel">
          <div class="artist-title">Artist Info</div>
          <div class="artist-info">
            <ArtistInfoCard {artist} />
          </div>
        </div>

        <!-- 主役機能：付箋ボード。Artist Info と Biography の間に目立つ形で配置する。 -->
        <div class="sticky-board">
          <h2 class="sticky-title">Sticky Note</h2>
          <StickyBoard {artist} />
        </div>

        <div class="bio-panel">
          <div class="bio-title">Biography</div>
          <div class="bio-info">
            <ArtistBio {artist} />
          </div>
        </div>
      </section>
    {/each}
  {/if}
</div>
