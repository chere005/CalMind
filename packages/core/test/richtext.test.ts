/** The marker → styled-run contract the note body renders by. */
import { describe, it, expect } from 'vitest';
import { richLines } from '../src/richtext';

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
    expect(richLines('-not a bullet')[0]!.kind).toBe('plain');
  });
  it('an empty line keeps one empty run so it still takes height', () => {
    expect(richLines('a\n\nb')[1]!.runs).toEqual([{ text: '' }]);
  });
});
