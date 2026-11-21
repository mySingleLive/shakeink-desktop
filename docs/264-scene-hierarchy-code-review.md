# 场景循环父级修复独立代码审核

日期：2026-10-31。审核者：独立子代理 `scene_hierarchy_review`，未参与本轮实现。范围为262方案、263用例及其审核，`novel-import-wizard-roster.ts`图算法、main清单提交/父级纠错、semantic类型、payload与专用提示、service专用请求/响应及最终校验、SH合成测试。未读取真实小说、模型配置、Key或私有journal，未调用模型；仅写本审核记录。

## 结论

**最终代码审核通过，无尚未解决的阻塞问题，可以继续主代理的受影响回归、构建及真实全文验收。** 本结论不代表《诡秘之主》真实整书导入、保存或重开已经通过。

## 已核对的行为

- `desktop/core/novel-import-wizard-roster.ts:9`迭代检测仅返回循环上的节点，不将指向循环的树枝当作修订目标；重复ID、缺失父级明确失败。`applySceneParentProposals`校验完整循环集合、32节点边界、每目标唯一proposal、外部/自指父级及应用后的完整图，只在副本改变这些目标的parentId；非循环节点及其它候选属性保留。
- `desktop/service/novel-import-ai.ts:51`独立从完整PLACE目录重算目标集合，不依赖controller单方面声明。协议限定semantic/analyze/roster/scene、空artifacts，无其它目标/锁定/修订上下文。根、proposal及evidence使用严格对象；缺漏/多项、未知键、非法父级、持续循环和无法定位引文均拒绝。null仅在该专用可选parentId位置规范化为省略，不能将一般非法值覆盖为正确值。
- `desktop/core/novel-import-ai-payload.ts`强制将全部sceneParentTargets加入有界目录及父链闭包，规范名即使没有出现在正文仍保留。main在instruction提供对应别名用于定位；专用提示要求根据真实空间包含关系修订，不将出入口、连接或相似名字当作双向隶属。普通roster及其它阶段不带该字段时继续原契约。
- `desktop/main/novel-import.ts:474`先检测完整图；无环不增请求，超过32节点明确失败，材料首批不能覆盖所有目标也明确失败。纠错只调用一次既有roster生成通道，继续使用generateJSON最多两次生成，不增加外层或自动循环重试。source/epoch与授权范围检查保留。
- 容量超限及材料预算无法覆盖全部目标的两条提示，仅在`safeError`固定消息表中精确自映射，没有扩大任意前缀或输出动态诊断。SH-04b使用合法16000上下文模型及8节点循环，实际验证预算不能覆盖全部目标时零父级纠错/零entity调用，失败提示具体可读，stash与coverage保留。
- main在临时候选上应用全部proposal，完成新图及来源验证后才整体提交；`main/novel-import.ts:461`保存失败回滚候选、stash与步骤状态。失败或暂停后的有效晚结果不会进入新清单；不先逐条改写已显示的父级。主进程结果stage门仅在专用请求中允许sceneParents。
- service最终引文逐项恢复后，使用应用proposal后的完整entities通过原`validateSemanticLinks`，不会把旧循环目录合回，也不进入普通roster的静默丢弃路径。引用可定位证明其来源归属，不等同于对所有文学事实作完备语义认证。

## 审核期间发现并已修正

初版service专用分支在验证新图后直接return，跳过原函数末端的`deps.assert`、重新resolve、signal及snapshot一致性门。已即时报告主代理与实施代理；最终代码不再提前返回，统一通过原尾部门。新增SH-02b覆盖末端撤权、snapshot变化和取消三种拒绝情形，独立执行通过。

最初独跑SH为8/9，失败是“跨批”夹具实际仍处于单批：约75k材料小于测试模型约87k的批次预算。主代理扩大第一章合成材料后，第二章的别名及反向父关系才进入后续批次，未因此修改产品接受条件。最终复跑SH-05同时验证真实跨批、别名定位、有效非循环父边保留及全部实体正常完成。

## 实际执行

明确运行时：`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`。

`node --import tsx --test tests/unit/novel-import-scene-hierarchy.test.ts`

最终 **11/11通过，0失败、取消、跳过、todo，约4.50秒**。覆盖严格请求/响应及两生成恢复/持续拒绝、最终授权门、无环零调用/容量门、实际材料预算覆盖失败、跨批完整导入、失败/保存回滚、暂停晚结果。`git diff --check`独立执行通过。

另在内存中以另一种逐路径算法核对400组确定性随机合成父图（每组40节点），循环节点集合全部一致；合法提案应用后无环，非循环节点和原输入保持。该检查不是新增400个正式用例，不与SH十一项或主代理回归数累加。

范围限定：本审核未重新执行主代理的其它定向回归、类型检查或构建。真实整书、正常退出和数据库重开须由主代理随后实际执行，不能以本审核或任何历史部分进度代替。
