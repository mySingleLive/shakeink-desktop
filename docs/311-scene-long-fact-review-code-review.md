# 场景长自由文本复核代码独立审核

2026-10-31。审核者为 structured_generation，未参与308/309对应产品与测试实现；本次只读其实现、执行合成定向用例并记录结果，不构建、不启动app、不调用模型或读取真实小说内容。

## 结论

通过，无阻塞问题。实施与已独审的308/309一致；该结论只证明定向代码与合成行为，完整原件导入及安装版验收由主代理继续执行。

## 范围与检查

- `desktop/core/novel-import-review-tasks.ts` 仅对 `kind==='scene' && schema===2` 且字段属于四个既有原生自由文本字段时，免除 `field.length + value.length` 的单一piece检查。字段仍以原完整字符串成为一个facts piece；没有slice、trim、截断、factRange或新分片协议。其它kind、schema及字段沿用原错误和精确边界。
- `desktop/shared/novel-import-scene-links.ts` 的 `IMPORT_SCENE_PROFILE_TEXT_FIELDS` 与原四个字面量同值同序；`desktop/core/novel-import-semantics.ts` 的V2.scene只改为引用该表，未放宽结构化JSON或其它字段集合。
- 原text/evidence几何、task key构造及投影生成未改。整包payload、review角色预算、完整元数据检查仍由原controller fits执行，合法长原子值不能绕过整包上限。
- 新测试使用独立四字段字面量及改前有效14个task key黄金。逐值验证长Unicode、换行、首尾空白完整保留，重复证据batch均携带完整原子值及真实projection；实际controller合成流程覆盖reviewFacts完整记账、正常wizard发布到mock以及保留全部材料。另以真实过大原子值证明整包拒绝、fact模型调用为0且已有body credit保留。其余八种kind/schema/field的piece边界保持原行为。

## 执行证据与边界

Node固定为 `/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`。

独立执行 `node --import tsx --test tests/unit/novel-import-scene-long-fact-review.test.ts`：13 / 13通过，exit 0；日志 `/private/tmp/scene-long-fact-independent-review.txt`。执行时306/307的新artifact元数据实现同时存在，未通过删除元数据维持预算。

相关AI、request-schema、semantic、semantic-session、budget-policy、wizard-prompt六个文件另运行129 / 129通过，含原NI-LB09审计用例；日志 `/private/tmp/scene-review-source-reference-regression.txt`。该组不是全仓测试，也不替代主代理组合后的类型、构建和真实系统验证。

作者RED记录13节点中10通过、3失败；LF02曾真实触发旧piece错误。LF03的RED被旧piece门提前阻断，不能声称RED已到达整包fits；本次GREEN独立确认其整包fits拒绝及零fact dispatch。未将mock发布标为真实应用或数据库发布通过。
