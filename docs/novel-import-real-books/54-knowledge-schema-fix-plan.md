# 主题阶段知识限定校验与安全错误提示的窄修复

日期：2026-10-26。状态：待55独立技术/限定用例审核，未编码、未再次调用主题模型。

## 事实与证据边界

C1世界观已生成2项、覆盖3/3。随后主题请求rev83失败，safeError显示通用文案。保留证据后仅做一次有记录UI恢复，rev103仍同文案，已停止重抽。两不可覆盖快照SHA分别`0842d23e33c138db6bcbe31b3aac003d4f342c238e66d53088735f97eabdc63f`与`54e30ea936e6cf6f90fadf69c3e81f6928546e93a5522db4792684d9086ea2d7`；14成功artifact、五类coverage、源/工作单元、正文2723/b636和checkpoint hash逐项不变。两次实际operation不同；第二次应用调用72.198秒，不证明超时或供应商尝试数。

没有raw失败响应/原始异常，不能断定知识字段就是实际原因，也不能排除网络。静态可确认的缺口：core知识规则的三条固定错误会被main.safeError泛化；ordinary analyze的facts仍只是字符串字典，其可靠性枚举/归属规则没有进入generateJSON既有纠正机会。无需额外付费探针即可先修此同义合同缺口。

## 范围与最小行为

仅`desktop/service/novel-import-ai.ts`、`desktop/main/novel-import.ts`及既有`tests/unit/novel-import-request-schema.test.ts`。不改core知识规则/四枚举、prompt、分类/分析scope、网关、预算、共享schema、解析、发布、UI结构/模型配置，不新增遥测或raw记录。

1. **仅newsem1普通analyze**的facts字段级增加与core完全相同的规则：非worldline/narrative允许省略reliability；一旦提供只能为客观事实/角色有限事实/人物推测/可能不可靠，空字符串或其他值不可默默丢掉/映射。worldline/narrative必须给该字段。有效非客观值要求attribution.trim()非空，但保留原归属字符串，不trim存储、不默认客观事实、不造来源。temporalScope及其余合法字段原值保持。
2. issues仅固定facts.reliability/attribution路径和静态提示，列四个固定合法值，不回显raw值/ID/正文。和kind/source字段错误同时出现仍不得获得成功信用。defaults共用桥、真实generateJSON原最多一次格式纠正、最终同schema解析及全部core/native/evidence/link晚门原样保留；不尝试提前覆盖nested narrative refs或全部native语法，不扩张成通用自动修复。
3. main.safeError仅对三条**完整静态字符串精确等值**添加安全文案映射：`事实可靠性类型无效`、`非客观事实缺少知识归属说明`、`事件或叙事必须明确可靠性`。输出分别明确可靠性/信息归属缺口，固定文字，不附原错误或调试值。原前缀白名单不扩大；相似前缀、secret后缀和未知异常继续走既有安全规则，不把原始消息直接传给UI或journal。
4. legacy/classify/review/patch/reconcile及source-copy零AI行为不变；只把既有普通推断校验前移，不改变合法响应集合或原有成功artifact。安全提示只影响失败文案，不进scope/plan/semantic hash或发布快照。

## 限定用例与执行

沿用J01/J02内部增补，不新增编号或suite：

- 生产同桥+真实generateJSON、只注入既有generateText：无效reliability（含空）、有效非客观但归属缺失/空白、worldline/narrative缺reliability，首坏后好恰2次；两次仍坏恰2次拒绝，首好1次。
- 普通theme省略reliability合法；客观事实可不带归属；三个非客观值配非空归属合法且原字符串/空白不改。无隐式默认、未知值不丢/不转义为合法枚举，来源/类别的混合错误保护继续成立。
- 反馈只有固定字段/四个合法值，不含合成秘密/raw/ID；raw绕过生成仍被拒绝。原合法响应、legacy/其它phase/reconcile及全部晚门保留。
- J02对实际main.safeError作隔离纯调用（可控controller且不initialize、禁用真实PDF/IO依赖，不新增产品测试hook）：三完整消息映射固定提示；附secret后缀/相似前缀/普通未知错误不泄漏，原受控安全错误行为保留。无真实配置/Key/用户库或应用访问。

仅原三条精确命令：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-concurrency=1 --test-name-pattern='^NI-J0[12]:' tests/unit/novel-import-request-schema.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[356]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-SEM0[1234]:' tests/unit/novel-import-semantic.test.ts
```

先当前53冻结版真实RED，再最小GREEN及独立code review；必要typecheck/build另记，禁止全量或其他suite。随后正常退出/构建/重开同C1、记录新构建并重新授权原目录，先逐项比对14项成功数据，再只恢复未完成主题等目标。若仍失败，保存可辨识的新错误并定位，不继续盲目重抽。两旧通用FAIL永久保留；合成绿色不等实际主题/全书通过。
