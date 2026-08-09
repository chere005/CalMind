/**
 * The spec replayer — spec/*.json is the shared behavior contract this core must
 * satisfy identically to the web reference and the native Swift/Kotlin cores.
 * Changing a behavior starts by amending the vector, never by editing a test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseWhenFromText, repeatStep, repeatDates, repeatNext, sortByDate } from '../src/index';
import type { Repeat } from '../src/index';

const vectors = <T>(name: string): T =>
  JSON.parse(readFileSync(fileURLToPath(new URL(`../../../spec/${name}.json`, import.meta.url)), 'utf8'));

type ParseCase = { name: string; input: string; today: string; now?: string; text: string; date: string | null; time: string | null };

describe('spec/parse.json — the slash-only US-order parser', () => {
  for (const c of vectors<ParseCase[]>('parse')) {
    it(c.name, () => {
      const [text, date, time] = parseWhenFromText(c.input, c.today, c.now);
      expect({ text, date, time }).toEqual({ text: c.text, date: c.date, time: c.time });
    });
  }
});

type StepCase = { name: string; start: string; unit: Repeat['unit']; n: number; i: number; expect: string };
type WindowCase = { name: string; start: string; repeat: Repeat | null; from: string; to: string; expect: string[] };
type NextCase = { name: string; start: string; unit: Repeat['unit']; n: number; after: string; expect: string };

describe('spec/repeats.json — clamped steps, window expansion, tick rolls', () => {
  const r = vectors<{ step: StepCase[]; window: WindowCase[]; next: NextCase[] }>('repeats');
  for (const c of r.step) {
    it(c.name, () => expect(repeatStep(c.start, { n: c.n, unit: c.unit }, c.i)).toBe(c.expect));
  }
  for (const c of r.window) {
    it(c.name, () => expect(repeatDates(c.start, c.repeat, c.from, c.to)).toEqual(c.expect));
  }
  for (const c of r.next) {
    it(c.name, () => expect(repeatNext(c.start, { n: c.n, unit: c.unit }, c.after)).toBe(c.expect));
  }
});

type SortCase = { name: string; rows: { id: string; due?: string; indent?: number }[]; expect: string[] };

describe('spec/sort.json — undated-first outline blocks', () => {
  for (const c of vectors<SortCase[]>('sort')) {
    it(c.name, () => expect(sortByDate(c.rows).map((r) => r.id)).toEqual(c.expect));
  }
});
