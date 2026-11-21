# 412 条件方案独立审核

结论：条件方案通过，可进入 413 用例独审；尚不准入产品 TDD。

审查版本 SHA-256：`1b950f192e4d510049837a4f22a0eccb3e3992a64daa8d6f3df9af009b051d90`。

实施必须等待 411 记录 R50 的全部启动条件：A 当前完整 tuple schema 得 HTTP400，B 单变量同质 items 得成功且完整 SDK/直接 JSON/共同合法答案与本地验证通过，实际 schema/input SHA、单次/全局调用、授权、只读、错误投影、资源关闭及产品保护门全部成立。否则本方案保持草案，不补试或猜测性修改产品；不得追认 R49 的错误正文或外推普遍供应商能力。

只改当前 bound Native schema 构造合理：保留每位置原 schema、完整 definitions/$ref、任务数量、replacement 三支、0 资格及字段容量，递归对象键排序且数组顺序不变地精确去重。单种直接 items、多种 anyOf、零 task 仅空 answers 的占位语义明确，不合并不同上界或资格、不取前 N、不新增调用。

同质 union 只是 advisory；某位置可通过 Native 但仍必须被原逐位置解码拒绝。源/retention/owner、旧 repairs/mixed-root、四代、非 stop、取消、预算等门均保持。不改变 prompt/deck/来源；新 schema 字节与既有 staged fallback 继续计入真实预算，必须重新测完整 130+136，不冒旧输入 SHA 或全文验收通过。

本次仅文档审核，未改产品、执行测试或调用 App/API。后续仍须真实功能 RED→GREEN、414 独立代码审核及主代理最终真实验收。
