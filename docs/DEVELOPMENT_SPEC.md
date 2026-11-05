# A股简单：开发规格

本文定义代码当前架构、数据契约、计算规则、PWA 生命周期、测试与发布要求。它仅对最新实现负责；调整功能时直接更新对应章节，不记录变更日志、不累积旧方案，也不把未来计划写成当前规格。

## 1. 技术栈与目录

运行时采用原生 HTML、CSS、JavaScript，ECharts 5.6.0 使用本地 vendor 文件。没有应用框架、服务器端游戏逻辑或数据库。Node.js 负责本地静态服务、自动测试、PWA 发布生成及 gh-pages 发布。

| 文件 | 职责 |
| --- | --- |
| index.html | 页面元数据、PWA manifest、图标和 defer 脚本加载顺序 |
| styles.css | 公共工作台、表单、桌面与手机布局、主题、版本入口 |
| hs300_list.js | 固定股票列表，全局 HS300_LIST |
| decoder.js | 新浪脚本加载、解码、前复权，全局 Util |
| engine.js | 纯计算和存档契约，浏览器 TradingEngine、Node module.exports |
| market-chart.js | 已知数据裁剪、周期聚合、指标预热、ECharts 联动，全局 MarketChart |
| game.js | 游戏状态、DOM 渲染、事件、设置、战绩与更新前保存 |
| pwa.js | 安装提示、Service Worker 注册、检查状态、应用更新，全局 AppPWA |
| manifest.webmanifest | 应用身份、相对 scope/start_url、图标和 standalone 模式 |
| icons/ | SVG 标识、PNG 安装图标、Apple 与 maskable 图标 |
| version.js | 构建生成的当前版本与内容指纹，window.APP_RELEASE |
| sw.js | 构建生成的 Service Worker，发布常量、应用资源列表和 worker 模板 |
| scripts/sw-template.js | Service Worker 生命周期与 fetch 策略模板 |
| scripts/build-pwa.cjs | 校验公开版本、计算内容指纹、生成资源、构造 dist |
| server.js | 仅监听 127.0.0.1 的开发静态服务，默认端口 5173 |
| tests/engine.test.js | 周期、交易、指标、存档与未来数据隔离测试 |
| tests/pwa.test.js | 发布指纹、缓存原子性、离线、作用域与安装资源测试 |
| docs/PRODUCT_SPEC.md | 当前产品契约 |
| docs/DEVELOPMENT_SPEC.md | 当前开发契约 |
| dist/ | 只包含发布运行资源的输出，不纳入源码提交 |

脚本顺序为 ECharts → 标的列表 → 解码器 → 引擎 → 图表 → 当前版本 → PWA → 游戏，全部 defer，在 DOM 解析后依次执行。游戏调用 AppPWA.markup() 创建版本入口，在每次替换应用 DOM 后调用 AppPWA.sync() 恢复安装及版本状态。

## 2. 引擎与设置契约

TradingEngine 导出 DEFAULTS、settings、dateString、aggregate、sma、ema、macd、kdj、createGame、currentBar、asset、drawdown、advance、serialize、hydrate、migrate、record。

settings(input) 从默认值补全、校验并归一化，不修改调用方对象：

| 字段 | 默认值 | 契约 |
| --- | --- | --- |
| days | 30 | 整数 7–200 |
| initialCash | 1000000 | 整数 10000–100000000 |
| history | 200 | 引擎允许整数 120–2000，UI 提供固定预设 |
| commission、slippage | 0 | 百分比数值 0–1，使用时除以 100 |
| lotSize | 1 | 1 或 100 |
| period | day | day/week/month |
| ma、volume、macd | true | 布尔 |
| kdj | false | 布尔 |
| maPeriods | [5,10,20,60] | 2–250 不重复整数，最多 6 条 |
| volumePeriods | [5,10] | 2–250 不重复整数，最多 2 条 |
| macdFast/Slow/Signal | 12/26/9 | 2–100 / 3–200 / 2–100，fast < slow |
| kdjPeriod/K/D | 9/3/3 | 2–100 / 1–50 / 1–50 |
| costLine、tradeMarkers | true | 主图辅助显示 |
| theme | light | light/dark |
| colorScheme | red-up | red-up/green-up |
| confirmOrders、shortcuts、coach | true | 交互偏好 |
| defaultSize | 0.25 | 比例 0.01–1；UI 提供 1/4、1/3、1/2、1 |

