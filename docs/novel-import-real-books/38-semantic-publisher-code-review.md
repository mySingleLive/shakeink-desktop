# 语义导入 native 发布与记录展示独立代码审核

日期：2026-10-26（Asia/Shanghai）。审核者：独立子代理 `cross_platform_picker_design`。最终结论：**PASS，仅限本轮 native publisher/记录 API 与既有展示组件的静态审核，以及获准 P01–03 的独立临时 PGlite 验证。四项 P1 均已关闭，无剩余必修项。** 不代表真实书、真实模型或目标平台验收通过。

## 范围与方法

依据 [21 技术方案与限定用例](21-semantic-import-plan.md)、[24 独立方案审核](24-semantic-import-plan-review.md)，审查 `desktop/service/novel-import-publish.ts`、既有 `NovelImportRecord.tsx`/记录 API 展示及 `tests/integration/novel-import-semantic-publish.test.ts`。对照实际 Prisma schema、规划 domain、已审 semantic decoder/mappings、PDF 审计与预算接口；不改上述生产或测试文件。

本审核者不是 publisher/SEM 产品实现作者；另负责纯机械审计 helper，其 [35 审核](35-native-semantic-audit-review.md) 通过不能代替本发布器的真实数据库投影验证。本会话未提供 CodeGraph 工具，所读均为上述已知文件和其明确的消费/依赖契约。

静审阶段没有运行可变测试；最终只执行批准的单文件 `^NI-SEM-P0[123]:` 三项、真实临时 PGlite，3/3通过。没有全仓 suite、真实应用、模型、Key、用户数据库/源小说/旧 S01 journal 或 HTTP 服务操作。下文保留初审问题及此前未冻结状态，最终关闭依据与独立结果见末节。

## SP-CR01 · P1 · 角色姓名与 artifact ID 共用映射表可能写错角色

初审 `publishNovelImport` 创建角色后，先把每个 artifact ID 写入 `characterIds`，再把唯一姓名写入同一个 Map。角色甲的姓名若恰为角色乙的 artifact ID，后者的实际数据库 ID 会被覆盖。例如甲 `id=char-a,name=char-b`，乙 `id=char-b,name=乙`，姓名别名步骤将 `char-b` 指回甲。

第二遍 `relationships` 更新据此会更新甲而非乙；合法的事件 people、叙事 narrator 和 ref.character 也可能错误指向甲。共享引用校验只证明目标 artifact 合法，不能使这一混合命名空间安全。

已先报告主代理与原实现作者。最小修订是分离 artifact-ID 映射与唯一姓名映射：关系/显式 ref.character 仅按 artifact ID；既有允许 ID/唯一姓名的 people/narrator 使用明确的 ID 优先解析。legacy 分支保持原行为，新增碰撞情形仍纳入原 P01/P02，不新增 suite。等待修订与独立验证。

## SP-CR02 · P1 · 材料警示只取首条会隐藏角色类型未确认标签

初审 `readNovelImportRecord` 只用 `.find` 取第一条匹配的 mappingWarning 决定材料名称标签。原 source 角色若先产生未支持字段 warning，再产生 roleType warning，首条不含 roleType，于是只显示“导入时结构映射未确认”，遗漏批准的“导入时角色类型未确认”提示。

原实现作者已确认并纳入同范围修订：聚合同一材料（含 `original-` 原材料视图）的全部 warnings，任一含 roleType 即使用角色标签；原 artifact.name/text 不被改写，分页仍读取完整原材料。等待原 P01 内窄反例及独立验证。

## SP-CR03 · P1 · 非两线业务内容可能丢掉已有知识限定

初审严格新语义路径会限定角色 bio、地点/世界 description 和两线，但 item.description、foreshadow/trope.content、theme.synopsis、STYLE/GOLD_FINGER 文字以及九类世界级 Setting.content 仍直接写 text/native content。若知识归属/可靠性仅存在于对应 facts.reliability/attribution/temporalScope，正常业务面板读到的会是没有范围说明的内容。原 facts 即使进入材料快照，也不能满足21 §4“正常业务描述可读保留限定”的要求；固定提示本身不证明每个字段实际已有说明。

