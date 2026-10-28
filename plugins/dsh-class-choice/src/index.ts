import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * Class-choice assistant: course, teacher, plan, credit, and policy lookups for
 * computer-science freshmen.
 *
 * The plugin is deliberately dependency-free. Tools are registered as plain
 * `ToolDefinition` values, which the harness validates and dispatches exactly
 * like tools built with the `defineTool` helper; keeping the definition literal
 * means the package installs by path with nothing to resolve at runtime.
 *
 * Data lives in `data/*.json` and is demo content: replace those files with the
 * registrar's published curriculum before running this for real students.
 */

export const name = 'class-choice'

/** Course/teacher/plan lookups need the tool registry. */
export const inject = ['tools']

interface JsonObject { [key: string]: unknown }

interface Course {
  code: string
  name: string
  aliases: string[]
  credits: number
  hours: number
  nature: string
  suggestedTerm: string
  modules: string[]
  prerequisites: string[]
  teacherIds: string[]
}

interface Teacher {
  id: string
  name: string
  title: string
  department: string
  research: string[]
  office: string
  email: string
  teaching: string[]
  assessment: string
  source: string
}

interface PlanModule {
  name: string
  minCredits: number
  note: string
}

interface Plan {
  major: string
  grade: number
  totalCredits: number
  effectiveFrom: string
  source: string
  modules: PlanModule[]
}

interface Clause {
  id: string
  title: string
  appliesTo: string
  text: string
  source: string
  effectiveFrom: string
}

interface ToolRegistry {
  register(definition: unknown): unknown
}

interface ToolContext {
  tools: ToolRegistry
}

const HERE = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(HERE, '..', 'data')

/**
 * Read one demo data file.
 * @param file - File name inside `data/`.
 * @returns Parsed JSON content.
 */
function loadJson<T>(file: string): T {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8')) as T
}

const courseData = loadJson<{ version: string, courses: Course[] }>('courses.json')
const teacherData = loadJson<{ version: string, teachers: Teacher[] }>('teachers.json')
const planData = loadJson<{ version: string, plan: Plan }>('plan.json')
const policyData = loadJson<{ version: string, clauses: Clause[] }>('policies.json')

const COURSES = courseData.courses
const TEACHERS = teacherData.teachers
const PLAN = planData.plan
const CLAUSES = policyData.clauses

/** Model-facing text block. */
const text = (value: string): { type: 'text', text: string }[] => [{ type: 'text', text: value }]

/**
 * Normalize a search term for case- and space-insensitive matching.
 * @param value - Raw user or model input.
 * @returns Lower-cased, whitespace-free string.
 */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, '')
}

/**
 * Resolve a course code to its display name.
 * @param code - Course code.
 * @returns The course name, or the code itself when unknown.
 */
function courseName(code: string): string {
  return COURSES.find((course) => course.code === code)?.name ?? code
}

/**
 * Match courses by code, name, or alias.
 * @param query - Free-text course reference.
 * @returns Matching courses, best matches first.
 */
function matchCourses(query: string): Course[] {
  const needle = normalize(query)
  if (needle === '') return []
  return COURSES.filter((course) => {
    const haystack = [course.code, course.name, ...course.aliases].map(normalize)
    return haystack.some((entry) => entry.includes(needle))
  })
}

/**
 * Describe one course for a tool result.
 * @param course - Course record.
 * @returns Plain JSON projection used by the tool output schema.
 */
function courseView(course: Course): JsonObject {
  return {
    code: course.code,
    name: course.name,
    credits: course.credits,
    hours: course.hours,
    nature: course.nature,
    suggestedTerm: course.suggestedTerm,
    modules: course.modules,
    prerequisites: course.prerequisites.map(courseName),
  }
}

