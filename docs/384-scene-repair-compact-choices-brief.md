# 修复证据目录的无损范围引用

R43 出现原完整修复预算拒绝。先限定修复目录的重复编码，不增加预算、不删除选择、不截断原文或引文，也不改源数据及接受门。资料保留失败仍需独立解决，不宣称本改动会修复其具体原因。

现有 request-local Stored 已有精确 unit、start、end 和私有完整 Anchor。新增只读 compactEntries：每项以原 choiceRef、unitIndex、UTF-16 本地 start/end 引用原请求完整 units 文本；保留全部项、顺序、literals、sourceRef、wholeUnit、preserved 信息，不重复 UUID 或非片段长 quote。原 entries 与私有 resolve/map 保持原义，CF 生成不变。wholeUnit 当前本来就不重复 quote，不误报该项节省。

服务只把显示给模型的 choices 换为完整无损目录，并明确这些范围只是阅读指针：源文本仍完整在同一实际 prompt 的 units/片段表，模型只回传 choiceRef，不计算/回传坐标。所有旧 good rows、keep、原草稿、当前回复、候选及窗口保持完整；每次仍按实际完整 prompt/schema 预算。原 typed/root 状态、四代、native schema、source/owner/retention/final 门均不变。

测试 helper 可从已提供 units 按精确索引恢复目录，用于既有 CF 选择控制，不猜位置、不用首项、不改变测试实体事实。384/385 顺序独审后 TDD/独立 code review/必要定向验证与构建，再做正常 fresh 全文。未执行的完整场景、资料复核、发布与重开均不能计通过。
