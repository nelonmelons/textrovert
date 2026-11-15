import { ReactNode, useState } from 'react';
import { ScrollView, ScrollViewProps } from 'react-native';
import { Theme } from '../theme';
import { GridPaper } from './Paper';

export function PaperScroll({ children, ...props }: ScrollViewProps & { children: ReactNode }) {
  const [size, setSize] = useState({ width: 440, height: 1200 });
  return (
    <ScrollView
      {...props}
      style={[{ flex: 1, backgroundColor: Theme.paper }, props.style]}
      onContentSizeChange={(width, height) => setSize({ width, height })}
    >
      <GridPaper width={size.width} height={size.height + 800} />
      {children}
    </ScrollView>
  );
}
