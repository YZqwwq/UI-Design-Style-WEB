# 按需 Skills 地图

规范类提供专业要求和工作方法，工具类提供具体自动化能力；两者均在任务需要时读取使用。轻量文本规则另存于 `.project-manager/rule/`，由 `AGENTS.md` 的规则地图定位。

| 名称 | 类型 | 职责摘要与适用条件 | 入口 |
| --- | --- | --- | --- |
| manage-skills | 规范 | 接入、复制、分类和维护项目 skills；添加、调整或移除轻量文本规则及规则地图 | `.project-manager/skill/manage-skills/SKILL.md` |
| manage-documents | 规范 | 初步能力概览、指定功能建档、明确范围内完整整理、已有文档维护与纠正 | `.project-manager/skill/manage-documents/SKILL.md` |

目前未登记业务 skills。新增条目以自然语言概括职责，不穷举触发词，不自动登记环境中所有可用能力。条目较多时可按领域分组，按需检索候选后再读取全文。

入口统一为可读取路径：全局 skill 使用实际绝对路径；非全局 skill 复制完整能力包到项目统一目录后登记项目相对路径。接入与更新读取上表的 skill 管理能力。
