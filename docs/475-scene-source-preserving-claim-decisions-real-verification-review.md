# 475：正常全文实测真实性独审

结论：报告、安全 JSON 和当前台账符合证据；R70 正常全文仍失败，不能声明场景阶段、七分钟、发布或重开通过。

本次独立运行只读取证复核副本，exit 0、0API；另存 `r70-reviewer-evidence-safe.json`，与原 `r70-independent-evidence-safe.json` 完整深等，没有覆写原收据。核实35个实际RPC中32成功/3拒绝；64代流全部完整、delta/done/completed相同，逐transfer/operation/payload与零API忠实重放对应，64个实际输入SHA全部吻合，重放同为32/3。正常App退出0、signal null、driver2，PID已无、pageErrors0；观察器排空并恢复。

冻结57源、8 bundle、303 renderer、47测试、25 helpers、5审核文件、runtime/driver/observer均匹配。小说字节、正文、1402章及4912个连续精确分区与R69一致。实际覆盖1188单元，部分账本778成员/559记录/538身份/70关系/0未决；artifact0、workingRevision0。这些部分计数与本地838/838不替代全文验收。计时54222ms仅为允许导入至本次失败，未改420000ms门。

状态取证重新验证四文件保存字节和receipt哈希。只有drafts变化，内容相等标志仍为false：chat仅同一空草稿ID及对应map key重新编号，原97条恢复记录全部保留，新1条RESTORE_DISABLED归档value完整深等于before.chat，其createdAt等于原snapshot时间；其它sources/autosaves/issues相同。restoreSession=false及原`draft-recovery.ts`禁恢复归档、`disabled-session-caches.ts`重置路径支持此解释。模型设置、目录、根标记字节相同；没有自动豁免draft变化，也不追补旧合成探针缺失before哈希。

三包的限定诊断由原64代重放及独立3请求/10实际输入SHA trace支持，诊断源SHA仍匹配冻结构建：第一包第二代selection被单元素数组拒绝，随后完整纠错提示固定资料66615>65536，未发第三代；第二包连续三次把selection答成claimChoices对象，被任务类型门拒绝；第三包为不存在的literal选不含该literal的窗口，第三/四代已含完整source-focus且合法域为空，来源门拒绝、未到retention。不能从这些首拒推断所有后续门已通过，也不把未发的新一代当成实际供应商答复。

原安全收据SHA-256为 `079f41020e03c79b4092249457f0152575bebeaf951dfce9b3d0fe88b466c5ad`。`requirements-traceability.json`保留actualFailed、activeRun=null、四项最终验收false及原静态outer false；历史结果没有代替本轮失败。本审核未改产品/测试、未启动App/API，未公开小说、实际回复正文或Key。
