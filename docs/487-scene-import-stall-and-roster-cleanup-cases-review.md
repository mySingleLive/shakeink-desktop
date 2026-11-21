# 487 用例独立审核

审核对象：`docs/487-scene-import-stall-and-roster-cleanup-cases.md`（下称“487”）。对照 486 方案（3R4 > 3R3 > 3R2 > 3R > 3.1/3.2）、五轮审核、当前分支源码和现有测试夹具。未运行测试。行号指当前文件。

## 一、RED 判定核对（当前代码）

- A1（487:7）在当前代码上会失败，可作 RED。`confirmRoster` 不区分 unresolved（`main/novel-import.ts:1148-1152`），`next()` 不领取（`:751`），最终停在 waiting（`:779`）。夹具可构造：roster 记录同时给出 same-place 和 different-place 链接即可得到 unresolved（`scene-identity.test.ts:154-157` 的做法）。
- A3（487:9）可作 RED：当前没有“继续导入”按钮（`NovelImportWizard.tsx:47`），`resume` 重新进入 `runEntities` 后仍会 waiting。修复后 A1 的流程不会再卡住，所以 A3 的状态只能注入构造，见第二节第 2 条。
- 以下用例在当前代码上同样会失败，但 487 没有标 RED，应补标，并在实现前确认它们确实是红的：
  - A2：勾选图片时同样卡住。
  - A3b：`wizardResume` 的图片检查（`:1033-1036`）会返回“请重新允许生成图片”。
  - A3c：`confirmRoster` 第一行就检查图片（`:1146`）；不勾图片时 selected>0，也会卡住。
  - A3d：遗漏流程在 `:923` 抛错。
  - A4：`sceneIdentitySummary` 现在没有 `deferred`。
  - C12b：`:1146` 先于 skip 判断。
  - D1：`defaultParts` 有 context 时返回“限定·地名”（`core/novel-import-scene-identity.ts:97-98`）。
- 现有 `CIUI01`（`novel-import-scene-identity-ui.test.ts:31-32`）断言全部待确认时按钮 `disabled===true`，混合时文案为“1 项仍需在详情确认，未跳过”。这两项与 3R2 第3项、3.1 的新提示相反。487 没有写明 CIUI01 要改写，也没有新提示文案的用例。

## 二、需修改的用例

1. **C6（487:36）与 3R 冲突。** 按 3R 规则1，目标必须是 keep；目标被判 drop 时，合并忽略（C4 第三条已这样写）。所以“被引用为合并目标的 drop 项”不会被任何通过的合并引用，drop 照常生效。C6 写的是 3.2 已被覆盖的规则，应删除，或改为“目标 drop：合并忽略，drop 生效，源项保持独立”（与 C4 合并）。
2. **A3/A3b 的构造方式没有写明（487:9-10）。** 修复后，正常操作无法再产生“已选 unresolved 加 waiting 任务”的状态。应写明：先用已明确的场景走到 `import-scene`，再用 `injectJournalEdit`（`tests/helpers/novel-import-wizard-fixture.ts:185`）把一个 unresolved 候选改为 `selected:true`，加上由候选 ID 派生的 waiting 实体任务（A3b 再加依赖它的 waiting 图片任务，并删除 `imageGrants.scene`），然后断言 `validJournal` 接受。A3b 还要求：其它图片任务全部为 done 或 skipped，且 `options.imageModel` 未设置，否则图片检查会因为别的原因合法地触发，用例就测不到这条规则。A3 补一条反向断言：有失败项时不显示“继续导入”（3R 写的条件是“无失败项”）。按钮发送的动作及参数也要写明（`resume`、`consent:true`）。
3. **A1/A3 缺少领取竞态断言（第一轮第4条）。** 增加断言：没有任何 failed 任务；`f.requests` 中没有以 unresolved 候选为目标的 entity 请求（`entityTarget`，夹具 :107）；`w.skipped` 没有新增记录，也没有伪造的 skipped 任务（3R 已取消 3.1 的人造任务）。A3 的“已完成任务不重跑”改为：已完成候选的 entity 请求数保持不变。
4. **A3e（487:14）可能空过。** `confirmRoster` 本来就在最后重算 `selectionHash`（`:1154`），走这条路径时断言必然成立。应限定在 A3 的 `resume → runEntities` 路径，在那里断言 `w.selectionHash===wizardSelectionHash(s)`。
5. **A6（487:17）没有可比的基线。** 当前代码不能和修复后的代码在同一个测试里比较。应改成显式期望：每个已选候选各有一个实体任务；已勾选图片时，每个已选候选各有对应图片任务；没有任务被删除或跳过；`w.skipped` 为空；`deferred` 为空；步骤自动前进。
6. **A2（487:8）防空过。** 必须配置图像模型（参照 `novel-import-wizard-session.test.ts:351` 的 `withImages`，该 helper 不在共享夹具中，需要复制），并断言已明确场景的图片任务确实生成，状态为 done。
7. **B1（487:21）补充以下几点。**
   - 请求顺序：links 请求之后、`sceneParentTargets` 请求之前。
   - 多包时每个包的 `catalog` 都是完整名录，且各包相同。各包 focus 互不相交，并集等于全部参与身份。
   - 同一身份既有正文提及又有资料成员时，参与整理，focus 单元取正文单元。
   - 参与身份为 0 时不发请求，步骤正常完成。
