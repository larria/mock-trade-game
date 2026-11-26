# A股简单：开发规格

本文定义代码当前架构、数据契约、计算规则、PWA 生命周期、测试与发布要求。它仅对最新实现负责；调整功能时直接更新对应章节，不记录变更日志、不累积旧方案，也不把未来计划写成当前规格。

## 1. 技术栈与目录

运行时采用原生 HTML、CSS、JavaScript，ECharts 5.6.0 使用本地 vendor 文件。没有应用框架、服务器端游戏逻辑或数据库。Node.js 负责本地静态服务、自动测试、PWA 发布生成及 gh-pages 发布。

| 文件 | 职责 |
| --- | --- |
| index.html | 页面元数据、PWA manifest、图标和 defer 脚本加载顺序 |
| styles.css | 公共工作台、表单、桌面与手机布局、主题、版本入口 |
| stock-universe.js | 完整市场快照、元信息与去重选池，StockUniverse 全局及 Node 导出 |
| scripts/refresh-universe.py | 官方指数和新浪完整板块名单更新与校验 |
| scripts/requirements-universe.txt | 名单刷新所需的 Python 依赖 |
| decoder.js | 新浪脚本加载、解码、前复权，全局 Util |
| engine.js | 纯计算和存档契约，浏览器 TradingEngine、Node module.exports |
| chart-studies.js | 复权和指标计算、图表设置校验及旧设置迁移，全局 ChartStudies |
| market-chart.js | 已知数据裁剪、周期聚合、指标预热、ECharts 联动，全局 MarketChart |
| chart-controls.js | 复权、绘图、副图和主图设置的对话框，全局 ChartControls |
| chart-drawing.js | 图表标注绘制和按对局持久化，全局 MarketDrawing |
| game.js | 游戏状态、DOM 渲染、事件、设置、战绩与更新前保存 |
| pwa.js | 安装提示、Service Worker 注册、检查状态、应用更新，全局 AppPWA |
| manifest.webmanifest | 应用身份、相对 scope/start_url、图标和 standalone 模式 |
| icons/ | SVG 标识、PNG 安装图标、Apple 与 maskable 图标 |
| version.js | 构建生成的当前版本与内容指纹，window.APP_RELEASE |
| version.json | 构建生成的线上版本描述，客户端通过网络检查 |
| sw.js | 构建生成的 Service Worker，发布常量、应用资源列表和 worker 模板 |
| scripts/sw-template.js | Service Worker 生命周期与 fetch 策略模板 |
| scripts/build-pwa.cjs | 校验公开版本、计算内容指纹、生成资源、构造 dist |
| server.js | 仅监听 127.0.0.1 的开发静态服务，默认端口 5173 |
| tests/engine.test.js | 周期、交易、指标、存档与未来数据隔离测试 |
| tests/pwa.test.js | 发布指纹、缓存原子性、离线、作用域与安装资源测试 |
| tests/universe-indicators.test.js | 四池完整性、去重、500 日与底栏读数测试 |
| docs/PRODUCT_SPEC.md | 当前产品契约 |
| docs/DEVELOPMENT_SPEC.md | 当前开发契约 |
| dist/ | 只包含发布运行资源的输出，不纳入源码提交 |

脚本顺序为 ECharts → 标的列表 → 解码器 → 引擎 → 图表 → 当前版本 → PWA → 游戏，全部 defer，在 DOM 解析后依次执行。游戏调用 AppPWA.markup() 创建版本入口，在每次替换应用 DOM 后调用 AppPWA.sync() 恢复安装及版本状态。

## 2. 引擎与设置契约

TradingEngine 导出 DEFAULTS、settings、dateString、aggregate、sma、ema、macd、kdj、createGame、currentBar、asset、canBuyAll、drawdown、advance、serialize、hydrate、migrate、record。

settings(input) 从默认值补全、校验并归一化，不修改调用方对象：

