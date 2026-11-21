/** Native schema2 text fields stay atomic during full-material review. */
export const IMPORT_SCENE_PROFILE_TEXT_FIELDS=['exteriorDescription','interiorDescription','backstory','entryMethod'] as const
/** Fixed correction text only. Never interpolate model values or source data. */
export const IMPORT_SCENE_FACT_GUIDANCE='facts仅允许entityType,parentId,coordinates,reliability,attribution,temporalScope,characterId,sceneId,itemId,exteriorDescription,interiorDescription,backstory,entryMethod；每值必须为字符串，未知可选字段省略；name/aliases不入facts，其它有据资料完整保留text。'
export const IMPORT_SCENE_LINK_FEEDBACK={
 parentId:{label:'场景身份与上级关系',guidance:'parentId必须逐字等于本次唯一目标目录项已确认的parentId；目录无上级时省略，不使用地点名称，不新增或改写上级；同时保持目标id/name与目录一致，完整保留有据资料与引用'},
 characterId:{label:'关联角色引用',guidance:'characterId必须使用可信实体目录中kind为character的id，不能使用名字、别名或其它类型的id；没有可确认的合法引用时省略该可选字段，相关有据内容完整保留于text或attribution'},
 sceneId:{label:'关联地点引用',guidance:'sceneId必须使用可信实体目录中kind为scene的id，不能使用名字、别名或其它类型的id；没有可确认的合法引用时省略该可选字段，相关有据内容完整保留于text或attribution'},
 itemId:{label:'关联物品引用',guidance:'itemId必须使用可信实体目录中kind为item的id，不能使用名字、别名或其它类型的id；没有可确认的合法引用时省略该可选字段，相关有据内容完整保留于text或attribution'},
} as const
