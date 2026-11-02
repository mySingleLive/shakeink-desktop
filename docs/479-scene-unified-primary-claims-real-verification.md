# 479 · 统一主生成格式正常全文实测

结论：R72正常全文导入仍失败。33个场景识别RPC中31成功、2拒绝；59代完整且零API回放输入SHA全部相同。未跳过失败项，未进入场景实体导入、完整复核、发布或重开。868项相关测试、类型/build及478独审通过，与真实全文失败分别保留。

R71最初仅在启动App前因旧临时基线缺失而中止，0App/0API/0consent，不计全文成败。478补充独审核对恢复数据与已审R70 immutable快照、原GB18030全文及1402章完整相同后，R72使用全新label/target/state目录。产品仍是冻结R71：57源/8 bundle/303 renderer/49测试/25 helper/5 review全部hash匹配，R72补充11项也匹配。driver仅替换基线路径，逆替后逐字原driver；业务步骤、计时和断言未改。

实际consent 2026-11-01T16:48:34.767Z，失败16:49:23.894Z，经过49127ms；16:49:26.409Z正常关闭，App0/signalnull、driver2。原420000ms未重置或放宽。129个完整计划包中33已实际调用。

两包所有选值均在各自单项域内，Native结构也通过，原联合门正确拒绝：一包同literal的两个未证mention连续选同一unit/window/occurrence，触发new-mention-duplicate；冻结第二代fixed65433B只余103B，下一次完整重试fixed69970B超过65536B共4434B，未调用第三代。另一包两个context位置的唯一eligible均为同一个完整窗口，虽均允许显式reject，第二、三、四代仍同时选择该窗口，触发group-window-duplicate；准确冲突反馈均已送达。后者fixed31080B/schema635B/context323696B均fit，非预算或单项域错误。两包未到retention首拒，无HTTP、length或缺流原因。

59/59 captures均complete/closed/completed且delta/done/completed完全相同；33条实际payload与计划精确绑定，零API忠实重放同为31接受/2拒绝。观察器pending、missing、ambiguity、parse/write/limit错误均0并已恢复。未用后来的反事实替代原失败。

原文件9468472字节SHA04e1a336e29d8437de3f2bd68ffe09f84befebe0748b8750e8f84caeebdd964e、raw UTF16 4803440、正文4785312/SHA81d901770a84a1280664fa77dbf30922aa5b8d52a208417af0c99dbb7ad07414、1402章/4912精确分区保持。部分覆盖1156，账本774成员/551记录/535身份/49关系/1未决、artifact0；这些不是完整导入结果。

状态逐文件原始before/after已保存：before四文件逐字等R70 after；after仅drafts变化。逐值证明空chat仅draftId及saved key同向轮换；原98条恢复记录全部保留，新第99条RESTORE_DISABLED.value严格等before.chat。restoreSession=false，其它source/autosave/issue不变；模型配置、作品catalog及根标记字节未变。明确保留draftContentUnchanged=false，不自动豁免变化。

独立安全收据 `/private/tmp/shakeink-scene-import-20261031/r72-independent-evidence-safe.json`；精确失败收据 `r72-failures-diagnostic-safe.json`；原payload/replay/完整流和会话在私有隔离目录600保存。公开报告不写原文、开放模型回复或Key。当前代码和工件冻结，下一步只在零API证据基础上重新审核联合约束表示和完整预算；全文、7分钟、发布、重开均未通过。
