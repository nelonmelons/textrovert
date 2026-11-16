import { Pressable, Text, View } from 'react-native';
import { router, Stack } from 'expo-router';
import { friends } from '../fixtures';
import { MiaConversation } from '../chat';
import { Theme, Type } from '../theme';
import { Bubble, ServiceIcon, SourceHeader } from '../components/Paper';
import { PaperScroll } from '../components/PaperScroll';

export default function Conversation() {
  return (
    <>
      <Stack.Screen
        options={{
          headerRight: () => (
            <Pressable onPress={() => router.back()} hitSlop={10}>
              <Text style={[Type.body, { color: Theme.accent, fontWeight: '600' }]}>Done</Text>
            </Pressable>
          ),
        }}
      />
      <PaperScroll contentContainerStyle={{ padding: 24, gap: 18 }}>
        <SourceHeader friend={friends[0]} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
          <ServiceIcon service="iMessage" />
          <Text style={[Type.caption, { color: Theme.secondary, fontWeight: '600' }]}>Nov 14</Text>
        </View>
        <Bubble text={MiaConversation.first} meta="Mia · 5:10 PM" cited />
        <Bubble text={MiaConversation.middle} meta="You · 5:40 PM" fromMe />
        <Bubble text={MiaConversation.last} meta="Mia · 5:41 PM" cited />
      </PaperScroll>
    </>
  );
}
