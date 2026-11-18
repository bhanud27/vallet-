import { Choice } from '../lib/types';

export const colors = {
  bg: '#F7F6F2',
  surface: '#FFFFFF',
  ink: '#19172A',
  muted: '#605C6F',
  border: '#E7E3EB',
  accent: '#5C39C4',
  accentSoft: '#F0EAFF',
  tag: '#DEFA83',
  buy: '#17704B',
  wait: '#6441AD',
  skip: '#5B586B',
  danger: '#B3261E',
  dangerBg: '#FCE8E6',
  warnBg: '#FFF3CD',
  warnInk: '#5C4300',
  infoBg: '#F0EAFF',
  infoInk: '#4B3286',
  okBg: '#DDF3E7',
  okInk: '#0E4B30',
};

export const choiceColor: Record<Choice, string> = { buy: colors.buy, wait: colors.wait, skip: colors.skip };
export const choiceBackground: Record<Choice, string> = { buy: '#EAF6EE', wait: '#F2EBFF', skip: '#F1EFF3' };

export const type = {
  title: { fontSize: 26, fontWeight: '800' as const, color: colors.ink, letterSpacing: -0.4 },
  h2: { fontSize: 18, fontWeight: '800' as const, color: colors.ink },
  body: { fontSize: 16, lineHeight: 22, color: colors.ink },
  small: { fontSize: 13, lineHeight: 18, color: colors.muted },
};
