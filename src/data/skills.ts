import { SkillGroup } from './types'

export const skills: SkillGroup[] = [
  {
    label: 'Web Frontend',
    items: [
      'Angular',
      'TypeScript',
      'JavaScript',
      'HTML5',
      'CSS3',
      'Tailwind CSS',
      'PrimeNG',
      'React',
    ],
  },
  {
    label: 'Mobile & Cross-Platform',
    items: ['Flutter', 'Dart', 'Riverpod', 'Provider', 'GetX'],
  },
  {
    label: 'Architecture & Patterns',
    items: ['MVVM', 'MVC'],
  },
  {
    label: 'Backend & APIs',
    items: [
      'Node.js',
      'Express',
      'Python',
      'Django',
      'Django REST Framework',
      'REST API',
      'WebSockets',
    ],
  },
  {
    label: 'Databases & Persistence',
    items: ['PostgreSQL', 'Prisma', 'Drift'],
  },
  {
    label: 'Tools & Testing',
    items: ['Git', 'GitHub Actions', 'Jira', 'Linux', 'Unit Testing', 'Widget Testing', 'Sentry'],
  },
  {
    label: 'Design',
    items: ['Figma', 'Rive', 'UI/UX Design', 'Animations'],
  },
]
