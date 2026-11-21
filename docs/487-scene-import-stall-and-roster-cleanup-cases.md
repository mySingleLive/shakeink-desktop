# 487 · 场景导入卡住与清单整理用例（修订4）

状态：已按 487 用例审核第一至三轮意见修订，待第四轮审核。486 方案第五轮审核通过；方案优先级 3R4 > 3R3 > 3R2 > 3R > 3.1/3.2。

通用约定：
- 单元用例只用合成地名（如“青石镇/青石”“鱼与菜市场/鱼和菜市场”“甲大学”），不用小说原文或原书地名；原书名称只在 E3 真实验证中核对。
- 模型返回一律经 `runImportAi`/`generateImportAiJson` 原服务门（同 `novel-import-scene-identity-actions.test.ts:22-34` 的桥）；控制器流程用 `tests/helpers/novel-import-wizard-fixture.ts` 的 `fixture`/`act`/`settle`。
- 无法经正常操作构造的状态用 `injectJournalEdit`（`fixture.ts:185`），并断言注入后的 journal 仍被 `validJournal` 接受。
- 标“RED”的用例在实现前运行并确认失败，记录失败断言。
- 凡用例需要已知上级关系（C5、C11、C12-3~5），一律在 roster 同批记录中用 `links:[{relation:'parent'}]` 构造；links 阶段只产生 identity 任务。

## A. 待确认场景不阻塞导入

- **A1（RED）**：roster 返回3条记录，其中一条经 links 返回的 `different-place` 与同组合并冲突成为 unresolved，另两条明确。清单点“导入 2 个场景”。
  断言：步骤进入 `detect-item` 或后续；unresolved 候选 `selected===false`；`w.tasks` 中无该候选的任务；无 `failed` 任务；`w.skipped` 为空；`f.requests` 中无以该候选为 target 的 entity 请求；`assertSceneOwnership` 不抛（推进到 verify 并 checks 全部 ok）。现代码停在 `import-scene` waiting。
- **A2（RED）**：同 A1，fixture 配置图像模型（`options.imageModel`/`generateImage` 返回合成 PNG），勾选外景图并给 `imageConsent`。断言 unresolved 候选无实体或图片任务；其余场景的图片任务全部 done；步骤前进。
- **A3（RED）**：先按 A1 推进到 verify，再用 `injectJournalEdit` 构造卡住状态：`w.step='import-scene'`，`stepState['import-scene']='waiting'`，其后各步 `stepState` 按 `resetLaterSteps` 规则复位为 pending，删除 `w.checks`，`phase='select'`，`resumePhase` 删除；unresolved 候选 `selected:true`，追加其 `waiting` 实体任务（ID 按 `planEntityTasks` 规则派生）。注入前断言：无 `failed` 任务、`w.skipped` 为空。
  断言：导入页底部出现“继续导入”而非“暂停”（组件渲染），点击时发出的 `act` 调用为 `resume` 且 `consent:true`（A3b 勾图片时另含 `imageConsent:true`）；进入下一步；两条已完成任务 `attempts` 不变；该候选未选、无任务；点击后新增请求中无以该候选为 target 的 entity 请求；无 `failed` 任务；`w.skipped` 为空。
  反例：同状态但另有一条 `failed` 任务时，底部仍为“跳过失败项并继续”，不出现“继续导入”。
