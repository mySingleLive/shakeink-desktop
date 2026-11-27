# 607 打开大纲卡顿：方案与测试独立审核

审核对象：`docs/607-outline-open-lag-plan.md`、工作区里尚未提交的 `src/lib/planning/domain.ts` 修改、`tests/unit/planning-card-order-perf.test.ts`。本次审核只写了这一份文件。下文的测量数据来自合成数据的临时基准：用 Node 24 分别在工作区代码和 `HEAD` 导出副本上运行，跑完后已删除。没有使用真实作品数据。

## 结论摘要

- 诊断成立。在 `HEAD` 上，900 张顶层卡时单章 `chapterProjection` 用时 27 ms，和方案测得的每章 16–17 ms 同一量级。`renderChapters(true)` 对每章各调用一次（`PlanningWorkspace.tsx:1551`），所以总成本是“章数 × 卡数²”。
- `orderedCards`、`readingCards` 和 `chapterProjection` 的新实现逐项核对后输出相同，包括排序的并列规则、`seen` 参数、异常的先后顺序、跨线父卡、不存在的父卡和重复 id。
- **公开的 `cardChapter` 改法引入了新的平方级回归**，会拖慢每次保存都要执行的 `validatePlanning`，必须修正（见问题 1）。
- 投影渲染路径上还有一笔方案没有提到的成本：每章各发 2 个本地请求，213 章合计 426 个。需要纳入 OL-07 实测（见问题 2）。

## 问题

### 1. 【阻断】公开的 `cardChapter` 每次调用都重建整张 id 表，`validatePlanning` 变成平方级

证据：

- `domain.ts:439-464`（工作区）：只要卡片自身没有 `chapter`，`cardChapter(data, card)` 就先执行 `cardsById(data)`，遍历全部卡片建 Map，再沿父链向上走。旧实现用 `data.cards.find` 逐层查找，找到就停，不会每次都扫满整个数组，还不用分配 Map。
- `validatePlanning` 对每张卡都调用这个公开函数：`domain.ts:613` 只对 `wordBudget !== null` 的卡调用，`domain.ts:631` 对所有叶子卡和 `narrateSummary` 卡调用。`validatePlanning` 在每次规划保存时执行（`planning.ts:306`），导入发布时也执行（`novel-import-publish.ts:184`），世界修复同样执行（`novel-import-world-repair.ts:38`）。
- 实测（顶层卡、都没有自身章节，比如导入中途或者尚未分章的作品）：

| 卡数 | `validatePlanning` HEAD | `validatePlanning` 工作区 | 对每张卡调用一次 `cardChapter`，HEAD → 工作区 |
| --- | --- | --- | --- |
| 900 | 16 ms | 38 ms | 10 → 36 ms |
| 5000 | 108 ms | 1418 ms | 101 → 1506 ms |
| 10000 | 322 ms | 6689 ms | 317 → 5806 ms |
| 5000（每 10 张一组，子卡继承父卡章节） | 168 ms | 1347 ms | 61 → 1283 ms |

- 方案 §3.1 自己写的是“`cardChapter` 每次调用只向上走一条父链，不值得为它单独建 Map……公开的 `cardChapter(data, card)` 签名和行为都不变”。代码和方案说法不一致。
- 渲染端也受影响：`PlanningWorkspace.tsx:965` 在卡片列表里对每张卡调用 `cardChapter`，`:1669` 在“未分章”区块对每张阅读卡调用。`story-artifacts.ts:76` 对每张阅读卡调用两次。凡是卡片没有自身章节、要走父链的，每次调用都会重建 Map。

修正：

- 公开的 `cardChapter` 恢复成旧的 `find` 逐层查找，可以保留 `card.chapter` 的提前返回。
- 只在 `chapterProjection` 内部共用一张 `byId`，这部分已经这样实现。
- `validatePlanning` 的 `:613`、`:631` 两处同样改为在函数内建一次 `byId`，再调用 `chapterOf`。这一步是可选优化，但比回退更好。
- 新增测试：5000 张没有章节的顶层卡，`validatePlanning` 的用时不能高于旧实现的参考值，或者给一个绝对上限，比如 < 300 ms。

### 2. 【重要】投影里每章 2 个本地请求，213 章共 426 个，方案没有分析，OL-07 也没有测

证据：

- `PlanningWorkspace.tsx:1608-1618` 在每章下各挂一个 `ReviewHistory` 和一个 `ScoreIndicator`。
- `ReviewHistory.tsx:26-33` 用 `useQuery` 请求 `/api/novels/:id/review?...`。`<details>` 即使没有展开，子组件也照样挂载，所以请求照样发出。
- `ScoreIndicator.tsx:57` → `use-score-report.ts:148-159` 请求 `/score-report`。
- 两个请求的服务端处理：
  - 都先执行 `getOwnedNovel`，即 `novel.findUnique`（`desktop/handlers/novels/[id]/lib.ts:20`）。
  - review 路由接着执行 `review.findMany`（`review.ts:458`）。
  - score-report 路由接着执行 `chapter.findUnique` 和 `review.findMany`（`score-report.ts:258,273`）；有评分时再加一次 `subAgentRun.findFirst`。
  - 合计每章至少 5 次 PGlite 查询，213 章 ≥ 1065 次。
