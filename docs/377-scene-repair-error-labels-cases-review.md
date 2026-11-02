# 377 独立用例审核

前置：376 方案已先审通过。结论：通过，可执行限定范围 TDD。

实际 JSON bridge 的持续 context.label 失败应保持四代拒绝，并验证预置标签及原错误元数据；quote、literal、保留与合并后的 CF/事务错误分别覆盖原拒绝门。未知反馈、任意字段和秘密哨兵必须保持静态回退，旧 roster、generic 与非 scene 正负控保留。不得用只有异常文案的 stub 代替首项实际生成桥 RED。

接受范围仅为五类固定业务标签，不要求恢复已合并的具体 CF/slot 原因。保留输入、草稿、错误 kind/finish/feedback/invalidFields 与次数断言；完成独立 code review、定向回归及构建后仍须新鲜全文实际验收。此次只审方案和用例，未改源/测试，未运行 App/API。
