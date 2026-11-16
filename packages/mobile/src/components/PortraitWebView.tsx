import { useEffect, useRef } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';

import { PORTRAIT_HTML } from './portraitHtml';

export interface PortraitWebViewProps {
  /** The GET /portrait body as text (fetchPortraitJson in src/api/friend.ts); null while it loads. */
  portraitJson: string | null;
  /** A person tapped in the orbit, rivers or atlas: open their profile. */
  onOpenPerson: (person: { name: string; personId: string }) => void;
  onHaptic?: (style: 'light' | 'medium') => void;
  style?: StyleProp<ViewStyle>;
}

type FromPortrait = { type: 'textrovert:ready' } | { type: 'textrovert:open-person'; name: string; personId: string } | { type: 'textrovert:haptic'; style: 'light' | 'medium' };

/**
 * The orbit/rivers/atlas portrait (packages/portrait, built into one HTML file) in a WebView. The page asks for its
 * data with "textrovert:ready"; the portrait JSON is injected then, and taps on a person come back as onOpenPerson.
 * Works offline: the page is bundled, only the data comes from the API.
 */
export function PortraitWebView({ portraitJson, onOpenPerson, onHaptic, style }: PortraitWebViewProps) {
  const web = useRef<WebView<object>>(null);
  const ready = useRef(false);
  const sent = useRef<string | null>(null);

  const inject = () => {
    if (!ready.current || !portraitJson || sent.current === portraitJson) return;
    sent.current = portraitJson;
    web.current?.injectJavaScript('window.textrovertPortrait(' + JSON.stringify(portraitJson) + ');true;');
  };
  useEffect(inject, [portraitJson]);

  const onMessage = (event: WebViewMessageEvent) => {
    let message: FromPortrait;
    try {
      message = JSON.parse(event.nativeEvent.data) as FromPortrait;
    } catch {
      return;
    }
    if (message.type === 'textrovert:ready') {
      ready.current = true;
      sent.current = null;
      inject();
    } else if (message.type === 'textrovert:open-person') onOpenPerson({ name: message.name, personId: message.personId });
    else if (message.type === 'textrovert:haptic') onHaptic?.(message.style);
  };

  return (
    <WebView
      ref={web}
      source={{ html: PORTRAIT_HTML, baseUrl: 'https://portrait.textrovert.local/' }}
      originWhitelist={['*']}
      onMessage={onMessage}
      style={[{ flex: 1, backgroundColor: '#0b0810' }, style]}
      containerStyle={{ backgroundColor: '#0b0810' }}
      bounces={false}
      overScrollMode="never"
      scrollEnabled={false}
      contentInsetAdjustmentBehavior="never"
      allowsLinkPreview={false}
      setSupportMultipleWindows={false}
    />
  );
}
