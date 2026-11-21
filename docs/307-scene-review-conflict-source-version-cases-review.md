# 场景冲突来源版本绑定用例独立审核

2026-10-31，独立审核者 `scene_hierarchy_review`。已先通过306方案独审，再审核307最小用例及本轮docs-only补充；未参与测试/实现，未执行尚未编写的新用例、读取真实小说或私有数据、调用模型或启动App。

**SV01—03设计通过，可按原顺序进入RED。** 源码工作须待主代理确认R23正常收尾；旧hash不代表新代码已被真实验收。当前R23已退出由主代理确认，不记为本审核独立操作。

- **SV01**通过真实JSON桥验证setting-body source和source-source两侧绑定，保留实际候选提案及原kind/hash/status；完整长字符串、空值、同文异ID、跨包index与原对象不变均有明确正控。canonical来源回到真实semanticDecision后，须到达版本比较后的fail-closed边界，不能仅看parse成功。建议的semanticRepairs钩子在clone回写owner或writer前抛出固定哨兵，能证明比较通过且owner/AI/write为0；错误旧source.value必须先在原固定版本门拒绝而到不了该哨兵。
- **SV02**覆盖严格单键、混合/未知/undefined、索引边界与字段范围，实际第二轮最多两生成。facts缺省不补空；同ID重复值不一致拒绝。补充的schema不同但其它投影/hash相同反例能独立证明新身份门，避免旧投影校验遮蔽。完整连续text/重叠一致正控与缺口/无range/重叠不一致负控完整，不能以只测拒绝实现成全部不支持。
- raw已知字段未完整展示的固定拒绝/defer是有意新增合同，不以旧golden全部保持掩盖。完整raw.value不等仍拒绝，首坏raw→次合法index只使用原纠错额度；raw.text允许原格式，setting-body候选保持真实提案。实际反馈的250字符、完整指导及秘密/原文/名称/ID/cause不回显须检查真实纠错段，不只读常量。
- 作者解释、其它scope、body-body无artifact的unit形式与原RA分支、原kind枚举及missingTargets隔离均保留。原UR/RA回归负责旧证据细节，无需复制全部矩阵。
- **SV03**保留完整payload材料，仅增加当前数组index/字段名；先证原预算可用再使新增metadata越界，零调用，不裁材料、借text容量或隐式拆包。真实生产默认接线和主/service同一序列化须在代码审核确认，不能仅测helper。范围/投影/锁定、末端授权或取消及来源后来变化的原决定拒绝覆盖合理；报告锁定字段矛盾本身不能被误判为一律非法。

RED/GREEN记录须准确指出已到达的断言；若前置尺寸门或夹具问题阻止到达版本边界，不能称后置用例已红/已绿。新helper不读owner补字段、不追改旧冲突、不清coverage或作者决定；索引正确不保证文学互斥判断成立。

本结论仅批准用例设计，不认证实际模型、原生保存或完整导入。R23另一个长fact尺寸错误交308/309处理；所有工作单元/冻结facts、正常作者处理、publish与reopen仍须新构建的真实结果支持。
