# 553 · 异常作品统一导航节点 代码审核

审核对象：`docs/551-faulted-work-node-plan.md`（以 §7 为准）与 `docs/552-faulted-work-node-cases.md`（以 §G 为准）的实现。只看本功能相关文件；工作区中 novel-import 等无关改动未审。审核人未修改任何源文件或测试文件。

## 结论：approve with changes

没有 blocker。服务端并发与回滚逻辑正确，分类标记不改变错误类型、message 或 `code`，错误响应不含路径。界面满足用户约束：统一节点、文件夹+感叹号图标、红/黄标题、单击/右键/`…` 打开同一菜单、始终有“删除”、正常作品菜单仍为“重命名”“删除”。下面的 should-fix 项修完后即可进入全量与真实目标系统验收。

## 已执行的验证（Node v24.18.0）

| 命令 | 结果 |
|---|---|
| `node --import tsx --test tests/unit/work-unavailability.test.ts tests/integration/faulted-work-removal.test.ts tests/integration/works-loading.test.ts` | 15/15 通过 |
| `node --import tsx --test tests/browser/works-loading.test.ts tests/browser/sidebar-navigation.test.ts` | 46/46 通过 |
| `npm run typecheck` | 通过 |

未执行：`npm test` 全量、`tests/integration/desktop-worker.test.ts`（WN-24）、`tests/browser/text-context-menu.test.ts` 及其余浏览器回归、真实目标系统（§F/G.3）。这些由主代理在验收阶段执行。

## 重点审核项结论

- **`forget` 守卫时机**（`desktop/service/workspaces.ts:293-295`）：`active` 检查与 `forgotten.add` 处于同一同步段。`run()` 从入口检查到 `slot.active++`（:367-411）之间没有 `await`，所以 `forget` 不可能在一个 `run` 已过入口检查、但还没把 `active` 加 1 时看到 `active===0`。§7.2 第 2 步成立，`forgetWorkspace` 不会漏掉新登记的位置。
- **回滚**（:304）：第 3–4 步任何异常都会执行 `forgotten.delete`。这时空闲槽已经退役，下一次 `run` 会重新连接。WN-22、WN-32b 实测证明健康作品可以恢复读取。
- **`retire` 不抛错**（:308-311）：`disconnect` 的拒绝被吞掉并记入 `failedRetirements`，`retiring` 只在仍指向本次 Promise 时删除。`run()` 的 `finally` 中 `await this.retireForgotten`（:430）不可能抛错。它也不会死锁，因为 `disconnect` 不进入 `serialize` 队列。
- **账本嵌套**：`forgetWorkspace` 经 `ledger.withGlobal` 走 `run('inbox')`，不走 `serialize`，所以在 `forget` 的 `serialize` 内调用不会自等待。WN-23 验证了 worker 生产路径 `runWithGlobal('inbox')` 下的嵌套调用。
- **`open()` 与 stranded 退役**（:272-274、:281）：`open()` 先重试 `disconnect`，失败时抛原错误；成功写入 catalog 后才清除 `forgotten`，失败时标记保留，行为正确。被移除的作品已不在 catalog 中，`previous` 为 undefined，所以不会走 `run(previous.id)` 分支。WN-15、WN-14c、WN-34 实测可以重新加入。
- **分类**（`desktop/service/work-unavailability.ts`）：只读 Symbol 标记和 `ContentError.code`，标记不可枚举，`markWorkFault` 返回原对象。`missingDeletionSource` 依赖的 ENOENT `code` 不变。WN-05′ 实测 in-use 抛出的仍是普通 `Error`，ENOENT 的 `code` 也不变。
- **错误响应**（`desktop/service/dispatcher.ts:139-153`）：只透传 `ContentError` 的 message（`WORK_NOT_FOUND`/`WORK_BUSY`/会话账本的 409 文案，都不含路径）；其他错误一律返回通用 500 文案。WN-22 断言响应正文不含 base 路径。
- **React**：`SidebarTree` 中新增的 hook（:1493-1527）都位于唯一的 `return`（:1873）之前，没有条件调用。行 key 为 `${scope}:${workId}`，切换 scope 时行内 `open` 状态会复位。`ContextMenuTrigger render={children}` 包住 `<div ref={row}>` 后，`row` ref 仍然生效（WN-42′ 的单击路径依赖这个 ref，实测通过）。
- **删除对话框**（:2258-2286）：`removeFlight` ref 与 `isPending` 共同保证同一时间只有一个请求；pending 时 `onOpenChange` 拒绝关闭，取消按钮和关闭按钮都被禁用或隐藏。WN-53′ 实测：连点只发出 1 次请求，Esc 不关闭对话框。

