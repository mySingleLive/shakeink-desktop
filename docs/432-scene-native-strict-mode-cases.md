# strict逐调用对照与条件TDD最小用例

431→432顺序独审；先PRIVATE，433代码独审后root实际两例；false全条件之前不改产品。两例共同schema/prompt/witness来自固定R58B，原f2e1 WIP预算失败不得normal。

| ID | 固定fixture | 必要断言 |
| --- | --- | --- |
| SM01 | 冻结R58B1953B及5task tuple/witness，true/false两immutable case | 两schema/prompt/witness逐值相同，schema SHA a471…/prompt b42…精确，候选及冻结tuple本地见证通过；唯一case差异expectedStrict，不调live旧历史factory。未知case/缺省strict不默猜。 |
| SM02 | 真实SDK→新matcher→生产ModelService/Gateway→fake最终出口 | native factory原true后通过合法resolved.providerOptions clone逐case覆盖；实际body.text.format.strict分别严格true/false，剥该字段后其它body深等，schema/inputSHA同、thinking/store/cap/model不变。反向strict、缺strict、字符串strict、错误schema/input、第二fetch均失败且不触发额外出口，不因Gateway包装误算正常。原resolved选项/模型记录及并发case不被修改。 |
| SM03 | 原readonly、安全原因、取消/撤权、写入/close、私有存储及WIP快照控制 | 各1/global2/retries0、0元数据写，R54流/161表/tee/正常quit机制复用不改；700/600/wx，当前budgetfailed WIP368与旧PRIVATE源CJS前后同。200返回full直接JSON/原tuple/witness，400只闭合投影、不运行响应schema；不记录开放error/Key/headers/url，不补试。 |
| SM04（条件） | bound Native6props hint与真实SDK generation closure | 已activate bound的第2/3/4次严格false；first、root-envelope恢复及unparsed重生每次true；无active/plain roster/entity/其它业务原选项不变。不用prompt猜状态，不改共用factory/generate默认，不mutate输入model或并发请求。保持所有原schema/完整budget/四代/nonstop门。 |
| SM05（条件） | first/primary/legacy三合法record；name-only/aliases-only/primary+legacy；unknown及局部0/range、旧repairs | 三合法真桥通过且source/窗口完整；partial/mixed先Native=true再真实runImportAi/generateJSON+SDK桥被原strict程序拒，unknown Native=false且业务桥拒。Native全局允许的0/另一task范围或record类型仍由原位置decode拒。原local三branch及来源/保留/归属/版本门字节不改，不能只测fixtureZod。 |
| SM06（条件） | 原CI16K与实际130+136、2/3/4全部prompt/schema/fixed/envelope/context | 原50accepted/13rejected比较和完整代次量测如实记，所有资料/draft/current/choices/keep/任务完整；原3个envelope失败必须真过。不得抬额度/截资料/减门，源码hash绑定、产品独审及rootfresh验证另记。 |

实际false例需全部431门，true结果是新隔离观察而非追认历史。若false不满足，SM04–06继续未执行，不改产品；fragment tuple为另审备选，不纳本轮scope。
