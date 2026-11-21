# 绑定未证 claim 的场景修复

R43/R44 实际仍有资料保留拒绝，R44 另有原文限定拒绝。现 replace 要模型重抄坏行中的全部好资料，并可重新发明 label；新添可选、显式的 claim patch，令应用保持可核验基底，模型只解决未证部分。旧 replace/reject 的严格语义、全部负控及根结构恢复不变，不通过自动补旧事实掩盖任意自由新增。

只对能无歧义分解的优先 first-record 三数组建立 patch 资格。无法完整表示的坏形状、未知控制字段或 legacy name/aliases/primary 元数据继续原 replace；不能忽略字段来取得资格。所有原未证部分必须在清单中明确表示，否则不启用此新分支。

每个未证 claimRef 绑定完整初稿/来源哈希、原 row stable slot、kind 和原位置。提及绑定原 literal；限定绑定原 label；关系绑定原 targetIndex/relation 及完整证据义务。已证提及、完整窗口、owner、限定和关系不给可改 claimRef，作为应用私有冻结基底。模型 patch 只能逐项 resolve/reject，不传自由字符串、路径或自由 add 数组；resolve 仍只选择原私有目录的 CF，不能让模型写新 literal/label/关系端点。

唯一新 JSON 行为 `{"repairRef":"rr…","disposition":"patch","patch":{"claims":[{"claimRef":"pc…","disposition":"resolve","choiceRefs":["cf…"]},{"claimRef":"pc…","disposition":"reject"}]}}`，仍放在唯一根 `repairs` 数组。mention 的 resolve 恰好一个 CF；context/link 至少一个，所有键 strict。每个原 mention 位置、每个原 context/link 的 evidence 位置必须逐一归类为冻结基底或独立 claim，不以集合差集丢原位置；context/link 的 label/target/relation 和原分组固定。已证子证据完整保留，未证原位置各自有决定，多 CF 只展开该位置；不能用一项决定覆盖其它原位置。全未证分组只有所有位置都显式 reject 才可不组成新分组，含任何已证子项的分组不得删除；空或非法分组仍原校验拒绝。部分关系的有效引用只是冻结来源组件，不能据此把整个未证关系标为已核实；最终整体和完整复核仍强制。不能完整分类或判定资格时整行不启用 patch。

冒用判定固定键：mention 为真实 unitId/unitHash、literal 及其绝对 occurrence 范围，换窄/宽 quote 的同一 occurrence 仍是旧事实；context 为 owner 成员绑定、原 label 和完整 Anchor；link 为双方 owner 绑定、relation 和完整证据组。跨旧 owner、命中上述已证旧键、重复或无法判定是否冒用的 resolve 都拒绝（资格阶段不确定则整行回旧 replace），不能把旧 fact 当新 claim 的答案。

恰一次处理所有要求的 claim：未知、跨行、重复、遗漏、借用已证旧事实冒充新问题、无资格的 reject 或伪造 CF 都拒绝。新 patch 的 source-present 未证称呼必须解决，不通过 reject 消去；重复/歧义或无法确定该资格时不启用 patch，回原 replace，不偷偷修改旧规则。未证明的限定/关系可按明示资格拒绝，不能把它们升级成已证事实；这不证明整本小说语义完整，后续全正文/事实/归属复核仍强制。

应用把冻结基底与这些绑定决定组合成坏行，再与原不变 good rows 原子组合整个 draft。维持原 stable slot/remap、dangling 关系拒绝和全部 strict/source/owner/retention/final 门；不部分入账、不重建已冻结草稿。禁止改已证窗口、旧归属或关系来“修复”；新错误仍失败。旧 replace 继续原严格路径，不能借新 patch 放宽旧格式。

新增 disposition 与原 repair JSON/native schema 同步，实际 schema 和完整来源/原草稿/当前回复/全部 choices/keep/claim 清单均继续预算，四代及 generic 两代不变，非 stop/授权/网络/取消/用量异常不扩恢复。compact 目录/私 Map 不变。不增加自由字段或平台后备。

388/389 按序独审后限定 TDD/独立 code review/定向验证/构建，再新正常 fresh 全文。只有全部场景、完整资料复核、正常 UI 处置、发布和退出重开实际完成才能验收。
