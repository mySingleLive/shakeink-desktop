# 546 · 导入主题定位测试用例（对应 545 方案及 §6 修订）

编号 TP-xx。“单元”测试位于 `tests/unit/novel-import-theme-position.test.ts`，“集成”测试位于 `tests/integration/novel-import-result-quality-publish.test.ts`（追加）。“向导”指 `tests/helpers/novel-import-wizard-fixture.ts` 夹具。全部使用合成资料。

## A. 契约与纠错文案

| 编号 | 类型 | 输入 | 期望 |
|---|---|---|---|
| TP-01 | 单元 | themeProfile 请求的 prompt | 含男频/女频判定标准；声明 channel 只能为男频或女频、genre 不得为“全部”；含玄幻/奇幻/悬疑的定义；简介规则含世界观、主角、开篇，“不写中段和后续”，“15行”“300字”；不含“无法判断时用\"不限\"” |
| TP-02 | 单元 | 普通主题批次 prompt | 不含定位契约 |
| TP-03 | 单元 | `IMPORT_THEME_PROFILE_GUIDANCE` | 不含“不限”“全部”“省略”；含必填说明 |

## B. 完整性、修复与纠错

| 编号 | 类型 | 输入 | 期望 |
|---|---|---|---|
| TP-10 | 单元 | 回复 channel “不限”、genre “玄幻” | 修复为男频，clearedPosition 计数；runImportAi 一次成功 |
| TP-11 | 单元 | channel 缺失、genre “现实”（两频道都有） | 不猜频道；条目保留（不被丢弃）；第一次生成后有纠错请求，反馈以“主题定位缺少”开头并提到频道 |
| TP-12 | 单元 | genre “全部”或缺失 | 纠错反馈提到题材；channel 保留 |
| TP-13 | 单元 | sellingPoints / targetAudience / synopsis 任一空白 | 纠错反馈提到对应字段 |
| TP-14 | 单元 | synopsis 20 个非空行 | 修复后 ≤15 个非空行，以句末标点结尾，计数 |
| TP-15 | 单元 | synopsis 350 字、中间有句号 | 修复截到 300 字内最后一个句号 |
| TP-16 | 单元 | 解码已保存的定位产物，synopsis 450 字 | `validateImportSemanticArtifact` 通过 |
| TP-17 | 单元 | 完整合法回复 | 一次通过，无纠错 |
| TP-18 | 单元 | 首轮缺 genre，纠错轮完整（fake generate） | runImportAi 成功；共 2 次生成 |
| TP-19 | 单元 | tags 含不属于题材的已知子类，genre/channel 合法 | 只丢该 tag；genre、channel 保留 |
| TP-19b | 单元 | 普通主题批次回复缺字段 | 修复与校验行为不变（无完整性检查） |

## C. 向导内的定位请求

| 编号 | 类型 | 输入 | 期望 |
|---|---|---|---|
| TP-20 | 向导 | 定位请求 | units 以工作正文第一个单元开始，按书序；每个 context 主题的引文单元都在 units 中 |
| TP-21 | 向导 | 定位请求一直失败（结构类错误） | 共 3 次定位请求；第 3 次 artifacts 为空、units 只含开篇单元；主题任务 done |
| TP-22 | 向导 | 第 1、2 次失败，第 3 次成功 | 采纳定位，无“主题定位”dropped |
| TP-23 | 向导 | 定位请求中止 | 不重跑 |
| TP-24 | 单元 | 定位请求 artifacts 含两个 id 都是 theme-1、名称不同的主题 | `validateSemanticLinks` 抛“模型实体标识与原类型或父级身份冲突”（复现根因） |
| TP-25 | 向导 | 两个主题批次都返回 id theme-1（不同名） | 定位请求 artifacts 中 theme-1 只出现一次；定位产物被采纳 |
| TP-26 | 向导 | 3 次都失败；正文“他”远多于“她” | 生成兜底定位产物：channel 男频，无 genre；dropped 文案为“…频道已按正文推断…”；产物进入会话 |
| TP-27 | 向导 | 3 次都失败；“他们/其他”很多而单字“她”多 | 兜底为女频（排除词不计入） |
| TP-28 | 向导 | 3 次都失败；他/她接近 | 不生成兜底；dropped 为原文案 |

## D. 发布

| 编号 | 类型 | 输入 | 期望 |
|---|---|---|---|
| TP-30 | 集成 | 有定位产物 | synopsis 为定位简介；channel/genre/tags/卖点/受众写入（IQ-41 不变） |
| TP-31 | 集成 | 无定位产物，两段长推断主题 | synopsis ≤15 个非空行、≤300 字，以句末结尾，是拼接开头（替代 IQ-42） |
| TP-32 | 集成 | 兜底定位产物（只有 channel） | channel 写入，genre “全部”，tags 空；synopsis 用 fallback |
| TP-33 | 集成 | 原资料复制主题 | synopsis 原样（IQ-11b 不变） |
| TP-34 | 单元 | `importThemeSynopsisFallback` | 空串→空串；短文本原样；无句末时按字符截断；字符边界正确（emoji） |

## E. 审核脚本与回归

