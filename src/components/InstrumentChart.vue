<template>
  <div class="instrument-chart">
    <div class="chart-modebar"><div role="group" aria-label="结构图范围"><button :class="{ active: range === 100 }" @click="setRange(100)">近100日</button><button :class="{ active: range === 0 }" @click="setRange(0)">全部结构</button></div><span>原始K线 · 合并结构坐标</span></div>
    <div ref="chartEl" class="instrument-chart-canvas" role="img" aria-label="原始K线、分型、笔、中枢与合并K线MACD结构图" />
    <div class="structure-legend"><span><i class="legend-stroke" />已完成笔</span><span><i class="legend-pivot" />笔中枢</span><span><b class="fractal-top">顶</b>顶分型</span><span><b class="fractal-bottom">底</b>底分型</span><span>MACD：合并收盘价</span></div>
    <p class="chart-coordinate-note">分型与笔按合并K线索引计算，再映射回原始K线；中枢为笔中枢。MACD沿用评分所用合并收盘价，短序列零值不代表有效指标。</p>
  </div>
</template>
<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import * as echarts from 'echarts';
import type { ECharts, EChartsOption, LineSeriesOption } from 'echarts';
import type { InstrumentDetail } from '../../shared/dashboard';

const props = defineProps<{ detail: InstrumentDetail }>();
const chartEl = ref<HTMLElement>();
const range = ref(100);
let chart: ECharts | undefined;
let observer: ResizeObserver | undefined;

