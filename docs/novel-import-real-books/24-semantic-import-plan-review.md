# 语义导入、业务映射与英文章界方案/用例独立审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `unified_picker_review`。

## 分开结论

- **21技术方案针对性复审通过，SEM-TR01已关闭，可交本范围实施。** 新语义复核不得被历史决定/已resolved的同hash吞掉，绑定当前结果/决定/正文版本及耐久轮数，持续矛盾继续阻断。
- **21内限定用例针对性复审通过，SEM-TR01、SEM-TR02均已纳入现有编号。** 仍为17个新用例、2个指定旧保护项，不要求新增suite、真实模型调用或扩大为全量分析/测试。以下保留初审阻断与依据，最终复审记录见末节。

本轮只读审核214行的21文档，SHA-256 `6ce13e3648c18f87aab1984a599271434676d943aff19025e3c762868a67bba0`；对照S01最终复审及当前schema、native内容规整、规划reliability、publisher、controller和AI adapter。CodeGraph工具在本会话未提供，读取的均为任务所列已知文件。未改生产、实现用例、运行测试/模型/应用/UI、读取Key/数据库/真实journal或触碰旧S01数据。

## SEM-TR01 · P1 · 完整复核重新报告的持续矛盾不能被历史决定hash消音

**当前接点：** `desktop/main/novel-import.ts:346` 的 `addConflicts`：只要 `s.decisions` 存在相同hash，或 `s.conflicts` 已有相同hash（包括resolved），即不接纳后续冲突。`review` 经这一函数合并结果，`workflow` 在没有pending时直接进入publish。

21 §5/6 已要求决定后实际修订、重新复核全部原文/字段，仍有矛盾不得发布，且最多两轮。然而若修订后的完整review再次返回原先同一个hash，沿当前去重逻辑仍可成为“无pending”，尤其保留作者锁定原值但模型再次发现它与正文冲突时。旧决定记录的存在不能证明当前产物与解释已经自洽。

**最小必修：** 仅在新的semanticVersion路径明确区分“同一轮结果重复投递”与“当前产物/决定/正文版本的完整复核再次判为未解决”。后者不得因历史已决定hash而忽略，应重开待处理或明确失败；保留原决定/锁定字段，不能无声推翻它，也不能靠换hash、清空历史或重启重置两轮计数。发布检查应绑定当前artifact/result指纹、决定集和workingRevision及无持续矛盾状态，不能只检查旧conflict列表的pending数。无须建立claim数据库或新UI。

**既定用例补充：** NI-SEM06/08 内用同一个冲突hash模拟作者决定后两轮完整review仍返回它；断言未发布、无假完成信用、历史决定仍可查，暂停/正常重开后仍阻断且轮数未重置。另区分同轮相同响应重放不得创建无限重复UI项。该子情形应真实经过controller合并/发布门控，不仅测一个新纯函数。

## SEM-TR02 · 阶段合同必须由同名适配器用例实际覆盖

21 §6 的阶段合同本身正确：classify仅分类，普通analyze仅artifacts/notFound，analyze+reconcile仅artifactEdits/真实未决conflicts，review仅conflicts/missingTargets，patch仅正文patches；错阶段非空字段拒绝，既有空数组无操作兼容保留。

当前限定表中NI-SEM04集中提示/知识来源与枚举，NI-SEM05集中差量纯函数，未明确通过真实 `runImportAi` adapter覆盖这些新增判别分支。两个旧保护项的实际名称存在，但NI-A03只覆盖来源ID/类别/证据/实体引用，不包含新intent/artifactEdits/missingTargets的阶段权限。

**最小必修：** 在现有NI-SEM04或05加入同一版本的真实adapter表驱动子情形：五种阶段/模式各合法结果可通过；错阶段的非空artifacts/artifactEdits/patches/missingTargets等越权字段拒绝且不能进入controller/checkpoint；空数组兼容不被扩大成允许非空结果；普通analyze不能用新reconcile路径绕过native字段/锁定值/目标校验。保持17+2数量和已有精确命令，不运行整个NI-A文件或其他suite。

## 已成立的方案边界