- 所有请求经 `src/lib/desktop/transport.ts` 走 IPC 和 MessagePort，送到同一个 Worker（`desktop/main/index.ts:325`），在单个 PGlite 上串行执行。

影响判断：

- 这些请求不在渲染进程同步执行，不会造成方案测到的那 3.6 s 冻结。
- 但打开大纲时会一次性排进 426 个请求。同一 Worker 上其他标签页的请求（对话、正文保存）会排在它们后面。
- 渲染进程要建 426 个 Request/MessagePort，逐个解析 JSON，并触发 852 次左右的组件状态更新。
- React Query 默认开启窗口聚焦时重新请求（`providers.tsx:13` 没有关闭），切回窗口时会再发一轮 426 个。
- 修复平方复杂度之后，这一项很可能成为“打开慢”的主要剩余成本，但目前没有数据。

修正：

- OL-07 增加记录项：打开大纲时 `/review` 和 `/score-report` 的请求数、从第一个到最后一个请求完成的耗时、期间另一个标签页某个请求的延迟。
- 如果实测明显，下一步再处理，比如只在 `<details>` 展开时挂载 `ReviewHistory`，或者给 `ScoreIndicator` 做视口内懒加载。这些改动会影响可见行为，需要单独立项，不放进本修复。
- 方案 §2 和 §5 应写明这一项“已识别、未处理”，免得验收时把它算作已解决。

### 3. 【重要】OL-07 的“首屏渲染完成”需要同时测 DOM 提交和布局

证据：

- 投影把 213 章全部渲染出来。每章有一个 `minHeight: 180` 的容器和一个 `MarkdownPreview`（`PlanningWorkspace.tsx:1619-1623`），后者用 `dangerouslySetInnerHTML` 插入整章大纲 HTML（`MarkdownPreview.tsx:20-29`）。
- 方案只测了 `renderMarkdown` 的字符串生成，14–22 ms。插入 HTML、样式计算和布局的耗时没有测，213 段大纲的 DOM 体量可能不小。

修正：OL-07 用 Performance 面板或者 `PerformanceObserver('longtask')` 记录点击后所有长任务，并把它们拆成脚本、样式和布局三部分。验收标准写成数字，比如最长任务 < 200 ms，或者给出可接受的总时长。不要只看 `chapterProjection` 合计。

### 4. 【建议】每次重渲染仍会把 213 章投影全部重算一遍；不用 `useMemo` 的理由不成立

证据：

- `renderChapters` 在 PlanningWorkspace 的每次渲染里执行。修复后，900 卡、220 章全部投影一次在 Node 里约 42–48 ms。
- 每次 `chapterProjection` 仍要重建 `childIndex` 和 `orderedFrom`，同一条线上的结果被重复算了 213 次。
- 组件订阅了 `useTabsStore`、`useDesktopStore` 等（`PlanningWorkspace.tsx:134-138`），`message`、`busy` 等本地状态变化也会触发重渲染。每次都要再付这约 50 ms。
- 方案 §3.2 说用 `useMemo` 会改变 BudgetForm 的 `key` 和展开状态。实际上 `key` 是 `${ch.id}:${query.data?.version}`（`:1629`），与投影对象的引用无关。按 `[data]` 缓存一张 `Map<chapterId, projection>` 不影响 key，也不影响展开状态。`query.data.data` 是 React Query 返回的对象，渲染端不会就地修改它；`applyPlanningOperations` 会先 `structuredClone`，见 `domain.ts` 中 `applyPlanningOperations` 开头。

修正（可选）：

- 在 domain 中加一个只读的批量函数，比如 `chapterProjections(data, line)`，对一条线只建一次索引和顺序，再按章分桶。输出与逐章调用逐项相同，作为纯函数没有缓存过期的问题。
- 或者在组件里 `useMemo(() => new Map(...), [data])`。

### 5. 【建议】OL-01 没有比较 `outline` 和 `requestHash`，和方案的表述不符

证据：

- `planning-card-order-perf.test.ts` 的 OL-01 只比较了 `cards`、`allCards` 的 id 列表和 `allocated`。没有比较 `outline` 字符串、`chapter`，也没有比较 `requestHash(chapterProjection(...))`。
- 方案 §5 写的是“输出必须逐字节相同，测试会覆盖这一点”。

修正：在测试里保留旧的 `refChapterProjection`，把整个对象拿来 `deepEqual`，再加一条 `requestHash(new) === requestHash(ref)`，`requestHash` 来自 `@/lib/services/content-commit`。随机卡片里还要加上 `beats`、`refs`、`jump`、`materialRefs` 和 `wordBudget`，让 outline 模板的各个分支都有覆盖。

