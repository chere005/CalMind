/**
 * One line of text with its inline markers RENDERED rather than shown.
 *
 * Sean, 2026-08-20: "apply bolds and italics to the recipes instead of the **
 * etc". The note's rendered body has always done this — richLines gives it
 * runs and it styles them — but two places drew a bare string instead and so
 * printed the asterisks: the recipe editor's ingredient and step rows, and
 * the badge branch of the note's own body, which threw the runs away to get
 * at the plain name.
 *
 * richLines is the same parser, given one line. Reusing it is the point: a
 * second implementation of "what does ** mean" is a second thing to get
 * wrong, and the two would drift the first time either changed.
 */
import { StyleSheet, Text, type StyleProp, type TextStyle } from 'react-native';
import { richLines } from '@calmind/core';

export function RichText({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  // One line in, one line out. A string that happens to start with '- ' or
  // '1. ' would be read as a bullet or a step and lose its marker, which is
  // right: callers pass the CONTENT of such a line, never the marker itself.
  const runs = richLines(text)[0]?.runs ?? [{ text }];
  return (
    <Text style={style}>
      {runs.map((r, i) => (
        <Text key={i} style={[r.bold && s.bold, r.italic && s.italic, r.under && s.under]}>
          {r.text}
        </Text>
      ))}
    </Text>
  );
}

const s = StyleSheet.create({
  bold: { fontWeight: '700' },
  italic: { fontStyle: 'italic' },
  under: { textDecorationLine: 'underline' },
});
