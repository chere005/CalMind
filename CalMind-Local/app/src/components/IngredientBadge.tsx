/**
 * The measure as a BADGE, iconized — Sean's ask, 2026-08-18: "when units are
 * pulled out, they should become badges that are iconized somehow, don't
 * just make it part of the text as well." One component for every surface
 * that draws an ingredient (the recipe editor's rows and the note's
 * rendered body), so the treatment cannot drift between them.
 *
 * The icon comes from the unit's FAMILY — spoons, cups, weight, liquid —
 * not from a per-unit table pretending to more precision than it has. A
 * unit outside the families (cloves, cans, bare counts) wears the badge
 * alone: a wrong icon is worse than none, the ingredientParts honesty rule
 * one level up.
 */
import { StyleSheet, Text, View } from 'react-native';
import { themed, T } from '../theme';

const UNIT_ICON: Record<string, string> = {
  tsp: '🥄', tbsp: '🥄',
  cup: '🥣', cups: '🥣',
  g: '⚖️', kg: '⚖️', oz: '⚖️', lb: '⚖️', lbs: '⚖️',
  ml: '💧', l: '💧',
};

export function UnitBadge({ qty, unit }: { qty: string; unit: string | null }) {
  const icon = unit ? UNIT_ICON[unit.toLowerCase()] ?? null : null;
  return (
    <View testID="ing-badge" style={s.chip}>
      {icon !== null && <Text style={s.icon}>{icon}</Text>}
      {/* The label keeps the ing-unit testID and carries ONLY the words —
          the specs that read '2 cups' out of it stay honest about what a
          screen reader hears past the icon. */}
      <Text testID="ing-unit" style={s.label}>{[qty, unit].filter(Boolean).join(' ')}</Text>
    </View>
  );
}

const s = themed(() => StyleSheet.create({
  // The editor's old unitChip, made a View so the icon can sit beside the
  // words: same pill, same right-justification (marginLeft auto).
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: T.surface2,
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginLeft: 'auto',
    flexShrink: 0,
  },
  icon: { fontSize: 11 },
  label: { color: T.dim, fontSize: 13 },
}));
