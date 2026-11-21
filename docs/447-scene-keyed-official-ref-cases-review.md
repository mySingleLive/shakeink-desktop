# 447 独立用例审核

结论：446通过后，447按序通过，可PRIVATE TDD；当前不准产品实施。审核 SHA256：`0f06ca3b68c1b50c4b5d1053c79409244989252950aaddcfad64f1e2589bb007`。

case1–2 明确冻结旧B/原A oracle，受控改名及目标同type证明、非法/悬空引用/误删type/丢字段拒绝；独立诊断copy/inliner、完整Ajv见证和必需字段反控防止把unknown keyword忽略冒作ref验证。exactkeys、局部范围/类型/0、严格三record及getter负控保留，反投原decoder不填值、不猜号。

case3–4 使用真实SDK到Gateway假最终出口，A/C同prompt/参数、strict=true且只有schema不同；两个完整schema必须原样出站，不能先反命名再发。wrong strict/schema/prompt/binding、第三fetch/redirect等fail closed，原安全投影/tee/只读存储/正常退出/R62及历史保护保持。HTTP失败为not-run，不能改成schema不合格或补试；实际仅root在PRIVATE代码独审后执行两次。

case5 保留441/442所有唯一replacement定位/原hasSource缺源提示和原业务门；官方文档不代替实际兼容，新静态成功不代替产品真实桥/完整130+256预算、92/25回归及全文发布重开。反命名copy的测试应明确截获真实wire仍为单数$def，防止诊断辅助被误当生产出口。未满足前提则停止，不放宽本地门或额度。

本审核未改产品/测试，未调用App/模型API；私有概念只作局部可行性证据，不作全书验收。