8. **B5（487:25）并发防空过。** 必须构造至少 32 个包（用小 `contextWindow` 的模型，`fixture(...,{models})`），fake 用延迟加 running 计数，断言最大并发等于 31，而不只是不超过 31。
9. **B6（487:26）防空过。** 至少要有 2 个包，其中一个成功，另一个连续失败 `SCENE_UNIT_ATTEMPTS` 次。只有这样，“不应用任何结果”才有意义。同时断言失败包的请求次数、步骤为 failed 且有 `stepError`。“重新识别”时 roster 请求数和 links 请求数都为 0。
10. **C1（487:30）缺少命名规则用例。**
    - merge 不给 `name` 时，名称为最早成员的原文写法。
    - 同一组内多个 `name` 冲突时，取组内最早提及的那个选择（3.2 规定，第一轮第16条要求确定性用例）。
11. **C4（487:33）文字有误，缺少跨包情形。** 链式情形的正确期望是：B→C 生效（C 为 keep），A→B 忽略（B 不是 keep），A 保持独立。还要补“跨包”（§4 列出的“跨包目标”）：A 与 B 在不同包，target 指向另一包的 keep 项，结果与包顺序无关。可以交换包顺序各跑一次。
12. **C5/C5b（487:34-35）。**
    - C5 每个子项都要断言：模型确实返回了 merge（请求和响应中可见），结果未合并，步骤成功，unresolved 成员集合没有增加，可导入候选数没有下降（第一轮第8条）。
    - C5b 在公开路径上可能无法构造。第二、三轮审核确认，预检已覆盖 regroup 产生 unresolved 的全部路径，所以“预检通过、应用后才变 unresolved”的合并通过合成正文造不出来。应写出一个具体可构造的数据，或明确改为对核心函数的受控注入（例如在纯函数测试里绕过预检，只验证回退），并注明这是防线测试。同时断言调试日志里有回退计数、没有名称（3R2 第5项）。
13. **C8（487:39）只测可达分支。** 过期构造需要写明：在 fake 处理第一次 cleanup 请求时，通过受控方式改变会话账本（例如走一次合法的账本写入，使 `ledgerHash`/`identityRevision` 变化）；第二次仍改变时，步骤失败。“hash 相同但重算名录或 focus 不同”在确定性重算下不可达，不应当作通过项写入，可标为代码审查项。
14. **C12（487:43-48）防空过，并写明注入方式。**
    - 子项1：断言重新识别时 links 确实发出了新请求（合并后 `basisHash` 改变），fake 返回 unknown，cleanup 请求数为 0。否则测不到第五轮 (a) 的情形。
    - 子项3：fake 的 `sceneParents` 前 `SCENE_UNIT_ATTEMPTS` 次失败，重试时成功。断言 cleanup 请求数为 0，`sceneParentTargets` 请求数大于 0。
    - 子项5：参照 `scene-identity-actions.test.ts:47` 包装 `c.save`，让 `:657` 的 checkpoint 失败一次。
    - 子项2、4：前提需要基线上级环（复用 C11 的构造）。
