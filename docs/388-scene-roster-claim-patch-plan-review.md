# 388 独立方案审核

最终结论：补稿复核通过，可进入 389 用例审核。

1. 冻结 patch 的 strict JSON 形状、各 kind 的 choice 数量、first-record 的确切资格，以及部分已证 context/link evidence 的原位置分类与重组规则。三数组每个原项必须无损归入冻结基底或明确 claim；无法一一覆盖、重复或歧义时整行仅保留旧 replace，不能用 proof 集合差集静默忽略 nested 项。
2. 冻结“旧 proof 冒充新 claim”的键及拒绝规则。mention 需按真实单位版本、literal 与源位置判 occurrence，缩换 quote 不能变成新提及；context 绑定 owner/label/完整 Anchor，link 绑定双端 owner/relation/完整证据。不能借另一个旧 owner 的资料解决新 claim 并形成桥接。

上述两项已由补稿关闭：唯一 `disposition:'patch' / patch.claims` strict 形状明确，mention 恰一 CF、context/link 至少一 CF；每个原位置均有基底或 claim，固定分组与元数据，含已证子项的分组不可删除。mention occurrence、context owner/label/Anchor、link 双 owner/relation/完整证据键明确；不确定时整行保留原 replace，不建立部分资格。部分关系组件仅冻结来源，不升级为已证完整关系。

其余边界接受：新分支显式、无自由 add/字段修改、原 replace 语义和 source-present zero-proof 规则不变，全部 source/retention/final 门、四代与实际完整 schema/claim/prompt 预算保留。原始数组或未证项不得在 fallback 时抹除，旧 replace 仍完整验证。未改源/测试或运行 App/API，未读取真实资料。
