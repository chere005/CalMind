import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
// RN's own SafeAreaView is iOS-only — on Android the top bar sat under the
// status bar and the tab bar under the gesture bar. This one insets on both.
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import { TabBar, NavCtx, type Tab } from './src/nav';
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
  // The tab survives a refresh, and every switch feeds the back stack.
  const [tab, setTabState] = useState<Tab>(() => {
    if (typeof localStorage !== 'undefined') {
      const t = localStorage.getItem('calmind.tab');
      if (t === 'reminders' || t === 'calendar' || t === 'add' || t === 'notes' || t === 'habits') return t;
    }
    return 'calendar';
  });
  const backStack = React.useRef<Tab[]>([]);
  const [canBack, setCanBack] = useState(false);
  const setTab = (t: Tab) => {
    if (t !== tab) {
      backStack.current.push(tab);
      setCanBack(true);
    }
    setTabState(t);
    if (typeof localStorage !== 'undefined') localStorage.setItem('calmind.tab', t);
  };
  const goBack = () => {
    const prev = backStack.current.pop();
    setCanBack(backStack.current.length > 0);
    if (prev) {
      setTabState(prev);
      if (typeof localStorage !== 'undefined') localStorage.setItem('calmind.tab', prev);
    }
  };
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
    <NavCtx.Provider value={{ canBack, goBack }}>
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
    </NavCtx.Provider>
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
      <SafeAreaProvider>
        <SafeAreaView key={themeGen} testID="page-root" style={s.page} edges={['top', 'bottom', 'left', 'right']}>
          <StatusBar barStyle={light ? 'dark-content' : 'light-content'} backgroundColor={T.bg} />
          <Root />
        </SafeAreaView>
      </SafeAreaProvider>
    </StoreProvider>
  );
}

const s = themed(() => StyleSheet.create({
  page: { flex: 1, backgroundColor: T.bg },
  centre: { flex: 1, alignItems: 'center' },
  body: { flex: 1, width: '100%', maxWidth: PAGE_MAX_WIDTH },
}));
