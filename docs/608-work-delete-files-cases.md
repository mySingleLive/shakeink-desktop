# 608 · 删除作品时询问是否删除磁盘文件 测试用例

方案：docs/608-work-delete-files-plan.md（以 §6 评审后修订为准）。

## 集成（真实 PGlite、临时目录，`tests/integration/work-delete-files.test.ts`）

| ID | 场景 | 期望 |
| --- | --- | --- |
| WD-01 | 健康作品 `DELETE /api/works/:id` 空体 | 200 `files:'kept-by-choice'`；catalog 无此行；目录除 `database/`、锁外摘要不变；锁已释放；可 `open()` 重新加入 |
| WD-02 | 健康作品 `{deleteFiles:false}` | 同 WD-01 |
| WD-03 | 健康作品 `{deleteFiles:true,path}`，目录内另有作者文件与子目录 | 200 `files:'removed'`；目录不存在；catalog 无此行；关联会话位置已删除；`/api/novels` 不含该作品 |
| WD-04 | 请求体非法：非 JSON、数组、多余键、`deleteFiles:'yes'`、`true` 缺 path | 400 `INVALID_REQUEST`；catalog 不变 |
| WD-05 | `path` 与 catalog 不一致 | 409 `WORK_PATH_CHANGED`；不变 |
| WD-06 | 目录已移走（missing） + `deleteFiles:true` | 200 `files:'missing'`；移出列表；移走后的目录摘要不变 |
| WD-07 | 作品路径被替换为指向另一目录的符号链接 | 409 `WORK_FILES_UNSAFE`；catalog、目标目录不变 |
| WD-08 | 目录被换成同名新目录（inode 不同，含复制的清单） | 409；不变 |
| WD-09 | 清单 `id` 或 `novelId` 不符 | 409；不变 |
| WD-10 | 作品 A 目录内有已登记作品 B | 删 A 409；A、B 都不变；删 B 成功 |
| WD-11 | 作品目录内有未登记的嵌套作品清单 / 应用标记 | 409；不变 |
| WD-12 | 作品目录内有目录预留路径 | 409；不变 |
| WD-13 | 外机锁（打不开的作品，host 不同） | 409；锁与目录不变 |
| WD-14 | 存活进程的锁（本机子进程 pid） | 409；不变 |
| WD-15 | 已结束进程的遗留锁（stale-lease） | 200 `removed` |
| WD-16 | 关闭连接时释放锁失败（锁目录内放未知文件） | 409“作品数据库未能关闭”；catalog 不变；随后选“删除”可移除 |
| WD-17 | 删除中途失败：子目录 `chmod 555` | 200 `files:'kept'`；catalog 无此行；清单仍在；`protectedDirectories()` 含该目录；重试 DELETE 得 404 |
| WD-18 | 有任务运行（active slot） | 409 `WORK_BUSY`；不变 |
| WD-19 | `GET /api/works/location?novelId=` / `?workId=` | 200 `{workId,novelId,path}`；不存在 404；无参数、两个参数、非法 uuid 400；`POST` 404 |
| WD-20 | `GET /api/works/<uuid>` | 仍 404（WN-19 不变） |
| WD-21 | 与应用数据根重叠（作品路径指向数据根父目录的伪造 catalog 行） | 409；不变 |

## 单元（`tests/unit/work-delete-files.test.ts`）

| ID | 场景 | 期望 |
| --- | --- | --- |
| WDU-01 | 注入 `lstat`：子目录 dev 与根不同 | 预检拒绝；删除递归遇到时停止并抛错，不删除该子目录 |
| WDU-02 | 删除顺序 | 先其他顶层条目，再锁、清单，最后根目录 |
| WDU-03 | 每个条目前 guard 失败 | 停止，清单保留 |

## 浏览器（`tests/browser/works-loading.test.ts` 内存夹具，非真实目标）

