# 场景识别修复：独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_review`。范围：两处产品修改、新增场景测试、既有向导提示测试的适配及真实验收脚本。未读取真实小说、模型配置、Key 或真实 journal；没有调用真实模型。

## 结论

**当前产品修改及修订后定向测试通过独立审核，未发现阻塞代码问题。** 可继续构建和已获授权范围内的真实验证；本记录不认证整书场景识别、落库或重开成功。真实执行的授权与当前阻塞由主代理另据实际工具结果记录。

## 独立执行结果

Node v24.18.0：

`node --import tsx --test tests/unit/novel-import-scene.test.ts tests/unit/novel-import-roster-ai.test.ts tests/unit/novel-import-wizard-prompt.test.ts tests/unit/novel-import-entity-target.test.ts`

最终 **29/29 通过**，0失败，约20.8秒。复看最新 SI-03/SI-04 修订后另运行场景文件，**6/6通过**，约2.4秒。`node --check scripts/run-lotm-wizard-import.mjs` 与 `git diff --check` 均通过。没有运行全仓测试。

已读取 `/private/tmp/scene-import-red.txt`：修改产品前6项中4通过、SI-01提示隔离与SI-02根级诊断两项失败；后者实际错误为“模型返回结构不完整（）”。该 RED 与本轮最小修改相符，未将既有正常场景路径误称为新缺陷。

## 产品核对

- `desktop/core/novel-import-ai-payload.ts` 仅 semantic/analyze/roster/scene 走独立场景名称清单提示；根对象、唯一 roster 字段、真实名称/别名、未知父级省略和无地点空清单明确，剔除了无关 native/artifact 输出合同。来源内容和自由指令仍为不可信资料。其它阶段没有修改，测试冻结其相关提示字节；固定提示预算门通过。
- `desktop/service/novel-import-ai.ts` 只转换上述场景清单阶段的 `StructuredGenerationError(kind=invalid_schema)` 消息，使用静态字段白名单及根级回退；取消、网络、授权、其它错误种类和其它阶段不进入该分支。服务 RPC 在 `desktop/service/rpc.ts:18` 仅传递 `error.message`，不会把原 invalidFields/feedback 发送到主进程。未知键、模型值和敏感合成哨兵未进入该最终消息。
- 没有放宽 schema，没有删除父级、字段或证据，没有增加生成轮数，也没有改动 controller 提交/恢复算法。现有生成两轮、目标身份、来源证据、原生类型、父级身份和循环门保持。

## 测试预审要求复核

- SI-02 根额外键、根数组、缺 roster、null/空 parent、错误 parentId及空名均覆盖首轮失败后恢复与持续两轮失败；合法无 parent 与空清单可解析；网络/授权一次、预取消零解析证明异常类别没有扩大。
- SI-03 最终为16层前向父级链，采用真实 controller 与 `runImportAi` 返回校验；journal证明前8份资料已提交后仍有后续请求，最终16个ID精确对应资料，text/facts/evidence保留、任务全部done、无skipped/dropped、原生可映射。
- 初审发现 SI-04 自引用/未知父级改变 artifact 而未同步可信 catalog，会先被身份冲突拒绝，未真正测试循环门。已改为未知父级在 catalog/artifact一致的独立负例与catalog两节点环，并断言精确“模型结果含无效实体引用”和“语义父级引用形成循环”；复审6项通过。本审核另以合成探针确认原负例先报身份冲突、修订负例分别到达预期门。
- SI-05 多批部分成功后失败的 coverage/stash 保留、失败批无coverage、正式重新识别仅补未覆盖单元、400个合成地点最终清单无损与错误清除均通过。它证明 controller同进程恢复，不能单独宣称真实应用重启恢复已执行。

## 真实验收脚本

