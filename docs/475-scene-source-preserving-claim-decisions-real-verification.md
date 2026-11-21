# 475 · 完整 claim 决定正常全文实测

结论：R70正常全文导入仍失败。35个场景识别请求中32成功、3拒绝；流程停止，未跳过失败项，未进入实体导入、完整复核、发布或重开。R70本地838项、类型检查及构建通过，与实际全文失败分别记录。

冻结构建为 `docs/scene-import-verification/build-identity-r70.json`：57源、8 bundle、303 renderer、47测试及25 helper在独立实际证据核查中全部匹配。实际从正常“允许分析并导入”开始，2026-11-01T15:50:04.905Z至失败15:50:59.127Z为54222ms；15:51:02.442Z正常退出，App0/signalnull、driver2。未修改原420000ms验收计时。

35个实际RPC均与原129包计划的payload绑定。64代捕获全部complete/closed/completed，delta/done/completed文本一致；零API忠实重放的64个输入SHA均匹配，结果同样32接受/3拒绝。没有将离线反事实或历史接受计为本轮供应商成功。观察器无pending、缺失、歧义或写入错误，关闭和恢复完成。

三失败的已核首因：一包第二代selection收到单元素数组，原闭合线格式拒绝；其冻结第二代prompt固定资料65530B，下一轮完整纠错与失败答复使固定资料66615B，超过原65536B上限1079B，因此未调用第三代。另一包第二、三、四代把第三个selection任务连续答为claimChoices对象，原任务类型门均拒绝。第三包第二、三、四代虽过Native形状，却为原文不存在的literal选择无该称呼的窗口；原来源门拒绝，第三、四代已实际提供完整source-focus及空合法域。固定原端点/形状等保守回退保持，未自动猜数、改字或丢弃资料。

保留证据：原小说字节SHA为 `04e1a336e29d8437de3f2bd68ffe09f84befebe0748b8750e8f84caeebdd964e`，正文SHA为 `81d901770a84a1280664fa77dbf30922aa5b8d52a208417af0c99dbb7ad07414`，1402章和4912个精确正文分区与R69相同。覆盖1188单元，部分账本778成员/559记录/538身份/70关系/0未决；这不代表全书场景已完成。场景artifact0、workingRevision0、skip/drop0。

新状态取证保存四文件原始before/after与逐文件哈希，模型设置、作品目录及根标记字节保持。仅drafts.json变化且内容变化没有被豁免：逐值证明chat仅空草稿ID和其map key同向轮换，其余active字段相同；原97条恢复记录完整保留，新增1条RESTORE_DISABLED归档的value严格等于before完整chat。restoreSession=false，与正常启动归档路径相符；其它source、autosave、issue相同。原R70合成探针的outer false保持，不追补其缺失before哈希。

私有证据均保留600：`r70-normal-requests-private.json`、`r70-normal-offline-replay-private.json`、`r70-independent-evidence-safe.json`、正常前后状态目录及 `evidence/scenes-r70-complete/`。正文、实际开放回复与Key不进入公开报告。当前源冻结，继续零API精确诊断和下一方案审核，不重发本轮测试或声称用户目标已完成。
