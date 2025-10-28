<script lang="ts">
  import Canvas from './lib/Canvas.svelte'
</script>

<Canvas />

<style>
  :global(html),
  :global(body) {
    margin: 0;
    padding: 0;
    overflow: hidden;
    width: 100%;
    height: 100%;
  }

  :global(#app) {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
  }
</style>