已报告主代理，主代理明确确认按21 §4作为本轮P1处理，不扩大为新产品功能/新UI。原作者须先明确各现有描述字段的无损映射，再在原 SEM04/P02 编号内实现和核对：strict inferred/confirmed 普通业务描述使用已有 qualifyImportKnowledgeText；九Setting保留原描述值并附已有知识，不改名字、ID、枚举或层级，不制造新事实。结构化 source 若知识只在 content 外，也须显式无损保留或警示；整段 source-copy 原 text/name/bio 仍按批准约束保原。具体映射说明、对应纯机械审计期望的最小增量与独立复审均待最终版本，当前不把这些内容记为通过。

原实现作者随后明确本次窄映射：

| 既有类型 | 加上已有知识限定的正常可读字段 |
| --- | --- |
| 普通业务产物 | strict item/foreshadow/trope/outline/theme/style 正常文字；goldenFinger ability 及非空 trigger/limitation。整段 source-copy 原文字不改 |
| 六文本 Setting | text |
| CONCEPT | 每项 explanation，term 不改 |
| FACTION | 每项 description 及非空 relations；id/name 不改 |
| LEVEL_SYSTEM | 全局 description、非空 rules；递归已有等级非空 description/condition/ability.description、途径非空 description。names/aliases/tags/enums/树不改 |

“非空”按 `trim().length>0` 判断，纯空白可选描述字段保持原值；全局/概念/势力上述指定承载字段允许原空时仅附已有 metadata。严格 native 解码、规整与实质内容门必须先执行，不能用后来添加的限定让原空内容通关。显式 JSON content 的 source 也在这些字段无损保留外部知识；原 artifact.text 与 facts.content 字符串仍逐字进入材料。source 缺 content 的文字/LEVEL fallback 整段原字，LEVEL 未提取结构 warning 继续保留。

纯审计 helper 的独立字段期望已按此最小更新，并保留原31场景、增加同 RB-P01 范围的九类限定/逐类丢限定/structured source/fallback/递归与空白边界，先 RED 后46项 GREEN及定向类型检查。随后按主代理要求，对无法解码的 source 仅在显式 sourceCopy、非 projectable、明确 warning、通用 raw text/facts/evidence 形状完整时作为未映射材料保留；同值 inferred/projectable 及坏 UTF-16 仍硬失败，累计56项 GREEN。历史各阶段 RED/GREEN 证据分前缀保留。它不调用产品的投影函数；该 helper 修改另交35原审核者独立增量复审，本报告不自审这份 helper，也不以其内存结果代替下面待执行的真实发布数据验证。

## SP-CR04 · P1 · 新增知识限定复制缺少输出放大预检

首个最终冻结版本 `e1b8cd172edbab6669ebfd7a9d4c14b040fe896bf5a6c36b822cb81edefa9453` 的 `qualifyImportWorldContent`（190–197行）先 structuredClone，再对每个描述字段重新构造完整限定；对应 publisher `790c360e…92dde` 在 Setting.create 的 json() 才 JSON.stringify。此路径没有按知识前缀长度、实际投影字段数及原内容计算安全输出上限。

显式 source.content 允许知识说明位于 JSON 外，长 attribution/temporalScope 可被重复到许多描述节点。原始小 JSON 和先前 native 可见内容检查，不能约束这一新增复制本身的放大；不能等到 stringify 或内存分配失败才处理。该检查由主代理明确指定为本次新增操作的范围，不扩为新 parser 或通用安全重构。

已先报主代理和原作者。最小修订须在复制/附前缀前，安全核对 prefix 长度 × 被投影字段数 + 原内容规模（包括安全整数与实际序列化保守估算），超限明确失败或将 source 按明确 raw fallback 处理；不能截断或提高原模型 B。只在原 SEM04/P02 编号内用可配置小阈值证明门槛，不真实分配大数组。等待资源门最终冻结，尚未运行会变更版本的独立 P01–03。

