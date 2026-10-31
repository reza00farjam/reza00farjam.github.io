import { Experience } from './types'

export const experience: Experience[] = [
  {
    id: 'exp-system-group',
    role: 'Frontend Engineer',
    org: 'System Group',
    start: '2025-04',
    end: null, // Present
    summary:
      'Working across multiple product teams, building mobile and web frontend applications.',
    highlights: [
      'Farsan: Built and shipped a PWA version alongside the existing Android and iOS applications. Refactored and optimized legacy Flutter code and delivered multiple product features.',
      'Afra: Developed Angular frontends using TypeScript, Tailwind CSS, and PrimeNG.',
      'Cloud Stock / IoT: Currently contributing to the Angular frontends while gaining experience with the C#/.NET backend.',
    ],
    tags: ['Flutter', 'Angular', 'TypeScript', 'Tailwind CSS', 'PrimeNG'],
  },
  {
    id: 'exp-jarvic',
    role: 'Flutter Engineer',
    org: 'jarvic.ai',
    start: '2023-02',
    end: '2025-02',
    summary:
      'Developed and maintained the jarvic.ai mobile application and landing pages for jarvic.ai and its parent company, QLindex.',
    highlights: [
      'Sole Flutter developer, responsible for complete architecture and development using MVC with GetX and Provider.',
      'Built an AI chat app with real-time WebSocket responses, a Google-Forms-style builder, Google Drive integration, and a private design-system package shared across company apps.',
      'Collaborated with the UI/UX designer, product manager, and backend team in an Agile, Jira-based workflow.',
    ],
    tags: ['Flutter', 'Dart', 'GetX', 'WebSocket'],
  },
  {
    id: 'exp-artin-analysis',
    role: 'Flutter Developer (Part-time)',
    org: 'Artin Analysis',
    start: '2022-07',
    end: '2023-01',
    summary:
      'Developed Diaboo, a reward-based mobile application for people with diabetes, as a part-time Flutter developer.',
    highlights: [
      'Implemented gamified health tasks, progress tracking, and personalized exercise recommendations.',
      'Built route suggestions and camera-based image correction using Provider, MVVM, Google Maps, and ML Kit.',
    ],
    tags: ['Flutter', 'Dart', 'Provider', 'Google Maps', 'ML Kit'],
  },
]
