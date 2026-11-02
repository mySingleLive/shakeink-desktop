# 定点记录修复：最小用例

2026-11-01。依据348，全部合成、真实JSON生成桥，原raw/draft只读。旧generic及第一轮接受集合不变；新修复轮期望显式更新，不把有意协议变化当产品RED。

| ID | 固定fixture | 必须断言 |
| --- | --- | --- |
| TR01 | 多good rows+bad anchor row，badrow内另有good完整长窗口/contexts/link；首选raw；第二代仅目标ref完整replacement含choiceRef | 真首失败→严格定点第二代，good rows原值保留，badrow good facts原完整窗口保留，组合新draft全过原full+344门后才返回；不把首bad直接提交，不改原raw/draft。原代码应因未支持事务而真实入口RED，非module missing。 |
| TR02 | 缺/重/未知repairRef、good-row ref、空/null replacement、整份roster、混键/ownundefined、第一轮choiceRef；替换改/丢badrow好事实或跨旧owner bridge；原关系多证据 | 全事务拒绝，原最多2gen；good provider修改无权，不以首项/路径定位。原窗口/owner/context/link及alias20/双唯一门照常执行，显式坏raw不自动映射选项；多candidate parse不提前切repair模式。 |
| TR03 | literal全包22处、同quote多处、CRLF/emoji/重叠匹配、跨片词；原完整好Anchor非最短；某occurrence无合法唯一窗口；context/link whole-unit | 全部精确可核验候选呈现，不取首/不fuzzy；choiceRef选哪条才恢复哪条，未知/伪造/混键固定拒绝。每choice经原门且绑定完整当前来源，缓存不跨text/geometry；好Anchor有精确保留选项，whole-unit须显式选，不能隐式扩邻片。完整metadata超预算失败不裁选项。 |
| TR04 | 原候选完全无grounded且所有称呼源中无；zero-grounded但一原literal存在；真实同file相邻单位分别以“书”结尾/“房”开头（含连续短单位链）；保留link指向reject；reject后前方slot消失 | 仅明确合资格reject可移除，不能通过空replace或无关改名隐删source-present候选；跨真实边界存在也不能reject，但不造跨单位anchor/choice，无合法原单位内窗口就失败。不强锁全无据幻觉。指向reject的good link不删不改指而整事务拒；badowner仅显式修复且不丢grounded关系。保留links按stable slots唯一remap，不能按旧整数直接索引压缩数组。 |
| TR05 | 完整实际二prompt含prior+所有choices，原65k+16k及v1+6000精确N/N1；非JSON/不可定位global错误、网络/abort/length/generic | 超限/不支持首1二0、固定安全错误，无截断/增cap/重试。plain/fence首draft正常，generic原默认不变；静态反馈/error不echo资料，完整prior仅untrusted数据。原profile/输入全材料/工作单位/角色及final owner授权门不变。 |

先记录实际RED节点/后置未达，再GREEN、必要原new-roster与generic回归、tsc/diff；冻结交独审，不构建App/API。单包与全文由主代理另验。