`LOTM_SCENES_ONLY=1` 选择场景定向推断、保留全章选择与场景默认全选，经正式向导动作运行。进入 verify 时核对全文 roster 单元覆盖、候选/任务/资料ID精确集合、全部done、名字、原生映射与父级、正文hash及章卷边界、零页面错误。场景实体或识别失败保存私有现场并退出，不自动跳过、不无限重试。正式verify检查通过后才点击保存作品，completed后保存最终私有journal。

初审发现两处已修：WP-01 原正则只认 `roster:[` 而不认合法JSON的 `"roster":[`，已兼容两种明确清单表述且其它断言保留；scene实际使用受控停止确认但 launch 记录native，已将记录条件修为 `charactersOnly || scenesOnly`。

**证据口径仍需保持：** `scenes-completed.json` 是进入verify时的导入阶段结果，可能早于复核完成；不能替代发布后数据库验收。当前脚本在发布完成后关闭，未自行重开数据库逐项比较场景业务字段与层级。主代理须补充正常重开/落库对照的实际步骤和证据，再认证 SI-REAL。本轮代码审核不把这些尚未执行的真实检查计为通过。

## 补充审核：真实重开持久化验收脚本

同日审核新增 `scripts/verify-lotm-scenes-persistence.mjs`，并获主代理授权仅在该脚本范围直接修正证据问题。未运行该脚本、未读取真实数据、未调用模型。

逐项源码核对：

- `desktop/handlers/novels/[id]/scenes/route.ts` 的 GET返回 `{scenes}`，`src/lib/services/scene.ts:24` 查询该作品全部场景字段，不分页；脚本按完整名称/父级路径唯一匹配记录，而不误以为导入 artifact ID 等于数据库新建 ID。
- `desktop/service/novel-import-publish.ts` 的 scene写入将native description通过同一knowledge限定函数转换，coordinates及schema2四业务字段按原值保存；脚本使用相同已确认映射计算预期值并逐项比较，不修改数据库。
- `import-record` 的 GET返回record.materials中原导入ID，脚本与全部已选场景 artifact ID逐项相等并验证record.id对应当前会话。
- `outline` 的 GET返回按卷/章index升序树；`chapters/[chapterId]` GET返回正文与所属volume。脚本通过 `importVolumeGroups` 核对卷组数/卷名/卷序、每卷章数及章的具体volumeId/index，再比较每章标题/正文与全书正文hash。

直接修订：

1. 初稿用 `assert.equal` 比较真实 description、业务字段和章正文，失败时Node会把实际/预期全文写入错误日志。已改为静态消息的布尔相等断言，页面错误仅比较数量；原始内容留私有检查点与临时截图。
2. 路径从字符串前缀检查收紧为规范化路径与realpath父目录检查，防止 `/private/tmp/../...` 或现有父目录符号链接把测试指向外部目录。证据目录0700、JSON0600，目录与文件不覆盖已有内容。
3. 补全完成快照前置门：wizard/semantic版本、仅scene目标、指定单一原件、候选全部选中、候选/任务/资料ID精确集合、任务全部done、零dropped/skipped、全文roster覆盖及原生全部可映射。
4. 将成功 `acceptance.json` 写入延后到全部内容比较与正常退出确认之后，避免在退出失败时留下单独可误用的成功证据；shutdown单独记录。

`node --check scripts/verify-lotm-scenes-persistence.mjs`、`git diff --check` 通过。**补充脚本静态审核通过；真实重开、落库字段与正文比较仍未执行。** 脚本只调用上述本地只读GET路由，不发起生成请求；这里没有把源码审核替代真实Electron运行。

## R3之后：parent安全诊断细化复审

主代理报告真实R3停在上级地点结构错误，但尚无具体值类型证据。本审核未访问该真实现场。复核实际补充实现采用比原拟“响应形状观察”更小的方案：**不读取模型返回对象**，仅在既有场景roster最终 `invalid_schema` 分支，对已验证 `roster.<合法非负整数索引>.parent` 的完整诊断路径，将 `error.feedback` 中“该path + 冒号空格 + 三条已知Zod消息”的全字符串相等匹配映射为固定标签。

