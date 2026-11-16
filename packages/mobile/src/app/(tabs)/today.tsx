import { ComingSoon } from '@/components/ComingSoon';
import { useTheme } from '@/theme';

export default function Today() {
  const theme = useTheme();
  return (
    <ComingSoon
      title="Today"
      tone={theme.tones.activities}
      art={require('../../../assets/hedgehog-leaf.png')}
      blurb="A calm morning page for the people you care about."
      teasers={['Plans and birthdays coming up', 'Replies worth sending', 'A friend to check in with']}
    />
  );
}
