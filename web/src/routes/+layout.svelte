<script lang="ts">
  import '../app.css'
  import Head from '$lib/components/Head.svelte'
  import Menu from '$lib/components/Menu.svelte'
  import ThemeSelector from '$lib/components/ThemeSelector.svelte'
  import Modal from '$lib/components/Modal.svelte'
  import { darkTheme, modalViewed } from '$lib/store'

  const url = 'https://vodstatus.picturo.us'
  const title = 'Auto HLS Conversion Status'
  const description = 'Auto HLS Conversion Status for Unraid Server'

  const menuItems = []
  const imageUrl = `${url}/screenshot.jpg`
  const gtagId = null
  const themeIcons = ['🌞 Toggle Light mode', '🌙 Toggle Dark mode']
</script>

<Head {title} {description} {url} {imageUrl} {gtagId} />
<main class={$darkTheme && 'dark'}>
  <ThemeSelector {themeIcons} />
  <Menu items={menuItems} />
  {#if $modalViewed}
    <Modal />
  {/if}
  <slot />
</main>