- **A3b（RED）**：A1 中**不**勾选图片推进到 verify，然后按 A3 注入，并加：`w.images.exterior=true`；为全部场景实体任务（两条 done、一条 unresolved 的 waiting）追加图片任务，两条已完成场景的图片任务为 `done`（带合成 `image` 元数据并在 images 目录写入合成文件），unresolved 的为 `waiting`；删除 `imageGrants.scene`；fixture 的 `options.imageModel` 返回 undefined。点击 `resume`（不带 `imageConsent`）：不报“请重新允许生成图片”/“尚未配置图像模型”；步骤前进；unresolved 的图片任务被删除。
- **A3c（RED）**：所有已选场景均为 unresolved。清单按钮文字为“跳过导入场景”且未禁用；点击后 `stepState['import-scene']==='skipped'`；推进到 verify 且 checks 全部 ok；待确认列表含全部场景。第二组：fixture 先配置图像模型并勾选外景图，到清单步骤后 `setImageModel(undefined)`（fixture 增加该开关），再点“跳过导入场景”，同样不报错。
- **A3d（RED）**：遗漏补充流程。构造：场景已导入后，复核返回 `missingTargets` 指向一个新单元，该单元同时含一个已导入场景 X 的提及（使 defer 后仍有可核对的已导入身份）。遗漏 roster 返回两条新记录 N1、N2，同批 N1 对 N2 的 `links` 同时含 `same-place` 与 `different-place`（`regroup` 先按 same-place 合组 `:112`，组内 different-place 使该组 unresolved `:115`；不能依赖 links 阶段，因已有 different-place 的配对被跳过 `:216`）。X 与 N1/N2 不共享 context，不进入该组。断言：遗漏流程无任何错误（`stepError` 为空），流程到达 verify 且 checks 全部 ok；新候选未选、无任务，出现在待确认列表。
- **A3e（RED）**：A3 注入时显式写入 `w.selectionHash=wizardSelectionHash(含unresolved选中的session)`；`resume` 后 `w.selectionHash===wizardSelectionHash(session)` 且不等于注入值。
- **A3f**：部分 unresolved 且勾选外景图：`imageGrants.scene.hash` 等于 `importHash({kind:'scene',images:['exterior'],ids:<defer后仍选中的id>})`。
- **A4（RED）**：校验页视图 `sceneIdentitySummary.deferred` 列出 unresolved 场景名称；执行 `wizard-retry-kind`（scene）后、以及返回修改到 `detect-scene` 再导入后仍列出。构造 201 个 unresolved 身份时列表长度200，`deferredTotal===201`。
- **A5**：A1 后在 verify 前返回 `detect-scene`，对 unresolved 身份执行 `partition`（state `source-scoped`），勾选后导入：该场景导入成功。
- **A6**：无 unresolved 时，任务列表的 `{id,kind,candidateId,state}` 等于显式期望（每个已选候选一条 done 实体任务）；`w.skipped` 为空；无 `deferred`；步骤自动前进。第二组配置图像模型并勾选外景图：每个已选候选再有一条 `dependsOn` 指向其实体任务的 done 图片任务，步骤自动前进。
- **A7（UI，改写 CIUI01）**：`novel-import-scene-identity-ui.test.ts:31` 原断言“全部待确认时禁用”改为：全部待确认时按钮“跳过导入场景”可用；混合时按钮“导入 N 个场景”，提示文字为“M 项归属待确认，不会导入，将在校验页列出；可在详情确认后再导入”。

## B. 清单整理请求与校验

- **B1**：识别、links 之后发出 cleanup 请求，在上级修复请求之前（按 `f.requests` 顺序断言）。每个包 `catalog` 等于全部参与身份（有正文提及、非 unresolved），逐包相同；focus 并集等于参与集合且不重复；focus 单元为各自最早提及所在的完整工作单元。仅资料来源场景、unresolved 身份不在名录。参与集合为空时不发 cleanup 请求。
- **B2**：严格 schema 拒绝：缺项、重复 index、多键、target 越界/指向自身/不在名录、index 不在本包 focus、action 不在三种之内、`name` 非本项或目标的名称/别名、`merge`/`drop` 缺证据。每类第一轮非法、第二轮合法时恢复；两轮都非法时该包失败。
- **B3**：证据门拒绝：quote 不在本项 ownedRanges 内（取同单元内另一同名地点的提及）、在单元内不唯一、不含本项名称/别名。
- **B4**：阶段隔离：entity、links、roster 阶段返回 `sceneCleanup` 被拒；cleanup 阶段返回 `roster`/`sceneIdentityDecisions`/`artifacts` 被服务端与主进程 `ai()` 均拒。
- **分包手段（B5/B6/C4 共用）**：fixture 的 `models` 用小窗口模型（`contextWindow` 取 `importCharacterBudget` 最小可用值附近，按版本1预算），并让每个参与身份的最早提及位于不同章节、各章正文长度接近预算。每个用例先断言实际 cleanup 包数满足要求，再断言业务结果。
- **B5**：预算：窗口固定在可用值（不低于 `importCharacterBudget` 下限，`budget-policy.ts:18`），扩大名录规模使名录加一个 focus 超预算，步骤失败并含预算提示，`f.requests` 无 cleanup 请求。并发：≥64 个参与身份，先断言包数 ≥32；测试模型每次返回前等待一个共享闸门，记录同时在途 cleanup 请求峰值，等于31。
- **B6**：先断言包数 ≥2；一个包始终非法（重试耗尽），其余合法：账本 `ledgerHash`、候选、`w.sceneCleanup` 均与整理前逐值相等；步骤 failed。随后修正测试模型并“重新识别”：roster 请求数为0，重发 cleanup 请求。
- **B7**：提示内容：cleanup 提示含合并同地异写、不合并只共享词或上下级、排除非地点、名称取原文写法、资料不可信这五项要点（逐项 `includes`）；roster、links、entity、parent 阶段的提示与修改前快照字节相等（在实现前记录 sha256）。