15. **C7（487:37）与 C12 重复。** C7 括号里的“即使之后上级修复改了账本”是 `cleanedHash` 的规则（3R4 第1项），不是 `inputHash` 的规则。建议 C7 只保留“相同则跳过、不同则替换 `excluded`、保留 `authorKept`”，跳过判定统一放在 C12。C7b 增加断言：对非排除项勾选或取消勾选，`authorKept` 不变。
16. **D1（487:55）防空过。** 必须使用带 context 标签的记录，否则当前代码的默认名也是纯 literal，用例在当前代码上不会失败。D2 写明构造方式：用 `label` 操作得到 `[context,literal]`，再追加一批无关记录，断言 `nameParts` 和 `ledgerHash` 不变。
17. **D3（487:57）补边界。** 补以下用例：限定语去重后用“、”连接；超过 60 字时的截断；没有 context 的身份不带 `sceneHint`；`sceneHint` 不进入 `name`，也不进入保存后的作品名称。
18. **UI 用例。** 补一条清单页新提示文案“N 项归属待确认，不会导入，将在校验页列出；可在详情确认后再导入”，并改写 CIUI01 的两项旧断言（见第一节）。A3、C3、D3、A4 中的界面部分应写明用 `scene-identity-ui.test.ts` 的渲染夹具实现，断言按钮或文字，以及点击后的 `calls`。
19. **A3d / C14（487:13、51）的构造需要写明。**
    - A3d：参照 `novel-import-scene-identity-session.test.ts:69` 的遗漏流程，在遗漏补充中返回冲突链接，得到新的 unresolved。
    - C14：对已导入且原本没有上级的身份，在遗漏后的 links 中给出两个不同上级的 parent 结论，使其成员不变、状态变为 unresolved（第三轮第4条）。
    - C14 是回归保护，不是 RED。断言抛出的信息，并断言该候选仍为选中、artifact 仍在。
20. **A5（487:16）路径不清楚。** `changeSceneIdentity` 在已有场景任务时拒绝修改（`:352`）。应写明具体路径，例如：导入完成后“返回修改到 `detect-scene`”，用 partition 确认该身份，再导入；断言该身份已从 `deferred` 中移除，并生成了 artifact。
21. **B 节漏项。**
    - 其它阶段的提示字节不变：现有基线测试 `novel-import-ai.test.ts:481` 要纳入 E1。
    - `sceneIdentityCleanupPrompt` 要包含规定的要点：合并简称、全称和异写；不合并只共享词的地点；不合并上下级；排除非地点；资料为不可信内容。
    - B2 补 schema 拒绝项：index 属于名录但不在本包 focus 中，`action` 取非法值。
22. **合成数据。** C1 和 E 节以外的单元用例使用“廷根”“莴苣与肉类”等小说原名，与 487:3 的“不使用小说原文”不一致。应改用合成名称（如“甲城市/甲城”“莲与藕/莲和藕”），只在 E3 的真实验证中检查原名。
23. **E 节补全。**
    - E1 加入 `novel-import-ai.test.ts`、`novel-import-request-schema.test.ts`、`novel-import-scene-identity-service.test.ts`、`novel-import-scene-identity-closure.test.ts`、`novel-import-scene-roster-retry.test.ts`、`novel-import-scene-hierarchy.test.ts`，以及第一轮 C 节要求的 `tests/browser/novel-import-wizard.test.ts`。
    - 补一项：`docs/requirements-traceability.json` 新增本需求条目（3R 验证补充）。
    - E3 补记以下数据：名录规模和整理应用耗时（3R2 第10项、3R3 第6项），unresolved 数，整理调用次数，整理后可导入数是否下降（第一轮 D 节）。

