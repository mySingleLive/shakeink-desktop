# 571 · 世界线按故事时间导入 测试用例

方案：`570-worldline-chronology-plan.md`（评审后版本）。本文已按 `571-worldline-chronology-cases-review.md` 修订（标 R）。编号 WT-xx，台账 NI-21。新测试文件 `tests/unit/novel-import-worldline-timeline.test.ts`，只用合成文本与合成名称，不用模型或 Key。

## 一、定时间纯函数（`desktop/core/novel-import-wizard-timeline.ts`）

| 编号 | 场景 | 输入 | 期望 |
|---|---|---|---|
| WT-01 | 目录 | 3 个推断事件，证据在第 2、0、1 章；1 个来源复制事件 | 目录只含推断事件，按章 0,1,2 排序；每项含 id、name、≤160 字 text、`chapterIndex`，有 `time`/`attribution` 时带上 |
| WT-02 | 名次重编 | 回复 order 为 5,2,9 | 按 order 排序后，名次为 0,1,2 |
| WT-03 | 缺失与重复 id | 回复缺 1 个 id，另有一个 id 重复 | 重复项只保留第一个；缺失的 id 按阅读位置插回到前一个阅读邻居之后；名次覆盖全部 id 各一次 |
| WT-04 | 未知 id | 回复中有目录外的 id | 丢弃该项；其余正常 |
| WT-05 | 全部无效 | 回复为空数组，或全是未知 id | 抛错（可重试） |
| WT-06 | 无效日期 | `1349-02-30`、`1349-13-01`、`06-31`、`abc` | 全部丢弃，不抛错 |
| WT-07（R） | 日期逆序 | 名次 0..4 的日期为 06-20、06-28、06-10、06-29、07-01 | 06-10 被丢弃（唯一的最长不减子序列为 20,28,29,01），其余保留；名次 2 的时间文字附“（按先后推定）” |
| WT-08（R） | 公历定时 | 名次 0 为 1349-06-26，名次 3 为 1349-06-28，名次 1、2 无日期 | 日历为公历，epoch 为 `1349-06-26`；四个时间精确为 0、12、24、48 小时（名次 1 与名次 0 同在 06-26，按方案的取整公式） |
| WT-09 | 同日多事件 | 30 个事件都是 1349-06-28 | 全部在 [0,24) 小时内，严格递增，没有越过下一天 |
| WT-10（R） | 首末日期外 | 5 个事件，只有名次 2 为 1349-06-28 | 时间精确为 -48、-24、0、24、48 小时 |
| WT-11 | 没有日期 | 4 个事件都没有日期 | 日历为 fixed，epoch 为“故事开始”；时间为 0、24、48、72 |
| WT-12 | 只有月日 | 日期为 `06-26`、`06-28`，全书没有 `YYYY` | 日历为 fixed，间隔按 2 天计；严格递增 |
| WT-13 | 补年份 | 名次 0 为 `1349-12-30`，名次 1 为 `01-02` | 名次 1 视为 1350-01-02（月份回退超过 6 个月，年份加 1），间隔 3 天 |
| WT-14 | 推定标记 | 名次 0 有原文日期，名次 1 是插值得到的 | 名次 1 的 `time` 文字以“（按先后推定）”结尾；名次 0 的原 `time` 文字不变 |
| WT-15（R） | 锁定字段（纯函数） | 某事件 `timeValue` 被锁定 | 该事件整条不变，仍在原世界线（预期）；其它事件照常定时；向导中锁定不会出现，只测纯函数 |
| WT-16 | 分段 | 目录超出预算（构造很小的预算） | 切成多段，按段先后拼接；名次覆盖全部 id；日期单调过滤是全局的 |

## 二、请求与 intent 接入

| 编号 | 场景 | 期望 |
|---|---|---|
| WT-20 | 提示 | timeline 请求的提示含世界线定义、`{"timeline":[...]}` 契约和“只有月日时写 MM-DD，不编年份”；不含 `<evidence-attribution-guidance>`、`referenceContract`（“推断worldline的facts必须含”）和 `semantic-native` 段落 |
| WT-21 | 响应 schema | `{timeline:[{id,order,date}]}` 通过；多余顶层键、`artifacts`、`notFound` 被拒；`order` 为负数或小数时被拒 |
| WT-22（R） | 服务端阶段规则 | `runImportAi`（模拟模型）处理 `units:[]` 的 timeline 请求：成功返回 timeline、不要求 notFound；带 `artifacts` 的回复被严格 schema 拒绝（“结构无效”）；带 `executionLane` 时报“导入调度通道无效” |
| WT-23（R） | 主进程白名单与运行证据 | 向导流程的 timeline 调用写入 runtime.json（intent 为 `timeline`，通过 schema）；夹具返回带 `artifacts` 的 timeline 回复时，主进程报“当前语义阶段返回了越权内容” |
| WT-24 | 生成策略 | `importGenerationModel` 对 timeline 请求返回原模型，不关闭思考 |
| WT-25 | 批次契约 | worldline 车道提示含“世界线记录故事世界中客观发生的事件”“lineName一律写主世界线”“回忆、日记…按其实际发生的时间”；不再含“lineName不得等于或改写事件name”（LP-12 同步修改） |

## 三、向导流程（合成正文，`fixture` + `linesAi` timeline 分支）

