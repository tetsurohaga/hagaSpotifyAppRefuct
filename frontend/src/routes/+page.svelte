<script lang="ts">
  // ログイン画面（旧 /start）。Login で /api/login へフル遷移する。
  import { onMount } from "svelte";

  onMount(() => {
    document.body.classList.add("login-page");
    return () => document.body.classList.remove("login-page");
  });

  function login() {
    window.location.href = "/api/login";
  }
</script>

<svelte:head>
  <title>Login to Spotify</title>
</svelte:head>

<div class="login-container">
  <div class="login-title">Login to Spotify</div>
  <button id="login" onclick={login}>Login</button>
</div>