## 三、覆盖完整、可直接实现的用例

A4、A3f、B2（除第21条外）、B3、B4、C2、C3、C9、C10、C11、C13 与方案规则一一对应。用现有夹具、`runImportAi`/`generateImportAiJson` 原服务门（`scene-identity-actions.test.ts:27-33` 的做法）和纯函数 API（`scene-identity.test.ts` 的做法）都能构造。断言不会空过。

结论：需修改

1. 删除或改写 C6，使其与 3R 规则1一致（目标 drop 时合并忽略，drop 生效）。
2. 写明 A3/A3b 的注入构造方式、图片前提和反向条件；A3b、A3c、A2、A3d、A4、C12b、D1 补标 RED；改写 CIUI01，并补清单页新提示的 UI 用例。
3. A1/A3 增加“无 failed、无 unresolved 的 entity 请求、无伪造 skipped”的断言；A3e 限定在 resume 路径。
4. A6、A2、B5、B6、C5、C12 子项1、D1 按第二节补充前提和断言，防止空过。
5. C5b 给出可构造的数据或改为受控防线测试；C8 删除不可达分支，并写明过期注入方式；C12 写明保存失败和修复失败的注入方式。
6. 补命名规则用例（无 name、多个 name 冲突）、跨包链和跨包目标、B1 的顺序、完整名录、0 参与者，以及 D3 的边界。
7. 补 cleanup 提示内容用例，纳入其它阶段提示字节基线；B2 补 focus 外 index 和非法 action。
8. A5、A3d、C14 写明具体构造路径；单元用例改用合成地名。
9. E1 补全受影响的测试组；补 traceability 条目；E3 补记名录规模、耗时、unresolved 数、调用次数，以及可导入数是否下降。

## 第二轮审核

对象：487 修订2。对照第一轮 9 项、486（3R4 > 3R3 > 3R2 > 3R）、`tests/helpers/novel-import-wizard-fixture.ts` 与 `desktop/main/novel-import.ts` 当前源码。未运行测试。

逐项核对：

- 第1项：已解决。C6 已删，C4 第三条“目标 drop：合并忽略，B 排除，A 独立”与 3R 规则1一致。
- 第2项：部分解决。A3/A3b 写了注入方式，RED 已补标（C12b 除外），A7 已改写 CIUI01 并补新提示。仍有以下问题：
  - A3b 会因为别的原因失败。`runEntities` 开头的 `planEntityTasks`（`novel-import.ts:968`）会给每个 scene 实体任务补 `i-…-exterior` 图片任务。注入 `images.exterior=true` 后，两个已完成的明确场景会新增 waiting 图片任务，`generateWizardImage` 随即抛“尚未配置图像模型”（`:1119`）。注入时必须同时为这两个场景加上 `done` 或 `skipped` 的图片任务（第一轮已要求，修订稿漏写）。
  - A3c 第二组和 C12b 的前提“勾选外景图且未配置图像模型”不能通过正常操作得到：`wizard-set-images` 在无模型时直接抛错（`:438`）。应写明构造方式：先配置 `imageModel` 并勾选，再把 `options.imageModel` 改为返回 undefined；或者用 `injectJournalEdit` 设置 `w.images`。
  - A3 的“先按 A1 推进到 import-scene 完成两个明确场景”：修复后该步骤会自动前进（只选场景时会一直走到 verify）。注入时要写明把 `w.step` 设回 `import-scene`，并重置后续步骤的 `stepState` 和 `checks`；或者在两个场景完成前让 fake 阻塞，再执行 `pauseAll`。否则这个状态无法稳定构造。
  - A3 的界面部分没有写按钮点击后的 `calls`（`resume`、`consent`），第一轮第2条和第18条都要求写明。