const COURSE_VIEW_SCHEMA = {
  type: 'object',
  properties: {
    code: { type: 'string' },
    name: { type: 'string' },
    credits: { type: 'number' },
    hours: { type: 'number' },
    nature: { type: 'string' },
    suggestedTerm: { type: 'string' },
    modules: { type: 'array', items: { type: 'string' } },
    prerequisites: { type: 'array', items: { type: 'string' } },
  },
  required: ['code', 'name', 'credits', 'hours', 'nature', 'suggestedTerm', 'modules', 'prerequisites'],
  additionalProperties: false,
} as const

/**
 * Register every class-choice tool.
 * @param ctx - Plugin context supplied by the loader.
 */
export function apply(ctx: ToolContext): void {
  ctx.tools.register({
    name: 'cc_course_lookup',
    description: '按课程名、课程代码或常用简称查询课程事实：学分、学时、性质、建议学期、所属模块与先修课程。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '课程名、课程代码或简称，例如“程设”“CS1021”' },
        limit: { type: 'number', description: '最多返回的匹配数，默认 5' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          total: { type: 'number' },
          matches: { type: 'array', items: COURSE_VIEW_SCHEMA },
        },
        required: ['query', 'total', 'matches'],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown): unknown => {
        const result = value as { query: string, total: number, matches: JsonObject[] }
        if (result.total === 0) {
          return text(`未找到与“${result.query}”匹配的课程。请确认课程名或课程代码，或改用更短的关键词。`)
        }
        const lines = result.matches.map((course) => {
          const prerequisites = (course.prerequisites as string[]).length > 0
            ? (course.prerequisites as string[]).join('、')
            : '无'
          return `- ${course.code} ${course.name}｜${course.credits} 学分 / ${course.hours} 学时｜${course.nature}｜建议 ${course.suggestedTerm}｜先修：${prerequisites}`
        })
        return text(`匹配 ${result.total} 门课程（数据版本 ${courseData.version}）：\n${lines.join('\n')}`)
      },
    },
    async execute(args: unknown): Promise<unknown> {
      const { query, limit } = args as { query: string, limit?: number }
      const matches = matchCourses(query).slice(0, Math.max(1, Math.min(limit ?? 5, 20)))
      return { query, total: matches.length, matches: matches.map(courseView) }
    },
  })

  ctx.tools.register({
    name: 'cc_plan_overview',
    description: '读取培养方案的模块结构与最低学分要求，用于回答“要修多少学分”“各模块怎么分”这类概览问题。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: {
        type: 'object',
        properties: {
          major: { type: 'string' },
          grade: { type: 'number' },
          totalCredits: { type: 'number' },
          effectiveFrom: { type: 'string' },
          source: { type: 'string' },
          modules: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                minCredits: { type: 'number' },
                note: { type: 'string' },
              },
              required: ['name', 'minCredits', 'note'],
              additionalProperties: false,
            },
          },
        },
        required: ['major', 'grade', 'totalCredits', 'effectiveFrom', 'source', 'modules'],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown): unknown => {
        const plan = value as { major: string, grade: number, totalCredits: number, modules: PlanModule[], source: string, effectiveFrom: string }
        const rows = plan.modules.map((module) => `| ${module.name} | ${module.minCredits} | ${module.note} |`)
        return text([
          `${plan.major} ${plan.grade} 级培养方案：毕业最低 ${plan.totalCredits} 学分（生效 ${plan.effectiveFrom}）。`,
          '',
          '| 模块 | 最低学分 | 说明 |',
          '| --- | --- | --- |',
          ...rows,
          '',
          `来源：${plan.source}`,
        ].join('\n'))
      },
    },
    async execute(): Promise<unknown> {
      return {
        major: PLAN.major,
        grade: PLAN.grade,
        totalCredits: PLAN.totalCredits,
        effectiveFrom: PLAN.effectiveFrom,
        source: PLAN.source,
        modules: PLAN.modules,
      }
    },
  })

  ctx.tools.register({
    name: 'cc_credit_audit',
    description: '按模块核算已修学分与培养方案要求的差额。输入已修课程代码列表，返回每个模块的已修、要求与缺口。',
    parameters: {
      type: 'object',
      properties: {
        completed: {
          type: 'array',
          description: '已修课程代码列表，例如 ["CS1011","MA1011"]',
          items: { type: 'string' },
        },
      },
      required: ['completed'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          major: { type: 'string' },
          grade: { type: 'number' },
          totalRequired: { type: 'number' },
          totalEarned: { type: 'number' },
          modules: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                required: { type: 'number' },
                earned: { type: 'number' },
                gap: { type: 'number' },
              },
              required: ['name', 'required', 'earned', 'gap'],
              additionalProperties: false,
            },
          },
          unknownCodes: { type: 'array', items: { type: 'string' } },
        },
        required: ['major', 'grade', 'totalRequired', 'totalEarned', 'modules', 'unknownCodes'],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown): unknown => {
        const audit = value as {
          major: string
          grade: number
          totalRequired: number
          totalEarned: number
          modules: { name: string, required: number, earned: number, gap: number }[]
          unknownCodes: string[]
        }
        const rows = audit.modules.map((module) => `| ${module.name} | ${module.earned} | ${module.required} | ${module.gap} |`)
        const unknown = audit.unknownCodes.length > 0
          ? `\n未识别课程代码：${audit.unknownCodes.join('、')}（未计入核算，请核对课程代码）。`
          : ''
        return text([
          `${audit.major} ${audit.grade} 级：已修 ${audit.totalEarned} / ${audit.totalRequired} 学分。`,
          '',
          '| 模块 | 已修 | 要求 | 差额 |',
          '| --- | --- | --- | --- |',
          ...rows,
          unknown,
          '',
          '说明：学分认定、转专业学分替换等以学院教务办公室书面结论为准。',
        ].join('\n'))
      },
    },
    async execute(args: unknown): Promise<unknown> {
      const { completed } = args as { completed: string[] }
      const earnedByModule = new Map<string, number>(PLAN.modules.map((module) => [module.name, 0]))
      const unknownCodes: string[] = []
      let totalEarned = 0

      for (const code of completed) {
        const course = COURSES.find((entry) => entry.code === code || normalize(entry.name) === normalize(code))
        if (course === undefined) {
          unknownCodes.push(code)
          continue
        }
        totalEarned += course.credits
        for (const moduleName of course.modules) {
          earnedByModule.set(moduleName, (earnedByModule.get(moduleName) ?? 0) + course.credits)
        }
      }

      return {
        major: PLAN.major,
        grade: PLAN.grade,
        totalRequired: PLAN.totalCredits,
        totalEarned,
        modules: PLAN.modules.map((module) => {
          const earned = earnedByModule.get(module.name) ?? 0
          return {
            name: module.name,
            required: module.minCredits,
            earned,
            gap: Math.max(0, module.minCredits - earned),
          }
        }),
        unknownCodes,
      }
    },
  })

  ctx.tools.register({
    name: 'cc_teacher_lookup',
    description: '按教师姓名查询公开档案：职称、系所、研究方向、办公地点、授课记录与考核方式。不提供主观评价。',
    parameters: {
      type: 'object',
      properties: { name: { type: 'string', description: '教师姓名，例如“苏槿”' } },
      required: ['name'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          found: { type: 'boolean' },
          query: { type: 'string' },
          teacher: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              title: { type: 'string' },
              department: { type: 'string' },
              research: { type: 'array', items: { type: 'string' } },
              office: { type: 'string' },
              email: { type: 'string' },
              teaching: { type: 'array', items: { type: 'string' } },
              assessment: { type: 'string' },
              courses: { type: 'array', items: { type: 'string' } },
              source: { type: 'string' },
            },
            required: ['name', 'title', 'department', 'research', 'office', 'email', 'teaching', 'assessment', 'courses', 'source'],
            additionalProperties: false,
          },
        },
        required: ['found', 'query'],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown): unknown => {
        const result = value as { found: boolean, query: string, teacher?: JsonObject }
        if (!result.found || result.teacher === undefined) {
          return text(`未找到教师“${result.query}”的公开档案。可以改用全名重试，或向学院教务办公室确认。`)
        }
        const teacher = result.teacher
        return text([
          `${teacher.name}｜${teacher.title}｜${teacher.department}`,
          `研究方向：${(teacher.research as string[]).join('、')}`,
          `办公地点：${teacher.office}｜邮箱：${teacher.email}`,
          `授课记录：${(teacher.teaching as string[]).join('；') || '暂无'}`,
          `考核方式：${teacher.assessment}`,
          `来源：${teacher.source}`,
          '',
          '说明：助手只提供公开客观信息，不提供对教师的主观评价或打分排序。',
        ].join('\n'))
      },
    },
    async execute(args: unknown): Promise<unknown> {
      const { name } = args as { name: string }
      const teacher = TEACHERS.find((entry) => entry.name === name.trim())
      if (teacher === undefined) return { found: false, query: name }
      const courses = teacher.teaching
        .map((record) => record.split('/')[0]?.trim() ?? '')
        .filter((code) => code !== '')
        .map((code) => `${code} ${courseName(code)}`)
      return {
        found: true,
        query: name,
        teacher: {
          name: teacher.name,
          title: teacher.title,
          department: teacher.department,
          research: teacher.research,
          office: teacher.office,
          email: teacher.email,
          teaching: teacher.teaching,
          assessment: teacher.assessment,
          courses,
          source: teacher.source,
        },
      }
    },
  })

  ctx.tools.register({
    name: 'cc_policy_search',
    description: '在选课与学籍管理规定中检索条款原文，返回条款编号、适用范围、正文与出处，用于规则解释类问题。',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: '检索关键词，例如“学分上限”“重修”“学业预警”' },
        limit: { type: 'number', description: '最多返回条款数，默认 3' },
      },
      required: ['query'],
      additionalProperties: false,
    },
    output: {
      schema: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          total: { type: 'number' },
          clauses: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                title: { type: 'string' },
                appliesTo: { type: 'string' },
                text: { type: 'string' },
                source: { type: 'string' },
                effectiveFrom: { type: 'string' },
              },
              required: ['id', 'title', 'appliesTo', 'text', 'source', 'effectiveFrom'],
              additionalProperties: false,
            },
          },
        },
        required: ['query', 'total', 'clauses'],
        additionalProperties: false,
      },
      render: (_args: unknown, value: unknown): unknown => {
        const result = value as { query: string, total: number, clauses: Clause[] }
        if (result.total === 0) {
          return text(`现有资料中未找到与“${result.query}”相关的正式条款。建议关注学院通知渠道，或向辅导员／学院教务办公室确认，不要依据推测作答。`)
        }
        const blocks = result.clauses.map((clause) => [
          `【${clause.id}】${clause.title}（适用：${clause.appliesTo}）`,
          clause.text,
          `来源：${clause.source}｜生效日期：${clause.effectiveFrom}`,
        ].join('\n'))
        return text(blocks.join('\n\n'))
      },
    },
    async execute(args: unknown): Promise<unknown> {
      const { query, limit } = args as { query: string, limit?: number }
      const needle = normalize(query)
      const clauses = CLAUSES.filter((clause) => {
        const haystack = normalize(`${clause.title}${clause.text}${clause.appliesTo}`)
        return needle !== '' && haystack.includes(needle)
      }).slice(0, Math.max(1, Math.min(limit ?? 3, 10)))
      return { query, total: clauses.length, clauses }
    },
  })

  console.log(`[class-choice] registered 5 tools · data ${courseData.version} · ${COURSES.length} courses / ${TEACHERS.length} teachers / ${CLAUSES.length} clauses`)
}
