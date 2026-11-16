import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { grid, useTheme } from '@/theme';

/** The notebook grid behind a screen, like Paper.swift's GridPaper (without the scroll drift). */
export function GridPaper() {
  const theme = useTheme();
  const [size, setSize] = useState({ width: 0, height: 0 });
  const columns = Math.ceil(size.width / grid.cell) + 1;
  const rows = Math.ceil(size.height / grid.cell) + 1;
  const line = (i: number) => (i % grid.majorEvery === 0 ? { backgroundColor: theme.gridMajor, size: 0.75 } : { backgroundColor: theme.gridLine, size: 0.5 });
  return (
    <View
      pointerEvents="none"
      aria-hidden
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ width: e.nativeEvent.layout.width, height: e.nativeEvent.layout.height })}>
      {Array.from({ length: columns }, (_, i) => {
        const l = line(i);
        return <View key={'c' + i} style={{ position: 'absolute', top: 0, bottom: 0, left: i * grid.cell, width: l.size, backgroundColor: l.backgroundColor }} />;
      })}
      {Array.from({ length: rows }, (_, i) => {
        const l = line(i);
        return <View key={'r' + i} style={{ position: 'absolute', left: 0, right: 0, top: i * grid.cell, height: l.size, backgroundColor: l.backgroundColor }} />;
      })}
    </View>
  );
}
