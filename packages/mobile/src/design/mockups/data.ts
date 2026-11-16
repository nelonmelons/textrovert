import type { EmojiAvatarProps, FillName, TabItem } from '@/design';

/** Fictional people and content for the mockups only. */
export const hedgehog = {
  dance: require('../../../assets/art/hedgehog-dance.png'),
  reader: require('../../../assets/art/hedgehog-reader.png'),
  leaf: require('../../../assets/art/hedgehog-leaf.png'),
  toast: require('../../../assets/art/hedgehog-toast.png'),
};

export const mascot: EmojiAvatarProps = { name: 'Textrovert', image: hedgehog.dance, color: 'blue' };

export const friends: (EmojiAvatarProps & { name: string; status: string; emoji?: string; last: string })[] = [
  { name: 'Mira Okafor', status: 'Planning the cabin trip', last: '2m', emoji: '🏕️' },
  { name: 'Theo Lindqvist', status: 'Owes you a coffee', last: '1h' },
  { name: 'Juno Park', status: 'Birthday on Saturday 🎂', last: '3h', emoji: '🎂' },
  { name: 'Sami Haddad', status: 'Sent 14 voice notes', last: 'Tue' },
  { name: 'Ines Duarte', status: 'Asked about the playlist', last: 'Mon', emoji: '🎧' },
  { name: 'Kit Moreau', status: 'Quiet lately', last: 'Sun' },
];

export const heroStack: EmojiAvatarProps[] = [
  { name: 'Mira Okafor', color: 'pink' },
  { emoji: '🎂', color: 'yellow' },
  mascot,
  { emoji: '🏕️', color: 'mint' },
  { name: 'Theo Lindqvist', color: 'peach' },
  { emoji: '😂', color: 'lilac' },
  { image: hedgehog.reader, color: 'white', name: 'Reader' },
];

export const plans: { title: string; when: string; emoji: string; color: FillName; people: string[] }[] = [
  { title: 'Cabin weekend', when: 'Fri – Sun · 4 going', emoji: '🏕️', color: 'mint', people: ['Mira Okafor', 'Theo Lindqvist', 'Juno Park'] },
  { title: "Juno's birthday dinner", when: 'Sat 7:30 pm', emoji: '🎂', color: 'yellow', people: ['Juno Park', 'Ines Duarte'] },
  { title: 'Return the tent', when: 'Mon · you promised', emoji: '⛺️', color: 'peach', people: ['Sami Haddad'] },
];

export const topics: { emoji: string; label: string; color: FillName; detail: string }[] = [
  { emoji: '🍜', label: 'Food spots', color: 'peach', detail: '412 mentions' },
  { emoji: '✈️', label: 'Trips', color: 'lilac', detail: '288 mentions' },
  { emoji: '🎧', label: 'Music', color: 'mint', detail: '203 mentions' },
  { emoji: '🐶', label: 'Pets', color: 'yellow', detail: '167 mentions' },
  { emoji: '💼', label: 'Work drama', color: 'blue', detail: '120 mentions' },
  { emoji: '💌', label: 'Crushes', color: 'pink', detail: '96 mentions' },
];

export const tabs: TabItem[] = [
  { key: 'today', label: 'Today', emoji: '☀️' },
  { key: 'ask', label: 'Ask', emoji: '💬' },
  { key: 'people', label: 'People', emoji: '👯' },
  { key: 'you', label: 'You', emoji: '🦔' },
];