| 字段 | 默认值 | 契约 |
| --- | --- | --- |
| days | 30 | 整数 7–500 |
| markets | [hs300,csi500,star,chinext] | 至少一项，去重并过滤非法范围；UI 拒绝空选 |
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
| macdReadout、kdjReadout | true | 分别控制对应副图底栏 |
| indicatorPrecision | 3 | 小数位整数 2–6 |
| indicatorDirections | true | 比较原始数值的升降箭头 |
| costLine、tradeMarkers | true | 主图辅助显示 |
| theme | light | light/dark |
| colorScheme | red-up | red-up/green-up |
| confirmOrders、shortcuts、coach | true | 交互偏好 |
| tradeMode | quick | 交易交互模式，取 quick 或 pro，缺失时默认为 quick |
| defaultSize | 0.25 | 比例 0.01–1；UI 提供 1/4、1/3、1/2、1 |

表单使用 required、min、max、step 校验，数组周期另外校验格式、重复和数量，MACD 校验快慢关系。错误字段位于隐藏分类时先切换分类，再聚焦并报告错误。settings() 用于存档和输入兜底；正常 UI 提交不能依赖静默修正代替错误提示。

## 3. 数据契约

### 3.1 市场快照

StockUniverse 导出 `{asOf,markets,stocks,pool,describe}`。markets 条目包含 id/name/count/asOf/source；stock 包含 code/name/fullCode/markets。id 为 hs300/csi500/star/chinext。pool(selected) 返回属于任一选中范围的股票，股票数组已按 fullCode 去重排序，多范围会员不增加权重。describe(selected) 返回公共范围名称。

刷新使用中证指数 `000300cons.xls`、`000905cons.xls` 官方成分表，要求精确 300/500 个唯一代码。新浪 `Market_Center.getHQNodeStockCount` 和 `getHQNodeData` 的 kcb/cyb 节点用于全部板块名单，80 条一页，最多 4 页并发；分页总数、唯一数和刷新后节点总数必须一致。科创板支持 sh688/sh689，创业板支持 sz30xxxx，不限于 300/301 前缀。

脚本完成所有四池校验后，才通过临时文件原子替换 stock-universe.js。失败不写部分数据。来源、日期和数量包含在快照中，只保存最新名单，不积累历史。当前四池数量 300/500/618/1411，去重并集 2633，快照日期 2026-11-05。静态快照随 PWA 发布缓存，运行时无需额外名单网络请求，不回溯训练日期的历史成员。

### 3.2 行情条目

行情按日期升序存放：

```js
{ date: Date, open: number, high: number, low: number,
  close: number, volume: number, amount: number, prevclose?: number }
```

价格必须是有限正数，date 必须是有效日期。调用 createGame 前，ChartStudies.preparedBars() 保持以完整行情末日为基准的执行价格，并将源 OHLC 与 prevclose 一并存入 original。复权因子由 prevclose / 前一交易日收盘价得到；成交量与成交额保留源数据。

### 3.3 对局 G

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

createGame 以 config.history 为最小训练起点，以 kList.length−30−config.days 为最大训练起点，均匀抽样。config 是含市场范围的开局设置快照；进行中不能用全局设置替代它计算交易费用和终点。

### 3.4 持久化

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

### 5.1 复权和已知数据边界

MarketChart.model() 先限制可用日线与除权因子，再聚合并计算指标。

```text
from = max(0, histStart−1500)
knownEnd = gameStart+day                // exclusive
knownBars = ChartStudies.prices(game, from, knownEnd, adjustment)
all = aggregate(knownBars, period, from)
visible = 从 endIndex>=histStart 的第一根周期开始
```

前复权从已知末根向前累乘后续除权因子，后复权从图表预热起点向后除以已发生的因子。不复权使用源 OHLC。旧存档无 original，保留已有执行价格。日、周、月的聚合边界都受 knownEnd 约束。指标在聚合序列预热，随后裁掉预热前缀。锚定 VWAP 按已知日线累计，再在聚合桶的末日取样。

相对标签用 D/W/M，训练前为负索引，开始后为正索引。揭晓后显示真实日期。成本线乘以当前图表价与执行价的比值；B/S 以成交日索引定位所处聚合桶。

### 5.2 指标和信号

