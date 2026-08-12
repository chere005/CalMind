/**
 * The section drag — level 0 of the suite's outline: a section travels as a
 * block and lands only between other sections. Sections have variable
 * heights, so this drag MEASURES: every section header registers a ref, the
 * grant measures them all in window space, and the pointer's absolute Y picks
 * the slot. The drop line is the only feedback, as ever.
 */
import { useRef, useState } from 'react';
import { PanResponder, type PanResponderInstance, type View } from 'react-native';

export type SectionSlot = { key: string; folderId: string; beforeSectionId: string | null };

export function useSectionDrag(
  onDrop: (sectionId: string, slot: SectionSlot) => void,
): {
  registerHeader: (sectionId: string, folderId: string) => (ref: View | null) => void;
  gripFor: (sectionId: string) => PanResponderInstance['panHandlers'];
  dragging: string | null;
  lineKey: string | null;
} {
  const headers = useRef(new Map<string, { ref: View; folderId: string }>());
  const [dragging, setDragging] = useState<string | null>(null);
  const [lineKey, setLineKey] = useState<string | null>(null);
  const slots = useRef<{ y: number; slot: SectionSlot }[]>([]);
  const live = useRef<SectionSlot | null>(null);
  const responders = useRef(new Map<string, PanResponderInstance>());

  const registerHeader = (sectionId: string, folderId: string) => (ref: View | null) => {
    if (ref) headers.current.set(sectionId, { ref, folderId });
    else headers.current.delete(sectionId);
  };

  const measure = async () => {
    const entries = [...headers.current.entries()];
    const measured = await Promise.all(
      entries.map(
        ([id, { ref, folderId }]) =>
          new Promise<{ id: string; folderId: string; y: number }>((res) =>
            ref.measureInWindow((_x, y) => res({ id, folderId, y })),
          ),
      ),
    );
    measured.sort((a, b) => a.y - b.y);
    const list: { y: number; slot: SectionSlot }[] = [];
    for (let i = 0; i < measured.length; i++) {
      const m = measured[i]!;
      // A slot ABOVE each header: land before this section, in its folder.
      list.push({ y: m.y, slot: { key: `before:${m.id}`, folderId: m.folderId, beforeSectionId: m.id } });
      // A trailing end-of-folder slot when the next header starts a new folder.
      const next = measured[i + 1];
      if (!next || next.folderId !== m.folderId) {
        const endY = next ? next.y - 1 : m.y + 400;
        list.push({ y: endY, slot: { key: `end:${m.folderId}`, folderId: m.folderId, beforeSectionId: null } });
      }
    }
    slots.current = list;
  };

  const gripFor = (sectionId: string) => {
    const key = sectionId;
    if (!responders.current.has(key)) {
      responders.current.set(
        key,
        PanResponder.create({
          onStartShouldSetPanResponder: () => true,
          onMoveShouldSetPanResponder: () => true,
          // As in the row drag: the enclosing ScrollView asks to take the
          // gesture over as soon as it travels, and yielding meant the drag
          // died on any list long enough to scroll.
          onPanResponderTerminationRequest: () => false,
          onPanResponderGrant: () => {
            setDragging(sectionId);
            setLineKey(null);
            live.current = null;
            void measure();
          },
          onPanResponderMove: (_e, g) => {
            const y = g.moveY;
            let hit: { y: number; slot: SectionSlot } | null = null;
            for (const s of slots.current) {
              if (s.y <= y) hit = s;
            }
            // Landing on your own boundary is a no-op, not a hint.
            if (hit && hit.slot.beforeSectionId === sectionId) hit = null;
            live.current = hit?.slot ?? null;
            setLineKey(hit?.slot.key ?? null);
          },
          onPanResponderRelease: () => {
            const slot = live.current;
            setDragging(null);
            setLineKey(null);
            if (slot) onDrop(sectionId, slot);
          },
          onPanResponderTerminate: () => {
            setDragging(null);
            setLineKey(null);
          },
        }),
      );
    }
    return responders.current.get(key)!.panHandlers;
  };

  return { registerHeader, gripFor, dragging, lineKey };
}
