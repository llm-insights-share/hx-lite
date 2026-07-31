import type { Component } from 'vue'
import {
  ApiOutlined,
  BookOutlined,
  BuildOutlined,
  FileOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  StarOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons-vue'

export type GuideKindCategory = 'inferential' | 'computational'

export type GuideKindCard = {
  value: string
  title: string
  category: GuideKindCategory
  desc: string
  icon: Component
}

/** Icon + category for each builtin guide kind (shared by org/project Guides views). */
export const GUIDE_KIND_META: Record<
  string,
  { icon: Component; category: GuideKindCategory }
> = {
  'guide.skill': { icon: ThunderboltOutlined, category: 'inferential' },
  'guide.template': { icon: FileTextOutlined, category: 'computational' },
  'guide.constraint': { icon: SafetyCertificateOutlined, category: 'computational' },
  'guide.exemplar': { icon: StarOutlined, category: 'inferential' },
  'guide.scaffold': { icon: BuildOutlined, category: 'inferential' },
  'guide.glossary': { icon: BookOutlined, category: 'inferential' },
  'guide.capability': { icon: ApiOutlined, category: 'inferential' },
}

/** Builtin cards only; org custom kinds are merged at runtime from GET /org/guide-kinds. */
export const GUIDE_KIND_CARDS: GuideKindCard[] = [
  {
    value: 'guide.skill',
    title: 'Skill / 技能规范',
    category: 'inferential',
    desc: 'coding-conventions、prd-writing…',
    icon: ThunderboltOutlined,
  },
  {
    value: 'guide.template',
    title: 'Template / 模板',
    category: 'computational',
    desc: 'proposal-template、design-template…',
    icon: FileTextOutlined,
  },
  {
    value: 'guide.constraint',
    title: 'Constraint / 硬约束',
    category: 'computational',
    desc: 'layering-rules、budget-rules…',
    icon: SafetyCertificateOutlined,
  },
  {
    value: 'guide.exemplar',
    title: 'Exemplar / 范例',
    category: 'inferential',
    desc: '好/坏示例对照',
    icon: StarOutlined,
  },
  {
    value: 'guide.scaffold',
    title: 'Scaffold / 脚手架',
    category: 'inferential',
    desc: '工程脚手架注入 Context Pack',
    icon: BuildOutlined,
  },
  {
    value: 'guide.glossary',
    title: 'Glossary / 术语表',
    category: 'inferential',
    desc: '领域术语约束 Agent 用词',
    icon: BookOutlined,
  },
  {
    value: 'guide.capability',
    title: 'Capability / 能力说明',
    category: 'inferential',
    desc: 'capability 写作与边界指引',
    icon: ApiOutlined,
  },
]

export type GuideKindApiItem = {
  id: string
  title: string
  desc?: string
  category?: string
}

export function toGuideKindCards(items: GuideKindApiItem[]): GuideKindCard[] {
  return items.map((item) => {
    const meta = GUIDE_KIND_META[item.id]
    const category =
      item.category === 'computational' || item.category === 'inferential'
        ? item.category
        : meta?.category || 'inferential'
    return {
      value: item.id,
      title: item.title || item.id,
      category,
      desc: item.desc || '',
      icon: meta?.icon || FileOutlined,
    }
  })
}

export function guideKindIcon(kind: string | undefined | null): Component {
  return GUIDE_KIND_META[kind || '']?.icon || FileOutlined
}

export function guideKindCategory(kind: string | undefined | null): GuideKindCategory | '' {
  return GUIDE_KIND_META[kind || '']?.category || ''
}
