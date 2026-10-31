import { Project } from './types'

export const projects: Project[] = [
  {
    id: 'project-mashinaam',
    title: 'Mashinaam (ماشینام)',
    summary:
      'An offline-first car maintenance tracker that helps owners stay on top of scheduled vehicle maintenance. It tracks consumables — including engine oil, filters, timing belts, brake pads, batteries, and tires — and sends reminders based on odometer readings or elapsed time. Features local notifications, cost-tracked service history, a customizable parts catalog, and cloud synchronization with OTP-based authentication. Designed and developed end-to-end: Flutter application (Riverpod, Drift), Node.js/TypeScript backend (Express, Prisma, PostgreSQL), and React admin panel (Mantine).',
    tags: ['Flutter', 'Riverpod', 'Node.js', 'TypeScript', 'PostgreSQL', 'React'],
    thumbnailKind: 'mobile',
    thumbnail: './images/mashinaam-main.jpg',
    thumbnailSecondary: './images/mashinaam-secondary.jpg',
    thumbnailTertiary: './images/mashinaam-tertiary.jpg',
    year: 2026,
    role: 'Product Design & Development',
  },
  {
    id: 'project-jarvic',
    title: 'Jarvic',
    summary:
      "Developed multiple applications for jarvic.ai, including an AI chat app with real-time WebSocket responses, a Google-Forms-style form builder, and Google Drive integration. Translated the company's Figma-designed design system into a reusable Flutter component library, implementing custom buttons, form fields, icons, typography, dialogs, toasts, expandables, and more.",
    tags: ['Flutter', 'GetX', 'WebSocket', 'Google Drive API', 'Rive'],
    url: 'https://jarvic.ai',
    thumbnail: './images/jarvic-main.jpg',
    thumbnailSecondary: './images/jarvic-secondary.jpg',
    thumbnailTertiary: './images/jarvic-tertiary.jpg',
    year: 2024,
    role: 'Sole Flutter Developer',
  },
  {
    id: 'project-cse-archive',
    title: 'CSE Archive',
    summary:
      "An open-access archive of Shiraz University's Computer Engineering study materials, featuring a Flutter frontend and Django REST backend. The accompanying Telegram bot handles user feedback and resource donations.",
    tags: ['Flutter', 'Django', 'REST API', 'PostgreSQL', 'Telegram API'],
    url: 'https://csearchive.ir',
    repoUrl: 'https://github.com/CSE-Archive',
    year: 2022,
    thumbnail: './images/cse-archive-main.jpg',
    thumbnailSecondary: './images/cse-archive-secondary.jpg',
    thumbnailTertiary: './images/cse-archive-tertiary.jpg',
    role: 'Design & Development',
  },
]