function draw() {
  if (!chartEl.value) return;
  chart ??= echarts.init(chartEl.value);
  const { candles, structure } = props.detail;
  const dates = candles.map((bar) => bar.date);
  const index = new Map(dates.map((date, i) => [date, i]));
  const point = (mergedIndex: number, price: number): [number, number] => [structure.merged[mergedIndex].endIndex, price];
  const strokeData: [number, number][][] = structure.strokes.map((stroke) => [point(stroke.si, stroke.sp), point(stroke.ei, stroke.ep)]);
  const first = range.value === 0 ? 0 : Math.max(0, candles.length - range.value);
  const zoomStart = first / Math.max(1, candles.length - 1) * 100;
  const fractals = structure.fractals.filter((fractal) => structure.merged[fractal.idx].endIndex >= first).map((fractal) => ({ value: point(fractal.idx, fractal.price), fractal }));
  const pivots: NonNullable<LineSeriesOption['markArea']>['data'] = structure.pivots.map((pivot) => {
    const start = index.get(pivot.sdt) ?? 0;
    return [{ xAxis: dates[start], yAxis: pivot.zg }, { xAxis: pivot.edt, yAxis: pivot.zd }];
  });
  const option: EChartsOption = {
    animation: false,
    axisPointer: { link: [{ xAxisIndex: 'all' }], label: { backgroundColor: '#6c506d' } },
    tooltip: { trigger: 'axis', backgroundColor: '#2c2331', borderWidth: 0, textStyle: { color: '#fff', fontSize: 11 }, padding: [10, 13], formatter: (params) => {
      const items = params as unknown as { seriesName: string; value: unknown }[];
      const candle = items.find((item) => item.seriesName === '原始K线')?.value as number[] | undefined;
      if (candle) return `${dates[candle[0]]}<br/>开 ${candle[1].toFixed(2)}　收 ${candle[2].toFixed(2)}<br/>高 ${candle[3].toFixed(2)}　低 ${candle[4].toFixed(2)}`;
      const macd = items.find((item) => item.seriesName === 'MACD柱')?.value as number[] | undefined;
      if (macd) return `合并K线 ${structure.merged[macd[0]].dt}<br/>${structure.merged[macd[0]].startDt} → ${structure.merged[macd[0]].endDt}<br/>MACD ${macd[1].toFixed(3)}`;
      return '';
    } },
    legend: { top: 0, left: 0, itemWidth: 16, itemHeight: 7, textStyle: { color: '#827482', fontSize: 10 }, data: ['原始K线', '已完成笔', '顶/底分型', '成交量', 'MACD柱', 'DIF', 'DEA'] },
    grid: [
      { left: 58, right: 18, top: 34, height: 295 },
      { left: 58, right: 18, top: 354, height: 65 },
      { left: 58, right: 18, top: 455, height: 100 },
    ],
    xAxis: [
      { type: 'category', data: dates, gridIndex: 0, boundaryGap: true, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#ddd4dc' } } },
      { type: 'category', data: dates, gridIndex: 1, axisLabel: { show: false }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#ddd4dc' } } },
      { type: 'category', data: structure.merged.map((bar) => bar.endDt), gridIndex: 2, axisLabel: { color: '#9b8d99', fontSize: 9 }, axisLine: { lineStyle: { color: '#ddd4dc' } }, axisTick: { show: false } },
    ],
    yAxis: [
      { scale: true, gridIndex: 0, position: 'right', axisLabel: { color: '#9b8d99', fontSize: 9 }, splitLine: { lineStyle: { color: '#efe9ed', type: 'dashed' } } },
      { gridIndex: 1, position: 'right', axisLabel: { show: false }, splitLine: { show: false } },
      { scale: true, gridIndex: 2, position: 'right', axisLabel: { color: '#9b8d99', fontSize: 9 }, splitLine: { lineStyle: { color: '#efe9ed', type: 'dashed' } } },
    ],
    dataZoom: [{ type: 'inside', xAxisIndex: [0, 1, 2], start: zoomStart, end: 100, minValueSpan: 15 }, { type: 'slider', xAxisIndex: [0, 1, 2], bottom: 0, height: 18, start: zoomStart, end: 100, borderColor: 'transparent', backgroundColor: '#f2ecef', fillerColor: '#b39bb52e', handleStyle: { color: '#a789a9' }, textStyle: { fontSize: 9, color: '#968492' } }],
    series: [
      { name: '原始K线', type: 'candlestick', xAxisIndex: 0, yAxisIndex: 0, data: candles.map((bar, i) => [i, bar.open, bar.close, bar.low, bar.high]), itemStyle: { color: '#c5685b', color0: '#6a9b84', borderColor: '#c5685b', borderColor0: '#6a9b84' } },
      { name: '已完成笔', type: 'lines', xAxisIndex: 0, yAxisIndex: 0, coordinateSystem: 'cartesian2d', polyline: false, data: strokeData.map((coords) => ({ coords })), lineStyle: { color: '#61446d', width: 1.7 }, symbol: ['circle', 'circle'], symbolSize: 4, z: 5 },
      { name: '顶/底分型', type: 'scatter', xAxisIndex: 0, yAxisIndex: 0, data: fractals, symbolSize: 15, label: { show: true, formatter: (p) => (p.data as { fractal: { type: string } }).fractal.type === 'top' ? '顶' : '底', color: '#fff', fontSize: 8 }, itemStyle: { color: (p) => (p.data as { fractal: { type: string } }).fractal.type === 'top' ? '#b4564b' : '#55836d' }, z: 6 },
      { name: '笔中枢', type: 'line', xAxisIndex: 0, yAxisIndex: 0, data: [], silent: true, markArea: { silent: true, itemStyle: { color: '#b497b21b', borderColor: '#ab8cab', borderWidth: 1, borderType: 'dashed' }, data: pivots }, z: 2 },
      { name: '成交量', type: 'bar', xAxisIndex: 1, yAxisIndex: 1, data: candles.map((bar, i) => ({ value: [i, bar.volume], itemStyle: { color: bar.close >= bar.open ? '#c68a7e55' : '#6a9b8455' } })), barMaxWidth: 5 },
      { name: 'MACD柱', type: 'bar', xAxisIndex: 2, yAxisIndex: 2, data: structure.macd.hist.map((value, i) => ({ value: [i, value], itemStyle: { color: value >= 0 ? '#c47c7055' : '#66917c55' } })), barMaxWidth: 5 },
      { name: 'DIF', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: structure.macd.dif, showSymbol: false, lineStyle: { color: '#805b80', width: 1 } },
      { name: 'DEA', type: 'line', xAxisIndex: 2, yAxisIndex: 2, data: structure.macd.dea, showSymbol: false, lineStyle: { color: '#b19561', width: 1 } },
    ],
  };
  chart.setOption(option, { notMerge: true });
}
function setRange(value: number) { range.value = value; draw(); }
watch(() => props.detail, () => nextTick(draw));
onMounted(() => { draw(); observer = new ResizeObserver(() => chart?.resize()); observer.observe(chartEl.value!); });
onBeforeUnmount(() => { observer?.disconnect(); chart?.dispose(); });
</script>
