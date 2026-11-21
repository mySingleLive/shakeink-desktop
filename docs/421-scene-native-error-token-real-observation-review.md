# R54 真实观察及形状候选独立复核

结论：本轮静态诊断完成；正控当前成功，B′仍失败。存在可检验的嵌套anyOf分支形状差异，尚不能认定唯一根因；不准据此开展产品TDD。

安全回执独立读取：R48原850字节正控HTTP200、stop、directJSON/schema pass、delta等于SDK文本；R52原4866字节B′HTTP400，模型JSON校验not-run。B′完整非截断投影为 `invalid json schema field anyOf missing field type other`。两例schema/prompt SHA精确吻合各自冻结来源；两例用途不同，不是单变量实验。每例生成/fetch各1、总2，正常App exit0、无timeout/page error、writeFailures0、close成功、metadata写尝试0、状态不变。

只读结构探针：原generic first的9个anyOf分支和repair的5个分支均显式带type；当前B′的5个分支只有 `/properties/answers/items/anyOf/1` 缺自身type，其内部为3个typed-object分支的anyOf。原generic工厂源码仅逆回新增预算参数/override后，仍精确等R47冻结源SHA，不能追认未留存的历史wire。将该纯对象联合加冗余type:object或将纯联合展平成typed leaves，都是可以另行严格验证等价性的候选。

词序未提供精确schema路径，正控schema/prompt也不同，因此这些证据不能证明该节点是唯一拒绝原因，更不能证明新候选会被当前接口接受。后续须经新方案/用例/代码审核及实际静态观察；如有条件产品方案，仍须原tuple/witness、本地逐位置/source/retention/owner和完整预算门，不用供应商strict代替本地校验。

实际执行Node24纯factory形状遍历及源SHA逆构断言、103个工具输入/368个产品逐hash复核，exit0，全部一致。本审核未App/API、未读真实小说/模型文本/Key或开放错误正文、未改产品。
