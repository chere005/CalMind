import React, { useEffect, useState } from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { StoreProvider, useStore } from './src/store';
import { TabBar, type Tab } from './src/nav';
import { Login } from './src/screens/Login';
import { Reminders } from './src/screens/Reminders';
import { Calendar } from './src/screens/Calendar';
import { Notes } from './src/screens/Notes';
import { Habits } from './src/screens/Habits';
import { Add } from './src/screens/Add';
import { QuickTick } from './src/screens/QuickTick';
import { themed, currentTheme, onThemeChange, T, THEMES_LIGHT, PAGE_MAX_WIDTH } from './src/theme';

function Root() {
  const { ready, session } = useStore();
  // Signing in lands on the Calendar, as the suite does — "what's on today"
  // shouldn't depend on which icon you opened.
  const [tab, setTab] = useState<Tab>('calendar');
  // The widget's row link: ?tick=<id> opens the one-reminder Done page
  // (the suite's quick.php mode), on the signed-in session only.
  const [tickId, setTickId] = useState<string | null>(() => {
    if (typeof location === 'undefined') return null;
    return new URLSearchParams(location.search).get('tick');
  });
  const tickDone = () => {
    setTickId(null);
    if (typeof history !== 'undefined') history.replaceState(null, '', location.pathname);
  };
  // A note made anywhere opens in its editor — the Add tab hands the id over.
  const [noteToOpen, setNoteToOpen] = useState<string | null>(null);
  if (!ready) return <View style={s.page} />;
  if (!session) return <Login />;
  if (tickId) return <QuickTick id={tickId} onDone={tickDone} />;
  return (
    <View style={s.page}>
      {/* Phone-first column, centred on a wide window — the suite's page shape. */}
      <View style={s.centre}>
        <View style={s.body}>
          {tab === 'reminders' && <Reminders />}
          {tab === 'calendar' && (
            <Calendar
              onNoteCreated={(id) => {
                setNoteToOpen(id);
                setTab('notes');
              }}
            />
          )}
          {tab === 'add' && (
            <Add
              done={() => setTab('calendar')}
              onNoteCreated={(id) => {
                setNoteToOpen(id);
                setTab('notes');
              }}
            />
          )}
          {tab === 'notes' && <Notes openNoteId={noteToOpen} onOpenConsumed={() => setNoteToOpen(null)} />}
          {tab === 'habits' && <Habits />}
        </View>
      </View>
      <TabBar tab={tab} onTab={setTab} />
    </View>
  );
}

export default function App() {
  // A theme switch remounts the whole tree: every themed() sheet re-creates
  // itself under the new palette, and no component has to know.
  const [themeGen, setThemeGen] = useState(0);
  useEffect(() => onThemeChange(() => setThemeGen((g) => g + 1)), []);
  const light = THEMES_LIGHT.includes(currentTheme());
  return (
    <StoreProvider>
      <SafeAreaView key={themeGen} testID="page-root" style={s.page}>
        <StatusBar barStyle={light ? 'dark-content' : 'light-content'} backgroundColor={T.bg} />
        <Root />
      </SafeAreaView>
    </StoreProvider>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  centre: { flex: 1, alignItems: 'center' },
  body: { flex: 1, width: '100%', maxWidth: PAGE_MAX_WIDTH },
}));
