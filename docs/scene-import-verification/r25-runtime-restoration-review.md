# R25隔离运行时恢复独立核验

2026-11-01，`scene_fix_review`只读核对启动失败日志、当前Playwright launcher、恢复记录及本地bundle文件树。未复制或修改运行时、产品、配置、Key或测试，未启动App/模型；本次仅新增此核验文档。

**恢复核验通过，无阻塞。** 完整来源为仓库`node_modules/electron/dist/Electron.app`，版本44.6.0。恢复的`LotmVerification.app`逐项结果：

- 共256个普通文件：255个文件内容SHA-256与来源完全相同；主`Contents/Info.plist`另做完整属性比较，唯一差异为`CFBundleIdentifier=ink.shakeink.lotm-verification`，Name/DisplayName及其它属性不变。不能将此记录说成“排除Info后256个文件hash相同”。
- 14个symlink目标、310个目录的树结构及全部权限模式与来源一致；核对没有跟随symlink修改来源。
- 主二进制SHA-256仍为`c9da78c3c79b9e6d6714fbf2a1136c4eb4a93cc5edad0f8ccfb058d681325e7e`，与R24冻结身份相同。模型配置及Key未因恢复而改动。

旧损坏bundle已作为`LotmVerification-damaged-20261101.app`保留。独立读取确认其主Info.plist缺失，Resources仅剩1个条目，Contents修改时间为`2026-10-31T16:00:00.762Z`（本地11月1日00:00）。这些事实支持“临时目录静态资源被清理”的判断，但本核验未读取系统清理日志，不认定具体删除机制。

首次R25启动日志显示Node inspector已连接，但没有到达Chromium的`DevTools listening`。Playwright在等待端点时收到stderr关闭/进程退出会统一抛`Process failed to launch`，其catch随后尝试进程组SIGKILL；日志中的`kill EPERM`来自该清理路径，是次生错误，不能单独视为原始启动原因。该次子进程退出1，没有窗口/session/模型结果，不记为导入或供应商失败。

主代理实际恢复后最小原生测试报告`NODE_READY`、`APP_READY`及正常退出0，模型调用0；这是主代理实测，本审核者没有重复启动。正式R25应记录恢复后的运行时来源和本次身份，不覆盖首启动失败或R24证据；恢复及启动成功不等于整书验收通过。

核对依据为私有`r25-runtime-restoration-private.json`、保留bundle及完整来源树；仅输出版本、计数、哈希及固定身份。执行Node24只读递归hash/属性/权限断言和本文件限定diff检查，不触发应用、模型或配置写入。
