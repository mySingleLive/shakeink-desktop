# 未证 claim patch 用例

1. 新真实 JSON/SDK桥：含已证提及/长完整窗口/限定/关系的坏行，模型仅逐 claimRef 返回决定，应用仍逐字保留全部基底，最终与原完整正确结果深等。context 只选择 CF，不能回传新 label；四代及两阶段 schema/用量/权限按实际调用检查。
2. 每个未证 claim 恰一次；unknown/重复/遗漏/跨行/改 literal、label、关系端点/冒用旧 proof/错误 CF/混坐标/无资格 reject 均拒绝，不把旧事实加回而掩盖非法决定。source-present patch 称呼不能被删，source-absent 只能按资格显式拒绝。
3. 所有原 source、完整窗口、owner/桥接、限定、关系双端负控仍过；原 replace 的删除/缩窗/挪组/错端点仍失败，旧 positive 与 direct strict 不改变。
4. 资格审查覆盖三数组的全部未证内容；未知或不能表达的字段、legacy 元数据、歧义/重复和不确定的 source-present 义务走原 replace，不静默忽略或部分采用。已证字段没有可改 ref，原 good rows 及 raw 草稿不变。
5. 原 stable slot 和 reject/remap/dangling 仍原子验证；patch 后无首轮再识别、typed/root 状态不退回，四代耗尽/非 stop/missing/unknown/外部失败保持。
6. 实际完整 claim+choices+原草稿+当前回复+native schema 的预算 N/N-1，原完整资料超额仍拒绝；不裁目录、不加预算。CF/ref/源坐标及全部证据范围均无损。
7. 新 claimRefs 只受当前冻结 draft/来源有效，改来源/顺序/版本不能重放。原 helper 可继续旧 replace 控制，新 patch 用独立显式 fixture，不隐式把旧负控变成成功。
8. 先真实功能 RED 后 GREEN；独审后本任务定向回归、类型/构建，再真实全文。公开证据只固定分类/计数/哈希，不提交小说或 Key。

合同补充控制：严格使用 388 的 disposition=patch / patch.claims / choiceRefs[] 形状；部分 context/link 子证据逐原索引全覆盖、已证子项保留且分组不丢。用不同完整 quote 包住同一个 mention occurrence 仍判旧 proof；owner、label、Anchor 或关系双端不匹配不能重放。无法逐项分类或判定借用资格的整行走旧 replace，不建立部分 patch。
