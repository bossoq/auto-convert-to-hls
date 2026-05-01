<script lang="ts">
  import { fade } from 'svelte/transition'
  import { modalViewed } from '$lib/store'
  import { clickOutside } from '$lib/clickOutside'
  import { handleModalClass } from '$lib/handleModal'
</script>

<div
  class="fixed z-20 inset-0 overflow-y-auto"
  aria-labelledby="modal-title"
  role="dialog"
  aria-modal="true"
  transition:fade
>
  <div
    class="flex items-end justify-center min-h-screen pt-4 px-4 pb-20 text-center sm:block sm:p-0"
  >
    <div class="fixed inset-0 bg-gray-500 bg-opacity-75" aria-hidden="true">
      <span class="hidden sm:inline-block sm:align-middle h-1/2 sm:h-screen" aria-hidden="true"
        >&#8203;</span
      >
      <div
        class="inline-block align-bottom bg-white rounded-lg text-left overflow-hidden shadow-xl transform transition-all sm:my-8 sm:align-middle sm:max-w-lg sm:w-full"
        use:clickOutside
        on:click_outside={(e) => handleModalClass(e, $modalViewed, true)}
      >
        <p
          class="absolute my-2 mx-3 sm:my-3 sm:mx-4 right-0 top-0 cursor-pointer text-black dark:text-white"
          on:click={(e) => handleModalClass(e, $modalViewed)}
        >
          x
        </p>
        <div class="bg-white px-4 pt-2 pb-4 sm:pt-5 sm:p-6 sm:pb-4 dark:bg-slate-800">
          <div class="sm:flex sm:items-start">
            <div class="w-full mt-3 text-center sm:mt-0 sm:mx-4 sm:text-left dark:text-white">
              <h3 class="text-base leading-6 font-medium text-gray-900 dark:text-white">
                Auto HLS Conversion Status
              </h3>
              <div class="mt-2">
                <p class="text-sm text-gray-500 dark:text-gray-300">
                  Monitors automatic MP4 to multi-rendition HLS transcoding. Supports filesystem
                  watching and Google Meet recording ingestion via Pub/Sub.
                </p>
              </div>
              <hr class="my-2" />
              <div class="mt-2">
                <h3 class="text-base font-medium underline">Renditions</h3>
                <div class="flex flex-col mt-1 w-full text-left">
                  <ul class="list-disc pl-4 text-sm text-gray-500 dark:text-white">
                    <li>1080p — 5000k video / 192k audio</li>
                    <li>720p — 2800k video / 128k audio</li>
                    <li>480p — 1400k video / 128k audio</li>
                    <li>360p — 800k video / 96k audio</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</div>
