<script lang="ts">
  import { onMount } from 'svelte'
  import { tweened } from 'svelte/motion'
  import { cubicOut } from 'svelte/easing'
  import axios from 'axios'

  let currentStatus = {
    busy: false,
    job: '',
    currentFrames: 0,
    totalFramesCount: 0,
    fps: 0,
    speed: 0,
    progress: 'NaN'
  }

  let queue = {
    length: 0,
    queue: []
  }

  const progress = tweened(0, {
    duration: 400,
    easing: cubicOut
  })

  const getStatus = async () => {
    const response = await axios.get('/status')
    currentStatus = response.data
  }

  const getQueue = async () => {
    const response = await axios.get('/queue')
    queue = response.data
  }

  onMount(() => {
    getStatus()
    getQueue()
    setInterval(() => {
      getStatus()
      getQueue()
      if (currentStatus.progress !== 'NaN') {
        progress.set(parseFloat(currentStatus.progress))
      } else {
        progress.set(0)
      }
    }, 1000)
  })
</script>

<div class="w-full h-screen flex flex-col gap-6 justify-center items-center bg-white dark:bg-black">
  <h1 class="font-bold text:2xl sm:text-6xl dark:text-teal-200 text-teal-800 flex flex-col">
    <span>Auto HLS Status</span>
  </h1>
  <div class="w-4/5 flex flex-col gap-2 justify-start items-center">
    <p class="font-medium text-lg sm:text-4xl dark:text-teal-200 text-teal-800">
      Status: {currentStatus.busy ? 'Converting' : 'Available'}
    </p>
    {#if currentStatus.busy}
      <p class="text-base sm:text-2xl dark:text-teal-200 text-teal-800">
        Current Job: {currentStatus.job} ({currentStatus.fps} fps) ({currentStatus.speed}x) ({$progress.toFixed(
          2
        )}%)
      </p>
      <progress
        class="w-full dark:progress-dark progress h-5 text-base sm:text-lg text-center dark:text-teal-800 text-teal-200"
        value={$progress.toFixed(2)}
        max="100"
        data-label="{currentStatus.currentFrames}/{currentStatus.totalFramesCount} frames ({$progress.toFixed(
          2
        )}%)"
      />
    {/if}
  </div>
  {#if queue.length > 0}
    <div class="w-4/5 flex flex-col gap-2 justify-center items-center">
      <p class="font-medium text-lg sm:text-4xl dark:text-teal-200 text-teal-800">Queue</p>
      <table
        class="w-full table-auto border-collapse border dark:border-gray-100 border-gray-800 dark:text-teal-200 text-teal-800 text-base sm:text-2xl text-center"
      >
        <thead>
          <tr>
            <th
              class="border dark:border-gray-100 border-gray-800 dark:bg-gray-100 bg-gray-800 dark:text-teal-800 text-teal-200"
              >ID</th
            >
            <th
              class="border dark:border-gray-100 border-gray-800 dark:bg-gray-100 bg-gray-800 dark:text-teal-800 text-teal-200"
              >Name</th
            >
          </tr>
        </thead>
        <tbody>
          {#each queue.queue as job, id}
            <tr>
              <td class="border dark:border-gray-100 border-gray-800">{id}</td>
              <td class="border dark:border-gray-100 border-gray-800">{job.name}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
  {/if}
</div>