### 6. 【建议】缺少的测试用例

- **规模上限的报错消息**：传入预先装了 9999 个 id 的 `seen`，再调用 `orderedCards`，断言抛出 `叙事结构过大`，并且这次检查发生在循环检测之后（顺序与旧实现一致）。
- **`seen` 被调用方修改**：调用之后，调用方传入的 `seen` 应包含本次访问过的全部 id，与旧实现一致。
- **重复 id**：`planningSchema.parse` 不拒绝重复 id，只有 `validatePlanning` 才拒绝。两张卡同 id 且各自有子卡时，新旧实现都应在第二次展开时抛出 `叙事卡片形成循环`；`cardChapter` 应取第一张卡（Map 先到先得，与 `find` 相同）。测试要把这一点固定下来。
- **跨线叶子判断**：线 A 的父卡只在线 B 上有子卡时，它在线 A 的 `readingCards` 中应算作叶子。OL-01 的随机数据可能碰到这种情况，但要写一条确定性用例。
- **深链**：9000 层的单链在 `HEAD` 和工作区上都会抛 `RangeError: Maximum call stack size exceeded`，这是旧行为，不是本次引入的。建议写进方案“不做的事”，不要在本次顺手改成迭代版。迭代版会改变异常类型，`seen.size` 检查的触发时机也可能随之变化。
- **问题 1 的回归测试**：大量没有章节的卡，测 `validatePlanning` 和公开 `cardChapter` 循环的用时。
- **OL-04**：只比较了 `applyPlanningOperations` 之后的 `orderedCards` 和 `readingCards`。建议对 group、move、copy 的结果再断言具体的 `parent`、`order` 和 copy 生成的新 id 映射（写成字面量期望值）。因为 `applyPlanningOperations` 内部已经在用新函数，拿它自己的结果互相比较证明不了什么。
- **保存路径**：`planning.ts:133,161` 在保存时对每章调用两次 `chapterProjection`。`HEAD` 上 213 章大约要 2 × 213 × 27 ms ≈ 11 s，都在 Worker 里。本次修复也会让这里变快。建议在 OL-07 里顺便测一次真实副本上“修改一张卡并保存”的耗时，作为附带收益的证据，同时确认没有因投影哈希不一致而误生成章节修订。

## 逐项核对结论（无问题）

- **分组与排序**：`childIndex` 按数组顺序分组后排序，比较规则和 `children` 相同。`Array.prototype.sort` 是稳定排序，所以每组与 `children(data, line, parent)` 完全相同，order 和 id 都相同时也一致。
- **跨线父卡和不存在的父卡**：索引只收本线卡片，而遍历从 `parent` 出发沿本线 id 展开。父卡在别的线或者根本不存在的卡，新旧实现都到达不了。叶子判断用的是本线索引，与旧的 `children(data, line, c.id)` 一样只看同一条线。
- **检查顺序**：先查循环，再查规模，然后 `add`、`push`、递归，与旧的 `flatMap` 顺序一致。`seen` 用的是调用方传入的同一个对象。
- **`chapterProjection`**：旧实现先在 `readingCards` 里展开，再在 `allCards` 里重新展开一次。新实现只展开一次。展开过程中能抛出的错误相同，并且会先于后面的 `cardChapter` 检查抛出。`cards` 先过滤，`allCards` 后过滤，`cardChapter` 循环错误的触发顺序也相同。返回的卡片对象引用相同。
- **`chapterOf`**：`parent === null` 时直接结束。旧实现的 `find(c => c.id === null)` 不可能匹配，因为 id 至少一个字符（`domain.ts:5`），所以结果相同。
- **`planning.ts:161` 的 `requestHash`**：新旧两边都用同一份新代码计算，只要输出相同就没有风险。`canonical` 会对键排序（`content-commit.ts:37-42`），而且投影输出逐项相同，所以哈希不变。
- **不做跨调用缓存**：这个判断正确。`applyPlanningOperations` 的 group、move 和 copy 分支会就地修改 `parent`、`order`、`line`，也会 `push` 新卡，之后在同一次操作里继续调用 `children` 和 `orderedCards`（`domain.ts` 原 :711、:733、:738、:758、:768）。按 `data` 引用缓存一定会读到过期结果。每次调用现场建索引是正确的选择。

## 其他观察（不在本次范围）

- 叙事线视图的 `treeNodes`（`PlanningWorkspace.tsx:769,782`）对每个节点调用两次 `children`，卡片多时也是平方级。按卡片列表展开计数（`:1057-1058`）同理。投影大纲不受影响，可以以后单独处理。

## 结论

**修改后通过。** 问题 1 必须修正并补上回归测试。问题 2 和问题 3 必须进入 OL-07 实测并如实记录。问题 4 到问题 6 建议一并处理。
