<template>
  <div class="score-cell" :class="kind"><div class="score-track"><i :style="{ width: `${score}%` }" /></div><strong>{{ score.toFixed(0) }}</strong></div>
</template>
<script setup lang="ts">
defineProps<{ score: number; kind: 'chan' | 'momentum' }>();
</script>