- 第3项：部分解决。A1 已补齐。A3 只断言“该候选未选、无任务、attempts 不变”，缺少“无 failed 任务、`f.requests` 中无以该候选为目标的 entity 请求、`w.skipped` 为空”。
- 第4项：A3e 已限定在 resume 路径，但“不等于注入前的值”会失败。注入的 journal 沿用修复后 `confirmRoster` 写入的 `selectionHash`，而这个值本来就不含 unresolved 候选，defer 后重算会得到相同的值。注入时必须显式写 `w.selectionHash=wizardSelectionHash(注入后的 session)`。
- 第5项：部分解决。A2、B6、C12 子项1、D1 已解决。
  - B5、B6、C4 跨包都要求多个包，但只写了目标（包数 ≥32、≥2 包、跨包布局），没有写手段。夹具默认 `contextWindow:1048576`（`fixture.ts:23`），64 个短身份很可能只分出一个包。需写明用 `fixture(…,{models})` 传入小 `contextWindow` 的模型，并先断言 cleanup 请求的包数（B5 ≥32，C4 两种布局下各自的包划分），否则断言可能空过。
  - A6 缺少勾选图片时的图片任务期望和“步骤自动前进”。
  - C5 缺少“步骤成功、unresolved 集合未增加、可导入数未下降”。
  - C5b 缺少“调试日志有回退计数且不含名称”（3R2 第5项）。
  - D2 空过：`buildSceneWizardCandidates` 不改账本，`ledgerHash` 必然不变。应先做一次会重建身份的账本操作（例如 `appendSceneRosterBatch` 追加无关记录），再断言该身份的 `nameParts` 仍为 context 组合，候选名称不变。用 `label` 操作构造原组合（第一轮第16条），不要手工注入，因为 `ledgerHash` 校验函数没有导出（`novel-import-scene-identity.ts:89`）。
- 第6项：基本解决。C1b、C4 链式期望、B1 顺序、完整名录和参与集合为空均已补。D3 仍缺“限定语去重后用‘、’连接”。B1 没有明说“同一身份既有正文提及又有资料成员”的情形。
- 第7项：已解决（B2 新增两类拒绝；B7 覆盖提示要点和字节基线）。
- 第8项：部分解决。已改用合成地名，A5 也写了路径。
  - C8 无法构造：`injectJournalEdit` 第一步执行 `pauseAll`（`fixture.ts:186`），会暂停并取消在途请求（`:1940`），cleanup 结果根本不会提交。应改为在 fake 处理 cleanup 请求时，直接在内存中修改会话账本：`c.session.wizard.sceneIdentity=applySceneIdentityChange(…)`，该函数已导出，结果合法且 hash 已更新。
  - A3d 只断言“不抛‘请返回识别场景’”太弱。defer 后 `additions` 为空，流程会走到 `:924`。如果遗漏单元里没有已导入身份，代码会抛“遗漏场景没有可核对的有据身份”。3R2 第9项要求“不再抛错”，所以应断言整个流程无错误，步骤到达 verify，并写明遗漏单元中是否含已导入身份。
  - C14 改用注入账本关系。这样做要手工满足 `ledgerHash` 和 mixed 结构校验（`:151`），无法直接实现。应写出可构造的路径（第一轮第19条的建议：在遗漏流程的 links 中返回冲突结论），并补断言 artifact 仍在。
  - C12 子项3–5 依赖上级修复会发生，前提需要基线上级环（复用 C11 的构造），修订稿没有写。
- 第9项：部分解决。E3（traceability）和 E4 记录项已补。E1 仍缺 `tests/unit/novel-import-ai.test.ts`（B7 的字节基线就在 `:481`）、`novel-import-scene-roster-retry.test.ts` 和 `tests/browser/novel-import-wizard.test.ts`。`novel-import-wizard*.test.ts` 只匹配 `tests/unit` 下的文件。

结论：需修改

