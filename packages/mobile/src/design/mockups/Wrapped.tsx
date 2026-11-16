import { useState } from 'react';
import { View } from 'react-native';

import { AvatarStack, BigButton, BigNumberTile, ChatBubble, GapBars, GuessButtons, MascotBadge, RecapRow, StorySlide, StoryTitle, Txt, space } from '@/design';
import { hedgehog, mascot } from './data';

const COUNT = 8;
const you = { id: 'you', name: 'You', color: 'blue' as const, emoji: '😎' };
const friend = { id: 'mira', name: 'Mira Okafor', color: 'pink' as const };

/** Maps to OpenerScene: who, which range, how much was read. */
export function OpenerSlide() {
  return (
    <StorySlide accent="yellow" index={0} count={COUNT} eyebrow="🎁 Wrapped · edition 1" footer={<Txt variant="subhead" tone="secondary" style={{ textAlign: 'center', fontWeight: '600' }}>Tap to start →</Txt>}>
      <AvatarStack size={84} overlap={0.22} bounce people={[you, { emoji: '💛', color: 'yellow' }, friend]} />
      <StoryTitle>You & Mira.</StoryTitle>
      <Txt variant="title3" style={{ fontWeight: '600' }}>Oct 15 – Nov 14 ✨</Txt>
      <Txt variant="body" tone="secondary">
        I read 2,418 of your messages with Mira and only kept moments I could trace back to the real texts.
      </Txt>
    </StorySlide>
  );
}

/** Maps to GuessScene + SplitButtons: the quote, then two big avatar keys; guessing reveals the speaker. */
export function GuessSlide() {
  const [guess, setGuess] = useState<string | null>(null);
  return (
    <StorySlide
      accent="pink"
      index={1}
      count={COUNT}
      eyebrow="🕵️ Who said it?"
      footer={
        guess ? (
          <View style={{ gap: space.md }}>
            <Txt variant="title2" style={{ textAlign: 'center' }}>{guess === 'mira' ? 'You called it 🎯' : 'Nope, it was Mira 🙈'}</Txt>
            <ChatBubble name="You" text="say less, I'm bringing the good snacks" time="3 min later" />
          </View>
        ) : (
          <GuessButtons people={[you, friend]} onGuess={setGuess} />
        )
      }>
      <Txt accessibilityRole="header" variant="display" style={{ fontSize: 38, lineHeight: 43, letterSpacing: -1.2 }}>
        “if we don't book the cabin tonight I'm booking it myself and charging you all interest”
      </Txt>
      <Txt variant="footnote" tone="secondary" style={{ fontWeight: '600' }}>Thu, Oct 23 · 21:04</Txt>
    </StorySlide>
  );
}

/** Maps to GhostScene: the count of long gaps in a tile, then the gaps themselves. */
export function GhostSlide() {
  return (
    <StorySlide accent="lilac" index={4} count={COUNT} eyebrow="👻 Your ghost era">
      <StoryTitle>You went quiet a few times.</StoryTitle>
      <BigNumberTile value="4" label="replies took over a day" emoji="👻" accent="lilac" bob />
      <GapBars accent="lilac" items={[{ label: '3d 4h', fraction: 1 }, { label: '1d 19h', fraction: 0.58 }, { label: '1d 6h', fraction: 0.4 }, { label: '1d 1h', fraction: 0.33 }]} />
      <Txt variant="footnote" tone="secondary">🔒 Private unless you choose to share it.</Txt>
    </StorySlide>
  );
}

/** Maps to FinaleScene: mascot art, the recap list, share and another edition. */
export function FinaleSlide() {
  return (
    <StorySlide
      accent="mint"
      index={COUNT - 1}
      count={COUNT}
      footer={
        <>
          <BigButton title="Share your Wrapped" emoji="📤" trailing={null} onPress={() => {}} />
          <BigButton title="Another edition" emoji="🔄" kind="secondary" trailing={null} onPress={() => {}} />
        </>
      }>
      <View style={{ alignItems: 'center', gap: space.lg }}>
        <MascotBadge image={hedgehog.toast} accent="mint" size={152} />
        <StoryTitle center>Cheers to you and Mira 🥂</StoryTitle>
      </View>
      <View style={{ gap: space.md }}>
        <RecapRow index={1} emoji="🏕️" accent="mint" text="The cabin ultimatum" />
        <RecapRow index={2} emoji="😂" accent="yellow" text="The running snack joke" />
        <RecapRow index={3} emoji="👻" accent="lilac" text="Your ghost era" />
      </View>
    </StorySlide>
  );
}

export const wrappedSlides = { opener: OpenerSlide, guess: GuessSlide, ghost: GhostSlide, finale: FinaleSlide };
export type WrappedSlideName = keyof typeof wrappedSlides;
