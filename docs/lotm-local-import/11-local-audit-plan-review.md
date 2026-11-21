# 本地整书审计方案独立审核

日期：2026-10-28。审核者：独立子代理 `agent-0`（只读）。未修改文件、未运行应用/模型/测试，未读取真实journal或Key。

## 结论

初审为有条件通过。方案正确放弃旧B1、8卷1394章和8目标假设，但需五项补强；已全部纳入 `10-local-audit-plan.md` 的“独审补强”：

1. 明确完整源文件4,803,440字符与筛选正文4,785,312字符的不同角色，加入non-narrative及units全源几何，禁止继承旧 `files[0].text===expectedBody`。
2. PlanningDocument 除大纲/两线外，补全reading line、9卷1402章投影、Chapter.outline/cards、事件分片及叙事完整字段。
3. Theme/STYLE/Trope改为精确行集合、归属、全部字段及无额外行检查，增加额外行和错误novelId负例。
4. ContentVersion/ContentMutation、snapshot、manifest与存储指针全字段绑定，逐项变异验证。
5. 合成fixture独立冻结，正例走完整closed-work路径；负例单变量且断言具体错误码，增加复制后、查询后和最终复核前的篡改，证明原库保护实际执行。

满足这些条件后方可进入定向RED/实现。审核本身不构成真实机械或文学PASS。