## 首个最终冻结版本的增量静态核对

生产 publisher `790c360ebe5e734cdfe5b95c68d58c25f512a4acf01cafb97baa04655ac92dde`、integration `820df71a1f531840a2ddccd2d9deedf4c171d73430533914fe34555153dc44e0` 与原作者[实施证据](semantic-implementation-evidence.md)一致。源码逐项确认：ID/name Map 分离且关系/ref 严格ID、people/narrator ID优先；多 warnings 聚合且 roleType 标签优先；ordinary strict 与九类结构描述均按已明确字段附限定，source 原材料/显式content字符串完整保留；完整 artifact hash 去重保留同text而facts/evidence变化的最终材料。源结构/知识无法解码的 raw fallback 只用于 origin source，native:null、警示且不加入 projectable；strict derived/confirmed仍抛错。

Record 组件仍为原 `93da972e…b61c`，没有产品布局更改；只消费服务端真实材料名称标签。35最新 helper `ea047b84…29eb` 已由另一代理独立60场景通过（含 raw-only timeline 与正常 decoded 缺可靠性门分开），本审核未再次改该 helper，也不拿它替代发布数据验证。前三项本轮暂记“代码修复已核对、独立数据库执行待最终资源门完成”；不能据原作者3/3日志提前作独立PASS。

## 其余静态核对

| 检查点 | 当前源码依据与判断 |
| --- | --- |
| 正常角色字段 | 新语义路径从已验证 native shape 写入真实 Character 列，aliases 为 JSON 字符串数组，全部批准 profile 字段及 bio 保留。source-copy name/bio 原字；strict derived/confirmed bio 用可读知识限定。relationships 在全部角色创建后按独立 artifact ID 表解析；P01/P02 已覆盖姓名与另一 ID 碰撞 |
| 地点与世界树 | scene 仅 native PLACE，父节点先创建，coordinates/description 写实际 Scene。WORLD 与 SETTING 分开；先 World 树，再九类 Setting，worldId/parentId 映射到本作品真实 ID。MAP 父节点类型与同世界约束在映射校验中验证，不能创建失败时提交半棵树 |
| 九类内容 | Setting 使用 decoder 严格验证后的真实 native content；六文本型为 `{text}`，LEVEL/CONCEPT/FACTION 为现有编辑器结构。没有先用宽容 normalize 补空认证，也没有强造九类内容。P01 已读取真实行、规整、编辑后保存再重读；P02 已核对知识限定实际落库，SP-CR03关闭 |
| 未结构化原资料 | byKind 仅选择实际 projectable 集合；未知 world/结构仅保留材料及 warning，不造假 World/空 Setting。缺角色 roleType 只在 source-copy 使用显式存储兼容位与 extra.importMapping；strict 推断无该默认。缺可靠性的 source 两线在映射时排除，不写默认客观 native 行 |
| 材料快照 | semanticVersion 1 的原/最终材料去重比较整个 artifact 的 hash（先恢复原 ID），不再仅以 kind/text 相同丢掉 facts/evidence 更新；原材料用 original- ID 保留，最终变更材料单独保留。legacy 的既有字段和去重分支继续独立 |
| 两线知识范围 | native event.fact 与 telling.intent 使用 qualifyImportKnowledgeText；telling/references 显式传 reliability，ref.character 显式解析，refs.kind 的 happen/mention/recall（缺省 happen）进入正常可读 source，原 facts.refs 仍完整进入材料审计。源资料未知可靠性不能靠 domain 的默认“客观事实”成为已完成投影 |
| 长文本 | 分片容量先扣完整知识前缀，再按 UTF-16 安全边界拆原文；每片重新加同一前缀，单片最多 100000，尾部不截断。原生事件首片继承已知时间，续片 unknown。前缀本身无法容纳则明确失败；P02 实际读数据库行逐片剥前缀拼回全文，尾哨兵与代理对保持完整 |
| 原子发布与重试 | assertPlan 校验 planHash、coverage、源正文/章节、未决冲突/patch、语义 checkpoint 当前 input/result/decision/workingRevision。数据/快照/ContentMutation 同事务；Workspaces 重试在原目标库核验 receipt 和唯一原 snapshot，已有请求不再次投影 |
| 旧版本 | semantic 字段只在 semanticVersion 1 时进入新 hash/record；无版本旧 snapshot、receipt 和 material 行不补默认、不迁移。P03 的旧 hash 与 snapshot 是固定期望，不由新版 producer/helper 计算预期 |
| PDF/预算组合与隐私 | record 保留 importBudget 私有审计及 PDF ledger/decisions/events/sourceTextDecoding 全证明；公开读取剥 PDF proof 并将 sourceTextDecoding 投影为三项摘要，不公开路径/PNG/previewToken/模型授权。公开 record 不返回 importBudget。21 semantic 字段添加不应覆盖25/26既有条件字段 |
| 既有记录 UI | 继续用真实 Dialog/Button/分页；材料按钮显示 API 名称标签，原文由按 novelId 限定的 API 分页读取，safeImportBoundary 防止切坏代理对。没有新编辑器、假资料或 HTML 原型进入生产；P01 已核对多 warning 顺序仍显示角色类型未确认标签，SP-CR02关闭；既有React组件只做静态复用核对，未运行真实应用UI |