指标注册表声明参数、可用交叉对象和输出序列。MACD 延续原标准，即 DIF=EMA快−EMA慢，DEA 为 DIF 的 EMA，柱为两倍差值。KDJ 延续初始 K/D=50 的递推。RSI、ATR 和 DMI/ADX 使用 Wilder 平滑。布林带中轨用 SMA，带宽取窗口总体标准差乘以倍数。超级趋势用 ATR 与最终上下轨确定翻转。一目均衡云按配置正向位移到已知周期，一律不生成未来 K 线。公式边界和预热由测试覆盖。

交叉在比较对象从一侧穿至另一侧时标记。贴线期间保留最近方向，数值缺失会重置方向。读数以原始计算值和同周期前值比较，随后应用精度格式。只有完整样本才开始输出需要窗口的序列。

### 5.3 图表布局和绘图

价格 grid 与最多五个独立副图 grid 共享 dataZoom 和 axisPointer。桌面按默认高度绘制，紧凑模式用视口、图表工具栏和交易栏的实测尺寸为主图与前三个副图分配空间，并在第三副图后显示缩放条。每个副图的参数、读数、信号、相对高度和排序保存在浏览器的图表偏好中。新增设置直接更新现有图表实例，切换周期会重置缩放。

绘图使用单独的 Canvas，与 ECharts 的 grid 坐标互换。绘图锚点用相对 gameStart 的日索引和原始价格保存，重载后无需依赖历史数组的绝对索引。渲染时换算图表价格口径，再把交易日映射到当前周期。未保存原始价格的旧对局使用其唯一口径。

## 6. 页面状态与交互

主要状态为 G、S、records、view、orderType、size、note、loading、fetchToken。view 为 workspace/records/guide。设置使用原生 dialog；表单草稿保存前不修改 S。

start() 先用 U.pool(config.markets) 获取去重池，再逐次尝试最多 8 个随机标的。fetchToken 用于取消后忽略晚到结果；每个脚本请求在 8 秒超时后移除并清理监听。取消是本地中止流程，不制造虚假训练记录。历史不足的股票不能截短配置的 500 日训练，只能换下一只。

`render()` 清理旧图表实例再渲染当前页面。图表周期与副图切换使用 `refreshChart()` 局部刷新。极简模式的底部操作栏保留同一组按钮节点，每次决策同步更新账户、日志、按钮状态与存档，行情图按浏览器动画帧合并刷新。进入原生或兼容全屏时，操作栏随行情图进入全屏容器。

`S.tradeMode` 保存为浏览器偏好，可在进行中切换。极简买卖用比例 `1`，持仓或持币用 `hold`；可买状态由 `canBuyAll()` 依据已揭示日 K、佣金、滑点与交易单位估算。若下一日的实际价格使全买无法成交，`advance()` 按持有推进并记录原因。专业模式共用原成交逻辑，继续支持下单比例、理由与确认。快捷键检查修饰键、输入法、重复按键、输入区、弹窗和当前视图。

app:before-update 是可取消事件。游戏监听后，在加载或存在打开弹窗时阻止更新；先调用 save()，失败阻止刷新；成功后将当前 gameId、orderType、size、note、view 存入 sessionStorage。新页面仅在 gameId 匹配时恢复一次，然后清除草稿。

## 7. PWA 发布契约

### 7.1 单一版本来源

`package.json.version` 是公开版本号来源；`CHANGELOG.md` 中对应版本章节提供更新说明。`build-pwa.cjs` 校验三段式公开版本号与更新说明，对版本、说明、worker 模板及应用资源哈希计算 SHA-256，取前 16 位作为 `build`。

`version.js`、`sw.js` 和 `version.json` 使用同一份 `{version, build, notes}`。生成 `version.js` 后计算其资源校验值，并随其他资源校验值一起写入 `sw.js`。公开版本、运行资源、模板或本版说明变化会改变 `build`。重复构建的输出一致。

生成资源包含 HTML、CSS、所有运行 JS、manifest、图标和本地 ECharts。npm run build 复制白名单资源到 dist，加入 .nojekyll 与 ECharts 许可证；不发布测试、规格源、node_modules、Git 元数据或本地服务代码。

### 7.2 注册与缓存

pwa.js 仅在安全 HTTP(S) 环境注册目录相对 sw.js，scope='./'，updateViaCache='none'。GitHub Pages /mock-trade-game/ 下注册、manifest 和所有关键资源都使用同一目录。file:// 不启用 worker。

