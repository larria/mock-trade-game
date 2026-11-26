# A股简单 · 交易修行场

面向所有玩家的多市场 A 股历史行情盲图模拟交易游戏。隐藏名称与日期，通过逐日决策练习技术分析、仓位管理与交易纪律。

[在线体验](https://larria.github.io/mock-trade-game/) · [版本记录](CHANGELOG.md)

## 规格文档

- [产品规格](docs/PRODUCT_SPEC.md)：用户流程、交易规则、参数范围、图表、存档、PWA 与验收要求。
- [开发规格](docs/DEVELOPMENT_SPEC.md)：架构、数据契约、指标公式、更新协议、测试与发布。

两份规格只描述当前最新实现。功能调整时直接更新对应章节，不记录版本历史或变更日志。

## 功能

- 每局 7–500 个交易日，默认 30 日；初始资金、历史窗口、佣金费率、滑点和交易单位可配置。
- 默认极简模式，底部固定「全买」「全卖」「持仓／持币」，一键推进一天。在「设置 → 训练规则」可切换专业操盘手模式，使用自定义比例、交易理由和买卖确认。
- 沪深 300、中证 500、全部科创板和创业板多选范围，当前合并去重 2,633 只，名单快照 2026-11-05。
- 日/周/月 K，MA 叠加主图；成交量、MACD、KDJ 独立副图，底部显示读数与升降箭头，精度可设 2–6 位；支持参数、联动十字光标、缩放、全屏与买卖标记。
- 交易理由、进度自动保存、战绩统计、最大回撤、收益基准和 CSV 导出。
- 日间/夜间主题、涨跌配色、默认仓位、交易确认与键盘快捷键。
- 可从浏览器安装为 PWA。桌面侧栏底部或手机顶部的版本入口显示下载进度，更新就绪后可查看说明并确认。更新会保存正在进行的对局和交易草稿。

成交采用下一交易日收盘价，并计入设定的佣金和滑点；图表只使用已揭示的训练日。完成后揭晓股票和日期。新抽取行情需要联网；已经保存的对局可离线继续。

Chromium 浏览器支持时会显示「安装应用」。iPhone 和 iPad 在浏览器的分享菜单选择「添加到主屏幕」。首次联网加载完成后，即可离线打开工作台。

## 本地运行

```sh
npm install
npm run dev
```

访问 http://localhost:5173 。PWA 需要 HTTPS 或 localhost，直接打开 HTML 文件时不启用安装与离线缓存。

```sh
npm test
npm run build
```

项目使用原生 HTML/CSS/JavaScript 和本地 ECharts。构建从 `package.json` 和 `CHANGELOG.md` 读取版本与说明，生成 `version.js`、`version.json`、`sw.js` 和 `dist/`。运行资源变化会生成新的构建指纹，已安装的应用可通过版本入口更新。

## 发布

1. 用 `npm version <版本号> --no-git-tag-version` 同步 package 与 lock，按 `CHANGELOG.md` 的格式添加本次说明。
2. 运行 `npm test` 和 `npm run build`，在浏览器验证安装、离线及从上一版切换。提交源码，创建对应的 `v<版本号>` 标签，推送至 GitHub。
3. 运行 `npm run deploy` 将 `dist/` 发布到 `gh-pages`。在 Pages 核对 `version.json`、入口资源与离线启动后，用同一标签发布 GitHub Release。

## 标的名单更新

```sh
python3 -m pip install -r scripts/requirements-universe.txt
npm run refresh:universe
npm test
npm run build
```

指数成分来自中证指数官方文件，科创板/创业板来自新浪完整分页名单。四池校验完成后原子替换快照，失败保留完整可用名单；更新后同步规格中的数量与日期并重新发布。
