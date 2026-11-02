# 场景验收驱动与作品数据库路由审查

日期：2026-10-31。执行者：子代理 `scene_fix_review`。本轮仅修改验收driver，未修改产品；未读取真实session、模型返回、正文、配置或Key，未运行实际导入/重开。

`scripts/run-lotm-wizard-import.mjs` 已补scenesOnly的关闭前完整私有checkpoint：进入conflicts、verify检查失败及driver异常时，保存 `scene-<原因>-session-private.json` 到本轮既有 `/private/tmp/` evidence目录，独占创建且权限0600。保存完整journal，不仅保留错误摘要。finally对其它失败退出补同一保全门；若仍无法保存，则保留窗口、退出码置1并记录固定 `keptOpenForCheckpoint`，避免关闭删除仅存检查点。原计时、任务/资料/正文断言及原有失败退出语义保留，没有自动解决冲突、跳过场景、裁减输入或改写业务状态。

正式 `scripts/verify-lotm-scenes-persistence.mjs` **按目标作品workspace读取**，无需改动：它使用publication.novelId访问scenes、import-record、outline及逐章GET。这四组路由在 `desktop/service/routes.generated.ts:39/77/103/119` 均为novel scope；`LocalDispatcher.workspaceFor`（dispatcher.ts:71）按catalog的novelId取得work.id；service/index.ts的start随后调用 `works.runWithGlobal(workspace)`。Workspaces使用catalog.path、作品身份及活动storage解析后，以 `join(storagePath,'database')` 连接作品数据库（workspaces.ts:315）。全局inbox连接用于共享上下文，不是这些novel GET的请求数据库。

主代理指出的私有snapshot脚本直接读取 `appRoot/inbox/database`，会选错作品数据位置；不能用该库的零记录推断正式发布丢失。建议复用正式重开脚本的本地IPC，或通过 `Workspaces.run(publication.workId)` 读取已登记作品及其活动storage；不要仅凭appRoot拼出作品数据库，也不要绕过活动storage指针。未修改或执行该私有脚本。

实际验证：Node v24.18.0对两个正式脚本执行 `node --check` 均exit0，`git diff --check` exit0。上述数据库路由结论来自源码核对，本轮没有取得实际Electron重开或整书验收的新成绩。
