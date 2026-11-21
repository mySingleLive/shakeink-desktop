# 无损修复目录用例

1. 全部原 choices 与 compact choices 一一对应，ref/顺序/literals/保留 flags 不变；按 unitIndex/start/end 恢复的完整 Anchor 逐字等于原私有 resolve，包括长非片段 quote、整单元、重复称呼多选、重叠、astral 与 CRLF，不能缩窗或错单位。
2. compact 目录只显示索引/完整边界，不含 quote 或 unitId；原 entries API 及私有 resolver 不变，返回副本/冻结不可改私有绑定；伪造 ref、混合坐标、越界及原 CF/来源/owner/retention 负控继续拒绝。
3. 实际 JSON/SDK bridge 的完整源文本、原失败草稿与当前回复保持；原正控输出深等，原选择数量不减、没有新默认选择；原 native first/repair schema、次数和 good rows 逐项相同。
4. 构造原重复编码超过固定纠错空间而精确 compact 目录可容纳的合成资料，实际字节必须下降且完整选择仍在；实际 prompt/schema 的 N/N-1 边界精确，原草稿或源自身超限仍先拒绝，不抬预算。
5. 必要 helper 仅根据传入完整 units 精确切片重建目录事实，保留旧纯 helper/直接 schema 的拒绝控制；先真实功能 RED 后 GREEN，独审后本任务定向组合、tsc/build，再正常全文实际验证。
