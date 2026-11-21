# 修正轮仅允许已核验引用选项

R34实际typed第二答4个Anchor仍使用旧ef，其中1个不含literal，原门拒绝。限定改动：第一轮及公共canonical接受集合不变；仅已激活的第二轮replacement中mentions/context/links的所有evidence严格为`{choiceRef:当前目录cf值}`，拒绝raw/ref/halfopen和混键，无resolver fallback。所有保留窗口及whole-unit选项已有cf；不改来源、窗口、预算、role、输出cap或两代上限。

第二prompt给出完整replacement的对象示例（含mention/context/link的choiceRef结构），明确sourceRef仅用于阅读原片段、不得回传ef。全部prompt和完整目录照原实际预算核验，超限失败不裁。还原后的完整新draft照原wire/source/canonical/full、retention及main所有门验证，不部分采纳。

测试夹具只把事先指定的精确Anchor编码为本次cf；必须核unit及完整quote一致，不得随意选首choice或缩原窗口求绿。目录无法表达的任意新窗口须明确为修正协议不支持，不能产品fallback；原首答/公共canonical仍可表达它。

范围：service的repairReference和第二prompt、对应定向测试及test-only编码helper；main/shared/core/ledger/generic不变。353独审后TDD，独立增量code review、定向回归/类型/构建，再实际R35；全文/发布/重开尚未通过。
