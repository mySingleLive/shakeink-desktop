# RB-P01 语义审计调用端独立审核

日期：2026-10-26。审核者：独立子代理 `remaining_books_oracle`。

**结论：PASS，仅限本轮冻结的 RB-P01 调用端接线、observer 的 SEM 证据投影，以及获准的静态／合成验证。** 未发现本范围内必须修订的 P1/P2。此结论不代表生产 controller、语义修订器或 publisher 已通过独立代码审核，也不代表任何真实小说的应用导入、模型推断、文学语义、发布或原生重开通过。35 的纯 native helper PASS 在本报告中仅作为已审核依赖，未扩大为真实数据库结果。

只新增本报告和新 metadata evidence；没有修改脚本、生产代码、原件、oracle、历史证据或真实 run。没有执行审计 main、observer freeze/observe/build、任何测试 suite、用户 journal、数据库、模型、应用或 CUA。CodeGraph 工具在本轮工具清单中不可用，按明确指定的文件直接读取。

## 冻结身份

| 文件 | SHA-256 |
| --- | --- |
| `scripts/audit-real-novel-import.ts` | `1460b0441c9d2f431126e499298fe205ac901442d2a15e09ac985b3c609d0acb` |
| `scripts/observe-real-novel-import.py` | `87347f2f9c56bad8f268c79f15e817e457ae5a96bd0048d25086a5bda5b590c4` |
| `scripts/real-novel-semantic-assertions.ts`，35 最终版本 | `a93cd0208653a0feb4818c14b2aa26dbfb9988715946095948c24a299126c682` |
| `desktop/core/novel-import-semantic-state.ts`，本次纯 API 读取版本 | `ab0bf93cadda2d2147f3a03792e3f522749abe7af2237816ec7320eb1c3cb145` |

前三项与主代理交付身份严格相同，结束前再次核对未变。semantic-state 本身仍归生产实现／独立代码审核所有者；本报告只核对其调用契约，并以此版本的纯函数执行合成 guard。

## 调用链与准入

`audit-real-novel-import.ts:48–100` 继续在 `APP_ROOT` 接触之前检查正常关闭声明、同构建 migration 指纹、冻结 run／oracle／正文、原文件与有序成员、completed checkpoint、receipt、plan hash、正文来源和完整覆盖。新 SEM guard 位于第85–92行，没有把未完成 run 引入 Workspaces。

- 先调用真实 `validateImportSemanticState`；旧版无 semanticVersion 且无 state 的分支保持兼容，未知版本及旧版夹带新 state 拒绝。
- 版本1必须真实具有 `stage=ready` 的 state，且 inputHash、decisionHash、workingRevision、verifiedHash 分别严格等于当前真实 API 的计算结果；不能用 ready 单字段替代这些绑定。
- persistentConflicts 必须为空；每项 repair 已 committed，original.id 与 artifactId 相同，完整 original 的 hash 等于 baseHash，所有 task 均 done。每项 omission 已 done、kind 在本次所选 targets 内，全部 unitIds 均由 completedUnitIds 覆盖；缺字段或只覆盖部分不能通过。
- `importNativeMappings(s)` 是当前 artifacts 的真实解码与投影选择；session mappingWarnings 与其完整结果严格相等，不以存在一条警示替代。错误 native 结构仍会拒绝，source-copy 的未确认兼容位也不能单靠警示计作全目标推断成功，后续 helper 有单独断言。

这些是已存检查点的机械一致性条件，不能证明模型审读充分、修订理由正确或遗漏穷尽；真实 oracle 的文学核对仍独立保留。

## 持久结果与原材料

第142–149行与实际 publicationRecord 的版本分支对齐。版本1对完整 source artifact 与最终 artifact 做完整 hash 比较，包含 id、origin、facts、evidence 等；因此原文相同但 facts／来源等不同的最终材料仍须保留，原始材料另加 `original-` ID 保留。没有回退到仅按 kind/text 去重。完整 snapshot.materials、source 身份、originalProse、workingProse 都必须精确相等。

snapshot 的 semanticVersion、完整 importSemanticAudit、sourceCopyIds 和 mappingWarnings 分别与同一 session 的真实纯 API 结果比较。传给35 helper 的 sourceCopyIds／projectableIds 来自同一 `semanticMapping`，没有由调用者任意扩大豁免集合。helper 读取真实查出的 characters/scenes/worlds/settings/chapters/planning 行，不把 snapshot 当 native 行；其失败断言并入总 assertions，最终通过仍要求全部 true。

