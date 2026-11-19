# 缠论 × 动量 · 二维共振看板

从单文件 HTML 迁移而来的动态前端项目。Vue 3 + TypeScript + Vite + Pinia + ECharts，配同构行情服务，可部署到 **Cloudflare Workers、Vercel Functions 或 Docker Compose**。原始 `../缠论动量二维共振看板_5分钟刷新.html` 保持不变。

## 功能

- 原 81 个港股、美股和 A 股标的，57 只个股 + 24 只 ETF。
- 按标的自动降级：东方财富 → 腾讯行情 → Nasdaq（仅美股）。
- 统一 OHLCV 校验、日期排序、去重、证券核对、130 根最低历史要求。
- 服务端缓存、过期回退、真实交易日、接收时间和逐源错误诊断。
- `legacy-v1` 保留原缠论与动量公式；纯函数截面百分位、四象限与稳定排名。
- 1 / 5 / 15 分钟刷新、暂停/恢复、手动刷新、隐藏页暂停、网络状态处理。
- 共振摘要、可点击散点图、筛选搜索与排序、数据来源面板和标的诊断抽屉。
- 无 JSONP、无 ECharts CDN、无前端行情密钥、无静态快照冒充实时行情。
- 结构研究图谱：原始K线、成交量、分型、已完成笔、笔中枢及与评分一致的合并K线MACD。
- 本机自选：固定配置池内收藏、自选筛选；默认仍按全池计算动量，不用子集重排。
- 导出：当前筛选排名 CSV、单标的完整研究 JSON、本机信号事件 CSV。
- 本机信号动态：象限、结构观察和超过5位的排名变化，最多240条，去重且忽略陈旧数据。

## 数据源与口径

| 来源 | 角色 | 支持范围 | 日线口径 |
| --- | --- | --- | --- |
| 东方财富 | 主源 | 当前标的池 | 前复权 |
| 腾讯行情 | 第一备用源 | A 股、港股有效；美股历史不足时自动跳过 | 前复权 |
| Nasdaq | 第二备用源 | 美股个股与 ETF | 历史价格，标为“拆股调整” |

一次单标的响应只采用**一个来源的完整 K 线**，不会跨源拼接历史。不同来源的复权口径、成交量和公司行动处理可能不同，切换来源后分数不保证与另一来源完全一致。Nasdaq 复权说明应作为保守标注，严格回测请使用有明确复权文档和授权的供应商。

当前版本每 5 分钟刷新的是**历史日线**，不是 5 分钟 K 线，也不是逐笔/WebSocket 推送。当日盘中 K 线可能未收盘。跨市场交易时段不同，截面比较并非严格同步。

### 当前本机实测

- `HK:00700`：腾讯，300 根，最新交易日 `2026-11-18`。
- `CN:510300`：腾讯，300 根，最新交易日 `2026-11-18`。
- `US:AAPL`：东方财富在当前网络连接被关闭，腾讯仅返回 2 根；Nasdaq 成功返回 300 根，最新交易日 `2026-11-17`，标为拆股调整。
- `US:QQQ`：Nasdaq `assetclass=etf` 成功返回 300 根。
- 整页首轮：75 / 81 个标的产生有效评分；`HK:03456` 仅 101 根有效日线，按原最低 130 根规则排除。
- 东方财富曾通过 curl 成功取得真实 JSON；本机 Node 的网络连接在后续测试中被上游关闭，因此实际页面降级为备用源。并非所有网络环境都复现这一限制。

## Cloudflare 部署（已完成）

已部署到 Workers + 静态资源 + KV：

- 线上地址：https://chan-resonance-dashboard.19431581976267.workers.dev
- KV 命名空间：`MARKET_KV`（ID `9fa0b1593cdb4dabb0a878932f4666fe`），用于跨请求日线缓存
- 实测：`/api/health` 200；`US:AAPL` 返回 Nasdaq 300 根日线，首次 `miss`（4.8s）、二次 `hit`（1.4s），KV 缓存生效
- 重新部署：`pnpm build && pnpm cf:deploy`

注意：本机网络对 `*.workers.dev` 存在 DNS 污染（解析到非 Cloudflare IP），本地测试需 `curl --resolve` 固定到真实边缘 IP（104.21.91.251 / 172.67.183.107，可用 DoH 查询）。浏览器直接访问也受此影响；绑定自有域名后即可正常访问。

## 全市场目录与扫描（2026-11 新增）

固定 81 只只是测试样例。项目现支持 **A股沪深（主板/创业板/科创板）、港交所主板普通股、美股主要交易所普通股与 ETF** 的全市场目录与后台扫描，速度可以慢，但目标是"目录完整、每只有终态、失败可重试、缺失可审计"。

### 目录来源（均经实测）