| 领域 | 审核判断及依据 |
| --- | --- |
| 正文与来源权威 | 源/units/初始正文只读；只有既有逐处批准apply-patches能改workingProse。设定差量只动artifact.text/facts，原source材料单独保留；既定NI-SEM05/07覆盖未指定字段与原证据不丢 |
| 正常角色消费 | 当前Character确有roleType、aliases、occupation、personality、appearance、clothing、catchphrase、growthArc和relationships列；两遍ID解析与不凭同名猜外键成立。新推断不默认SUPPORTING，不用traits替代现有列；不扩大为所有心理/能力字段迁移 |
| Scene/World/九Setting | 当前Scene是parent地点树，World是世界树；世界级Setting有worldId、MAP parentId，九种类型与既有SettingContent契约对应。先严格检查再normalize，不以补空认证；同名身份包含类型/父/所属世界，跨书/循环拒绝；不以名称正则证明文学语义 |
| source-only兼容例外 | 允许0AI保留原文/分页；缺role的SUPPORTING只是显式存储兼容位，extra＋审计＋现有材料名说明未确认，不能计新推断正确。未知World归属/结构仅保留可读材料，不制造空Setting/假World；真实全12目标run不能用此例外抵消已证实投影失败。该降级及角色列表仍在配角桶的限制已明示，无需改schema/新向导 |
| 知识来源与两线 | 规划native schema确有四种reliability及ref.character。方案要求言说与所述事实区别、转述/时间范围进入可读文本和native fact，显式传telling/ref可靠性，不靠默认客观。语义支持性保留真实模型与独立原文验收边界 |
| 字段级修订与预算 | exact before/start/end/baseHash、sparse set/unset、作者锁定、证据并集、同artifact所有片段先暂存再原子提交，避免整对象覆盖。B/2B/完整3B包含新增意图/决定/差量元数据；不能装下明确失败，不截断。工作项按决定集/workingRevision/baseHash/证据片段绑定，暂停/失败/迟到epoch无半成品，重开只补未成功 |
| 完整性与两轮 | 仅有真实证据的missingTargets可触发所选目标补全；关联修订沿明确引用/共享证据，不无差别重做全kind；变更后全文＋全部facts重检。两轮及耐久计数合理；SEM-TR01补上现有去重接点后可闭合。召回仍须冻结oracle独审，不能把review零conflict当穷尽证明 |
| 旧S01/hash | 旧已发布数据、receipt、importHash、snapshot、记录只读不迁移。semanticVersion条件加入新scope/plan/audit，旧字段/顺序/值不补默认；未发布旧草稿不偷偷升级。NI-SEM-P03要求独立冻结旧snapshot/hash及隔离真实回执，避免拿新helper算预期冒充兼容 |
| 英文章界 | 通用英文数词/规范Roman连续序列，独立标题边界、目录/重复/缺号歧义不猜；孤立I不触发。手动cuts优先、UTF-16安全、所有切片拼接逐字相等；真实L02/M02数量只在验收，不入生产提示/规则 |
| 并行所有权 | PDF/预算先完成审核并冻结组合基线，重叠main/shared/publish/payload取得所有权后串行接线，保留PDF门控和既有几何；不整文件覆盖其他改动 |

## 用例与执行范围核对

准确为10项NI-SEM01–10、3项NI-CH01–03、3项NI-SEM-P01–03、1项NI-SEM-B01，共17新测试；加2个实际存在的旧测试NI-D01/NI-A03。命令限定Node24绝对路径、单个明确文件组和锚定名称；没有通配整个目录、完整browser/package/test命令。真实React SettingContentEditor九类消费及隔离PGlite真实投影/编辑后重读，比仅查snapshot充分；真实原件/oracle/Key不进入夹具。

SEM-TR01/02应加入现有编号内子场景，不能为满足本审核扩大测试许可。当前未执行任何上述命令。待这两项修订通过针对性复审后，技术方案和限定用例才可一并交实施TDD；真实新S01、L02/M02及其余正式原件的最终验收仍逐run保留，不改旧FAIL结论。

## SEM-TR01/02 针对性复审

同日只复读21的指定修订，最终文档SHA-256为 `550fa6c1bf1dd3cfaa71dbef0633475e61509bd29bda79f493daca589d6eac35`。没有实现或运行测试，也没有重做已确认领域审核。

| 项目 | 关闭依据 |
| --- | --- |
| SEM-TR01 已关闭 | §6明确修改现有addConflicts接点：当前完整复核的持续同hash矛盾不能被decisions/resolved消音；复核绑定artifact/result指纹、决定集和workingRevision，重开待处理或失败，历史决定保留，普通retry/重开/重启不重置两轮。NI-SEM06新增同hash重新报告仍阻断，NI-SEM08覆盖跨重开/重启与轮数持久化；没有扩大测试编号 |
| SEM-TR02 已关闭 | §7明确真实adapter对五种阶段/模式逐一执行非空输出白名单及零credit拒绝，保留无操作空数组兼容；NI-SEM04加入真实adapter的错阶段artifactEdits/artifacts/patches/missingTargets拒绝和空数组保护，不拿纯函数或旧NI-A03冒充新mode权限验证 |

**技术方案最终结论：通过。** 已将两个真实现有接点具体化，源/正文权威、native投影与显式纯复制例外、字段级原子修订、完整预算/证据/复核、两轮停止、旧已发布S01只读hash与章节保真边界成立。可按§9取得串行文件所有权后进入TDD，不能与未冻结PDF/预算重叠入口同时写。

**限定用例最终结论：通过。** 仅既定17新case＋NI-D01/NI-A03两旧保护项及明确单文件命令获本审核认可；所有结果仍未执行，测试名不存在/空匹配/skip不能记通过。后续实现与独立code review须验证上述契约，合成绿测/编译不能替代真实新S01语义及正常业务实表/重开，也不修改旧S01的FAIL与回执。