表单使用 required、min、max、step 校验，数组周期另外校验格式、重复和数量，MACD 校验快慢关系。错误字段位于隐藏分类时先切换分类，再聚焦并报告错误。settings() 用于存档和输入兜底；正常 UI 提交不能依赖静默修正代替错误提示。

## 3. 数据契约

### 3.1 行情条目

行情按日期升序存放：

```js
{ date: Date, open: number, high: number, low: number,
  close: number, volume: number, amount: number, prevclose?: number }
```

价格必须是有限正数，date 必须是有效日期。数据在调用 createGame 前经 Util.applyQfq() 进行前复权。applyQfq 使用日线 prevclose 与前一收盘比值形成因子，对除权日之前的价格累乘；成交量不进行价格复权。当前复权基准是加载到的完整行情最新价格。

### 3.2 对局 G

```js
{
  id, stock: { name, code?, fullCode }, kList, config,
  histStart, gameStart, endIdx, day,
  cash, shares, costBasis, initCash, totalFees,
  actions: [{ day, action, size, quantity, price, fee, note }],
  dailyRows: [{ day, date, close, chg, act, asset }],
  revealed
}
```

索引含义：histStart 为可见历史起点，gameStart 为第一个训练日索引，endIdx 为最后训练日的包含索引，day 为已完成决策数，取 0…config.days。day=0 时当前价格来自 gameStart−1。id 用于已完成记录去重，不作为身份认证。

createGame 以 config.history 为最小训练起点，以 kList.length−30−config.days 为最大训练起点，均匀抽样。config 是开局设置快照；进行中不能用全局设置替代它计算交易费用和终点。

### 3.3 持久化

公共命名空间：trade_settings_v2、trade_game_current_v2、trade_game_records_v1。一次性更新草稿使用 sessionStorage 的 trade_order_draft_v1。客户端还支持既有存档键读取，属于兼容输入，公共界面和新写入均不含个人署名。

serialize() 保留 histStart 前最多 1,500 条已知行情及训练区间，到 endIdx 为止，日期转毫秒整数并将索引相对存储切片重新定位。hydrate() 恢复 Date、归一化 config、校验进度/索引/账户有限数值，失败返回 null。

兼容的紧凑日 K 格式为 kSlice [{ d,o,h,l,c,v,a }]，通过 migrate() 转成统一 G；当前开发不得删除兼容入口而造成用户进行中的有效存档丢失。

write() 捕获本地存储错误并提醒。完成记录按 id 去重；记录成功持久化后才清除进行中存档。保存完成记录失败时留下已结算 G，下一次打开再次尝试恢复完成记录。

决策备注使用 HTML 转义输出；CSV 所有单元格双引号包装、双引号转义，可能触发表格公式的前缀先转成文本。

## 4. 交易执行算法

advance(g, action, size, note) 只接受 buy/sell/hold，买卖 size 必须有限且在 (0,1]。结束、非法操作、空仓卖出或无法买到交易单位时抛错。错误在账户变更前发生，不消耗交易日。

设下一交易日收盘为 C，佣金 r=config.commission/100，滑点 s=config.slippage/100，单位 L=config.lotSize：

```text
买入价 P = C × (1+s)
买入股数 Q = floor(现金 × 比例 / (P × (1+r)) / L) × L
买入手续费 F = Q × P × r
现金减少 Q×P+F；股数增加 Q；成本增加 Q×P+F

卖出价 P = C × (1−s)
部分卖出 Q = floor(持仓股数 × 比例 / L) × L
清仓 Q = 全部剩余持仓股数
手续费 F = Q × P × r
成本按卖出前平均成本等比例扣除；现金增加 Q×P−F
```

现金、成交价和费用内部保留 JavaScript 双精度。UI 资产默认展示整数元、收盘两位小数、成本和成交提示三位小数；展示精度不能回写到计算。清仓后成本明确归零。没有固定最低佣金、独立税率或卖空路径。

每次有效操作追加 action 和 dailyRow，再增加 day。当天涨跌相对上一已知收盘；action 记录实际数量/价格/费用和最多 160 字符的 note。到 config.days 设 revealed=true，之后禁止继续 advance。

record() 计算单局收益、未扣成本的买入持有基准、是否跑赢、买卖次数、最大回撤、费用。观望不计买卖次数。胜率以 return>0 为胜，跑赢以 return>=benchmark 判定。

## 5. 行情图与指标算法

### 5.1 已知数据边界

MarketChart.model() 必须先裁剪，再聚合：