三条映射为null类型错误→“上级地点为空值”、最小长度错误→“上级地点为空字符串”、最大300字符错误→“上级地点名称过长”。其它类型/路径/消息保持原静态字段或响应结构回退；原feedback、未知字段和值均不插入最终消息。invalidFields和feedback来自 `parseJsonOutput` 同次最后schema失败，未新增跨解析/跨调用状态、计数或重试，也没有规范化null/空白值。

独立使用真实 `generateImportAiJson → generateJSON`、仅注入合成generateText的6类探针：null、空串、空白字符串、301字符名称、数字、含敏感哨兵的对象，全部严格拒绝且各恰好2轮。前三种与过长原因映射精确符合上表，数字/对象回退“上级地点”，最终消息无敏感哨兵。另运行场景测试 **6/6通过**。未运行真实模型或读取真实数据。

**诊断细化实现通过独立审核。** 建议将上述原因精确断言加入SI-02长期回归；现有SI-02主要保护最终消息净化，不能单独证明新原因映射准确。后续取得真实类型证据再审核任何可选parent兼容，不能把本次安全诊断审核当作已允许规范化或整书成功。

## R4后：scene roster可选parent:null兼容代码复审

已先独审250/251中R4修订及SI-06，再复核主代理提供的RED/GREEN记录和实际改动。本审核未读取R4私有现场或真实小说。

**本次有界兼容实现通过独立代码审核。** 产品增量只在 `rosterEntrySchemas.scene`：parent改为原 `rosterName` 的nullable/optional输入；对象仍strict，成功解析后仅 `entry.parent === null` 时解构移除该键。其它值不进入该转换，合法parent继续原trim且保留；name、aliases、evidence及其它字段原样沿用既有schema。相同schema供生成桥和最终解析复用，canonical输出不含null或自有undefined parent，不新增纠错轮次。

读取 `/private/tmp/scene-null-parent-red.txt`：新增SI-06修改前明确因 `roster.0.parent` 的Zod `expected string, received null` 失败，其余6项通过。读取主代理74项GREEN汇总为74通过。独立再次执行本审核原4文件定向命令（新增SI-06后共30项），**30/30通过**，0失败，约20.2秒；`git diff --check`通过。

SI-06覆盖真实schema解析、真实生成桥一轮成功、`runImportAi`定位且完整保留来源证据，`Object.hasOwn`确认null parent真正省略、原输入对象仍为null且未被原地修改。空串、数字、对象、数组、false、过长parent，null name/aliases及未知键仍拒绝；world roster未获得兼容，普通scene阶段不接受roster结构。已有有效父级与另一同名null关系条目合并时父级保留，并保留新增别名。既有SI-03/04前向层级、错类型/未知父级、循环和非法证据门同时通过。

本次批准仅限scene清单可选parent的JSON null表示兼容；不批准其它非法值清洗、不修改历史R3/R4失败结论。R5新会话整书识别/全部场景导入、发布与重开结果须由后续实际运行另证。

## R5后SI-07：场景有界调度与合批保存代码审核

已按250/251新增SI-07预审要求，独立审核 `desktop/main/novel-import.ts` 和 `desktop/service/novel-import-ai.ts` 调度增量及相关合成测试；未读取R5真实数据。

**调度及保存边界实现通过独立代码审核。** `WIZARD_SCENE_CONCURRENCY` 从既有runtime proof容量减一派生为31；main仅将current/epoch检查、慢写合批等待及写失败停止门扩展至scene，角色按ID替换分支仍仅character，scene仍走原 `mergeImportArtifacts`。item/world4、图片2的代码配置未改，未声称新增实际item/world全链路并发测试。

service新增严格scene entity谓词用于 `runInsideLongTask` 调度上下文，独立于 `lightImportGeneration`；后者及 `importGenerationModel` 模型策略保持。scene模型resolved对象及thinking/providerOptions不变。全局共享聊天槽配置未修改，主controller的31路池是此上下文实际并发上界，不把该标记表述为新全局信号量。

