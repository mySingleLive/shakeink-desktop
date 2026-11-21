# 场景修复错误标签：独立增量审核

结论：**限定两文件增量通过，无阻塞，可冻结后进行R42正常fresh全书验收。**376/377已按序独审。审核者未改产品/测试、构建或启动App、调用模型或读取真实小说/request/raw/Key。

`desktop/service/novel-import-ai.ts:614–624`仅在原semantic v1 / analyze / scene / roster的invalid_schema catch中，增加确切`repairs`路径映射。feedback必须为`repairs: `开头，再匹配源内完整固定反馈或完整literal句前缀；只输出“原文限定、称呼来源、证据窗口、资料保留、修复事务”五个预置标签。没有按任意关键词或模型值推测；apply/resolve已经合并成事务指导时只报事务。未知反馈/路径仍回退响应结构，旧roster字段及非scene行为保留。

同一error直接修改message后抛出，kind、finishReason、feedback、invalidFields和数组引用不变。独立在内存移除唯一新增repairs分支后，完整service SHA256精确恢复374的`c1c26d0dd42da8ae3c31749fec4fc691f56c23290c1bb96bb1dec7d5d863bc9d`，证明prompt、生成次数、parser、schema、预算、source/retention和接受/拒绝门其余字节未变。主界面仅显示固定标签，不回显未知键/值、引用、索引或反馈正文。

实际独立命令，使用`/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node`：

```sh
node --import tsx --test tests/unit/novel-import-scene-roster-error-labels.test.ts tests/unit/novel-import-scene-roster-bounded-recovery.test.ts tests/unit/novel-import-scene-roster-failure-shape.test.ts tests/unit/novel-import-ai.test.ts
node node_modules/typescript/bin/tsc --noEmit --incremental false
git diff --check
```

**114/114、exit0**（EL7、BR43、UD36、AI28已全部包含），日志`/private/tmp/scene-roster-error-labels-independent.txt`。完整tsc exit0，`/private/tmp/scene-roster-error-labels-independent-typecheck.txt`为空；diff exit0。不与作者/主代理498或历史组相加。

EL实际JSON桥四代持续失败验证context.label、显式name/aliases称呼归属、资料保留及未知CF，仍拒绝且只改固定标签；输入、原draft及错误元数据保留。quote标签为明确的固定feedback catch注入控制，不冒称穿透已合并的CF错误；注入还验证原error身份/数组引用。秘密哨兵、未知feedback、非确切repairs路径、任意关键词、旧name及非scene回退均通过，真实main.safeError可读标签检查通过。

冻结SHA256：

| 文件 | SHA256 |
| --- | --- |
| desktop/service/novel-import-ai.ts | c834497e9e7f6c83e212f0cff91bf143931d27e2efd3c72d4624e2e310569226 |
| tests/unit/novel-import-scene-roster-error-labels.test.ts | 2c1bbdfe51bc5ca9c0bc9e899acf61de43151846e4894ca235e2bf8727417f79 |

该增量改善新失败的可诊断性，不修复或追认R41历史回复，也不代表全部场景或全文验收通过；R42实际完整导入、复核、作者UI、发布和退出重开仍由root另验。