| ID | 场景 | 期望 |
| --- | --- | --- |
| WDB-01 | 正常作品菜单“删除” | 对话框标题“删除《可用作品》”；正文问句、路径、“选「删除」只从玄印写作中删除，文件保留。”；按钮 取消/删除/删除，不保留文件；未发 DELETE |
| WDB-02 | 不可用作品菜单“删除” | 同上标题与按钮；location 用 workId 查询 |
| WDB-03 | 选“删除” | DELETE 体 `{deleteFiles:false}`；toast“作品已从列表中删除”；关闭该作品 tab；刷新 novels 与 conversations |
| WDB-04 | 选“是” | DELETE 体 `{deleteFiles:true,path}`；toast“作品及其文件已删除” |
| WDB-05 | 结果 `missing` / `kept` | 对应 toast 文案 |
| WDB-06 | location 读取中 | 显示“正在读取作品目录…”，“删除，不保留文件”禁用、“删除”可用 |
| WDB-07 | location 失败 | 显示“无法读取作品目录位置”，“删除，不保留文件”禁用，选“删除”可完成 |
| WDB-08 | 进行中 | 三个按钮禁用，Esc 不关闭，双击只发一次 |
| WDB-09 | 409 `WORK_FILES_UNSAFE` | alert 显示服务端文案，对话框保持；再选“删除”成功 |
| WDB-10 | 404 `WORK_NOT_FOUND` 且选“是” | 关闭对话框，toast“作品已从列���中删除” |
| WDB-11 | 路径只出现在对话框 | 关闭对话框后页面文本与 React Query 缓存都不含路径 |
| WDB-12 | 删除后不再调用 `DELETE /api/novels/:id` | requests 中无此请求 |

改写既有：WN-50'/50b/51'/52/53'、WN-4x 中的对话框文案与“确认删除”按钮断言改为新对话框。

## 真实目标（macOS 构建版，隔离测试根，无模型）

| ID | 场景 |
| --- | --- |
| WDR-01 | 新建作品 → 删除 → 删除：列表移除、目录完整，可“打开作品”重新加入 |
| WDR-02 | 新建作品（目录内放作者文件）→ 删除 → 是：列表移除、目录不存在 |
| WDR-03 | 截图对话框，核对文案与路径 |

## 审核后修订（docs/608-work-delete-files-cases-review.md，结论“修改后通过”）

| 审核项 | 处理 |
| --- | --- |
| 高1 外部链接 | WD-03 目录内加入指向外部目录和外部文件的符号链接，以及一个硬链接；断言外部 `digest()` 不变 |
| 高2 作品根是挂载点 | 判断提取为纯函数 `deletionRefusal`；WDU-04 用父目录 dev 不同的情况覆盖。预检中子目录 dev 不同由 `inspectDeletion` 拒绝，删除中遇到时由 `removeTreeOnDevice` 停止（WDU-01） |
| 高3 同 pid 锁 | WD-14b：同进程另一个 `Workspaces` 实例持有锁时返回 409，会话不变；锁目录是符号链接或 `owner.json` 无法解析时都返回 409。WD-13 中的 `pid === process.pid` 遗留锁也返回 409 |
| 高4 边界 | WDU-05 只用纯函数覆盖 `/`、主目录、卷根、数据根、引导目录，不对真实路径执行删除；WD-21 改为独立的 `outer/data` 构造，`outer` 中没有其他作品，断言文案为“应用数据目录” |
| 中1 不变 | 拒绝类用例统一用 `assertRefused`：返回 409 `WORK_FILES_UNSAFE`，响应不含路径，作品仍在列表中，会话不变（WD-14b、WD-16 断言会话） |
| 中2 WD-17 | 断言完整响应体为 `files:'kept'`，`run()` 仍被拒绝，`database/` 已删除，清单仍在；`chmod` 在 `finally` 中恢复 |
| 中3 注入接口 | 导出 `removeTreeOnDevice(path, device, fs)`、`deleteWorkFolder(target, fs)`、`TreeFs` |
| 中4 EACCES / ENOTDIR | WD-06b（父目录 `chmod 000` 时返回 409）、WD-06c（父目录变成文件时为 `missing`） |
| 中5 响应不含路径 | `assertNoPath` 用于 WD-03、WD-17 和所有拒绝类用例 |
| 中6 竞争 | WD-22（两个 DELETE 同时发出，结果为 removed 和 404）、WD-23（删除与 open 并发，catalog 中每一行的目录都存在）、WDB-13（迟到的 location 响应不会显示在下一个对话框中） |
| 中7 夹具与旧用例 | 夹具记录请求体，location 有可配置的响应和闸门，DELETE 也会移除健康作品；WN-10 的响应体加上 `files`；新对话框按用户选定的简短文案执行，不再保留 stale-lease 提示（选“是”时，已结束进程留下的锁可以安全删除，WD-15） |
| 低1 | WD-04 补充 `{}`、`{deleteFiles:false,path}`；WD-19 补充大写 UUID、重复参数，以及 `DELETE location` 返回 400 `INVALID_WORK_ID` |
| 低2 | WD-09 拆成 `id` 不符和 `novelId` 不符两条；WD-11 覆盖三种标记文件；台账见 WD-608 |
