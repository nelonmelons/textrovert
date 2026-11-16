import { View } from 'react-native';

import { Friend, firstName } from '../../people';
import { Chip, Txt, space } from '@/design';
import { ProfileCard } from './ProfileCard';

// Placeholder until interests come from the server (convex/interests.ts): a stable pick per friend.
const POOL: { emoji: string; label: string; gift: string }[] = [
  { emoji: '🧗', label: 'Bouldering', gift: 'A new chalk bag' },
  { emoji: '🍜', label: 'Ramen spots', gift: 'Ramen night, your treat' },
  { emoji: '🎧', label: 'Indie playlists', gift: 'Tickets to a small show' },
  { emoji: '✈️', label: 'Japan travel', gift: 'A Kyoto guidebook' },
  { emoji: '📚', label: 'Fantasy novels', gift: 'The next book in their series' },
  { emoji: '🎮', label: 'Co-op games', gift: 'A two-player game' },
  { emoji: '☕️', label: 'Coffee', gift: 'Beans from a local roaster' },
  { emoji: '🏃', label: 'Running', gift: 'Running socks' },
  { emoji: '🎬', label: 'A24 films', gift: 'An A24 poster' },
  { emoji: '🌱', label: 'Houseplants', gift: 'A trailing pothos' },
  { emoji: '📸', label: 'Film photos', gift: 'A roll of Portra 400' },
  { emoji: '🍳', label: 'Cooking', gift: 'A good chef’s knife' },
  { emoji: '🎤', label: 'Karaoke', gift: 'A karaoke night' },
  { emoji: '🏀', label: 'NBA', gift: 'Tickets to a game' },
  { emoji: '🧶', label: 'Crochet', gift: 'A skein of nice yarn' },
  { emoji: '🎨', label: 'Sketching', gift: 'A pocket sketchbook' },
];

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export function interestsFor(friend: Friend) {
  let seed = hash(friend.id);
  const pool = [...POOL];
  const out: typeof POOL = [];
  const count = 4 + (seed % 3);
  while (out.length < count && pool.length) {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    out.push(pool.splice(seed % pool.length, 1)[0]);
  }
  return out;
}

/** A gift idea that fits this friend's top interest. */
export const giftFor = (friend: Friend) => interestsFor(friend)[0].gift;

/** The friend's interests as glass chips, under a sticker title like the other profile cards. */
export function Interests({ friend }: { friend: Friend }) {
  const items = interestsFor(friend);
  return (
    <ProfileCard title="Interests">
      <Txt variant="subhead" tone="secondary">
        What {firstName(friend)} talks about most
      </Txt>
      <View accessibilityRole="list" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {items.map((item) => (
          <Chip key={item.label} emoji={item.emoji} label={item.label} />
        ))}
      </View>
    </ProfileCard>
  );
}
