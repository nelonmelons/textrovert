import { Stack } from 'expo-router';

import { DesignFonts } from '@/design';

export default function DesignLayout() {
  return (
    <DesignFonts>
      <Stack screenOptions={{ headerShown: false }} />
    </DesignFonts>
  );
}