1. A3b 注入时为已完成的明确场景补上 done/skipped 图片任务。A3c 第二组和 C12b 写明“已勾图片、无图像模型”的构造方式。C12b 补标 RED。
2. A3 写明注入时把 `w.step` 设回 `import-scene` 并重置后续状态（或改用暂停构造）。补“无 failed、无该候选 entity 请求、`w.skipped` 为空”和界面点击后的 `calls`。
3. A3e 注入时显式写入含 unresolved 的 `selectionHash`。
4. B5、B6、C4 跨包写明用小 `contextWindow` 模型分包，并先断言包数或包划分。
5. A6 补图片任务和自动前进。C5 补步骤成功、unresolved 未增加、可导入数未降。C5b 补日志断言。D2 改为经账本重建操作后断言 `nameParts` 保持。D3 补“、”连接去重。
6. C8 改为在 fake 中直接修改内存中的账本，不用 `injectJournalEdit`。
7. A3d 断言流程无任何错误并到达 verify。C14 改用可构造的路径，并断言 artifact 仍在。C12 子项3–5 写明基线上级环。
8. E1 补入 `novel-import-ai.test.ts`、`novel-import-scene-roster-retry.test.ts` 和 `tests/browser/novel-import-wizard.test.ts`。

## 第三轮审核

对象：487 修订3。对照第二轮 8 项结论、486（3R4 > 3R3 > 3R2 > 3R）、`tests/helpers/novel-import-wizard-fixture.ts`、`desktop/main/novel-import.ts` 与 `desktop/core/novel-import-scene-identity.ts` 当前源码。未运行测试。

逐项核对：

- 第1项：已解决。A3b 补了 done 图片任务、`image` 元数据和合成文件，RED 成立（现 `wizardResume` 在 `:1034` 等待“请重新允许生成图片”）。A3c 第二组与 C12b 用 `setImageModel(undefined)` 构造，并写明需在夹具中新增该开关，可以接受。C12b 已标 RED（现 `confirmRoster` 在 `:1146` 的跳过检查之前就抛“尚未配置图像模型”）。
- 第2项：部分解决。注入时的步骤复位、`checks`、`phase`、`resumePhase` 都已写明，也补了“无 failed、无该候选 entity 请求、`w.skipped` 为空”。点击按钮后的 `calls` 仍未写：没有断言“继续导入”按钮发出的 `act` 调用及其参数（`resume`，`consent`；勾选图片时还有 `imageConsent`）。第一轮第2、18条和第二轮都要求了这一点。
- 第3项：已解决。
- 第4项：已解决。A3e 显式写入了含 unresolved 选中项的 `selectionHash`。
- 第5项：基本解决。分包手段、A6、C5、C5b、D2、D3 均已补齐。D2 经 `appendSceneRosterBatch` 触发 `regroup` 重建，不再空过。非阻塞提示：`importCharacterBudget` 在窗口低于 8000 时直接抛错（`novel-import-budget-policy.ts:18`），roster 与 links 也用同一预算。所以 B5 的“窗口再缩小”只有在基线窗口高于下限时才可行。更稳妥的做法是固定窗口，扩大名录（增加身份数或别名长度）来制造超预算。
- 第6项：已解决（第二轮编号清单未要求 B1）。
- 第7项：C8 已改为在 fake 中直接修改内存账本，可以构造。测试需要经类型转换取得控制器的 `sceneSources`，用来调用 `applySceneIdentityChange`。A3d 已补“无错误、到达 verify”，但仍有问题，见需修改第2条。C14 补了“artifact 仍在”，但新写的构造路径无法实现，见需修改第3条。
- 第8项：已解决。

新增问题：