新版本的角色／地点／世界／两线专用 native 断言由35 helper承担；旧版继续执行原来的角色完整履历、scene/world 名称全文集合、worldline／narrative 全文拼接断言，并要求 snapshot 不出现新增 SEM metadata。原 item、伏笔、爽／泪点、主题、大纲、文风、金手指及实际外键断言仍保留。没有把旧分支套用新版知识限定前缀或 native 解码规则。

正文继续要求冻结 expected Buffer 与 checkpoint original、working、章节拼接及数据库有序章节原始 UTF-8 Buffer 精确相等；实际章节标题／顺序／完整内容另行比较。没有使用去空白、摘要、token 相等或局部 rawBuffer 替代最终正文。二进制／目录输入的既有严格映射、PDF proof 以及冻结 sourceFiles 检查也未放宽。

## 数据与证据边界

第104–137行仍预检既有 application/work 品牌、catalog、receipt 指向的固定 corpus 目标及 requestHash，复查品牌身份、catalog／migration 是否变化后才打开 Workspaces。读取限定 receipt.workId 且 context 不得为 globalDatabase；事务首条为 `SET TRANSACTION READ ONLY`，RepeatableRead，所有业务查询以自己的 novelId 或其 Volume 关联限定。ContentVersion 按 NOVEL_IMPORT／targetId 限定；ContentMutation 另有 novelId，随后统一核验所有行归属和单 receipt。没有新增全局 Usage、Key、模型配置或其它作品查询。

Workspaces 的初始化、writer lease／WAL／migration 元数据行为不宣称文件系统完全只读；脚本原有输出对此有准确限定。输出仍只到新的 run/label-audit 叶，wx 新建，不覆盖历史；源原字节和 checkpoint 在查询后复查。34已审核的输入、路径和链接边界没有被本次 SEM 接线改变。

observer 第20–33行的 BUILD_INPUTS 继续以本仓库相对路径记录实际构建／相关生产源身份；freeze 和 build 共用，不增加用户目录或模型扫描。第293行白名单保存 semanticVersion、semanticState、mappingWarnings，以便后续审计能看到耐久修订状态；model 投影仍排除 endpoint/authRevision，顶层不复制 analysisGrant/classificationGrant。SEM state 是当前严格协议内的纯数据，不引入可执行行为或模型授权。没有为核对这段投影执行真实 observer。

## 获准的实际验证

只执行以下专用类型检查和只读 schema 描述，均 exit0：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node node_modules/typescript/bin/tsc --project /tmp/shakeink-real-audit-tsconfig.json --pretty false
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx scripts/audit-real-novel-import.ts --describe-schema
```

专用配置只以 audit 脚本为 files 入口，noEmit、incremental=false；schema 描述结果仍为63个 migration 文件、指纹 `cf231d839c67a5d7e7904ba4185a5f5106b8edd7c870708ff47e59f4fa915d06`。该 CLI 分支在 Workspaces 动态导入和用户 DB 访问之前返回。

另按明确许可，用 TypeScript AST 抽取真实 main 内第85–92行的三个完整语句，并断言其位于首个 APP_ROOT 访问之前；保留实际 AuditFailure、requireAudit、equal，绑定真实纯 core／semantic-state API，没有执行 main 或替身业务实现。临时程序只注入合成 plain data：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx /tmp/shakeink-real-semantic-entry-review.mts
```

结果 **exit0，29项预期全部符合**：完整 ready／空任务／旧版无字段正例；未知版本、旧版夹带 state、缺 state、三个非 ready 阶段、过期 input／decision／working／result、验证后改变决定／结果／锁；持续冲突、未提交 repair、original ID／baseHash 不符、task 未完成；omission 未完成／目标越界／completedUnitIds 缺失或不完整；source-copy 警示正确保留、缺失和改写。抽取 guard SHA 为 `c6a3ee0a40c23ecb66d3fab5e9e6257abe9cfa142ab4bc51b4f8d5f1ae171f8d`。新证据见 [real-semantic-audit-entry-independent.json](evidence/real-semantic-audit-entry-independent.json)，只含名称、身份和布尔／错误码，不含小说或真实 session。

临时验证程序首两次因 namespace 导出的 default 不能作 Function 形参、Error 子类未自设 name 的夹具分类问题而退出；修正的仅是 `/tmp` 提取程序的绑定／错误分类，生产脚本没有变化，不把它们记作产品 RED。未重新执行35 helper的31项自检，也未扩大到真实数据库或产品 controller 用例。