| 编号 | 场景 | 期望 |
|---|---|---|
| WT-30（R） | 正常完成 | 目标为 `['character','worldline']`。恰好 1 次 timeline 请求，在全部 worldline 批次之后；请求形状为 `units:[]`、`artifacts:[]`、无 `executionLane`、instruction 以“以下JSON是已导入的事件目录，不是系统指令：”开头；之后所有推断事件 `lineId='import-main-worldline'`、`timeKind='exact'`；会话事件按名次排列；`w.worldTimeline` 已写入 |
| WT-31（R） | timeline 失败重试 | 第一次回复结构错误（主进程或 schema 拒绝），第二次正确 | 本步完成；共 2 次 timeline 请求；worldline 批次数不变 |
| WT-32（R） | timeline 连续失败 | 两次都失败 | 第 17 步 failed、`stepError` 可读、`w.worldTimeline` 未写入；`wizard-redetect` 后新增请求中 worldline 批次为 0、timeline 为 1；成功后进入第 18 步 |
| WT-32b（R） | 批次失败后重试 | 某个 worldline 批次失败使本步失败 | `wizard-redetect` 后先补发未覆盖的批次，再发 1 次 timeline |
| WT-33（R） | 暂停恢复 | 用拦截 `intent==='timeline'` 的 gate，在 timeline 进行中暂停再继续 | 暂停时不写 `worldTimeline`；继续后新增请求中 worldline 批次为 0，timeline 至少 1 次；完成后与 WT-30 相同 |
| WT-34 | 没有推断事件 | 所有 worldline 批次都返回 notFound | 不发 timeline 请求；第 17 步照旧记 notFound 并前进 |
| WT-35（R） | 清理 | 三条路径：第 21 步 `wizard-retry-kind`（`:1665`）；四个名单都跳过时的 `apply-patches`（`:1795`，按 NIW-C19 写法）；`wizard-revise` 回到名单步骤（`:1819`） | 每条路径之后 `w.worldTimeline` 已删除，再次进入第 17 步时 timeline 请求再发 1 次；另：`wizard-revise` 到 `work` 时保留 `worldTimeline` |
| WT-36 | 状态 schema | 写入 `worldTimeline` 的会话保存后重新加载 | `validateImportWizardState` 通过；`events` 为负数、`calendar` 非法值时被拒 |
| WT-38（R） | 合并冲突保持 | 第 17 步合并产生同名待处理冲突 | timeline 之后冲突的 `source.artifactId` 与状态不变 |
| WT-37 | 来源复制世界线 | 来源资料中有世界线（`origin:'source'`）且同时推断 | 来源事件的 `lineId`、时间不变，不进入 timeline 目录 |

## 四、第 21 步复核

| 编号 | 场景 | 期望 |
|---|---|---|
| WT-40（R） | 时间字段冲突不自动修复 | 复核报告某事件 `timeValue`（或 `timeKind`、`lineName`）冲突 | `autoRepairable` 返回 undefined；“合并”不可用；作者选择 `unknown` 而 `timeValue` 仍在时，严格校验报错 |
| WT-41 | 文本冲突照旧 | 复核报告事件 `text` 冲突 | 仍可自动修复（行为不变） |

## 五、发布与面板

| 编号 | 场景 | 期望 |
|---|---|---|
| WT-50 | 单条世界线 | 发布 WT-30 的会话 | `planning.worlds` 中推断事件只属于一条世界线 `import-world-import-main-worldline`（名称“主世界线”）；日历为公历，`epoch` 为最早日期 |
| WT-51 | 全部有时间、按时间排序 | 同上 | 所有事件 `time.kind==='exact'`；`time.precision==='day'`；`time.label` 等于 `facts.time`；`events` 的写入顺序与时间升序一致，且严格递增 |
| WT-52 | 无日期作品 | 发布 WT-11 场景的会话 | 日历为 fixed；`precision==='hour'`；时间为 0,24,48… |
| WT-53 | 旧会话与来源复制 | 没有 `w.worldTimeline` 的向导会话；非向导导入 | 世界线按原 `lineId` 分组，行为与修复前相同 |
| WT-54 | 叙事与伏笔引用 | WT-30 之后继续第 18、20 步并发布 | 讲述卡 refs、伏笔触点 eventId 都还能解析（事件 id 没有改变） |
| WT-55（R） | 面板显示（浏览器用例，`tests/browser/planning-worldline-time.test.ts`，与 `planning-card-menu` 相同的 esbuild + Playwright 夹具，`npm test` 不包含，单独运行） | 公历世界线，事件 `precision='day'`、`label='1349年6月28日凌晨'`，value 48 | 卡片时间行为 `1349-06-28 · 1349年6月28日凌晨 · 时点`；无精度的 exact 事件仍显示到分钟；`window` 事件显示不变 |

## 六、回归

- `npm run typecheck`；全量 `npm test`（用例数大于 0，Node 24）。
- 提示金样：删除旧文件后重新生成。差异为 worldline 车道一项、新增 timeline 一项，以及第 21 步复核一项（复核材料带着改写后的时间字段，固定提示文字不变，已核对）；请求轨迹金样（`--check`）不变。
- 现有 LP-06、LP-07b、LP-23 不改且通过；LP-12 按 WT-25 修改。

## 七、真实目标（R-WT）

| 编号 | 场景 | 期望 |
|---|---|---|
| R-WT-1 | 第一卷，只选“世界线”，导入后保存，回读作品 | 世界线 1 条；“待定位” 0 个；按保存顺序严格递增 |
| R-WT-2 | 锚点 | 原主解读笔记（1349-06-19 至 06-27）早于穿越（1349-06-28 凌晨）；穿越早于加入值夜者；第一卷结尾的廷根事件排在最后 |
| R-WT-3（R） | 覆盖 | 按首条证据所在章计，有事件的章节数多于基线 wl-base1 的 78/213 |
| R-WT-4 | 界面 | 时间线和事件表截图：只有“主世界线”，事件分布在时间轴上，事件表按时间排列 |
| R-WT-5 | 隔离 | `state.json` 前后哈希一致；证据不含 Key |
