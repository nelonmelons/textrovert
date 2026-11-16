import { useEffect, useRef } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

import { PORTRAIT_HTML } from './portraitHtml';

export interface PortraitWebViewProps {
  /** The GET /portrait body as text (fetchPortraitJson in src/api/friend.ts); null while it loads. */
  portraitJson: string | null;
  /** A person tapped in the orbit, rivers or atlas: open their profile. */
  onOpenPerson: (person: { name: string; personId: string }) => void;
  onHaptic?: (style: 'light' | 'medium') => void;
  style?: StyleProp<ViewStyle>;
}

/** Web build of PortraitWebView: the same bundled page in an iframe, talking over window.postMessage. */
export function PortraitWebView({ portraitJson, onOpenPerson, onHaptic, style }: PortraitWebViewProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);
  const latest = useRef({ portraitJson, onOpenPerson, onHaptic });
  latest.current = { portraitJson, onOpenPerson, onHaptic };

  const send = () => {
    if (ready.current && latest.current.portraitJson) frame.current?.contentWindow?.postMessage({ type: 'textrovert:portrait', portrait: latest.current.portraitJson }, '*');
  };
  useEffect(send, [portraitJson]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      const message = event.data as { type?: string; name?: string; personId?: string; style?: 'light' | 'medium' };
      if (message?.type === 'textrovert:ready') {
        ready.current = true;
        send();
      } else if (message?.type === 'textrovert:open-person' && message.name && message.personId) latest.current.onOpenPerson({ name: message.name, personId: message.personId });
      else if (message?.type === 'textrovert:haptic' && message.style) latest.current.onHaptic?.(message.style);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  return (
    <View style={[{ flex: 1, backgroundColor: '#0b0810' }, style]}>
      <iframe ref={frame} title="Portrait" srcDoc={PORTRAIT_HTML} style={{ border: 0, width: '100%', height: '100%', display: 'block' }} />
    </View>
  );
}
