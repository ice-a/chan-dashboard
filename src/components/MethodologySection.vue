<template>
  <section class="method-section" aria-labelledby="method-title"><div class="section-heading"><div><span class="section-index">05</span><h2 id="method-title">理解这张看板</h2></div><span>口径透明，比结论本身更重要</span></div><div class="method-grid">
    <article><span class="method-number">01</span><h3>缠论结构分 <small>0–100</small></h3><p>前复权（或单独标注的拆股调整）日线经过包含处理、分型、笔、中枢与MACD力度比较，再叠加末笔方向、20日涨幅和中枢位置。≥ 78 视为结构偏强。</p><span class="method-note">结构观察 ≠ 已确认买卖点</span></article>
    <article><span class="method-number">02</span><h3>动量截面分 <small>0–100</small></h3><p>组合20 / 60 / 120日收益、均线趋势、ATR波动与量能，转化为池内相对百分位。≥ 70 视为近期动量偏强。</p><span class="method-note">换样本池会改变相对排名</span></article>
    <article><span class="method-number">03</span><h3>二维共振分 <small>几何平均</small></h3><p>共振分 = √(缠论分 × 动量分)。两个维度同时偏高才有较高得分，用于横向观察，不是涨跌概率或目标收益。</p><span class="method-note">算法版本：legacy-v1</span></article>
  </div>
  <div class="risk-note"><AppIcon name="info" /><div><strong>数据与风险提示</strong><p>每5分钟重新拉取的是<strong>历史日线</strong>（前复权，或明确标注的拆股调整），包含当日未收盘K线时，分数可能在盘中变化。港股、美股与A股交易时段不同，跨市场比较并非严格同步。上游接口可能延迟、限流或改变；页面会标注来源、真实交易日与陈旧状态。</p><p>缠论与动量均为量价技术因子，不反映估值与基本面；杠杆及衍生产品尤其容易失真。以上内容仅供量化研究，不构成投资建议。市场有风险，决策需独立判断。</p></div></div>
  </section>
</template>
<script setup lang="ts">
import AppIcon from './AppIcon.vue';
</script>
