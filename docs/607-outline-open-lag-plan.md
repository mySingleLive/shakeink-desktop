# 607 打开大纲卡顿：调研与技术方案

用户反馈（2026-11-25）：点击进入《诡秘之主2》的大纲时，界面会卡住一段时间没有响应。

## 1. 数据规模

作品 `cmwnfbnmm01c2xy6v99n4hkta`（目录 `导入诡秘之主8`）。测量只读，用的是数据库副本，真实数据未改动。

| 项 | 数量 |
| --- | --- |
| 规划文档 | 1.56 MB |
| 叙事卡片 | 862（全部为顶层卡，最大深度 0） |
| 章节 | 213（同一叙事线） |
| 事件 | 1155 |

## 2. 测量结果

服务端 `GET /api/novels/:id/planning` 的各项查询都在 40 ms 以内（PGlite 实测：规划文档 19–36 ms，其余 ≤ 10 ms）。客户端 `planningSchema.parse` 用时 6–15 ms，`renderMarkdown` 渲染 213 章总共 14–22 ms，也都不是瓶颈。

瓶颈在 `renderChapters(true)`（`PlanningWorkspace.tsx:1551`）：它对每一章调用一次 `chapterProjection(data, ch.id)`，213 章合计 **3.5–3.7 秒**，平均每章 16.5–17.3 ms。这些计算都在 React 渲染里同步执行，所以界面会无响应。

单章拆分（862 张卡）：

| 调用 | 用时 |
| --- | --- |
| `readingCards(data, line)` | 27.8 ms |
| `orderedCards(data, line)` | 10.0 ms |
| `cardChapter` × 862 | 0.2–0.4 ms |

原因是 `src/lib/planning/domain.ts` 里的两个函数是平方级：

- `orderedCards`（:396）对每张卡递归调用 `children`，而 `children` 每次都把全部 `data.cards` 过滤一遍再排序。862 张卡大约要扫描 74 万次。
- `readingCards`（:427）在 `orderedCards` 的基础上，又对每张卡调用一次 `children` 判断它是不是叶子，又是同样数量的扫描。

`chapterProjection` 每章都把这两个函数各跑一遍，结果是总成本 = 章数 × 卡数²。

## 3. 方案

### 3.1 消除平方复杂度（domain.ts，对外行为不变）

- `orderedCards`：先遍历一次 `data.cards`，按 `parent` 分组，组内用与 `children` 相同的比较规则（`a.order - b.order || a.id.localeCompare(b.id)`）排序，再从 `parent` 开始做深度优先展开。这几项保持原样：
  - 循环检测（`叙事卡片形成循环`）；
  - 规模上限（`seen.size < 10000`，`叙事结构过大`）；
  - 输出顺序；
  - 签名，包括可选的 `parent` 和 `seen` 参数。
- `readingCards`：复用同一份分组，用“该卡在本线下是否有子卡”判断叶子，不再对每张卡调用一次 `children`。
- `cardChapter`：沿 `parent` 向上走时改用按 id 建立的 Map，不再每层 `data.cards.find`。它在 `chapterProjection` 中会被调用“卡数 × 章数”次，换成 Map 后每次查找都是 O(1)。循环检测和返回值保持不变。

**不做跨调用缓存。** 检查调用点后发现，`applyPlanningOperations`（`domain.ts:707-774`）会在同一个 `data` 对象上就地修改卡片：`group`、`move` 和 `copy` 分支会改 `parent`、`order`、`line`、`chapter`，或者 `push` 新卡。修改之后，它在同一次操作里还会再调用 `orderedCards` 和 `children`。`planning.ts:496` 和 `novel-import-publish.ts:181` 也会对 `cards` 执行 `push`。按对象引用缓存会返回过期的结果，所以每次调用都现场建立索引，复杂度为 O(n log n)。

`cardChapter` 每次调用只向上走一条父链，不值得为它单独建 Map。改为由 `chapterProjection` 在一次调用内建立一张 id→card 表，传给内部辅助函数使用；公开的 `cardChapter(data, card)` 签名和行为都不变。

这样，213 章 × 862 张卡的成本从 213 × 862² 降到约 213 × 862 × log 862。

### 3.2 只读投影一次算完（PlanningWorkspace.tsx）

`renderChapters` 内 `chapterProjection` 的每章调用保持不变，但它的内部成本已经由 3.1 降下来了。不额外引入 `useMemo`，以免改变渲染语义，比如 BudgetForm 的 `key` 和展开状态。

### 3.3 不做的事

- 不改变大纲的界面、文案、排序和交互。
- 不引入虚拟列表或分页：这会改变“整本大纲连续阅读”的界面，需要先经 UI 审批。
- 不修改数据库查询，它不是瓶颈。

## 4. 预期效果

`orderedCards` 和 `readingCards` 从 O(n²) 降为 O(n log n)。按当前数据，213 章的投影合计从约 3.6 s 降到 100 ms 以内；验收以实测为准。

## 5. 影响面

`orderedCards`、`readingCards`、`cardChapter`、`children` 被服务端多处使用：`planning.ts:133,161`、`story-materials.ts`、`story-workflow.ts`、`story-artifacts.ts`、`content-review.ts`、`chapter.ts`、`narrative-assessment.ts`、`planning-tools.ts`。`planning.ts:161` 用 `requestHash(chapterProjection(...))` 比较新旧投影，所以输出必须逐字节相同，测试会覆盖这一点。

## 6. 测试方案

| ID | 内容 | 层级 |
| --- | --- | --- |
| OL-01 | 等价性：随机生成的多线、多层、含 `narrateSummary`、`order` 有重复的卡片树上，新旧 `orderedCards`、`readingCards`、`cardChapter`、`chapterProjection` 输出逐项 `deepEqual`。旧实现作为参考实现保留在测试文件内 | unit |
| OL-02 | 带 `parent` 参数调用 `orderedCards` 时，只返回该子树 | unit |
| OL-03 | 父子成环时抛出 `叙事卡片形成循环`；`cardChapter` 遇到父链成环时同样抛出 | unit |
| OL-04 | 就地修改：在同一个 `data` 上先调用一次 `orderedCards`，再就地修改某张卡的 `parent` 或 `order`，或 `push` 一张新卡，再调用一次，结果与参考实现一致（无过期结果）。另外，`applyPlanningOperations` 的 group/move/copy 结果与参考实现一致 | unit |
| OL-05 | 性能：用合成的 900 张顶层卡、220 章，对所有章调用 `chapterProjection`，总用时 < 500 ms（修复前同规模约 3.5 s） | unit |
| OL-06 | 回归：`npx tsc --noEmit`；全量单元 + 集成测试，失败集合与基线（5187 条 / 42 条失败）相同；规划和世界线相关的浏览器测试 | 回归 |
| OL-07 | 真实目标：在《诡秘之主2》数据库副本上测量 213 章 `chapterProjection` 合计耗时，并在开发版 Electron 中打开该作品的大纲，测量从点击到大纲首屏渲染完成的时间，以及主线程最长任务 | 实测 |

OL-07 使用作品目录的副本，不打开真实作品目录，避免占用作品锁。
