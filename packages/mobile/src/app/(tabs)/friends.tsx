import { ComingSoon } from '@/components/ComingSoon';
import { useTheme } from '@/theme';

export default function Friends() {
  const theme = useTheme();
  return <ComingSoon title="Friends" tone={theme.tones.activities} blurb="Friend profiles with plans, gifts and memories will land here when the Friends screens are ported." />;
}
