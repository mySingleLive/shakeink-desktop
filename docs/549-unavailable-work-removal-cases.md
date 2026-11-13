# 549 · 删除不可用作品 测试用例（对应 548 方案）

编号 UW-xx。“集成”位于 `tests/integration/works-loading.test.ts`（追加，真实 PGlite 作品库与隔离临时目录）；“浏览器”位于 `tests/browser/works-loading.test.ts`（追加，真实 `SidebarTree` + `UnavailableWorks`，fetch 夹具）。全部使用合成资料。

## A. 服务端

| 编号 | 类型 | 输入 | 期望 |
|---|---|---|---|
| UW-01 | 集成 | 两个作品，其一目录被改名（unavailable）；`DELETE /api/works/{id}` | 200 `{ok:true,novelId}`；catalog 不再含该行；`GET /api/novels` 的 `unavailableWorks` 为空、健康作品仍在；改名后的目录内文件字节不变 |
| UW-02 | 集成 | 遗留写入锁作品（stale-lease）删除 | 200；锁目录与 owner.json、作品清单字节不变；列表不再含该作品 |
| UW-03 | 集成 | 健康作品调用删除 | 409 `WORK_AVAILABLE`；catalog 字节不变；作品仍可读 |
| UW-04 | 集成 | 未注册 uuid | 404 `WORK_NOT_FOUND`；catalog 不变 |
| UW-05 | 集成 | workId 非 uuid（如 `abc`） | 400；catalog 不变 |
| UW-06 | 集成 | inbox 中有指向不可用作品的会话位置；删除前 `GET /api/chat/conversations` 失败 | 删除后会话列表 200 且不含该会话；其他作品/未绑定会话保留 |
| UW-07 | 集成 | UW-06 之后关闭并以新 `Workspaces` + 恢复流程重启 | 启动成功；会话列表仍 200；恢复结果对该删除为 pending，不抛错 |
| UW-08 | 集成 | 删除后把目录改回原名，用“打开作品目录”(`works.open`) 重新加入 | 作品重新出现在 `novels`；已删除会话不出现 |
| UW-09 | 集成 | 同一 id 删除两次 | 第二次 404，不抛 500 |
| UW-10 | 集成 | 错误响应正文 | 不含作品目录绝对路径或临时目录名 |

## B. 界面

| 编号 | 类型 | 输入 | 期望 |
|---|---|---|---|
| UW-20 | 浏览器 | unavailable 作品 | 显示“删除作品”按钮；works 视图与其他导航视图均可见 |
| UW-21 | 浏览器 | stale-lease 作品且有修复桥 | “修复作品锁”与“删除作品”都可见 |
| UW-22 | 浏览器 | 点击“删除作品” | 打开 React 对话框（role=dialog，标题“删除作品”），正文含作品名、“作品目录中的文件不会被改动”；未发请求 |
| UW-23 | 浏览器 | 取消 | 对话框关闭，未发 DELETE |
| UW-24 | 浏览器 | 确认，服务端 200 | 只发一次 `DELETE /api/works/{workId}`；重新读取 `/api/novels`；作品消失；对话框关闭；该 novelId 的 tab 被关闭 |
| UW-25 | 浏览器 | 确认，服务端 409 `{error:'作品已可正常打开，请使用作品菜单删除'}` | 对话框保持打开并以 role=alert 显示该文案；可再次确认 |
| UW-26 | 浏览器 | 删除请求挂起时连续点击确认 | 只发一次请求；确认按钮禁用；“重新加载作品”“修复作品锁”禁用 |
| UW-27 | 浏览器 | 修复作品锁进行中 | “删除作品”禁用 |
| UW-28 | 浏览器 | 无 `window.desktop`（Web 环境）且 reason=unavailable | 仍显示“删除作品”（该端点由本地服务提供，Web 返回错误时按 UW-25 显示） |

## C. 回归

- `tests/integration/works-loading.test.ts`、`tests/browser/works-loading.test.ts`、`tests/browser/sidebar-navigation.test.ts` 现有用例全部通过。
- `npm run typecheck`、`npm test` 全量通过。
- 真实目标系统：构建安装版，用隔离数据根制造一个目录缺失作品，在界面中删除，截图留证。
