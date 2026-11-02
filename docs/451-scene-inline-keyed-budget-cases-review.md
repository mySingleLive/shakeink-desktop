# 451 独立用例审核

结论：450通过后，451按序通过，可先真实功能RED再实现。

审核版本SHA256：`7f2c0967516d0cb6d5892cfcd9542a5e310f4df07b00c4f4393949c2de663101`。

case1–2 明确分桶的N/N±1和实际UTF8/emoji边界，完整context含prompt/schema/6000、v1/v2及未知16000拒绝和实际role容量必须独立控制；不能沿用旧组合门的“仍拒”假设，也不能把新桶任意传给非prepared路径。来源/单元/原fixed限和wrapper分别保持，失败不能activate或请求模型，避免预算检查变成隐性采用。

case3–5 保留冻结实际成功A的完整结构/三record/字段上限、局部域/资格0、无refs的逐键表示与严格data-property反投原decoder；旧array/repairs原正负控及解析器不变。Native与本地门应有独立oracle，强schema拒绝不能掩盖原本地检查。恢复strict=true只撤旧advisory覆盖，首轮/其它参数和并发隔离维持。

case6–8 来源定位及缺源说明有RED要求，保留reject造成行移动、patch内层压缩/多任务/歧义回退、原hasSource跨unit保守事实和原claimed/canReject/boundCanReject。诊断最多六项、真实首门优先、无值回显、无选择/资料副作用，原BD/source/retention/owner/工作限额/权限门完整。

case9 必须量测最终新完整提示而非拿概念统计作收据：130首轮+256历史、92/25及所有桶/完整context，无取样、提额或裁raw/keep/current/全部目录。边界夹具应确实达到目标门，不被更早guard遮蔽，也不能把预算fallback造成的更短任务误称固定N。全部定向/类型/构建/独审后才fresh正常全文，原420000ms不重置，未执行的发布/重开保持未通过。本审核未改产品/测试、未调用App或模型。
