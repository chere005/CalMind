import React, { useEffect, useState } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';
// RN's own SafeAreaView is iOS-only — on Android the top bar sat under the
// status bar and the tab bar under the gesture bar. This one insets on both.
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StoreProvider, useStore } from './src/store';
import { ToastProvider } from './src/components/Toast';
import { TabBar, NavCtx, type Tab } from './src/nav';
import { Login } from './src/screens/Login';
import { Notes } from './src/screens/Notes';
import { Shopping } from './src/screens/Shopping';
import { Add } from './src/screens/Add';
import { Search } from './src/screens/Search';
import { themed, currentTheme, onThemeChange, T, THEMES_LIGHT, PAGE_MAX_WIDTH } from './src/theme';

function Root() {
  const { ready, session } = useStore();
  // Signing in lands on NOTES. Upstream it is the calendar — "what's on today"
  // shouldn't depend on which icon you opened — and there is no calendar here.
  // Notes is where the recipes are, which is what this app is for.
  // The tab survives a refresh, and every switch feeds the back stack.
  const [tab, setTabState] = useState<Tab>(() => {
    if (typeof localStorage !== 'undefined') {
      const t = localStorage.getItem('chefmind.tab');
      // 'reminders' is deliberately absent, and the absence does work: a
      // browser that used the old build has that string in localStorage, and
      // accepting it would land on a tab that no longer renders anything.
      if (t === 'add' || t === 'notes' || t === 'shopping') return t;
    }
    return 'notes';
  });
  const backStack = React.useRef<Tab[]>([]);
  const [canBack, setCanBack] = useState(false);
  const setTab = (t: Tab) => {
    if (t !== tab) {
      backStack.current.push(tab);
      setCanBack(true);
    }
    setTabState(t);
    if (typeof localStorage !== 'undefined') localStorage.setItem('chefmind.tab', t);
  };
  const goBack = () => {
    const prev = backStack.current.pop();
    setCanBack(backStack.current.length > 0);
    if (prev) {
      setTabState(prev);
      if (typeof localStorage !== 'undefined') localStorage.setItem('chefmind.tab', prev);
    }
  };
  // A note made anywhere opens in its editor — the Add tab hands the id over.
  const [noteToOpen, setNoteToOpen] = useState<string | null>(null);
  // The 🔍 in every top bar opens the one search screen; a tapped result
  // closes it and goes where the thing lives (Sean, 2026-08-19).
  const [searchOpen, setSearchOpen] = useState(false);
  if (!ready) return <View style={s.page} />;
  if (!session) return <Login />;
  return (
    <NavCtx.Provider value={{ canBack, goBack, openSearch: () => setSearchOpen(true) }}>
    <View style={s.page}>
      {/* Phone-first column, centred on a wide window — the suite's page shape. */}
      <View style={s.centre}>
        <View style={s.body}>
          {tab === 'add' && (
            <Add
              done={() => setTab('notes')}
              onNoteCreated={(id) => {
                setNoteToOpen(id);
                setTab('notes');
              }}
            />
          )}
          {tab === 'notes' && <Notes openNoteId={noteToOpen} onOpenConsumed={() => setNoteToOpen(null)} />}
          {tab === 'shopping' && <Shopping />}
        </View>
      </View>
      <TabBar tab={tab} onTab={setTab} />
      {searchOpen && (
        <Search
          onClose={() => setSearchOpen(false)}
          onOpen={(hit) => {
            setSearchOpen(false);
            if (hit.kind === 'note') {
              setNoteToOpen(hit.id);
              setTab('notes');
            } else {
              // The only reminder records left are shopping rows.
              setTab('shopping');
            }
          }}
        />
      )}
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
          {/* The toast host wraps the tree so its popup is the LAST thing laid
              out in here, and therefore the thing drawn on top. Inside the
              safe area, so a centred notice is centred in the PAGE rather than
              in the screen the status bar is part of. */}
          <ToastProvider>
            <Root />
          </ToastProvider>
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
