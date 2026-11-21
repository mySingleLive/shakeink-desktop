# 530 · 导入缓存第二、三步代码审核（526 保守版 + 528 修订 1）

日期：2026-11-08。独立审核，范围仅限 522–529 相关的未提交改动（`git diff` 中 sharedSource / promptLayout / sceneFragmentRefs / sceneFragmentLayout 等符号），不含 510–521 的既有改动。未修改任何源文件。

## 结论：修改后通过

主体正确：两项布局都只对新建向导会话（v2 预算）生效，旧会话的提示词、金样与哈希逐字节不变；12 位 ref 在载荷、服务端建表、zod、原生 schema、提示词示例和各修复路径上位宽一致，没有发现会导致新会话失败或旧会话变化的缺陷。未通过的部分是 528 的验收观测与 M3 预算口径没有落地，用例覆盖也不完整（见中 1–4）。补齐中 1–3 后可以进入真实首跑；中 4 建议同批修复。

## 已核实（命令与证据）

- `node --import tsx --test tests/unit/novel-import-shared-source.test.ts tests/unit/novel-import-scene-fragment-compact.test.ts`：28/28 通过。
- `scripts/capture-novel-import-prompt-golden.ts --check`：`prompt golden unchanged 24 groups 36 requests`；`scripts/capture-novel-import-request-trace.ts --check`：`traceOk:true, hashOk:true`。
- `tsc --noEmit` 退出码 0。
- 相关回归：targeted-repair / native / correction / control-focus / token-usage 五个文件 85/85 通过。
- **修复路径位宽（任务重点）：** 把 `novel-import-scene-roster-targeted-repair.test.ts` 的请求临时改成 `sceneFragmentRefs:{version:1,width:12}`，并把夹具中的建表与 `sourceRef` 正则改成 12 位后，25/25 通过（临时文件已删除）。定点修复、bound 修复（八列 choices 的 `sourceRef`）、根结构恢复（`captureRootEnvelope` → `anchor(reference.parse)`）都使用 `createSceneRosterGeneration` 里按位宽建的同一张表（`service/novel-import-ai.ts:91`、`:231`），与紧凑包一致；没有任何路径仍按 16 位建表后去解析紧凑包的 ref。唯一按 16 位建表的是控制焦点验证器（低 1），它只比对 `cf` choiceRef（摘要不含 ef ref），不会造成不一致。
- **分批不变：** 用合成场景夹具实测，紧凑会话 3 批（22/21/7 单元），旧布局载荷 237,364 / 235,980 / 78,861 字符，紧凑载荷 132,064 / 130,980 / 43,861（约 −44%）；SC-02 用例断言新旧会话批次逐项相同。
- `requestFits`（`main/novel-import.ts:1733-1744`）对“去掉 `sceneFragmentRefs` 的旧请求”和真实请求都做载荷与原生预算判定，两次都通过才算 fit，符合 M1/M2；`sceneFragmentRefs` 不进载荷 JSON（SC-04 断言）。
- 服务端 `validateSemanticRequest`（`service:877-880`）把 sharedSource 和 sceneFragmentRefs 校验放在 `semanticVersion` 缺省早返回之前，键集合精确，只接受 `{version:1,width:12}`；SC-14 断言拒绝发生在模型解析之前（`resolved===0`）。
- 主进程 `ai()`（`main:1811-1813`）断言调用方的 `sceneFragmentRefs` 与快照一致，并对 sharedSource 校验运行门与规范窗口。场景 roster 的两个调用点（`main:723`、`main:1233`）都经过 `stageRequests → requestSnapshot`，字段在 `sceneRequest`（`main:370-374`）统一附加，并排除 `sceneParentTargets`。
- 哈希：`importScopeHash`/`importPlanHash`（`core/novel-import.ts:385`、`:390`）以条件展开计入两个字段；`validateImportBudgetState`（`budget-policy.ts:37-38`）拒绝未知值或缺少 `budgetPolicy` 的日志。
- 共享布局：`<`/`>` 只在新布局中转义（`shared-source.ts:50`）；旧布局与金样不变；拆分重试与残缺窗口走旧布局（`main:648-658`、`:676`）。

## 发现

### 中

1. **528 M3 未实现：纠错与 focus 预算没有按旧布局等价长度判定。** `service/novel-import-ai.ts:717` 的 `checkBudget` 使用 `payload=serializeImportAiPayload(request)`，即紧凑载荷；`:722`（根结构恢复 focus）和 `:779`（定点/bound focus）的可选块判定也基于它。紧凑载荷更小，所以在旧布局下会被省略的 focus 块，在新布局下可能被附带，纠错提示词因此与旧布局不同。这违背 528“复审补充 M3”和 SC-11（中 9）中“与旧布局下是否附带 focus 一致”的要求，也会混淆真实首跑对纠错代次率的比较。修法：对紧凑包另外计算 `{...request,sceneFragmentRefs:undefined}` 的旧载荷，`checkBudget` 和 focus 判定用旧载荷与旧提示词长度做一次判定（再对真实值判定一次），并补 SC-11 中 9 的构造用例。

