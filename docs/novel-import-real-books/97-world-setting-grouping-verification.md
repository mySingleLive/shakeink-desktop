# 世界观归属修复验证

日期：2026-10-27（Asia/Shanghai）。结论：**RB-WORLD-FIX01通过**。截图中的旧测试作品现为一个“小说世界”，原七项内容作为该世界的设定保留：社会环境五项、人文环境两项。新导入增加相应业务指导，有依据的多世界结构仍保留。

本结论只覆盖这次归属问题。旧S01整书文学验收仍为FAIL；S02新D1已实际发布、查库并重开，机械保存通过，独立文学验收仍为FAIL。其余小说及正式LIFE测试尚未完成。

## 审核与定向检查

- [94方案及用例](94-world-setting-grouping-plan.md)、[95最终方案审核](95-world-setting-grouping-plan-review.md)、[96最终代码审核](96-world-setting-grouping-code-review.md)均完成。95保留首轮三项P1历史；96保留启动租约、恢复回执两项P1及修复后的通过记录，最终无剩余P1/P2。
- 最终定向检查：NI-A07–10为16/16、NI-WR01/02为23/23、NI-SEM-P01为1/1，均无跳过。WG-CR02修改后只增量复验WR，沿用同SHA的A10/SEM信用。**未运行全量测试。**
- 全项目类型检查、独立审计脚本类型检查、桌面构建均exit0，见[最终构建记录](evidence/world-setting-repair-wg-cr02-root-build.json)。原AI响应校验、正文处理、publisher、UI样式、PDF worker与五个Monaco资源保持。
- 最终实现与测试指纹见[WG-CR02冻结记录](evidence/world-setting-repair-wg-cr02-freeze.json)，实际七项分类另经[独立语义小审核](reviews/S01-legacy-world-setting-grouping.md)。

## 唯一实际作品

只处理 `RB-S01-20261026-0355`，workId `6d6d3c82-bc69-4641-b710-5efdba574200`，novelId `cmvobvvvt000loo6vdretjykm`。没有迁移其他作品、修改原小说文件、旧导入journal或原NOVEL_IMPORT快照/回执。

证据目录：`/Users/dt_flys/Documents/拆书/真实小说导入测试-20261026/执行证据/S01-20261026-0355/`。完整原文和实表记录仅在该隔离目录，不进入仓库报告。

1. 从原实表导出准备显式计划，canonical planHash为`42bdf2ecfcc0b4215e8b7bac7a4acf506695bcabd628c95e415678938e3d5a62`；准备阶段未打开数据库。
2. 首次预览遇`WR_CLI_WORK_LEASE_STALE`，工具停止且无业务写入。随后使用应用已有“修复作品锁”流程，仅对该目录确认已退出的原进程40433，界面报告恢复成功；重启后正常退出，再核对两个写作应用均未运行。没有手动删除锁或处理其他作品的遗留锁。
3. `world-grouping-dryrun-02-world-setting-repair`实际预览exit0，cleanup closed。七旧World与计划完整基线一致，其他13组业务记录与历史隔离实表逐对象一致；原正文2723字符逐字保留，UTF-8 SHA256为`b6360470a56ab29b0c8a1e327db72ac552651b206a63b1392dd94749e8381d4a`。
4. `world-grouping-apply-01-world-setting-repair`事务提交exit0，cleanup closed。生成一个空介绍的中性世界与七条Setting，七个原名称及description逐字转为`content.text`。Setting表合计8条，包括原有STYLE一条。原13组保护数据及原导入审计不变。
5. `world-grouping-verify-01-world-setting-repair`再次读取实表与原回执，结果和首次提交逐对象相同，无重复转换。实际snapshotId为`a3e92445-21d0-4b6e-98ae-13e0fc9167d8`；beforeHash为`d6bb707db21a3fa4cb155b678c7464ea74ef642f2f76995c14aeaa3b1e253899`，afterHash为`13c3cfed7f962b05d9870a196a3de388a4092bdc9e78f88786fa5fad5d3c53ec`。

原七项内容、原导入材料facts/evidence、13组保护数据及回执方向另经[实际数据独立审核](reviews/S01-legacy-world-setting-actual.md)通过，未把JSON推断成UI实测。

## 原生界面验证

重新启动当前构建，使用CUA操作真实macOS Electron界面。为获得完整AX树，仅本次启动附加`--force-renderer-accessibility=complete`，没有改产品默认配置；这是[Chromium可访问性测试支持的开关](https://www.chromium.org/developers/design-documents/accessibility/)。

- 在该作品的世界观分组中，实际只有一个“小说世界”按钮；旧七标题不再是独立世界按钮。
- 打开这个世界，社会环境列出五项、人文环境列出两项，七个v1条目均出现；截图同时确认实际分组。
- 分别打开“鲁镇酒店格局与温酒习俗”和“酒价、下酒物与铜钱消费”，设定名称输入框与原Markdown编辑器均可编辑；切换预览后，实际显示的完整文本与已提交`content.text`逐字相同。
- 本次没有改写或保存业务内容，没有点击AI生成。这里只验证原编辑界面可打开及读取，不将其表述为真实编辑保存回归；保存行为由隔离原生发布用例覆盖。

运行证据包含`world-grouping-*-independent-assertions.json`及`world-grouping-ui-verification.json`。UI报告的“未写入”指未进行业务内容编辑；打开标签、预览/编辑模式等正常界面状态不属于这项断言。

截图问题已修复，后续继续原真实小说测试任务。