独立运行：

`node --import tsx --test tests/unit/novel-import-scene-scheduling.test.ts tests/unit/novel-import-character-commit.test.ts tests/unit/novel-import-character-performance.test.ts`

最终 **13/13通过**，约10.1秒。角色原4项性能/取消/模型策略/lane测试及新增场景lane、64项峰值31和精确31暂停恢复均通过；角色与场景各3项真实慢写barrier用例共6项同时通过，验证合批保存、pause等待IO/丢弃未提交缓冲结果、已保存项恢复不重生成、写失败停止新增请求与排空。

初审指出SI-07b只记录峰值不足以证明完整runtime记录与31项取消。新增SI-07c实际挂起31个场景请求，核对runtime.json中31个pending operationId与挂起集合相等，再pause核对proof恰好31条scene调用、取消集合相等、remaining全0并resume完成64项。第一次独立运行该新增例失败，原因是AI promise已创建但runtime.json串行写尚未完成；已改有界poll实际runtime记录后再断言，不用固定延时或扩大期望范围。修正后13项全部通过，未改产品解决测试竞态。

相关RED记录显示旧scene4路与聊天槽等待、旧保存门均不能满足新增测试；GREEN只证明合成调度/持久化边界，不认证供应商31并发承载能力或真实全批成功。没有增加本次用户未提出的时间阈值。

## SI-08：场景entity专用提示与静态错误复审

按250/251新增SI-08预审后复核产品增量与新增 `novel-import-scene-entity.test.ts`，**实现通过独立代码审核**。限定semantic/analyze/entity/scene早期分支输出专用提示，绑定唯一目标id/name/kind、inferred及PLACE；parentId复制可信目标目录已有ID，无父级时省略。facts仅列当前 `importFactFields('scene')` 的v1接受字段，内外观/背景/进入方式等有据内容完整放入text，没有暗中开启scene v2字段，也没有添加角色roleType或其它类别原生合同。

直接引文/sourceUnitIds规则、单位和目录材料、模型策略、最终schema与两轮生成上限均未改动。知识归属、非客观可靠性、attribution及temporalScope仍明确。服务catch仅在该场景entity阶段的 `invalid_schema` 中，把两条完整已知反馈分别识别为“单场景目标”或“场景身份与上级关系”，其它结构问题固定回退“场景字段格式”；不会回显模型值、未知键或原feedback。已有anchor错误分类在该分支之前处理，网络/授权/取消也不被改写。

读取 `/private/tmp/scene-entity-red.txt`：修改前3项中1通过、专用提示与静态诊断2项失败，旧错误实际为“模型返回结构不完整（artifacts）”。该记录只能证明旧提示与诊断未满足新合同，不能证明R5真实响应包含某个具体值。

独立执行场景entity、场景、roster-ai、wizard-prompt四文件定向测试，**27/27通过**。SI-08a/b/c/d包括不含无关合同的提示、缺目标/多项/错ID/缺错父级第二轮恢复、全部text/facts/evidence/sourceUnitIds保留、永久错误恰好两轮并精确检查固定分类、含未知键/敏感值哨兵的字段格式回退、无父级目标一轮成功、网络/授权一次与进行中取消原AbortError、纯anchor no-match仍两轮原分类。`git diff --check`通过。仅移除本次有意替换的scene entity旧提示hash，普通scene及其它roster基线仍冻结。

非阻塞建议：专用提示的“quote选择10–30个字符”可未来改为“优先10–30，短单元可用更短真实连续片段”，以延续既有引文指导。当前服务schema对合法较短连续引文的接受集合未变，新SI-08正例实际含短引文并通过；主代理选择保留已冻结真实运行构建，本审核不因此阻塞。若后续真实错误表明该指导造成问题，再补有据修订；不能将这一建议描述为本次改变了证据校验。

