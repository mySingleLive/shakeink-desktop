# 导入发布独立代码审核

审核日期：2026-10-25。审核人：独立 UI 实施代理（未实施被审发布模块）。依据：`06-technical-plan.md`、`08-test-cases.md`。本轮只读检查发布、内部初始化、持久目录预留及其定向用例；未运行全量测试，也未把静态检查记为测试通过。

初审结论：存在4项阻断，见下文历史记录。**2026-10-26复审：4项均已修复，当前审核范围内无遗留代码阻断。** 最终定向执行结果仍须由主代理归档；本代理未运行发布测试。下文初审行号对应修复前源码。

## 修复复审（2026-10-26）

| 初审项 | 复核结果与当前源码 |
| --- | --- |
| 1 目录身份窗口 | `Workspaces.importLeaseTarget`（`desktop/service/workspaces.ts:153`）保留边界 guard；`assertSelection` 在 reservation 读取和品牌读取之后重新核对原始 path/dev/ino，返回原生授权身份。NI-W05（测试文件 `57`）在 `requireExisting` 返回前用同 manifest 替换 inode，并断言拒绝。关闭本项。 |
| 2 两条线投影 | 发布模块 `64–81` 建 artifact→本次规划事件映射；同 lineId 的事件共用世界线，保存父事件/时间/人物；叙事使用 chapterIndex/order、角色视角和 refs 映射。推断结果缺结构信息会拒绝，未知来源可只保留文本。NI-W01 已核对 native 章节、事件、时间及视角。关闭本项。 |
| 3 恢复记录 | 发布模块 `36–39` 同时核对 mutation 目标/hash 与唯一 version1 NOVEL_IMPORT snapshot 的完整指纹；内部已有回执也仍会走 Workspaces 的 verify。NI-W04（测试文件 `51`）删除原材料版本而保留 mutation，恢复必须拒绝。关闭本项。 |
| 4 长两条线 | 发布模块 `15` 按 Unicode 安全边界分割不超过100000字符的续页，`72`/`81` 写入原生事件/卡片；完整原始材料仍保存在独立记录中。NI-W02 核对长 worldline/narrative 投影拼接等于原文，且读原始大纲/正文仍完整。关闭本项。 |

补充复核：记录的 targets 在 `14` 以正文实际存在且 infer 启用为条件，纯拷贝不再声称执行补全；记录分页 `103–107` 会修正落在代理对中间的 offset 并返回实际位置，且保证返回文本不从代理对中间断开。UI 的 NI-U07 另外用连续 emoji 与非固定页长核对实际 offset，包含作品ID切换后不继续请求上一本材料。

已读取主代理提供的 `/private/tmp/novel-import-publish-green.tap`：NI-W01–W06共12个顶层/子项通过（含五处故障窗口与缺记录恢复拒绝），耗时约21秒。该证据由主代理执行；后续 emoji/续页修订的最终运行以主代理重新归档的结果为准，不把旧运行挪作最新版本的执行证明。

## 初审阻断项（已关闭，保留审计经过）

1. **[P1] 锁恢复候选在异步预留读取后没有再绑定原生授权的物理身份。** `desktop/service/workspaces.ts:153` 只在入口执行一次 `verifySelection`，`155` 等待全局数据库读取后，`156` 重新获得 `directoryIdentity(canonical)` 并直接作为新的 proof 返回；没有与原 `selection.device/inode` 再比对。与此同时 `assertWorkDataBoundary` 返回的持续 guard 被丢弃。若该等待期间目标被重命名并用携带同请求 manifest 的新目录替换，当前分支会返回替换目录的新 inode，供锁恢复操作使用。应在关键 await 后校验最初 selection 的身份并保留边界 guard；不能把重读得到的新身份视为原授权。在 NI-W05 增加 reservation 读取期间替换目标 inode 的断言；现有 `tests/integration/novel-import-publish.test.ts:68` 只覆盖发布前已换目录，不覆盖此恢复窗口。

