/** The marker → styled-run contract the note body renders by. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { noteBulletDots, noteListEdit, richLines } from '../src/richtext';

type ListEditCase = {
  name: string;
  previous: string;
  next: string;
  result: { text: string; caret: number } | null;
};
type BulletDotsCase = { name: string; text: string; result: string };
const editCases = JSON.parse(readFileSync(
  fileURLToPath(new URL('../../../spec/richtext.json', import.meta.url)), 'utf8',
)) as {
  bulletDots: BulletDotsCase[];
  listEdit: ListEditCase[];
  sequences: { name: string; initial: string; steps: { next: string; result: { text: string; caret: number } | null }[] }[];
};

describe('noteBulletDots', () => {
  for (const c of editCases.bulletDots) {
    it(c.name, () => {
      const result = noteBulletDots(c.text);
      expect(result).toBe(c.result);
      expect(result.length).toBe(c.text.length);
    });
  }
});

describe('richLines', () => {
  it('renders bold, italic and underline runs', () => {
    expect(richLines('a **b** c')[0]!.runs).toEqual([
      { text: 'a ' }, { text: 'b', bold: true }, { text: ' c' },
    ]);
    expect(richLines('*i* and __u__')[0]!.runs).toEqual([
      { text: 'i', italic: true }, { text: ' and ' }, { text: 'u', under: true },
    ]);
  });
  it('nests: bold inside italic', () => {
    expect(richLines('*a **b***')[0]!.runs).toEqual([
      { text: 'a ', italic: true }, { text: 'b', bold: true, italic: true },
    ]);
  });
  it('an unclosed marker styles the rest of its line, never the next', () => {
    const lines = richLines('**loud\nquiet');
    expect(lines[0]!.runs).toEqual([{ text: 'loud', bold: true }]);
    expect(lines[1]!.runs).toEqual([{ text: 'quiet' }]);
  });
  it('reads the line prefixes', () => {
    expect(richLines('> wise words')[0]).toEqual({ kind: 'quote', runs: [{ text: 'wise words' }] });
    expect(richLines('- milk')[0]).toEqual({ kind: 'bullet', runs: [{ text: 'milk' }] });
    expect(richLines('* milk')[0]).toEqual({ kind: 'bullet', runs: [{ text: 'milk' }] });
    expect(richLines('• milk')[0]).toEqual({ kind: 'bullet', runs: [{ text: 'milk' }] });
    expect(richLines('  • milk')[0]).toEqual({ kind: 'bullet', runs: [{ text: '  milk' }] });
    expect(richLines('-not a bullet')[0]!.kind).toBe('plain');
  });

  it('keeps emphasis parsing intact inside star bullets', () => {
    expect(richLines('* **bold** and *italic*')[0]).toEqual({
      kind: 'bullet', runs: [{ text: 'bold', bold: true }, { text: ' and ' }, { text: 'italic', italic: true }],
    });
  });

  it('a numbered step is read as one, so it can be laid out like a bullet', () => {
    // Recipes write their method as '1. ', and a wrapped step used to run
    // flush under its own number — a wall of text to find your place in
    // while holding a pan. The number belongs in a gutter, like the dot.
    expect(richLines('1. Heat the pan')[0]).toEqual({
      kind: 'number', num: '1.', runs: [{ text: 'Heat the pan' }],
    });
    expect(richLines('12) Fold it in')[0]!.num).toBe('12.');
    // Prose that merely starts with digits is prose.
    expect(richLines('1996. What a year')[0]!.kind).toBe('plain');
    expect(richLines('1.5 cups flour')[0]!.kind).toBe('plain');
    // A bullet still wins — recipes never nest the two, and '- ' is the
    // marker the toolbar actually writes.
    expect(richLines('- 1. odd but a bullet')[0]!.kind).toBe('bullet');
  });
  it('an empty line keeps one empty run so it still takes height', () => {
    expect(richLines('a\n\nb')[1]!.runs).toEqual([{ text: '' }]);
  });
});

describe('noteListEdit', () => {
  for (const c of editCases.listEdit) {
    it(c.name, () => {
      expect(noteListEdit(c.previous, c.next)).toEqual(c.result);
    });
  }

  for (const sequence of editCases.sequences) {
    it(sequence.name, () => {
      let body = sequence.initial;
      for (const step of sequence.steps) {
        const result = noteListEdit(body, step.next);
        expect(result).toEqual(step.result);
        body = result?.text ?? step.next;
      }
      expect(body).toBe('* First\n* Second\nPlain');
    });
  }
});
