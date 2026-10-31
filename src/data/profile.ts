import { Profile } from './types'

export const profile: Profile = {
  name: 'Reza Farjam',
  role: 'Frontend Engineer',
  tagline:
    'I build web and cross-platform applications using Angular and Flutter, backed by hands-on experience with the APIs and systems behind them.',
  location: 'Shiraz, Iran',
  about: [
    'Computer Engineering graduate from Shiraz University with professional experience building and shipping mobile and web applications. My primary frontend technologies are Angular, TypeScript, and Flutter.',
    "Beyond frontend development, I've built Django APIs and independently developed Mashinaam, a complete product spanning a Flutter application, Node.js/TypeScript backend, and React admin panel.",
    'I also write about Flutter engineering on Medium and previously served as a teaching assistant for Python Fundamentals at my university.',
  ],
  aboutExtra: {
    title: 'Beyond the code',
    paragraphs: [
      {
        text: "Outside of development, I'm a big fan of board games and point-and-click adventure games. I enjoy movies too, and if the visual direction of this website hasn't given it away already, TRON: Legacy is probably my all-time favorite. I used to produce music as well, and my old tracks are still up on {link} if you want a listen.",
        link: { label: 'SoundCloud', url: 'https://soundcloud.com/f4rjam' },
      },
      'I\'m also naturally curious and enjoy exploring new things. This portfolio is one example: I used it as an opportunity to experiment with vibe coding while finally checking "build my own website" off a rather old to-do list.',
    ],
  },
  links: [
    {
      label: 'GitHub',
      url: 'https://github.com/reza00farjam',
      kind: 'github',
    },
    {
      label: 'LinkedIn',
      url: 'https://www.linkedin.com/in/reza00farjam/',
      kind: 'linkedin',
    },
    {
      label: 'Stack Overflow',
      url: 'https://stackoverflow.com/users/13993137',
      kind: 'website',
    },
    {
      label: 'Medium',
      url: 'https://medium.com/@reza00farjam',
      kind: 'website',
    },
    {
      label: 'Email',
      url: 'mailto:reza00farjam@gmail.com',
      kind: 'email',
    },
  ],
}