R6真实运行中的部分完成数量没有在本审核计为通过。全部场景、正式发布、正常重开、完整字段/层级/卷章正文对照仍须由最终真实证据另证。

## SI-09：场景机械引文协议与schema2早期校验代码审核

先独审250/251中明确的SI-09扩展方案与用例，再复核主/服务/payload实际增量及新增 `novel-import-scene-wire.test.ts`。**SI-09实现通过独立代码审核，未发现阻塞问题。** 未读取R6/R7真实小说、响应、配置或journal。

- 新 `indexedEntityRequest` 仅覆盖semantic/analyze/entity的character或scene，用于已核验引文选项、来源索引派生及schema2验证；与 `lightImportGeneration` 分离，scene模型thinking及resolved对象不变。main单位筛选、材料、目录、目标/parent、并发池与scene合并算法未改。
- main对scene从当前units调用既有连续片段提取器生成选项，服务生成前仍验证每个选项位于对应unit原文；payload为选项提供显式0-based optionIndex。仅严格索引对象才转换成当前请求对应引文，混合键、坏quote和非法索引不会被挑选索引部分“修好”。直接引文仍走同一严格定位器。
- sourceUnitIds仅按已有角色协议进行机械归一：合法已声明单位与核验引文单位做集合，不属于当前units的字符串声明过滤；evidence本身不因此过滤或替换。scene entity的原生资料在生成schema及最终服务门均按schema2验证四个既有文本字段，未知native字段/非法类型继续拒绝，单目标、PLACE及可信parent身份门仍保持。
- controller新增scene三条完整静态结构消息及四类固定anchor消息的有界字段纠错，第二请求位于同一catch之外，不形成重试循环。网络、授权、取消、预算及持久化错误未进入新增白名单。其它类别没有获得scene错误重试、索引/字段协议或新模型策略。
- 场景专用提示同步显示四字段和机械协议，完整text/事实保留，quote指导已改为优先10–30字符、短单元可以更短真实连续片段；前次非阻塞建议在本轮有意合同修订中落实。未知可选资料仍省略，不本地虚构值或修改有效父级。

读取 `/private/tmp/scene-wire-red.txt`：新增3项修改前全失败，包含旧schema不接受编号/缺省source索引及controller没有scene选项；未据此猜测R6真实坏字段。初次本审核26项独立通过后，要求补齐scene anchor外层恢复及独立未扩散反例，主代理已落实。

最终独立执行：

`node --import tsx --test tests/unit/novel-import-scene-wire.test.ts tests/unit/novel-import-scene-entity.test.ts tests/unit/novel-import-character-source-index.test.ts tests/unit/novel-import-character-profile-ai.test.ts tests/unit/novel-import-evidence-rebind.test.ts`

**28/28通过**，0失败，约18.6秒；`git diff --check`通过。

SI-09六项测试中，结构字段和anchor各覆盖每目标恰好2请求/3生成恢复、2请求/4生成持续失败；持续失败任务无伪成功artifact，成功保留全部四字段、text与有效父级。外部evidence.unitId、坏quote、无选项却用索引、混合键、未知native仍拒绝；显式序列化选项索引与规范sourceUnitIds正确。普通scene使用合法直接引文和来源索引但带四字段的独立负例仍拒绝，不会被索引先行拒绝掩盖字段门。原角色CP-09/10/11及RB定位拒绝语义同时通过。

旧character-source-index测试中两条“scene entity不得支持协议”的断言按已批准新增范围分别改为普通scene和item负控，保留原不支持类别的实际反例，未删除越界/混合/伪造/未知单元测试。SI-09c的权限/网络/预算/取消/持久化错误来自AI边界合成注入，只证明每目标一次的错误分类边界；实际磁盘保存失败停止仍由SI-07真实保存barrier证明。

本记录只认证明确合同与定向合成验证。R7中的部分完成/四字段非空计数不算整书成功；最终需全部候选任务资料ID、父级、发布与重开逐项实际验收。