| 市场 | 来源 | 实测数量 | 状态 |
| --- | --- | ---: | --- |
| A股 | 上交所 getStockListData2（主板 + 科创板） | 1,604 + 405 | 完整分页验证 |
| A股 | 深交所 ShowReport（A股 + ETF） | 2,905 + 772（ETF 含 LOF 过滤） | 完整分页验证；当前网络偶发 fetch failed，失败轮会如实标注 |
| 港股 | 港交所 ListOfSecurities.xlsx（主板普通股） | 本机仅取到 5 条（文件被截断） | 该网络下不可靠，需在实际部署环境重试 |
| 美股 | Nasdaq screener stocks + etf | 7,291（纳入 5,807，排除权证/优先股等 1,484）+ 5,519 | 完整验证 |
| 北交所 | bse.cn 有反爬拦截 | 未同步 | 明确列为缺口，不伪造数据 |

目录同步要求逐页取完、数量与声明一致、跨来源无重复 ID；任何一页失败则该来源标记 failed，**未封口目录不会冒充全市场**。来源报告在页面"全市场目录与扫描"面板逐项展示。

### 扫描与快照

- `POST /api/catalog/sync`：同步四来源目录（需管理员令牌）。
- `POST /api/scans`：按当前目录创建全量扫描任务；服务端分片并发执行，浏览器关闭不影响进度。
- `GET /api/scans/:id`：实时进度（成功 / 历史不足 / 失败 / 待处理）。
- `POST /api/scans/:id/retry`：重试终态失败项。
- 扫描完成并封口后发布研究快照，前端按分页读取排名。

数据源按市场能力路由（CN→东财→腾讯，US→Nasdaq），不再对每个标的探测不支持的市场。单标的逻辑与 `/api/market/bars` 完全一致。

### 本地运行扫描

```bash
node server/node/index.ts --research-token <你的本地管理令牌>
# 页面"全市场目录与扫描"→（localStorage 设置 chan-admin-token=<同一令牌>）→ 同步目录 → 启动扫描
```

当前验证：13,340 只标的目录同步约 13 秒；扫描实时进度正常推进（本机网络下 CN/HK 上游不可达会进入失败台账并可重试，美股正常成功）。

### 已知缺口（如实标注，不伪造）

- 港股 ETF 目录与北交所目录暂缺来源，页面会显示来源缺口而非假装完整。
- 内存 store 重启后丢失；持久化 PostgreSQL/R2 存储为下一步（接口已按 ResearchStore 抽象预留）。
- 扫描中的失败项可重试；继承上一成功快照的封口规则已在 `shared/integrity.ts` 实现。

## 结构图谱、导出与本机历史

点击任意有效标的，打开宽幅研究抽屉。默认显示近100日原始K线与成交量，分型、已完成笔和笔中枢通过合并K线的原始起止索引回画，可切换全部结构和缩放。MACD沿用评分计算的合并收盘价，包含DIF、DEA和柱值；它不是原始日K MACD。图和分数使用同一次响应的K线，不在打开详情时重新取数。

排名工具栏支持“全部标的 / 我的自选”，星标及详情页均可收藏。收藏保存在 `localStorage` 的版本化ID列表中，损坏数据与未知代码会被忽略。自选只过滤显示，**不改变全池动量截面基准**。

- “导出当前 CSV”：只导出当前筛选结果，含UTF-8 BOM、评分、来源、行情时点、复权及算法口径。
- “导出研究 JSON”：包含该标的原始OHLCV、结构数组、MACD、指标与数据血缘，并说明坐标系。
- “本机信号动态 → 导出”：导出当前分类的信号事件CSV。

首次有效轮次只建立基线。后续只有象限变化、结构观察变化或排名变化至少5位才记录事件；相同状态不重复记录，stale结果不产生事件，盘中数据标为“盘中观察”。清空操作有二次确认，收藏不受影响。

本机收藏与历史使用当前浏览器、当前origin的 `localStorage`，不上传服务器，不是账号同步或完整行情历史；`:5173`、`:8787`、正式域名之间不共享。历史最多240条，存储失败不影响行情刷新。三种部署均无需新增数据库。

## 本地开发

要求 Node.js **24+** 和 pnpm。当前使用 Node 26、pnpm 9 验证。

```bash
pnpm install
pnpm dev
```

打开 http://127.0.0.1:5173。Vite 将 `/api` 转发至 `127.0.0.1:8787`，两个进程会一起启动。

```bash
pnpm test        # Vitest 单元测试
pnpm typecheck   # 前端、Worker、Node 与 Vercel 函数类型检查
pnpm build       # 类型检查 + dist 前端生产构建
pnpm start       # 生产模式：同一端口提供 dist 与 API
```

生产模式先执行 `pnpm build`，再运行 `pnpm start`，访问 http://127.0.0.1:8787。

`.env.example` 提供可配置项；本地 shell 中按需导出，Node 不依赖 dotenv：

| 变量 | 默认值 | 用途 |
| --- | ---: | --- |
| `HOST` / `PORT` | `127.0.0.1` / `8787` | Node 监听地址 |
| `MARKET_CACHE_TTL_SECONDS` | `300` | 已收盘 K 线短期缓存；盘中最多 60 秒 |
| `MARKET_STALE_TTL_SECONDS` | `86400` | 全部来源失败时允许回退的最长时间 |
| `MARKET_REQUEST_TIMEOUT_MS` | `9000` | 单个上游请求超时 |
| `MARKET_PROVIDER_CONCURRENCY` | `4` | 每个供应商的服务端并发上限（1–8） |

