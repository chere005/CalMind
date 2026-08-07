import React from 'react';
import { SafeAreaView, StatusBar, StyleSheet, View } from 'react-native';
import { StoreProvider, useStore } from './src/store';
import { Login } from './src/screens/Login';
import { Reminders } from './src/screens/Reminders';
import { T } from './src/theme';

function Root() {
  const { ready, session } = useStore();
  if (!ready) return <View style={s.page} />;
  return session ? <Reminders /> : <Login />;
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
});