- links 阶段不会产生 parent 关系。`planSceneIdentityLinkWave` 只生成 `type:'identity'` 任务（`novel-import-scene-identity.ts:219`）。`applySceneIdentityLinkWave` 对 identity 任务只接受 `same-place`/`different-place`/`unknown`，其它结果按 `shape` 拒绝（`:233`）。parent 类型任务只由上级修复写入，且结果固定为 unknown（`:17-18`）。因此 C11、C12 子项3–5 的基线“links 返回 parent 结果形成 A↔B”，以及 C14 的“links 返回两条不同 parent”，都无法构造。
- C12-1/C12-2 断言“发出了新的 links 请求”，但没有写出能产生新核对任务的构造。重新识别时 roster 记录按 key 去重，`old?.result` 已有结果（包括 unknown）的任务不会再发出（`:218`）。账本不变时就不会有 links 请求，子项1会失败，子项2也无法返回“新 same-place”。账本若被 roster 改变，又会使整理重跑，与子项1的期望矛盾。

结论：需修改

1. A3 补写点击“继续导入”后的 `calls` 断言（`resume`，`consent:true`；勾选图片时 `imageConsent:true`）。
2. A3d 补两点。(a) 写明遗漏单元同时含一个已导入场景的有据提及。否则 defer 后 `additions` 为空，流程会走到 `:924` 并抛出“遗漏场景没有可核对的有据身份”，与“无任何错误”矛盾。(b) 写明 unresolved 冲突只发生在新记录之间。例如遗漏 roster 同批返回两条新记录，彼此的 `links` 同时含 `same-place` 与 `different-place`。如果新记录借 links 与现有已导入身份成组，该已导入身份也会变为 unresolved，按 3R3 第4条应当抛错。
3. C11 与 C12 子项3–5 的基线环改为由 roster 记录的同批 `links:[{relation:'parent',targetIndex}]` 构造（A 指 B、B 指 A），不再写“links 返回 parent”。C14 改为可构造的路径，例如：遗漏 roster 同批返回 N1、N2，两者之间有 `different-place`；links 阶段让二者分别与已导入身份 X 判为 `same-place`（三者须共享 context 标签才会生成核对任务）。X 的成员位置最早，因此 ID 不变，组内冲突使 X 变为 unresolved。
4. C12-1/C12-2 写明能产生新核对任务的构造。首次整理的合并结果须与另一参与身份共享 context 标签，使合并后的身份 `basisHash` 变化，重新识别时才会产生新的 identity 核对任务。子项1让这些任务全部返回 unknown（账本 hash 仍等于 `cleanedHash`，跳过整理）；子项2让其中一条返回 `same-place`（账本变化，重新整理）。同时先断言这些 links 请求确实发出，避免空过。

## 第四轮审核

对象：487 修订4。对照第三轮 4 项结论、486（3R4 > 3R3 > 3R2 > 3R）以及 `desktop/core/novel-import-scene-identity.ts` 当前源码（`regroup` :107-132、`addRosterBatch` :136、`planSceneIdentityLinkWave` :206-232、`applySceneIdentityLinkWave` :233），并参照 `desktop/main/novel-import.ts` :611-676、:910-924。只做源码推演，未运行测试。

逐项核对：

- 第1项：已解决。A3 写明点击“继续导入”后的 `act` 调用为 `resume`、`consent:true`，勾选图片时另含 `imageConsent:true`。
- 第2项：(a) 已解决。遗漏单元含已导入场景 X 的提及，defer 后 `additions` 为空时 `:924` 能取得 X 作为核对目标。(b) 未解决，按现写法无法构造。N1、N2 之间有同批 `different-place` 关系，`planSceneIdentityLinkWave` 遇到两身份成员间存在 `different-place` 关系时直接跳过该对（:216），不会生成 N1–N2 核对任务，links 阶段也就无法返回 `same-place`。N1、N2 因此各自独立，不进入冲突，也不会成为 unresolved。“X 不共享 context、不进入该组”一项成立。
- 第3项：已解决。
  - C11/C12-3~5：同批记录的 `links:[{relation:'parent'}]` 经 `addRosterBatch` 写成两条 parent 关系（:136）。`regroup` 的 `added` 分支（:127-129）让 A 的上级为 B、B 的上级为 A。构建账本时不检查环，`:656` 会检测到环并发出上级修复请求。之后各次 `regroup` 中身份未变，`old` 分支按原 `relationKey` 保留上级（:130），整理时环一直存在。
  - C14：X、N1、N2 共享 context 标签，所以同一个桶内会产生 X–N1、X–N2、N1–N2 三个配对。N1–N2 因 `different-place` 被跳过；另两对 key 是新的，同一波次规划，可在同一次 `applySceneIdentityLinkWave` 中都返回 `same-place`。`regroup` 把三者并成一组，组内 `different-place` 使该组成为冲突根（:115）。组内没有 partition 决定，所以整组为 unresolved。新成员集合与旧 X 不同，ID 由首成员派生（:123），X 位置最早则 ID 不变；unresolved 身份名称取首成员 literal（:7），与修复后 D1 的默认名称一致。`:922` 由已选 unresolved 触发抛错，符合 3R3 第4条。
