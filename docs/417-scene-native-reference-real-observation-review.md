# R52 真实观察独立复核

结论：诊断完整，A′/B′仍均HTTP400；412/413未准入，禁止产品TDD，完整导入仍未通过。

独立读取闭合安全回执并执行纯Node断言：两例各1生成/1fetch，共2次；actual wire与冻结展开schema SHA相符、剩余引用均0、prompt相同。两例HTTP正文投影均parsed/complete，219/206字节、code=invalid_request_error，与R50闭合投影逐字段相同。此处相同仅指投影，不证明未保存的开放正文逐字相同；A′的ref关键词不表示wire仍含ref。模型JSON校验均not-run，不能声称原tuple/witness通过或定位唯一根因。

App原始正常exit0、无timeout/page error，writeFailures0、closeFailed=false、metadata写尝试0、状态不变。重新逐hash核103项工具输入、368项R49产品/renderer、R50历史8项源/CJS及新entry/CJS，全部一致。417主记录边界准确。

命令：Node24只读JSON断言及SHA256复核，exit0；本审核未启动App/API、未读真实小说/模型文本/Key/开放错误正文、未改产品。下一私有诊断须另经418/419及420审核，不能据本轮失败自动扩大产品变更。
