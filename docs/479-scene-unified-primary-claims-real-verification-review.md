# 479：R72正常全文实测真实性独审

结论：报告、安全JSON与最新台账符合证据；R72实际失败，场景阶段、七分钟、完整复核、发布及重开均未通过。

独立运行只读checker副本exit0、0API，另存`r72-reviewer-evidence-safe.json`，与原独立安全收据完整深等（SHA-256 `92c3b0f8a9ffa1817c4933eb9f723c8b0d6e178cbe4c500937943583498ceb5b`），未覆写原证据。核实33个RPC中31成功、2拒绝；59代完整/closed/completed、delta/done/completed相同，逐transfer/operation/payload与零API忠实重放对应，全部59输入SHA相同，重放仍31/2。正常App0/signal null、driver2，PID已无、pageErrors0；观察器排空、无缺失/歧义/解析/写入/容量错误并恢复。

R71产品manifest的57源、8 bundle、303 renderer、49测试、25 helpers、5审核文件，R72恢复补充11项、runtime和observer全部匹配。driver逆替唯一baseline路径精确回原driver；恢复候选与旧R70快照及原GB18030来源完整相等，仍明确不是恢复原baseline字节。R71只发生App前预检中止，不计一次全文成败。R72首次consent至失败49127ms，原420000ms不变；这是失败所耗时，不是性能目标通过。

原9468472字节、raw4803440 UTF16、正文4785312及原SHA、1402章和4912个精确分区均保留。部分coverage1156、774成员/551记录/535身份/49关系/1未决，artifact0、workingRevision0、skip/drop0；这些部分结果不作全书完成凭据。

两失败的限定诊断有两请求/六实际输入SHA trace与冻结源哈希支持：同literal两个未证mention选到同一occurrence，原new-mention-duplicate拒绝，下一完整重试固定资料69970>65536，未发第三代；另一包两个context位置同时选唯一相同窗口，连续三次被group-window-duplicate拒绝，准确反馈已存在，后者预算均fit。Native形状及单项域通过不等于联合合法；两包未到retention首拒，不推断其后续门通过。反事实不替换原实际答复或失败。

R72 before四状态文件逐字等R70 after；after仅drafts变化。明确保留draft内容false：同一空chat草稿ID/key轮换，原98恢复项全部深等保留，新第99项RESTORE_DISABLED完整value等于before.chat；其它sources/autosaves/issues相同，restoreSession=false与已审原禁恢复归档路径相符。模型配置/catalog/根标记字节不变，无自动豁免draft内容变化。

最新台账已更新R72 actualFailed、activeRun=null及正确计数范围，保留R70历史和R71预检记录；本地868项及478审核通过与本轮实际失败分别记录。本审核未修改产品/测试，未App/API，未公开原文、实际开放回复或Key。下一方案仍须另行按序审核，本事实审核不构成实施准入。