## 最终独立定向执行

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-SEM-P0[123]:' tests/integration/novel-import-semantic-publish.test.ts
```

实际执行：**exit0，3 tests / 3 pass / 0 fail / 0 skip / 0 cancel，13215.80575ms**。只有上面这一条独立测试命令；没有额外执行原 SEM unit、PDF、浏览器或全仓用例。

| 独立执行项 | 实际覆盖与结果 |
| --- | --- |
| NI-SEM-P01 · 6304.674083ms | 实际 Character profile/aliases/两遍关系、不同父地点同名小空间、World父树/九Setting归属与MAP父树；真实读→编辑→保存→重读；角色ID/姓名碰撞；未知source原文与警示、不造World/客观线；同text不同facts/evidence的原/最终快照与角色职业；坏基础raw形状拒绝；警示顺序标签。通过 |
| NI-SEM-P02 · 3912.751459ms | 原编号内小阈值预检：精确转义字节门槛、少一字节/少一个字段时source raw+warning/排除、strict硬失败、source原字fallback；实际临时数据库中people/narrator/ref ID碰撞、普通七kind/九类Setting的限定与source保原、显式结构source外部knowledge、原facts/content快照；两线100000完整分片与续片unknown。通过 |
| NI-SEM-P03 · 1914.990167ms | 独立冻结legacy hash/snapshot及真实幂等receipt；旧request不能新版重投影；新semantic+Bv2与PDF decoding/ledger/decisions/events实际保留、公开decoding摘要（proof私有保留/公开剥离另由源码静核）；新旧库分开、旧snapshot及两份合成来源字节不变。通过 |

日志：[独立P01–03](evidence/semantic-publisher-independent-final-p01-p03.txt)，SHA-256 `c5f5aeb18c55d88c4e420f9ec77bdc53d2efd6481fc840da691446a112ec1e2c`。测试 fixture 在自身 mkdtemp 根创建管理区、来源与每本作品库，通过真实 Workspaces/Prisma/PGlite 调用；after 关闭连接并移除自身临时目录，没有用户数据库或真实小说输入。

执行前后的[13文件指纹](evidence/semantic-publisher-independent-final-source-before.json)与[独立命令/执行后指纹](evidence/semantic-publisher-independent-final-source-after.json)完全一致：11项原作者冻结文件另加未变的Record组件及35已独审helper。后两文件只证明边界未被改变，不意味着本审核重审主进程/adapter或自审纯helper。metadata记录真实命令、exit0、3/3、0skip及日志hash；没有源书、用户DB或Key信息。

## 最终修复复审

**SP-CR01关闭。** publisher的 artifact ID Map 与唯一姓名 Map 分离。角色update/relationships与ref.character只用ID；people/narrator采用ID优先/唯一姓名。P01直接读取两位角色，甲的关系指向乙真实ID且乙关系不被覆盖；P02直接读取事件people与telling/ref.character，姓名等于另一artifact ID的情形仍指向乙。未用审计helper预期代替这些真实行断言。

**SP-CR02关闭。** 记录API聚合同一artifact及original视图的全部warnings，任一含roleType就显示指定角色未确认标签。P01以traits未映射warning先于roleType的次序核对实际readNovelImportRecord结果；原快照name不加标签、材料分页原字。Record真实组件继续显示API名称，不增加产品UI或改角色原name/bio。

**SP-CR03关闭。** strict普通业务字段与九Setting描述字段按前述窄协议附已有限定，source整段原字/显式content原字符串保留；原内容须先严格解码和通过实质内容门。P02核对实际Item/Foreshadow/Trope/Theme/Style/Volume/GoldFinger/Setting行，包含空承载字段、纯空白关系、路径/等级/能力描述、source显式content外知识和source无结构fallback；原材料facts/text逐项相等。事件与叙事逐段前缀、reliability/真实角色ID/ref可读kind及完整拼接亦实际验证。结构枚举和可读范围保留不等于文学解释已经有据，仍须真实oracle。

**SP-CR04关闭。** 最终 semantics `30ea421c…704ab` 的assertImportWorldContentProjectionBudget在qualify的structuredClone之前生效；mapping也在纳入projectable前执行同门。计量逐字符处理JSON引号/反斜杠/控制符、中文与surrogate pair，对象undefined键按实际JSON省略；原完整JSON含键/标点，增量为未分配重复字符串的escaped prefix bytes × 实际描述字段数。安全整数加乘、16MiB输出/100000描述字段硬门及1m结构访问节点/256深度保护均存在；可选limits只可下调。source缺content按实际不加prefix计量；超限source保原材料并加明确content/knowledge字段warning、排除native，strict derived/confirmed抛错；publisher再次默认硬门。P02独立小阈值情形实际通过，没有巨大分配。作者SEM04的clone spy及其unit红绿仅作为作者证据/源码核对，未冒充本轮独立运行。

另确认新的isImportRawSourceArtifact在source decode catch前要求plain基础对象、合法id/kind/name/text及facts/sourceUnitIds/evidence与完整UTF-16。坏业务值仍可成为带警示的raw-only材料；facts字符串/数组/Date等坏基础形状不能降级。P01原编号内实际执行相关拒绝断言通过；这关闭首个冻结版catch过宽的静态候选，不扩为旧journal迁移或新parser。

| 最终主要文件 | SHA-256 |
| --- | --- |
| desktop/service/novel-import-publish.ts | `790c360ebe5e734cdfe5b95c68d58c25f512a4acf01cafb97baa04655ac92dde` |
| desktop/core/novel-import-semantics.ts | `30ea421c4c70008ca1b975a16bfc9a83b70ed7dfbab1c9bfc7bac1312ef704ab` |
| desktop/core/novel-import-semantic-state.ts | `57bc498f75b800fc602666f984594bb7ec10e59207d5ee709f8dacda7272f60c` |
| tests/integration/novel-import-semantic-publish.test.ts | `b1ae2f06289b3279d60469d088988af8181185780d6c85d5c1d64b6216eb6469` |
| src/components/desktop/NovelImportRecord.tsx（未改） | `93da972ef693c3fdca37508085121c2f5c31d9714ae166c8c265a4b16c2cb61c` |

**限定结论：PASS，无剩余本范围必修项。** 合成临时数据库通过不证明整书事实有文学依据，不代表真实新S01/全12目标/RB-Q01、真实跨平台或最终正常业务面板重开验收通过；旧S01失败记录不变。新41 runtime诊断当前仅计划，未进入本冻结基线，本结论不覆盖其将来实现。
