# 普通分析唯一kind固定合同：独立方案审核

日期：2026-10-26。技术方案 **PASS**；限定用例方案 **PASS**。无 P1/P2 必修项。允许按76限定TDD；不代表模型已经服从或实际S02物品通过。

## 身份与范围

审阅 `76-requested-kind-prompt-plan.md`，SHA-256：`7f47189046c1ad199cd3f340cc791782a97f906b5f666e7e7ed5b07bf7e99b13`。只读核对已知payload固定合同、service请求schema与生成接点、主进程kind传递接点及A07/J01–03保护范围；未编码、执行测试或访问实际run、小说、应用、模型、journal或用户数据库。

rev76错误与12产物保持来自主代理报告，本审核未读取真实快照。没有raw返回，不能推断具体坏kind，也不能将该错误归因为中文翻译、子类型或传递丢失。

## 技术判断

现普通semantic analyze合同只写“仅指定kind”，service却已经以IMPORT_TARGETS验证请求并使用该kind的z.literal限制输出。仅把这个既有唯一值及origin inferred明确写进首次固定phase-output-contract，属于约束表达补足，不改变接受集合；原空数组/notFound合同应逐字保留。

固定值必须由IMPORT_TARGETS逐字匹配后得到，再以JSON字符串形式表达；不得直接拼任意request.kind或其它来源/自由要求。未知或缺省kind的独立prompt helper不新抛错、不默认/翻译目标，也不回显到固定段；真正runImportAi继续在模型解析、授权及生成前由现factory拒绝，J02已有0resolve/0generate保护。

范围只限semanticVersion1、普通analyze、非reconcile。legacy、classify、review、patch、reconcile及73通用指导逐字保持；source/payload/单元、schema/anchor/晚门、预算、网关、授权、重试和已完成信用均不动。通用native说明仍可提其它类别，不能把“唯一目标”误解为删除原多类别native合同。

## 用例判断

A08应通过真实runImportAi生成DI接点遍历全部12合法目标，在实际固定phase-output-contract中独立断言唯一kind JSON literal及origin inferred，不应对整段native说明做“不含其它类型”断言。source与自由指令只在数据封套，request/raw/payload、signal和角色不变；正常notFound及非BMP/转义输入原固定/wrapper预算继续验证。非法/缺省kind的helper安全行为与实际run拒绝应分别核对，不能用默认目标使测试通过。

旧分支prompt及payload字节期望须取自真实修改前基线的独立hash/literal，不能由修改后producer生成expected。A07保护73指导、8组旧分支、投影与锁门；J01–03保护实际bridge、原一次纠正、唯一kind及来源/证据校验，足以直接覆盖本次窄改。不把提示词面或合成notFound通过记作模型文学质量通过。

仅批准76两条精确命令，先新A08在真实生产基线RED，再最小GREEN及独立代码审核：

```sh
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-A0[78]:' tests/unit/novel-import-ai.test.ts
/Users/dt_flys/.nvm/versions/node/v24.18.0/bin/node --import tsx --test --test-name-pattern='^NI-J0[123]:' tests/unit/novel-import-request-schema.test.ts
```

本轮未执行上述命令。主代理后续同草稿重开仍须目录和同模型范围授权、核对12产物/覆盖/正文/14章/预算，仅续未完成物品；所有实际失败及文学待修保留，真实效果另行验收。
