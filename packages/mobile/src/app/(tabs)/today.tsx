import { ComingSoon } from '@/components/ComingSoon';
import { useTheme } from '@/theme';

export default function Today() {
  const theme = useTheme();
  return <ComingSoon title="Today" tone={theme.tones.plans} blurb="Plans, birthdays and replies worth your attention will land here when the Today screen is ported." />;
}