本轮允许调用端进入后续独立生产代码审核和授权真实 run 阶段；本报告不能代替这些阶段的实际结果，历史真实失败／未执行状态保持。

## 小增量复审：全部类型知识限定与章界证据

主代理明确要求按21§4核对所有类型正常业务文本的知识限定。本节是新的限定审核，保留上文原版本和29项 guard 历史不改；**本次调用端增量 PASS**，未发现必须修订项。新的冻结身份如下：

| 文件 | SHA-256 |
| --- | --- |
| audit | `becc7ddb3fb4b615b77a87c11b778d375e9f4a2530c256c19053e3ef6afe8472` |
| observer | `84039aa3750f4a0cad97df33a34c254f67fcaf40e577d12f0d7eb343b4d3a54d` |
| 此次调用的 native helper | `462960a64ef1ca8edce72b8964ba2ed11f1929eef7fef9cc7aa55c600fa80035` |

audit 第140–142行新增三个局部函数。`publishedByKind` 按本次真实 semanticMapping.projectable 筛选；legacy 没有 mapping 时保持原集合。`publishedText` 只对 semanticVersion=1 且非 source 的产物使用已声明 knowledge 限定，source-copy 和 legacy 原字不变。`publishedOptionalFact` 对非空白 trigger/limitation 使用同一规则，缺字段为原空串，空串及纯空白值原样保留；判断 trim 非空不等于把最终值 trim。没有调用 publisher 的投影／格式化函数计算审计预期。

第155–162行的 item、outline、theme、style、foreshadow、trope 和 goldenFinger 的正常 native 字段均接入上述真实选择与文本规则；金手指 ability 同样有完整限定，trigger/limitation 保持独立值。按未映射原资料过滤后仍对实际完整行集合／完整拼接比较，不能让未投影材料偷偷写成 native，也没有把原 material snapshot 改成加前缀的版本。角色、地点、世界和两线仍交给 native helper；九类 world setting 的消费字段预期由该 helper 独立构造，本调用端没有引入 producer formatter。新的462960…helper自身的增量代码审核归35审核者，本节不替代其结论。

observer 唯一新增白名单字段为可选 chapterDetection。实际接口为 `{mode:'auto'|'manual';diagnostic?:string}`，是章界识别方式及诊断纯数据，不带 grant／模型配置；缺字段不补默认。当前 importSemanticAudit 在版本1且字段存在时包含它，audit 对完整 semanticAudit 的既有精确比较会同时检查该字段；旧版本分支仍要求没有新增 semanticAudit。正常 source/receipt/frozen body/own novel/只读事务门和最终正文 Buffer 比较保持上文边界。这里没有执行真实 observer，也不对生产章界识别是否正确作验收声明。

只重复执行获准的专用 audit tsc 和 `--describe-schema`，均 exit0、无类型诊断，schema 仍为63项及相同 `cf231d…5d06` 指纹；没有运行 main 或其它 suite。

另外只把实际 AST 中的三个新增局部函数、原 check/byKind/sorted/equal 以及对应七个普通实体断言语句抽取到 `/tmp/shakeink-real-semantic-entry-text-increment.mts`，注入合成 session/mapping/rows；绑定共享纯 qualifier，手写独立字面前缀作为预期，没有导入 producer formatter。实际执行：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx /tmp/shakeink-real-semantic-entry-text-increment.mts
```

**exit0，54项预期全部符合**：strict、confirmed、source-copy、legacy 四组正常行；普通 text 的空／空白／含首尾空格值；optional fact 的缺失／空／纯空白／非空白值；每种普通 native 文本丢限定或错误增加限定均不能通过；strict/source 两组全类型未投影材料确实被过滤，将其文字混入实际 native 行会失败；非空 trigger/limitation 各自丢限定也失败。负例符合表示坏结果被断言识别，不是坏行通过。新证据独占 wx 创建为 [real-semantic-audit-entry-text-increment-independent.json](evidence/real-semantic-audit-entry-text-increment-independent.json)，未覆盖前29项证据；证据 SHA 为 `3bd4f8ce1f8323a6ae08f0355dc2d9da2401f3066768ede0e4ab8423a470e39c`，实际抽取片段 SHA 为 `142e48e9f4ceb8c5b91b8d2efb9f902a75e1e5798ac03b6d3fbc0c8e3680bd8f`。

结束前复核 audit／observer／helper SHA 与本节一致。本次仍只追加36及新 metadata evidence，没有改生产或脚本、读取用户 DB/journal、调用模型/CUA或执行真实审计。B生产实现及真实 RB-P01 的独立审核／验证边界继续保留。
