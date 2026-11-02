# 本地引用展开的两次静态诊断

R50原A/B均HTTP400，412条件未成立，禁止产品实施。本稿仅新增PRIVATE诊断，R49产品及R50全部历史源/CJS保持冻结，不发送小说或重跑旧两例。安装SDK对items数组与definitions/$defs均递归保留，不能凭Draft7/Ajv合法性断言供应商支持。[JSON Schema引用规则](https://json-schema.org/understanding-json-schema/structuring#ref)说明本地引用；本次只处理实际固定schema的受限DAG，不做通用解析器。

A′、B′分别取冻结R50 case factory生成的原A(tuple)/B(uniform)，仅将所有本地引用语义等价展开。允许的$ref必须是唯一键，且为原root下`#/definitions/<name>`或`#/$defs/<name>`；按JSON Pointer解码合法~0/~1，精确查原root own字段，不猜路径。外部/未知/循环引用、$ref siblings、$id/$anchor/动态或递归引用语义一律在发网前拒绝。保留type/anyOf/required/items/minmax/additionalProperties、数组顺序及全部值，不扩大类型或删分支。递归clone完整展开、确认保留树无$ref后才删root definitions/$defs；每例固定上限10000节点/128深度，超限0fetch，不能部分展开。

两展开schema仍使用原同一prompt和共同synthetic witness；Ajv分别校验原/展开正控及固定反控一致，原schema/hash不变。A′与B′仍仅有原items tuple/uniform及additionalItems差异，不能夹带其他变化。每例记录原schemaSHA、展开schemaSHA/bytes、引用数及剩余0、实际wire/inputSHA。`validate`除本例展开schema外再记录对原tuple A及共同witness的静态结果，避免把更宽B通过冒作原位置门通过；仍不能推为真实小说语义完整。

复用冻结R50的execute/stream/安全HTTP投影/each1-global2硬门/tee有界取消，不改旧文件。新helper仅替换case factory和新700/wx600目录，真实SDK→相同matcher→ModelService/Gateway→当前已授权接口；readonlyUsage、maxNetworkRetries0，固定新两例各一次，未知/失败不补试。9词闭合投影不扩充，不保存HTTP开放正文、headers/URL/Key/开放Error。原vault内部正常使用凭据，不声称其读次数为0。

416独审及root保护368/输入产物hash核验后，root才执行新2fetch。沿用已审正常quit/原timeout不可cleanup0掩盖；clone/read/cancel/drain复用已证机制。A′拒/B′收仅支持去引用条件下items编码差异；两者均收仅支持原共同引用编码为候选原因，不能外推strict保证；两者均拒仍未知。必须实际新观察后再另审产品变更，412不能自动沿用准入。

固定交付：`dist/review/scene-native-reference-probe.cjs`，private manifest `scene-native-reference-probe-build-manifest.json`；`run({root,destination})`，新目录`native-reference-r52-UUID`，与root新runner匹配。0App/API实施前控制通过。