## should-fix

1. **键盘焦点在菜单关闭后落到不可见的 `…` 按钮上。** 位置：`src/components/layout/SidebarTree.tsx:388` 用 `querySelector(...).click()` 程序化点击 `…` 触发器；触发器（:373）只有 `opacity-0 group-hover:opacity-100 data-popup-open:opacity-100`，没有 `focus-visible:opacity-100`。用 Enter/Space 打开菜单再按 Esc 关闭后，Base UI 会把焦点还给 `…` 按钮，键盘用户看不到焦点位置。此外，行上的 `aria-haspopup="menu"` 与实际菜单的锚点不是同一个元素。建议给该 `NavigationMenuContent` 设置 `finalFocus` 指回行元素，或至少给触发器加 `focus-visible:opacity-100`。另外，实现没有采用 §7.3 写的“受控 open + rAF”，改成了点击真实触发器（注释见 :387）。这个偏离需要在 551 或台账中记录，并补一条用例：Esc 关闭后断言 `document.activeElement` 可见或为该行。
2. **右键打开菜单时没有收起悬停卡片。** §7.3 要求“右键打开时 `hover.hideNow`”，但 `TreeNode`（:264-279）只在 `onClick` 中调用 `hideNow`，`FaultedWorkRow`/`FaultedWorkContext`（:380-393）、`NavigationWorkGroup`（:358）和健康行包装（:1937）都没有 `onContextMenu` 处理。悬停 600ms 后再右键，卡片可能和菜单同时显示。建议在 `NavigationContextMenu` 的 `onOpenChange(true)` 或 `TreeNode` 的 `onContextMenu` 中调用 `hideNow`，并补一条“悬停→卡片出现→右键→卡片消失”的浏览器用例。
3. **台账未登记。** §5 要求在 `docs/requirements-traceability.json` 追加 `WN-01`，但 `grep -c "WN-" docs/requirements-traceability.json` 的结果为 0。追加时注意保留其他未提交条目。
4. **WN-18′ 的 `..%2F` 偏离用例。** 用例要求返回 400，实际是 `requestSchema` 先抛出“本地路径不能越界”，`handle` 直接 reject（`tests/integration/faulted-work-removal.test.ts:202-203` 把这个行为写成了断言）。安全上没问题，渲染端也不会发出这种 id，但测试与 552 不一致，需要在 552 §G 或台账中注明这是有意偏离，不能记为“按用例通过”。

## nit

- `run()` 的 `finally`（`workspaces.ts:430`）和 `retainTask` 释放回调（:424）中的 `retireForgotten` 在当前代码下不可达：`forget` 只在 `active===0` 时才设置标记，之后 `run` 与 `retainTask` 都会拒绝。作为防御代码保留可以，但建议加注释说明，免得以后误以为测试覆盖了这条路径。WN-14c 测的是 409 加释放后重试，并没有走到这条路径。
- `forget` 中 `retire` 失败后，紧接着又对同一个 slot 执行一次 stranded `disconnect`（:298-300），共尝试两次。行为无害。
- 退役失败后，`run(id)` 先命中 `failedRetirements` 检查（:368），报“数据库关闭未完成…”，而不是“作品不在本地目录索引中”。目前不影响账本，因为该作品的位置都已标记 deleted。如果以后有代码依赖后一条文案，需要调整这两个检查的顺序。
- 退役失败且被移除的作品不再出现在列表里，但 `close()` 每次都会因为它抛错（WN-14d），用户在界面上找不到原因。只有锁目录被注入未知文件时才会发生，建议在 551 §6 风险中写明。
- 本进程自己残留的锁（pid 等于 `process.pid`）也会被归为 in-use，文案是“正被其他进程或设备打开”。551 §6 已列出这个风险，可以接受。
- 失败文案只在 `status>=500` 或无 `error` 字段时追加“关联对话可能已删除…”（:1505）。§7.3 写的是“500/冲突”，而 409 `CONVERSATION_TRANSFER_BUSY` 不会追加。实际影响很小。
- 切换 scope 时，已打开的 `remove-faulted` 对话框和 `removeError` 不会复位。在新数据根下确认删除会得到 404，被按成功处理。建议在 scope 变化时关闭该对话框。
- `openMenu` 靠 `aria-label="作品操作"` 字符串查找触发器，与 :373 存在字符串耦合，可以改成 ref。