| 编号 | 类型 | 内容 | 期望 |
|---|---|---|---|
| TP-38 | 单元 | `tests/unit/lotm-local-import-audit.test.ts` | 按 fallback 简介修订后通过 |
| TP-39 | 单元 | `scripts/audit-real-novel-import.ts` theme 检查 | 使用定位简介或 fallback |
| TP-40 | 全量 | Node 24 下 `npm test`、`npm run typecheck`、`npm run build` | 与 542 基线比无新增失败 |

## F. 真实目标

隔离根 `~/shakeink-test-roots/cache-522`，LotmVerification.app，驱动 `/private/tmp/shakeink-theme-545/launch-theme.mjs <label>`，第一卷（小丑），目标只选“主题”。

| 编号 | 内容 | 期望 |
|---|---|---|
| TP-41 | 导入、保存、读回 Theme | channel 男频；genre 玄幻；sellingPoints、targetAudience 非空；synopsis ≤15 个非空行、≤300 字 |
| TP-42 | 读回简介 | 只讲世界观、主角、开篇；不出现事件词：邓恩牺牲/死、死而复生、复活、前往贝克兰德、梅高欧丝、因斯·赞格威尔；人工复核截图 |
| TP-43 | 连续 2 次 TP-41 | 两次都满足，genre 都为玄幻；记录每次定位尝试次数 |
| TP-44 | 主题面板截图 | 简介、频道、题材、卖点、受众可见 |

## G. 按审核（546-…-cases-review.md）修订

本节与前文不一致处，以本节为准。

### G1. 542 用例修订（H1）

| 编号 | 旧期望 | 新期望 |
|---|---|---|
| IQ-33/34 | `都市频+奇幻` 清空 channel/genre/tags | channel 修为男频，genre 奇幻保留（M5）；`都市频+现实` channel 清除、genre 保留、tags 清除；`女频+玄幻`（频道题材冲突）保留 channel、清 genre/tags，严格 schema 进入纠错并提“题材” |
| IQ-48 | `都市频` 计 1 处 clearedPosition | 仍计 1 处（换频道计为一处修复） |
| IQ-35 | 501 字简介解码失败 | 不变（解码上限仍 500） |
| IQ-35b | 简介截到 500 字 | 截到 300 字（无句末，按字符），clearedPosition 仍为 2 |
| IQ-36 | 契约含“蒸汽朋克” | 不要求；改为含“玄幻”“奇幻”“悬疑”定义（TP-01） |
| IQ-38 | 定位请求 2 次 | 3 次；第 3 次精简；fixture 正文无“他/她”时 dropped 为原文案 |
| IQ-42 | 5000 字拼接 | 删除，由 TP-31 替代 |

### G2. 补充用例

| 编号 | 类型 | 输入 | 期望 |
|---|---|---|---|
| TP-10b | 单元 | `不限+现实` | channel 清除，进入纠错，反馈提“频道” |
| TP-13b | 单元 | 回复同时有一条无法定位的引文、2500 字卖点、空受众；第 2 轮完整 | 第 2 次 prompt 的纠错段以“主题定位缺少目标受众”开头，不含“证据”“引文”；`generations===2`；结果卖点为第 2 轮值（H3） |
| TP-20a | 向导 | 预算只够 1 个开篇单元 | 定位请求只含 `units[0]`、artifacts 为空，仍发出 |
| TP-20b | 向导 | 预算连 1 个开篇单元都放不下 | 无定位请求；主题任务 done；dropped 为原文案 |
| TP-23b | 向导 | 定位请求抛非重跑类错误（如“模型接口请求失败”） | 只 1 次定位请求；主题任务 done |
| TP-28a | 单元 | 他=2×她（4:2） | 男频；他=3、她=2 | 不生成 |
| TP-33a | 集成 | 原资料主题 800 字（含句号）、无推断主题、无定位 | 简介原样等于原资料（不截断，IQ-11b） |
| TP-33b | 集成 | 原资料主题 + 推断主题（长），无定位 | 简介 = 原资料原样 + 空行 + 推断部分的 fallback（≤15 行、≤300 字） |

TP-33a/b 对应方案 545 §6 H4 的补充：fallback 只截断推断主题，原资料主题原样在前（见 545 §7）。

### G3. 其它修订

- TP-24：经 `runImportAi` 验证（已实现），期望错误含“模型实体标识”或“结构不完整”。
- TP-39：`scripts/audit-real-novel-import.ts` 无单测，改为代码检查 + 真实运行读回时通过。
- TP-40：`npm test`、`npm run typecheck`、`npm run build` 全部 0 失败；与本改动无关的已知失败逐条列出用例名与原因，并证明在 HEAD 上同样失败。
- TP-41：补 `synopsisChars>0`，卖点、受众去空白后非空；`profileArtifact===true` 且 dropped 无“主题定位”；从 `app-stderr.log` 统计 `theme-profile-fail` 行数记为失败尝试次数，写入每次运行的 `quality-readback.json` 旁的 `attempts.txt`。
- TP-41 前置：运行前在 Node 24 下 `npm run build`，运行中不重建；`state.json` 哈希不变。
- TP-44：截图中频道显示男频、题材不是“全部”。
- L3（attempt 1–3）在代码审核中确认；L5 台账 NI-19 只追加。
