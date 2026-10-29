# 106 service/J09 分包实施证据

只改 `desktop/service/novel-import-ai.ts` 一行、在 Jtest 末尾追加 NI-J09；payload/A11 由主代理拥有，本分包不修改。源码和测试已冻结，等待 108 独立审核。M01 实际失败字段仍未知，不能从这些合成格式例子推断真实 rev41 是哪种坏值，也不能声称实际重测通过。

局部普通 sem1 analyze/character 分支将 facts record 的 value schema 从原 `z.string()` 改为带 106 固定中文 error 的 `z.string()`，其余 kind 仍是原构造。key schema、strict/optional、semantic text 空串、知识/证据/kind/origin/source superRefine 和全部晚门未动。没有 transform、coerce、trim、自动 stringify 或替换人物值；105 整个 generateImportAiJson mapper 逐字不变。逆替这一个表达式可将整个 service 精确恢复到真实 3dba02 基线；原 J01–08/e0ce2d 完整字节前缀不变。

唯一执行命令是 freeze.json 中的 Node24 绝对路径 J01–09 精确命令。先保存实际基线的初始 schema-message RED，再在原 service 上调整 J09 断言次序，让五种坏值都实际完成 runImportAi → production bridge → generateJSON → Zod 的首坏次好两轮后，因第二 prompt 没有固定双层 JSON 编码反馈取得干净 bridge RED，43 项 37 通过/6 失败。两份日志原样保留，未把实施后变异称作初始 RED。

最小生产改动后 **43/43、0skip、exit0**。数组 aliases、对象 relationships、number、boolean、null 的首坏次好各恰两次，持续坏各两次停止，首好一次；固定反馈不含合成值/姓名/来源ID/quote/endpoint/secret，signal/role/包装和预算限制保持。字符串（空、空白、emoji、JSON 文本）、非字符串、可选缺省/严格字段、未知 keys 及既有 `__proto__` 行为的同一 literal 接受矩阵在基线与末版均通过。其它 phase/kind/legacy/reconcile 的原 string 错误保持；native/知识/source/link 晚门与接受集没有放宽，原始输入、坏结果及成功结果逐对象不变。

完整 SHA、源反向证明、mapper hash、四个未变控制根与 RED/GREEN 日志身份见 `character-facts-contract-service-freeze.json`，全 delta 见同前缀 `delta.diff`。未跑 Atest、其它测试、类型或构建；combined global/audit 类型及 desktop 构建由主代理协调。未访问实际 M01、私有 journal、应用、模型或用户数据库。
