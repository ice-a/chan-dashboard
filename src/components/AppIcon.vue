<template>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path v-if="name === 'refresh'" d="M20 7v5h-5M4 17v-5h5M5.1 8a8 8 0 0 1 13.5-2L20 8M4 16l1.4 2A8 8 0 0 0 19 16" />
    <path v-else-if="name === 'pause'" d="M9 5v14M15 5v14" />
    <path v-else-if="name === 'play'" d="m8 5 11 7-11 7Z" />
    <path v-else-if="name === 'search'" d="m20 20-4.4-4.4M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" />
    <path v-else-if="name === 'close'" d="m6 6 12 12M6 18 18 6" />
    <path v-else-if="name === 'arrow'" d="M5 12h14m-6-6 6 6-6 6" />
    <path v-else-if="name === 'star'" d="m12 3 2.75 5.58 6.16.9-4.46 4.34 1.05 6.13L12 17.06l-5.5 2.89 1.05-6.13L3.09 9.48l6.16-.9Z" />
    <path v-else-if="name === 'download'" d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4" />
    <path v-else-if="name === 'clock'" d="M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    <path v-else-if="name === 'database'" d="M19 6c0 1.7-3.1 3-7 3S5 7.7 5 6s3.1-3 7-3 7 1.3 7 3v12c0 1.7-3.1 3-7 3s-7-1.3-7-3V6m14 6c0 1.7-3.1 3-7 3s-7-1.3-7-3" />
    <path v-else-if="name === 'info'" d="M12 11v6m0-10v.1M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    <path v-else d="M4 19 10 5l4 9 6-8M3 21h18" />
  </svg>
</template>
<script setup lang="ts">
defineProps<{ name: string }>();
</script>
<style scoped>
svg { width: 18px; height: 18px; flex-shrink: 0; }
</style>