## Docker Compose

```bash
docker compose up --build
# http://localhost:8787
```

多阶段镜像使用 Node 24 Alpine，前端在构建阶段编译，生产阶段不需要安装运行时 npm 依赖。容器以非 root 用户运行，只读根文件系统、受限临时目录，含健康检查。Compose 默认映射 `8787:8787`。

```bash
docker compose down
```

## Cloudflare Workers + 静态资源

项目通过 `wrangler.jsonc` 同时托管 `dist` 和 `worker/index.ts`，`/api/*` 由 Worker 处理，其他路径回退到 SPA。共享处理器使用标准 `Request` / `Response`。

```bash
pnpm exec wrangler login
pnpm build
pnpm cf:dev
# 需要实际上线时：
pnpm cf:deploy
```

未绑定 KV 时使用 Worker 实例内存缓存，冷启动/不同实例之间不共享。生产建议创建 KV：

```bash
pnpm exec wrangler kv namespace create MARKET_KV
```

将返回的命名空间 ID 填入 `wrangler.jsonc` 中已注释的 `kv_namespaces`，绑定名保持 `MARKET_KV`。KV 提供跨实例的短期/陈旧缓存，但存在传播延迟，不应用作行情时点的权威依据。

`pnpm cf:build` 会执行前端构建及 `wrangler deploy --dry-run`，不上传、不创建云资源。Cloudflare 的公共出口能否访问全部上游，需要在目标区域实测。

## Vercel + Functions

- Vite 构建输出 `dist`。
- `api/market/[...path].ts` 处理行情接口，`api/health.ts` 处理健康检查。
- `vercel.json` 仅对非 `/api/` 路径执行 SPA 回退。
- Functions 复用同一个标准 `fetch(request)` 处理器，不需要 Express。

```bash
pnpm exec vercel login
pnpm exec vercel link
pnpm vercel:build  # 不登录也可验证官方函数构建器
pnpm vercel:dev
# 需要实际上线时：
pnpm exec vercel deploy --prod
```

Vercel 使用实例内存缓存；冷启动、扩缩容和不同实例不保证共享，也不依赖磁盘或永久后台进程。可通过平台环境变量配置与 `.env.example` 相同的参数。跨源请求需在函数所在区域实测，生产流量大时应换成有 SLA 的行情 API 和持久缓存。

## API

```text
GET /api/health
GET /api/market/providers
GET /api/market/bars?instrument=US:AAPL
GET /api/market/bars?instrument=HK:00700
GET /api/market/bars?instrument=CN:510300
```

返回 `MarketResponse`：`MarketData` 包含实际 `provider`、`adjustment`、`sourceDate`、`receivedAt`、`cache`、`stale`、`isUnclosed`、`attempts` 和完整 `candles`。失败返回结构化错误及逐源原因，HTTP 502 不代表前端的整个页面失败。

仅允许请求配置池中的标的和固定上游主机，不是任意 URL 转发代理。响应禁缓存由应用层控制，真实缓存 TTL 与命中状态显式返回。

## 代码结构

```text
src/
  components/       Vue 看板、图表、表格、数据链路与诊断
  composables/      页面存活期间的自动刷新
  config/           81 个标的及供应商映射
  domain/           legacy-v1 缠论、MACD、动量与共振纯函数
  services/         浏览器同源行情 API、导出、存储与信号归并
  stores/           请求代次、结果、陈旧状态、收藏与本机历史
shared/             前后端共享行情与展示类型
server/core/        数据源、校验、路由、缓存、标准 HTTP 处理器
server/node/        Node 静态资源与 API 宿主
worker/             Cloudflare Workers 适配
api/                Vercel Functions 适配
tests/              算法、校验、缓存与降级单元测试
```

## 算法边界与风险

`legacy-v1` 保留原包含、分型、笔、中枢与经验评分，不表示严格缠论买卖点已经完成独立校验。“中枢上方”只作为趋势观察，不直接等同于第三类买点。ATR 为近 14 个 TR 的算术平均，量能比为近 5 / 20 日平均成交量比。

失败标的不会静默从池中消失：有历史成功结果时保留并标 stale；无历史时进入诊断而不评分。动量分依赖本轮有效样本池，样本变化仍会影响相对排名，页面显示新鲜样本数和算法版本。

本项目仅供量化研究，不构成投资建议。公开网页接口可能改变、限流或受地区网络影响；商业或生产部署应使用获得授权、口径明确的数据服务。

## 验证状态

- Vitest：22 项单元测试通过（含结构映射、收藏、导出和信号历史）。
- TypeScript、Vite 生产构建：通过。ECharts 独立打包，首屏会加载图表模块。
- Cloudflare：Wrangler dry-run 配置及 Worker 打包通过，本地健康检查通过，未执行线上部署。
- Vercel：官方构建器及动态 Function 编译通过，直接 `fetch` 真实美股请求成功；CLI 本地开发需要已有登录凭据，未执行线上部署。
- Docker：当前机器无 Docker 可执行文件，已提供配置但未能实际构建容器。