```text
from = max(0, histStart−1500)
knownEnd = gameStart+day                // exclusive
knownBars = kList.slice(from, knownEnd)
all = aggregate(knownBars, period, from)
visible = 从 endIndex>=histStart 的第一根周期开始
```

均线、成交量均线、MACD、KDJ 先对 all 计算，再裁掉预热部分。不能对完整未来 kList 计算后仅隐藏蜡烛图。周月末根同样受 knownEnd 约束。

aggregate() 周键使用当地年月日构造 UTC 日期并回退至周一，月键使用年月，日键使用年月日；聚合条目额外包含 key、firstDate、startIndex、endIndex、count。OHLC 和成交量规则见产品规格。

相对标签用 D/W/M；训练前为负索引、训练周期为正索引。揭晓后才能显示真实日期。tooltip 不输出股票对象或未揭示数据。

### 5.2 指标公式

- SMA(N)：最近 N 根的算术平均，完整 N 根之前为 null，滑动累加求和。
- EMA(N)：首值取首个收盘，之后 EMA=2×C/(N+1)+(N−1)×EMA前值/(N+1)。
- MACD：DIF=EMA快−EMA慢，DEA=EMA(DIF,信号周期)，柱=2×(DIF−DEA)。
- KDJ：完整 RSV 周期前 null；RSV=(C−窗口最低)/(窗口最高−窗口最低)×100，平盘窗口 RSV=50；初始 K/D=50；K=(前K×(K周期−1)+RSV)/K周期，D=(前D×(D周期−1)+K)/D周期，J=3K−2D。

KDJ y 轴不强制夹在 0–100，保留 J 的可能越界值；20/80 仅是视觉参考线。

### 5.3 ECharts 结构

第 0 个 grid 是价格主图，candlestick 和 MA 共享 xAxis/yAxis=0。启用的成交量、MACD、KDJ 按顺序获得独立 grid 和 axis。所有 grid 由 axisPointer.link 和 dataZoom xAxisIndex 数组联动。

图表高度由主图 285px、副图每个 90px、间隙与滑块构成。ResizeObserver 处理容器变化，DOM 替换前 dispose。图表模式切换保留决策表单；周期改变重置缩放，副图开关保留周期和视窗。最新追踪窗口随已揭示数据推进；查看历史时不强行切到最新。

成本线来自 g.costBasis/g.shares。B/S 标记通过成交日索引查找所在聚合 K 线。图表颜色跟随全局 theme/colorScheme。

## 6. 页面状态与交互

主要状态为 G、S、records、view、orderType、size、note、loading、fetchToken。view 为 workspace/records/guide。设置使用原生 dialog；表单草稿保存前不修改 S。

start() 逐次尝试最多 8 个随机标的，fetchToken 用于取消后忽略晚到结果；每个脚本请求在 8 秒超时后移除并清理监听。加载中的取消是本地中止流程，不制造虚假训练记录。

每次 render() 清理旧图表实例再渲染当前页面；图表周期与副图切换使用 refreshChart() 局部刷新，避免丢失交易备注。快捷键检查 modifier、isComposing、repeat、输入区、弹窗和当前 view，避免输入文字触发交易。

app:before-update 是可取消事件。游戏监听后，在加载或存在打开弹窗时阻止更新；先调用 save()，失败阻止刷新；成功后将当前 gameId、orderType、size、note、view 存入 sessionStorage。新页面仅在 gameId 匹配时恢复一次，然后清除草稿。

## 7. PWA 发布契约

### 7.1 单一版本来源

package.json.version 是公开版本号唯一源，当前 1.0.0。build-pwa.cjs 校验版本格式，使用 SHA-256 对版本、worker 模板、所有应用资源的文件名和内容求哈希，前 16 位作为 build。

version.js 设置冻结 APP_RELEASE={version,build}；sw.js 嵌入同一个 RELEASE 和 ASSETS。version.js 不参与自身 hash，避免循环。任何运行资源或模板变化都会改变 build；相同公开版本下也能发现内容更新。重复构建无内容差异时输出完全一致。

生成资源包含 HTML、CSS、所有运行 JS、manifest、图标和本地 ECharts。npm run build 复制白名单资源到 dist，加入 .nojekyll 与 ECharts 许可证；不发布测试、规格源、node_modules、Git 元数据或本地服务代码。

### 7.2 注册与缓存

pwa.js 仅在安全 HTTP(S) 环境注册目录相对 sw.js，scope='./'，updateViaCache='none'。GitHub Pages /mock-trade-game/ 下注册、manifest 和所有关键资源都使用同一目录。file:// 不启用 worker。

