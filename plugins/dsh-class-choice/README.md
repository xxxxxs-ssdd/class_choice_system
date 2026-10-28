# dsh-class-choice

选课与培养方案域的工具插件：课程事实、培养方案、学分核算、教师档案、规则条款。

零运行时依赖：工具以普通 `ToolDefinition` 字面量注册，不 import `defineTool`，因此按路径加载即可，不需要给插件单独安装依赖。

## 装载

```yaml
- insert:
    - id: class-choice
      name: '<REPO>/plugins/dsh-class-choice/src/index.ts'
```

插件声明 `inject = ['tools']`。

## 工具

| 名称 | 参数 | 返回 |
| --- | --- | --- |
| `cc_course_lookup` | `query`（课程名 / 代码 / 简称），`limit?` | 课程卡字段：学分、学时、性质、建议学期、模块、先修课 |
| `cc_plan_overview` | — | 专业、年级、毕业总学分、模块最低学分与说明、生效日期 |
| `cc_credit_audit` | `completed: string[]` | 逐模块已修 / 要求 / 差额、总已修、未识别代码 |
| `cc_teacher_lookup` | `name` | 职称、系所、研究方向、办公地点、邮箱、授课记录、考核方式 |
| `cc_policy_search` | `query`，`limit?` | 条款编号、标题、适用范围、原文、出处、生效日期 |

所有工具都遵守两条边界：

- **不编造**：查不到时返回明确的“未找到”结果，并在渲染文本里给出转人工建议；
- **不越权**：教师工具显式声明不提供主观评价、打分或排序。

## 数据

`data/*.json` 是演示数据（12 门课、8 位教师、7 个模块、6 条规则），字段即契约：

- `courses.json`：`code`、`name`、`aliases`、`credits`、`hours`、`nature`、`suggestedTerm`、`modules`、`prerequisites`、`teacherIds`
- `teachers.json`：`id`、`name`、`title`、`department`、`research`、`office`、`email`、`teaching`、`assessment`、`source`
- `plan.json`：`major`、`grade`、`totalCredits`、`effectiveFrom`、`source`、`modules[{name,minCredits,note}]`
- `policies.json`：`clauses[{id,title,appliesTo,text,source,effectiveFrom}]`

替换数据时保持字段不变即可；工具输出会带上 `version`，便于回答里标注数据版本。

## 本地验证

```js
import { apply } from './src/index.ts'
const registered = []
apply({ tools: { register: (definition) => registered.push(definition) } })
const result = await registered.find((t) => t.name === 'cc_credit_audit')
  .execute({ completed: ['CS1011', 'MA1011'] }, {})
console.log(result)
```
