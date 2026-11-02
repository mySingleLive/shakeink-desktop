# R27场景阶段独立核验

2026-11-01，`scene_fix_review`只读核对R27的`scenes-completed.json`与场景结束私有检查点，并调用原native mapping、比较冻结章节/正文及18项构建哈希。未操作App、调用API、修改产品或执行草案。

**场景阶段核验通过；完整导入尚未验证通过。** [标量记录](r27-scene-stage-review.json)明确将full review、publication及reopen保持为false，不能用本阶段结果代替它们。

- 1055候选全部选中；1055个唯一entity任务全部done，与1055个场景artifact的ID集合精确一致，确认名称逐一相同。没有用预过滤任务集合隐藏其它状态或条目。
- 全部为PLACE；282个父关系逐项等于确认候选，零缺父、零循环。原native mapping完整投影1055项，mapping warnings为0。
- 5589个工作单元全部具有场景识别coverage；失败、跳过、丢弃及场景结束快照page error均为0。
- 实际原始TXT的SHA-256与冻结源基线相同；原/工作正文逐字相等且匹配冻结body hash，workingRevision为0。1402章标题、卷、范围及每章正文切片均逐一匹配原基线。
- 本次场景计时297560.754958ms，小于原420000ms门；entity计时266093.450125ms。没有提高阈值或将后续完整review耗时混入此阶段结论。
- 当前18项冻结source/dist/相关文件全部匹配[构建身份](build-identity-r27.json)，该身份文件SHA-256为`2f60e56ff2f915bfdb4b2aa31e6e8f6c801667f006502d24e84b3c41ad49e771`。

场景资料text的UTF-16字符数按nearest-rank统计：p50为496、p95为1734、最大7407。此处仅作输出形态观察，未将长度设为正确性、完整性或是否复写的验收门，也不据此认定所有模型语义判断正确。

核验使用Node24本地JSON/哈希和原native映射函数，无网络、数据库写入或新App；公开文件仅含计数、布尔及哈希，不含名称、原文或Key。后续完整body/facts复核、作者冲突门、正常发布/退出与重开仍须按实际结果另验，旧轮记录不能合并为本轮完整通过。