缓存名为 trading-pwa:<编码后的完整 scope>:<build>，隔离同源不同目录应用。install 时使用 cache:'reload' 的 Request 将全部必需资源 addAll；任何关键资源失败即删除这个不完整新缓存并拒绝安装。install 不调用 skipWaiting。

activate 清除仅属于当前 scope 的其他 build 缓存，再 clients.claim。外部新浪脚本、Google 字体、sw.js 更新请求、非白名单请求和非 GET 请求不拦截。页面导航到应用根或 index.html（含查询参数）统一从此 build 的缓存 index.html 返回；应用关键资源 cache-first，避免旧页面与新脚本混用。

外部字体不属于关键离线缓存，失败时系统字体兜底。股票数据通过本地对局保存提供离线训练，不新增跨域行情缓存服务。

### 7.3 更新协议与状态机

worker 消息：GET_RELEASE 通过 MessageChannel 回复 RELEASE；SKIP_WAITING 执行 skipWaiting。版本通信超时 4 秒，安装等待超时 20 秒，切换等待超时 15 秒。

客户端状态 idle/checking/latest/ready/updating/offline/error/unsupported。启动自动检查，恢复联网检查，重新可见且距上次超过 15 分钟检查。手动检查调用 registration.update()，等待 installing 完成，再比较 waiting 或 active 的 build 与页面 APP_RELEASE.build。

新 build 完整缓存时 ready，公开版本号不提前改变。玩家点击才触发 app:before-update；事件通过后将 waiting worker 激活，收到 controllerchange 刷新。若另一页已经激活不同 build，则本页准备保存后直接刷新。检查、下载或切换失败不清除当前可用版本。

禁止在发现版本时无条件刷新；禁止在离线情况下显示“已是最新”；禁止清空本地对局/设置/战绩以更新代码。不同窗口的 controllerchange 不直接刷新非发起窗口。

### 7.4 安装

manifest 使用相对 id/start_url/scope，standalone，192/512 any PNG、512 maskable PNG。index 提供 Apple touch icon 和应用元信息。beforeinstallprompt 保存一次可用事件；点击安装触发原生浏览器提示，appinstalled 或提示结束清理按钮。安装动作不能绕过浏览器许可，也不伪造成功状态。

## 8. 开发、测试与发布

```sh
npm install
npm run dev          # 生成 PWA 资源后启动 localhost:5173
npm test             # 生成当前 worker 后运行 node:test
npm run build        # 生成完整 dist 发布目录
npm run deploy       # 构建后发布 dist 至 gh-pages
```

开发静态服务对所有资源设置 no-cache，webmanifest 使用 application/manifest+json。代码修改后运行 build:pwa 才会更新 worker 发布指纹；已安装的缓存版本通过版本入口切换，也可以开发时在浏览器工具中解除 Service Worker。

源码推送到 https://github.com/larria/mock-trade-game 的 main；运行资源发布至 gh-pages 根目录。GitHub Pages 地址是 https://larria.github.io/mock-trade-game/ 。推送前 fetch 并确认不覆盖他人提交，普通 push，不强推。

发布前必做：语法检查、npm test、git diff --check、npm run build、检查生成版本一致、检查运行资源白名单、桌面/手机版本入口、真实 browser 的 worker 注册与更新。

自动测试覆盖 7/30/200 日结束、双向手续费、滑点、单位取整、非法指令、周/月聚合、SMA/EMA/MACD/KDJ、污染未来数据后的模型不变、存档恢复、兼容存档、回撤、可复现 build、内容指纹变化、子路径缓存、安装失败保留旧缓存、跨作用域清理、显式激活协议与 PNG 尺寸。

浏览器验收覆盖公共文案、真实行情开局、买卖/观望/结算、刷新恢复、无横向溢出、安装提示、版本检查、等待新 worker、点击更新后的页面 build 切换，以及离线使用既有对局。线上验证以实际公开 HTML、version.js、sw.js、manifest 和资源返回为准，Git push 成功不能替代 Pages 可访问性确认。

## 9. 规格维护规则

PRODUCT_SPEC.md 负责用户可见规则，DEVELOPMENT_SPEC.md 负责实现契约与运维。更改功能必须同步修改相关段落和测试，删除不再适用的描述；README 保留两份文档链接。不为某个旧版本追加章节，不添加历史表，不将未经实现的能力写入规格。
