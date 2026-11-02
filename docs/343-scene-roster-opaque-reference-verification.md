# 精确ref实现、实际结构通过及保留缺口（343）

2026-11-01。340/341独审后OR真实旧代码RED18节点（10pass/8fail；函数不存在与功能入口失败分列，4后置子项未达）；OR22+FA29+RC17合并68/68，作者相关10文件254/254，主代理最终含CI/UI/closure的10文件227/227，重叠不相加。作者与342独立tsc/diff0，桌面build0；不使用全仓测试或Mock作实际供应商结论。

最新controller.stageRequests完整计入ref metadata后，全书仍是原5589 units，129包；首40 units、payload244917字符，SHA401cd879de5cfd243c867117c5f5b38ba5fe80b269516028c573681180ddc3f8。新私有helper重新bundle、旧版本保留，原保护产物构建时不变。正常只读role/DB与metadata拒写/state hash及退出门均在。

## R32当前接口实际：结构通过，但不作为完整通过

2gen均stop，第二代通过generation、原source/full/canonical及service-final，返回10个canonical records；正常app exit0、state hash不变。然而原始回复保留检查发现：第一代27条/48提及/9context，第二代10条/11提及/5context。此例原始两代links均为空，可直接逐行用原完整generation schema验证首代记录；26条完整通过、42个distinct精确mention+Anchor键，第二代只保留11个，丢31个。此诊断没有部分导入/修改raw，也不将第一代全部坏候选当事实；它证明大量原门已验证的数据被下一代缩减，不能拿结构成功当‘所有场景完好’。

当前generateJSON的纠错只发原prompt+错误路径，并不把上一份JSON交第二代；源代码支持stateless重做的判断。下一步344/345评审有界完整prior数据与已验证信息保留门，不能只数records/mentions，也不能锁死完全未锚定的幻觉。新鲜全文仍止于R28，R29—R32均为独立诊断，没有发布/重开验收。

另独立合成实际controller/service短引文闭环5/5证明3、4字精确quote可以正常完成ref roster→原生entity→verify；错unit/owned范围外真实短quote均0gen拒绝。没有‘全部quote必须8字’矛盾，无需修改产品；这不证明短quote充分支持任意完整场景事实。
