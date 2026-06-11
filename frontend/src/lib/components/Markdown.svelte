<script lang="ts">
  // Claude が返す Markdown を HTML 化し、DOMPurify でサニタイズして描画する。
  import { marked } from "marked";
  import DOMPurify from "dompurify";

  let { source = "" }: { source?: string } = $props();

  const html = $derived(
    DOMPurify.sanitize(marked.parse(source ?? "", { async: false }) as string),
  );
</script>

<div class="markdown-body">{@html html}</div>