2. **528 验收观测缺失：没有 `refWidth`，也没有 `scene-roster-ref-invalid` 计数。** `observeImportUsage`（`service:634-645`）的行里只有 `layout`，没有 528 修订 1 要求的 `refWidth:12|16|null`；`service:96` 的 ref 解析失败也不输出调试计数行，跨片备选使用次数同样没有计数。SC-REAL 中“ref 无效计数、跨片备选次数、`refWidth` 分布同报”和回退判断都依赖这些数据，缺了它们首跑无法按 529 验收。修法：按 SC-16 加字段和计数行（格式 `scene-roster-ref-invalid {"op","count"}`，调试关闭时不输出），并核对行长 ≤768 字节。

3. **529 用例覆盖不足**（`tests/unit/novel-import-scene-fragment-compact.test.ts` 共 8 个用例）。缺少：
   - SC-11/SC-12：新布局下的定点修复、bound 修复、根结构恢复、控制焦点。本次审核用临时改写才证实一致，仓库里没有对应的回归用例。
   - SC-06（中 5）：只断言了载荷、zod 和原生 schema。repair-choices 的 `sourceRef`、control-focus、提示词示例、usage `refWidth`、`supportsStructuredSceneRoster` 在 16 位回退时的一致性都没有测。
   - SC-07a–d：没有分拆，也没有计数断言（依赖中 2）。
   - SC-09：没有“100 组随机单元集合上新载荷 ≤ 旧载荷”的性质测试；SC-10 没有 fit 观察器（`legacyFits&&actualFits`）。
   - SC-15：没有测主进程断言的附加、剥离、篡改三种不一致。
   - SC-02（中 8）：只测了 controller 选项 `promptLayout:'legacy'`，没测 `SHAKEINK_PROMPT_LAYOUT` 环境开关、v1 预算不写入、resume 不切换。
   - SC-13：没有断言 `service:807` 的分类表。
   - SC-16b：没有测 memo 上限。

   另外，528/529 的“审核修订”声称已覆盖的项与实际用例不符，台账（`requirements-traceability.json`）不应标为通过。

4. **`widthMemo` 以整包原文为键，会长期占用较多内存。** `core/novel-import-scene-roster-fragments.ts:64` 的键是 `JSON.stringify(units.map(u=>[id,fileId,start,end,text]))`，上限 2,000 项（`:68`），而且是模块级、不随会话清理。真实正文的旧载荷约为正文的 7.1 倍，`requestFits` 的旧载荷判定会让 `importStageBatches` 的贪心整批计划失败（`budget-policy.ts:98`），转为逐单元增量判定，每加一个单元就新增一个整批原文键。整卷场景识别下来能积累上千个数万字符的键（估计数十 MB），每次计算键也要对整批原文做一次序列化。建议改用 `[id,fileId,start,end,importHash(text)]`，或复用 `fragmentMemo` 已有的单元级结果，并调低上限。

### 低

1. 控制焦点验证器仍然自己按默认 16 位建表（`service/novel-import-scene-roster-control-focus.ts:45`，`createSceneRosterFragmentTable(input.units)`），没有按 M5 接收已有表。功能上没有问题（只比对 `cf` ref），但多建了一张表，也与“所有使用方从同一建表结果取位宽”的约定不一致。
2. 回滚 entity 路径后的残留：
   - `shared-source.ts:3` 的注释仍写“roster and entity requests”。
   - `:6` 的 `windows[]`/`extraUnitIds`、`:40-45` 的多窗口循环和 extra 拼接，在保守版下只能是一窗、零 extra。
   - `:62` 的 `canonicalSharedSourceError` 参数 `intent` 没有使用。
   - `:70-72` 和 `main:97` 的注释说 2× 窗口门“让 entity 保留补充单元”，这个依据已经不成立（门本身可以保留）。
   - `SharedRequest` 的 Pick 里有未用的 `entityTarget`/`entities`。

   `IMPORT_SHARED_HEAD` 和载荷中的 `extra:[]` 属于已经冻结的缓存前缀，不建议再改。
3. 528 和 526 没有独立的回退开关：`options.promptLayout==='legacy'` 和 `SHAKEINK_PROMPT_LAYOUT=legacy` 会同时关闭两项（`main:96`、`:1540`）。528 §3.4 的“关闭 compact-v1”需要改代码。建议加一个仅测试根生效的 `SHAKEINK_SCENE_FRAGMENT_LAYOUT=legacy`，或者在文档里写明回退方式。
4. `sceneRosterNativeSchema`（`core/novel-import-scene-roster-native.ts:30`）在请求带 `sceneFragmentRefs` 但没有 `units` 时会静默返回 16 位 schema。现有调用点都会带 `units`，建议在这种情况下直接抛错，而不是回退。
5. 紧凑提示词比旧提示词多约 52 字节固定文本（实测固定部分 2,491 → 2,543）。`requestFits` 在非原生模型下不检查固定预留（这个检查原本就没有），只有 `ai()` 会检查。余量很大，但建议在 fit 判定中统一调用 `assertImportFixedPromptReserve`。
6. 注入（既有问题，不属于本次范围）：场景 roster 的新旧载荷都不转义 `<`/`>`。实测正文中的 `</novel-import-data>` 会原样出现在紧凑载荷里。紧凑布局没有让它变得更糟，可以另起一项，像共享布局那样只在新布局中转义（需要同时更新 SC-04 的拼接断言）。

## 建议顺序

中 1 → 中 2 → 中 3（补用例，含把本次临时改写的 TR 用例作为 SC-11 固化进仓库）→ 中 4 → 低项。完成后重跑两份金样 `--check`、两份新测试文件和全量回归，再做 SC-SIM 与 SC-REAL。
