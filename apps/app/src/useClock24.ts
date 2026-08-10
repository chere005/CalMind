/**
 * Does this account want 24-hour times?
 *
 * One hook rather than `prefsOf(recs, 'suite').clock24` scattered through the
 * screens: the setting is only useful if EVERY surface honours it, and a
 * surface that forgets is a surface that quietly disagrees with the others —
 * which is the shape of most of the bugs in this repo.
 *
 * The watch and the widget cannot call this: they are other processes, in
 * another language. They get the flag in the feed instead (watchFeed's
 * `clock24`), which is the same value from the same record.
 */
import { prefsOf } from '@calmind/core';
import { useStore } from './store';

export function useClock24(): boolean {
  const { recs } = useStore();
  return prefsOf(recs, 'suite').clock24 === true;
}
