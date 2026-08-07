import React, { useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { StoreProvider, useStore } from './src/store';
import { TabBar, type Tab } from './src/nav';
import { Login } from './src/screens/Login';
import { Reminders } from './src/screens/Reminders';
import { Calendar } from './src/screens/Calendar';
import { Notes } from './src/screens/Notes';
import { Habits } from './src/screens/Habits';
import { Add } from './src/screens/Add';
import { T, PAGE_MAX_WIDTH } from './src/theme';

function Root() {
  const { ready, session } = useStore();
  // Signing in lands on the Calendar, as the suite does — "what's on today"
  // shouldn't depend on which icon you opened.
  const [tab, setTab] = useState<Tab>('calendar');
  if (!ready) return <View style={s.page} />;
  if (!session) return <Login />;
  return (
    <View style={s.page}>
      {/* Phone-first column, centred on a wide window — the suite's page shape. */}
      <View style={s.centre}>
        <View style={s.body}>
          {tab === 'reminders' && <Reminders />}
          {tab === 'calendar' && <Calendar />}
          {tab === 'add' && <Add done={() => setTab('calendar')} />}
          {tab === 'notes' && <Notes />}
          {tab === 'habits' && <Habits />}
        </View>
      </View>
      <TabBar tab={tab} onTab={setTab} />
    </View>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <SafeAreaView style={s.page}>
        <StatusBar barStyle="light-content" backgroundColor={T.bg} />
        <Root />
      </SafeAreaView>
    </StoreProvider>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  centre: { flex: 1, alignItems: 'center' },
  body: { flex: 1, width: '100%', maxWidth: PAGE_MAX_WIDTH },
});