缓存名为 `trading-pwa:<编码后的完整 scope>:<build>`。安装时以 `cache:'reload'` 请求所有必需资源，用各自的 SHA-256 完整性值验证响应。所有写入结束后，任一资源失败即删除本次不完整的缓存。完整安装的 worker 保持等待，直到玩家主动应用。

激活时清除当前作用域的旧应用缓存，再调用 `clients.claim()`。应用根和 `index.html`（含查询参数）从当前缓存返回，应用关键资源也优先使用该缓存。外部行情、字体、`sw.js`、线上 `version.json` 和非白名单请求使用网络。

外部字体不属于关键离线缓存，失败时系统字体兜底。股票数据通过本地对局保存提供离线训练，不新增跨域行情缓存服务。

### 7.3 更新协议与状态机

`GET_RELEASE` 通过 `MessageChannel` 返回已缓存版本及说明。`INSTALL_PROGRESS` 报告实际写入资源数量，`GET_INSTALL_PROGRESS` 查询当前进度。`SKIP_WAITING` 由确认更新的页面发送。版本通信超时 4 秒，线上版本请求 8 秒，下载等待 60 秒，切换等待 15 秒。

客户端状态为 `idle/checking/downloading/latest/ready/updating/offline/error/unsupported`。启动、恢复联网、页面重新可见且距上次超过 15 分钟时检查，也可手动触发。以查询参数和 `cache:'no-store'` 从网络读取 `version.json`，再检查 worker，等待安装结束。用 worker 的 `build` 与页面的 `APP_RELEASE.build` 判断是否可切换。

新版本就绪后，版本入口显示来自 worker 的说明。确认时触发可取消的 `app:before-update`。通过后等待目标 worker 进入 `activated` 再重载。若另一页已激活目标 worker，本页仍须确认保存后才重载。`sessionStorage` 中一次性的目标 build 用于显示更新完成。检查或下载失败时保留当前可用版本。已完整下载的 worker 可以离线应用。

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

用 `npm version <版本号> --no-git-tag-version` 更新 package 与 lock，再添加 `CHANGELOG.md` 版本章节并构建。提交源码到 `main` 并推送对应的 `v<版本号>` 标签。运行资源发布到 `gh-pages`，公开入口为 https://larria.github.io/mock-trade-game/ 。验证线上资源后，用源码标签和本版更新说明创建 GitHub Release。

发布前必做：语法检查、npm test、git diff --check、npm run build、检查生成版本一致、检查运行资源白名单、桌面/手机版本入口、真实 browser 的 worker 注册与更新。

自动测试覆盖四池完整性与来源、范围去重、底栏数值/箭头/精度/空值、7/30/200/500 日结束、双向手续费、滑点、单位取整、非法指令、周/月聚合、SMA/EMA/MACD/KDJ、污染未来数据后的模型不变、500 日存档恢复、兼容存档、回撤、可复现 build、内容指纹变化、子路径缓存、安装失败保留旧缓存、跨作用域清理、显式激活协议与 PNG 尺寸。

浏览器验收覆盖公共文案、四池多选和 500 日上限、MACD/KDJ 底栏位置和光标联动、真实行情开局、买卖/观望/结算、刷新恢复、无横向溢出、安装资格、版本检查、下载进度与说明、确认后切换 build，以及离线使用既有对局。线上核对 HTML、`version.json`、`version.js`、`sw.js`、manifest 和离线启动。

### 8.1 标的名单维护

```sh
python3 -m pip install -r scripts/requirements-universe.txt
npm run refresh:universe
npm test
npm run build
```

刷新来源文件不提交到仓库，stock-universe.js 是唯一运行快照。更新后同步两份规格中的当前数量和日期，再重新发布。刷新失败保留最后的完整名单。游戏设置展示实际去重数量，不硬编码总股票数。

## 9. 规格维护规则

PRODUCT_SPEC.md 负责用户可见规则，DEVELOPMENT_SPEC.md 负责实现契约与运维。更改功能必须同步修改相关段落和测试，删除不再适用的描述；README 保留两份文档链接。不为某个旧版本追加章节，不添加历史表，不将未经实现的能力写入规格。