## C. 整理结果的应用

- **C1**：“青石镇”“青石”与“鱼与菜市场”“鱼和菜市场”两对，模型返回 merge 带 `name`。断言每对成为一个身份；账本新增 `same-place` 关系，`basis==='model'`，证据为原文还原范围；候选名称等于选定写法，且为原文 literal。
- **C1b**：merge 不带 `name`：合并后名称为组内最早提及的 literal。同组两条 merge 选不同 `name`：取组内最早提及成员所在项的选择。
- **C2**：两个同名无限定身份（各一次提及）被 merge 后成为一个候选。
- **C3**：非地点条目被 drop：候选未选、`sceneExcluded===true`，清单显示“非具体地点”标签；排除证据记于 `w.sceneCleanup.excluded`；作者勾选后导入成功。
- **C4**：链与环（同包与跨包两种布局，结果相同，与包顺序无关）：
  - A→B（B为merge→C）、B→C（C为keep）：B→C 生效，A→B 忽略，A 保持独立。
  - A→B、B→A：均忽略。
  - A→B，B 为 drop：合并忽略，B 被排除，A 保持独立。
- **C5**：预检（每项断言：模型确实返回了该 merge；结果为未合并；步骤成功；unresolved 数不增加；可导入场景数不少于整理前减去生效合并数）：
  - 双方有 `different-place` 关系。
  - 作者先 partition 判为不同。
  - 合并后有两个不同外部上级。
  - 合并后上级指向自身。
  - A 上级为 B、B 上级为 C，A 合入 C 会形成新环。
- **C5b（受控防线）**：直接调用核心 `applySceneCleanup`，传入绕过预检的 merge 列表（测试入口参数），其中一条会使原非 unresolved 成员成为 unresolved：该条被回退，其余生效，无抛错；`SHAKEINK_IMPORT_DEBUG=1` 时 stderr 有一条回退计数日志，且日志不含任何地名或原文。
- **C11**：基线已有上级环（links 阶段只产生 identity 任务、不产生 parent 结果，见 `scene-identity.ts:219/:233`；故在 roster 同一批记录中用 `links:[{targetIndex,relation:'parent'}]` 让 A 以 B 为上级、B 以 A 为上级，形成 A↔B）：与环无关的合并生效；整理后上级修复请求发出并消除环；只有使环成员集合扩大的合并被回退。
- **C12** 跳过判定：
  子项1–2 的构造：首次整理把 P、Q 合并，且合并组与另一参与身份 R 共享 context 标签，首次 links 中 P–Q、P–R、Q–R 三条核对任务全部返回 unknown（P、Q 须在整理前保持独立，整理的 merge 才生效）；合并改变组的 memberKeys，使 P∪Q 与 R 的核对依据 hash 变化，重新识别时产生新的 identity 任务。两子项先断言该新 links 请求确实发出且含 P∪Q–R 任务。
  1. 返回修改到 `detect-scene` 再识别，新 links 任务全部返回 unknown：无 cleanup 请求；候选重新带上排除，`authorKept` 中的项保持选中。
  2. 同上，新 links 任务返回 `same-place`：发出 cleanup 请求。
  子项3–5 的基线：同 C11，在 roster 记录中用 parent links 形成 A↔B 上级环，使上级修复必定发出。
  3. 上级修复请求返回非法使修复失败（重试耗尽），点“重新识别”：无 cleanup 请求，有上级修复请求。
  4. 上级修复成功后，`f.controller` 的保存在 `:657` 对应 checkpoint 处注入一次失败（包装 `save`，计数到该次抛错），再“重新识别”：无 cleanup 请求。
  5. 上级修复成功且保存成功后再识别：无 cleanup 请求。
