# 新导入顺序方案独立审核

日期：2026-10-28。审核者：独立子代理 `agent-3`（只读）。未运行应用/模型/测试，未读取真实journal或Key。

## 初审与补强

初审有条件通过，指出八类必须修正，已在16/17落实：

1. 连续覆盖不能证明无缺章：每候选必须cut或ignoredStarts，本地强制边界必须cut，并增加删除中间真实章界负例。
2. 明确outline.facts.chapterIndex、冻结快照、非法/重复/改绑/空细纲拒绝，以及提交前merge/coverage/归属验证和发布门槛。
3. 以最终artifacts为canonical，review/repair后发布前统一投影并同步，避免Chapter过期。
4. 第一卷summary只含无chapterIndex的卷级/来源大纲，章级细纲进入Chapter/cards且不重复；03同步修订。
5. structure独立stage/schema/白名单/prompt/hash/runtime `(structure,classify)`，普通classify不变。
6. 坐标明确为当前sourceBody的JS UTF-16 code-unit，按session.files和body units无分隔符拼接，覆盖排除区/接缝/astral/多文件。
7. structure独立几何/result hash，暂停恢复与重开再授权分离，set-chapters使其失效。
8. 旧H05仅限已停止未发布，正式set-chapters清旧coverage/artifacts/grant/语义状态/旧细纲，下一次outline从零开始。

建议各批先累计私有候选、全书验证后一次提交，review前与assertPlan前双门槛。上述已纳入合同，可进入TDD；不是实测通过结论。