- 第4项：已解决。整理合并 P、Q 后，P∪Q 的 `memberKeys` 与 records 都变了，`basisHash=h([a.memberKeys,b.memberKeys,a.records,b.records])`（:217）随之变化，任务 key 也是新的。`old` 为空，所以不会被 `old?.result` 跳过（:218），重新识别时必定产生 P∪Q–R 任务。子项1：结果为 unknown 时不写关系，`ledgerHash` 不含 `linkTasks`（:89），账本 hash 仍等于 `cleanedHash`，跳过整理成立。子项2：返回 `same-place` 会写入关系并 `regroup`，hash 改变，整理重跑成立。非阻塞补充：P、Q 也共享该标签，首次 links 同样会规划 P–Q 任务。用例应写明该任务也返回 unknown；若返回 `same-place`，P、Q 在整理前已合并，整理 merge 就落空了。
- B5 非阻塞提示：已采纳（固定窗口，扩大名录）。

结论：需修改

1. A3d 的冲突构造改为不依赖 links 阶段的 N1–N2 任务。可行写法：遗漏 roster 同批返回 N1、N2，N1 的 `links` 对 N2 同时含 `same-place` 与 `different-place`。`regroup` 先按 `same-place` 合组，组内 `different-place` 使该组成为 unresolved（:112、:115），links 阶段对这一对不发任务（:216）。另一种写法：再加一条新记录 N3，与 N1、N2 共享 context，links 阶段在同一波次把 N1–N3、N2–N3 判为 `same-place`（同 C14 的机制，但不含 X）。X 仍不得与这些记录共享 context。

## 第四轮复核

只复核 A3d 与 C12 子项1–2 构造的修订，对照 `novel-import-scene-identity.ts` 当前源码。未运行测试。

- A3d：可以构造。N1 对 N2 的两条 links 关系类型不同，`addRosterBatch` 按不同 key 写入（:133、:136），schema 不限制同一目标出现多条。`regroup` 先按 `same-place` 合组（:112）。组内 `different-place` 没有 partition 决定，`partitionRelation` 返回 undefined，该组成为冲突根（:115）。没有锁定身份，整组为 unresolved（:122）。N1、N2 已是同一身份，X 不共享 context，links 阶段不会产生涉及它们的配对，X 身份与名称不变，`:922` 的名称检查也不会误触发。defer 后 `additions` 为空，遗漏单元含 X 的提及，`:924` 取得核对目标。
- C12 子项1–2：可以构造。首次 links 中三条任务都返回 unknown，只记录在 `linkTasks` 中，不写关系，P、Q 保持独立，之后整理的 merge 能生效。合并后 P∪Q 的 `memberKeys`、records 改变，P∪Q–R 的 `basisHash` 与任务 key 都是新的（:217），不会被 `old?.result` 跳过（:218），重新识别时必定发出。子项1 的 unknown 不改变 `ledgerHash`（:89 不含 `linkTasks`），子项2 的 `same-place` 改变账本，均与 3R4 第2条一致。

结论：通过
