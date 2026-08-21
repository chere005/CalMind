/**
 * The measure as a BADGE beside the name it belongs to.
 *
 * Sean's ask, 2026-08-18: "when units are pulled out, they should become
 * badges" — then 2026-08-20: "put a badge around the units, drop the dumb
 * emojis, and put the units after the item name, not far off to the side."
 *
 * So: no icon, and no `marginLeft: auto`. The badge used to be pushed to the
 * row's right edge with a 🥄 or a ⚖️ in front of it, which read as a column
 * of decorations rather than as part of the ingredient — "2 cups" belongs
 * next to "flour", not eight centimetres away from it. The pill stays, with a
 * border now that there is no icon to say "this is a thing of its own".
 *
 * One component for every surface that draws an ingredient (the recipe
 * editor's rows and the note's rendered body), so the treatment cannot drift
 * between them.
 */
import { StyleSheet, Text, View } from 'react-native';
import { themed, T } from '../theme';

export function UnitBadge({ qty, unit }: { qty: string; unit: string | null }) {
  return (
    <View testID="ing-badge" style={s.chip}>
      {/* ing-unit carries ONLY the words, as it always has — the specs that
          read '2 cups' out of it stay honest about what is on screen. */}
      <Text testID="ing-unit" style={s.label}>{[qty, unit].filter(Boolean).join(' ')}</Text>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  chip: {
    backgroundColor: T.surface2,
    borderWidth: 1,
    borderColor: T.line,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 999,
    overflow: 'hidden',
    // Beside the name, not banished to the edge. flexShrink 0 so a long
    // ingredient elides its NAME rather than squeezing the measure.
    marginLeft: 8,
    flexShrink: 0,
  },
  label: { color: T.dim, fontSize: 13 },
}));
