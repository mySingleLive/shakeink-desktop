# 场景清单：定点记录修复事务

2026-11-01。347/R33真实两代仍失败；32个首代anchors均选旧raw，8个bad rows，其中一literal在当前包全无。次代虽独立fullschema合法，仍改了原本正确的完整引用窗口而被344保留门拒绝。仅继续重发全清单不足以修复。

## 最小事务

仅既有new-roster scope。第一份可严格定位的roster JSON草稿及stable slots深冻结，原raw文件不改；沿原parseJsonOutput候选/fence规则，不猜补非JSON。应用识别所有编译/原逐row门失败的slots，生成opaque repairRef→原slot私Map。已验证rows不列入清单，provider不能修改。若首份无法严格定位、全局错误不能归因row或清单为空而整份仍失败，固定失败，不退回stateless全文重发。

第二代唯一输出严格`{repairs:[{repairRef,disposition:"replace",replacement:完整row}|{repairRef,disposition:"reject"}]}`；每个指定repairRef恰一次，不漏/重/新增，不接受roster、自填路径或good-row ref。replacement至少一mention，不能null/空记录/0条来删slot。模式只在实际第二代hook翻转，不随原parser多candidate校验提前改变。

原draft不修改：应用在新副本按私Map替换bad slots，reject必须显式且通过下述资格门。随后全份新draft过原wire/编译/canonical/validateSceneRosterRecords及344完整窗口、所有owner双向精确投影、context/link保留和原final/main门，全部通过后才返回结果。不是采纳首bad结果，也不把未经全份验证的部分拼为成功。

## 选项与无据拒绝

对badrow声明的literal/name/alias，逐字搜索**当前全部units的全部重叠位置**，不取首、不fuzzy、不跨单位改绑。优先复用已能通过原双唯一的fragment；其它occurrence构造确定性连续window并调用原门验证：literal恰一次、quote在该unit唯一、Unicode/CRLF边界安全。可先取不含相邻同literal完整出现的最大安全窗口，再按固定顺序缩短且每步保持原门；无合法window则不造选项。全部实际可核验候选进入目录，按source/window去重共享，不截首N项；超预算即失败。

选项用opaque choiceRef精确私Map绑定原Anchor；已有fragment可引用当前ref避免重复原文，新增window才提供其完整quote。context/link另有明确whole-unit选项，选择时恢复完整unit.text，不靠模型计算边界。**badrow内已核实的完整原Anchor也必须有对应choiceRef及保留标记**，即使不是最短/fragment窗口，方便原样保留而不抄raw。所有选项均不可由provider自填或修改，不自动选任何候选。

仅修复轮新增严格anchor `{choiceRef}`；原raw/ref/halfopen在原义下可用，第一轮和公共canonical不接受choiceRef。replacement中choiceRef由应用精确恢复后再进原wire门，不重解释错误raw。choice/ref哈希带版本、冻结draft/单位hash/geometry/window，重复key静态拒绝；表私有、冻结、返回Anchor副本，无旧ID缓存。

reject资格由应用证明：原row无任何已核实grounded事实，且其所有声明literal/name/alias在当前全部units及可证明同file真实连续单位的原文边界/连续链中均无逐字匹配。连续边界检查仅用于保守阻止错误删除，绝不合并unit、造跨单位anchor/choice或放宽原门；若称呼仅跨边界存在而无合法单位内窗口，保持失败。只无grounded但任一原称呼存在时不能reject；这种zero-grounded row的replacement必须真修原source-present称呼，逐个以有据mention保留，不得改成无关新literal作隐性删除。没有可通过原门的窗口就失败，不伪造来源。非zero row中的合法事实仍344原门完整保留；不把未核实幻觉强锁为真值。

## 稳定关系与边界

所有原links.targetIndex先解析为原stable slot；replacement仍按该冻结slot编号解释，不按删除后的新数组猜编号。最终保留slots确定后由应用唯一映射到新targetIndex，允许只为表示变化重编号，原endpoint/关系/证据不变。good row若指向reject slot，事务固定拒绝，不自动删link/改指其它row；bad link owner可在其已声明replacement中显式修正，但344已grounded关系不许丢。第一版不扩good-row依赖编辑closure。

完整prior、bad-row清单、固定错误指导、全部choice metadata均计入**实际完整第二prompt**的原65KiB fixed门并另保留16KiB wrapper；v1还过实际UTF8+6000≤有效contextWindow（0/未知16000）。不截资料/候选、不缩包、不增常量、cap、次数、role或thinking。原两代上限及网络/取消/最终授权保持，预算/不支持情形首1/二0明确失败。

文件预计：service及小pure targeted-repair helper、retention helper必要复用、新tests；generate.ts既有hook复用，除必要小接线不改generic默认。若需要逐row验证，只在core scene-identity等价提取原循环的一项入口，原whole shape/容量/所有拒绝门原封保留；不改main/shared/ledger。349独审后TDD及独立code review，再实际单包/全文，当前仍未准入全文。

实施澄清：repairRef显式绑定draftHash+stable slot；choiceRef按版本/source hash/geometry/window稳定，当前draft权限由私Map实例绑定。同一来源窗口可跨事务同ref，但不得全局缓存或在当前表缺失时解释旧ref。