- **C12b（RED）**：fixture 先配置图像模型并勾选外景图，roster 请求失败使识别步骤 failed，再 `setImageModel(undefined)`；“跳过此步骤”（`{skip:true}`）不报错，import-scene 标 skipped。
- **C7**：重新整理（C12-2 场景）后新排除结果替换旧值。
- **C7b**：作者勾选排除项加入 `authorKept`；取消勾选移出；“全选”加入全部当前排除项；“全不选”清空。
- **C13**：重新整理后旧排除项改判 keep：当前未选且不在 `authorKept` 中则恢复选中；新排除项不在 `authorKept` 中则设为未选。
- **C8**：过期：fake 模型处理 cleanup 请求时，在返回前用导出的 `applySceneIdentityChange` 对 controller 内存会话的账本做一次 `label` 变更并替换 `session.wizard.sceneIdentity`（不经 `injectJournalEdit`，因其 `pauseAll` 会取消在途请求）。提交时结果被丢弃并重新整理一次（cleanup 请求数+1）；连续两轮都被改动则步骤失败，账本不含任何整理关系。
- **C9**：`w.sceneCleanup` 非法结构（多键、hash 格式错）被 `validateImportWizardState` 拒绝；视图中无 `sceneCleanup` 字段；返回修改到 `detect-scene`、`retryKind('scene')` 后保留；返回到 `tree` 后清除。
- **C10**：模型以仅资料来源场景或 unresolved 身份为 target 时被 schema 拒绝。
- **C14**：场景已导入后，复核返回 `missingTargets`，遗漏 roster 返回两条新记录 N1、N2，同批 `links` 互为 `different-place`；N1、N2 与已导入身份 X 三者共享同一 context 标签；遗漏流程的 links 把 N1–X、N2–X 都判为 `same-place`，使含 X 的组冲突成为 unresolved（X 成员集合扩大，按成员集合判定 X 由非 unresolved 变为 unresolved）。断言：抛“请返回识别场景，确认新增地点及归属后继续导入”，该候选仍选中，其导入结果仍在。

## D. 名称与区分

- **D1（RED）**：roster 记录带 context 标签（如“北岸”）时，新身份默认名称等于 literal，不含“·”；context 仍在账本，详情可见；原 `novel-import-scene-identity.test.ts:159`（CI06）label 操作可组合 context 保持。
- **D2**：账本中有一个身份已由作者 `label` 设为 context 组合 `nameParts`。随后 `appendSceneRosterBatch` 追加一条与它无关的新记录（触发 `regroup` 重建全部身份）：该身份 `nameParts` 与名称保持组合不变；新身份名称只含 literal。
- **D3**：`sceneHint`：两个同名不同身份各有 context，清单行与导入卡片显示各自限定语；同一身份多个 context 去重后以“、”连接；超过60字截断为60字；无 context 时不显示；保存的场景名称不含提示。

## E. 组合、台账与回归

- **E1** 定向组：`novel-import-scene-identity*.test.ts`、`novel-import-scene-hierarchy.test.ts`、`novel-import-scene-entity.test.ts`、`novel-import-scene-links.test.ts`、`novel-import-scene-performance.test.ts`、`novel-import-wizard-session.test.ts`、`novel-import-wizard*.test.ts`、`novel-import-request-schema.test.ts`、`novel-import-ai.test.ts`（含既有提示字节基线 `:481`）、`novel-import-scene-roster-retry.test.ts`、`tests/browser/novel-import-wizard.test.ts`，加新增测试文件。不跑全仓。
- **E2** 类型检查、`build:desktop`（Node 24）通过。
- **E3** `docs/requirements-traceability.json` 新增本需求条目，关联 486/487 与新增测试。
- **E4** 真实验证：第一部“小丑”全部章节，隔离目录，`LotmVerification.app`，只推断场景。记录：
  - 整理前后场景数、名录规模、合并数、排除数、整理应用耗时、模型调用数。
  - unresolved 数，以及可导入场景数是否少于整理前。
  - 清单中“廷根”同名、“廷根市/廷根”、“莴苣与肉类/莴苣和肉类”的处理结果。
  - 名称无“·”拼接；导入完成后自动进入下一步，进度 N/N；校验页待确认列表。
  - 保存并重开后场景数与已导入数一致。
  原文、Key 不进入仓库。