2. **[P1] 两条线的原生投影丢弃已分析的事件与阅读关联。** `desktop/service/novel-import-publish.ts:62` 为每个 worldline artifact 新建一条世界线，`63` 则把所有 narrative artifact 按数组顺序放在章节之后，未使用其来源位置、事件引用或章节归属，生成的 telling `refs` 全为空、卡片 `chapter` 全为 null。即使上游提供了可验证的 `facts.eventId`，发布也完全忽略它。结果是有完整文本的孤立卡片，不能按已批准方案中的阅读顺序/章边界表达事件披露；同一客观世界中的多个事件也会散到不同世界线。应明确结构字段并映射本次数据库/规划 ID，未知关联保持未知，有关联时必须保存；NI-W01 应核对多事件、跨章/倒叙的 worldline 与 narrative refs，而不只在 `tests/integration/novel-import-publish.test.ts:31` 断言 world/card 数量。

3. **[P2] 已有回执的恢复分支没有验证原始材料记录。** `desktop/service/novel-import-publish.ts:33` 的 `verify` 只检查 ContentMutation 的 novelId 和 requestHash，`41` 遇到相同回执也直接返回。缺少 `06` 明确要求的 `NOVEL_IMPORT` ContentVersion 记录与其 request/importHash 核对。回执仍存在、导入记录缺失或指纹不符时，catalog previous 或 ready-before-catalog 的恢复仍会成功，之后原大纲/最初正文入口却不可访问。应共同验证目标、版本、记录 ID 与 importHash；NI-W04 增加回执存在但记录缺失/不匹配的拒绝断言。

4. **[P2] 长世界线/叙事线原文无法发布。** `desktop/service/novel-import-publish.ts:62` 把完整 artifact.text 放入 `eventSchema.fact`，`63` 放入 telling.intent；两者沿 `src/lib/planning/domain.ts:5` 的 text schema 限制为 100000 字符。来源文本在 `desktop/core/novel-import.ts:111` 按文件/类别合并，可合法超过这个长度。大纲在发布 `58` 已有保留全文并给规划提示的处理，但两条线没有同等处理，纯拷贝也会在事务里失败。应对大原文提供不截断的原记录保留与明确可访问的规划投影，或按安全原文块映射；NI-W02 增加超过 100000 字符的 worldline/narrative 原材料回读与发布断言。

## 已核对的实现与证据边界

- 正文从已确认章节切片直接写入 Chapter.content；发布前核对原始正文、章节拼接和每章切片（发布模块 `20–23`、`59`），没有 trim 或换行规范化。NI-W01 的合成正文包含 CRLF、空格和 emoji。
- 领域行、规划、原始材料 ContentVersion 与幂等 ContentMutation 在同一个领域事务内；manifest ready 与 catalog 位于初始化成功之后。普通建书不传 initializer，原指纹仍保持原行为。发布指纹纳入 reservation、manifest、catalog，ContentMutation 再校验同一请求；现有 NI-W03 已覆盖五个明确故障点，NI-W04 覆盖 creating/catalog previous 的换 payload。
- 原始大纲和所选设定保留于独立记录；最初正文与修改后的副本分开；读接口先核对当前作品归属，返回的来源是文件名/格式/hash，不含绝对源路径。长大纲测试逐页拼接比较完整原文。
- `WorkCreationReservations.requireExisting` 为只读查询，不创建新的恢复资格；`assertSame` 同时检查 requestId/hash/path/dev/ino。NI-W05 已包含缺 reservation、错目标、creating/ready-before-catalog、本机活进程/外机拒绝及死进程确认恢复。此处审阅不替代主进程单实例锁/无活动 job 接线及实际目标系统验证。
- NI-W03 在领域事务内部已有 `domain-writing` 故障点，但当前测试主要比较恢复后的唯一实体/版本。建议同时断言重试前的事务实体确已回滚，避免只能证明重试幂等。此建议与08中 NI-W03 目标一致，不增加全仓回归。

本轮没有独立执行 NI-W 系列命令；实际执行结果以主代理的定向证据为准。未验证 Windows 或真实供应商端点。
