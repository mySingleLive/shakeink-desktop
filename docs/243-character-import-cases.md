# 角色导入引用回归用例

日期：2026-10-30。方案和独审：242。测试采用合成资料，真实书文本仅用于隔离 Electron 验证。

| ID | 操作与必须断言 |
|---|---|
| CI-01 | 24 个全选角色，前 23 个关联最后角色，最后角色回指首个角色。前 8 个返回后强制等待 journal 实际提交、确认目标尚未提交，再放行后续返回；使用正式 controller → runImportAi（仅 generate 受控）链。修复前同样“导入实体引用类型或归属无效”或任务失败，修复后 24/24 done、零 failed/skipped、ID 集合与候选完全相等，24 条关系全部保留且能解析；到达 detect-scene。 |
| CI-02 | 用含合法未提交关系的部分集合检查快照：未给 entities 时仍因坏引用失败；显式 entities（含空数组）不扫描无关部分集合，输出目录必须与输入一致。 |
| CI-03 | 真实 runImportAi 校验：显式目录中缺少关系 ID、关系 ID 指向 scene，均拒绝；同一正确角色目录可接受前向关系。不得删关系制造成功。 |
| CI-04 | 定向复跑 NIW-C30/31/33/34/35/38/39/40b/41/49，覆盖重试、暂停恢复、跳过、字段重试、错误归属、并发存储；相关服务/语义/发布/提示词测试与类型检查。既有失败须与改动前结果对照，不扩大为全仓测试。 |
| CI-REAL | 当前构建的真实 macOS Electron，指定 GB18030 原件全文 1402 章，默认全选全部识别角色，真实文本模型。角色步骤全部 done、零失败/跳过，候选与 artifact 一一对应、全部 relationship.characterId 可解析、无页面错误、原件 SHA 前后不变，下一步 detect-scene 停止；截图、调用计数与结果摘要。受控选择器明确记录，不声称原生选择器或其他步骤/发布验收。 |

真实运行遇到问题须保留最初错误并查明原因，经修复后重新验证。自动重试最多三次仅处理暂时供应商失败，不跳过；任何尚未成功的项都不得判通过。

## 真实运行发现的目标契约回归

| ID | 操作与必须断言 |
|---|---|
| CI-05 | controller 的真实请求包含从已选候选构造的 entityTarget（id/aliases/作者确认 roleType）。service 在 generate 前拒绝缺失目标、外部 ID、目录重复 ID、目标 kind 不符、非 analyze/entity 使用 entityTarget。响应 schema 对 notFound、空列表、多项、错 ID/name/kind 均拒绝；正确目标及全部已有引用/证据仍通过。普通 analyze 仍允许 notFound。 |
| CI-06 | canonical name 没出现在本批原文、只有别名出现时，序列化始终保留目标目录项与结构化 entityTarget；固定 entity 契约明确只返回单个目标并保留未知字段空缺/作者确认类型。角色关系引用可用相关目录；普通 analyze/roster/review/reconcile 提示及 payload 的既有 hash 全部保持。 |
| CI-07 | 实际 generateImportAiJson → generateJSON，仅 generateText 受控：依次以 notFound、多项、错 ID/name 作为第一次模型输出，第二次正确输出；断言有限纠错实际再次调用、纠错提示包含目标契约、最终恰好正确 artifact，关系与证据不被清空。持续非法输出仍失败；取消/授权失败不当成合法输出。 |

CI-REAL 重跑从原件新建完整会话，全部角色默认全选，不复用手改 journal。驱动若在运行中观察到结构、引用或目标等非瞬时失败，应及时暂停并保留现场，不能等所有角色跑完才查错。角色全部成功后保留最终状态分布与候选/任务/artifact ID 的一一对应证据。

## 服务端结构错误与字段纠错边界

- CI-08：通过正式 controller → runImportAi → generateImportAiJson → generateJSON 链（只控制 generateText），某角色前两次生成含非法 reliability 与 sourceUnitIds，第三次合法。断言该角色两次 controller 请求、三次结构生成，第二请求具有固定字段纠错提示，全部候选 done、资料与关系仍在。持续相同非法输出时恰好两请求/四生成后失败，绝不无限重试，不把非法值清洗为成功。
- CI-09：对授权变更、普通网络错误、AbortError、请求预算与运行时持久化错误分别断言不进入第二次模型请求；保留 NIW-C30/33/41/47/50 原语义。entity 专属提示必须明确可选 reliability 省略/既有枚举、unit.id 与 fileId/entity.id 的区别；普通阶段 hash 保持不变。RB03/RB04 等未知单元/虚构引文仍严格拒绝。
- CI-09 补强：形似字段错误但包含未知诊断标签（`SYNTHETIC_SECRET`）不得进入重试。服务端括号诊断仅接受既有固定标签、最多六项、无重复；纠错反馈不拼接任意异常正文。
- CI-REAL：原件全文重新构建测试，真实返回结构错误的内部有限纠错与可见失败分别记录；全部角色最终成功且无跳过才能通过。任何持续失败都保留现场并继续修复，不能靠手改 journal、丢弃字段/关系或多次随机重跑迁就结果。
