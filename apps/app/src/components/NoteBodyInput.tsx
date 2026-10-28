import React, { useLayoutEffect, useRef, useState } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';
import { noteBulletDots, noteListEdit } from '@calmind/core';
import { editNoteInput, noteInputSelection, noteInputState, type InputSelection } from './noteInputState';

type NativeInputEvent = { text?: string; eventCount?: number; selection?: InputSelection };
type SelectedText = { text: string; selection: InputSelection };
export type NoteInputReveal = (field: TextInput, caret: React.RefObject<SelectedText | null>) => void;
type NoteBodyInputProps = TextInputProps & {
  /** Render legacy line markers as real bullets in card editors. */
  bulletDots?: boolean;
  /** Let the containing page reveal this field above the keyboard. */
  onEnsureVisible?: NoteInputReveal;
};

// The page owns scrolling; there is no second scroll view inside the body.
export const NoteBodyInput = React.forwardRef<TextInput, NoteBodyInputProps>((props, forwardedRef) => {
  const input = useRef<TextInput | null>(null);
  const { bulletDots = false, onEnsureVisible, ...inputProps } = props;
  const sourceValue = typeof inputProps.value === 'string' ? inputProps.value : '';
  // This is a display projection only. In particular, mounting a card with
  // legacy markers does not call onChangeText or rewrite its saved value.
  const value = bulletDots ? noteBulletDots(sourceValue) : sourceValue;
  const caret = useRef<SelectedText | null>(null);
  const ensureVisible = () => { if (input.current?.isFocused()) onEnsureVisible?.(input.current, caret); };
  const priorText = useRef(value);
  const native = useRef(noteInputState(value));
  const nativeEventCount = useRef(0);
  const echoes = useRef<string[]>([]);
  const lastProp = useRef(value);
  const [selectedText, setSelectedText] = useState<SelectedText | null>(null);
  const selectText = (text: string, selection: InputSelection) => {
    caret.current = { text, selection };
    setSelectedText((previous) =>
      previous?.text === text && previous.selection.start === selection.start && previous.selection.end === selection.end
        ? previous : { text, selection });
  };

  const fitWeb = React.useCallback(() => {
    if (Platform.OS !== 'web' || !input.current) return;
    const field = input.current as unknown as HTMLTextAreaElement;
    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }, []);
  useLayoutEffect(() => {
    priorText.current = value;
    const echo = echoes.current.lastIndexOf(value);
    if (echo >= 0) echoes.current.splice(0, echo + 1);
    else if (value !== lastProp.current && value !== native.current.text) {
      native.current = noteInputState(value);
      caret.current = null;
    }
    lastProp.current = value;
  });
  useLayoutEffect(fitWeb, [fitWeb, value]);

  return (
    <TextInput
      {...inputProps}
      value={value}
      ref={(field) => {
        input.current = field;
        if (typeof forwardedRef === 'function') forwardedRef(field);
        else if (forwardedRef) forwardedRef.current = field;
      }}
      scrollEnabled={false}
      style={[inputProps.style, Platform.OS === 'web' && { overflow: 'hidden' }]}
      onLayout={(event) => { fitWeb(); inputProps.onLayout?.(event); ensureVisible(); }}
      onFocus={(event) => {
        // Wait for this focus's selection before revealing a tall field;
        // a caret remembered from the previous focus may have been at its end.
        caret.current = null;
        inputProps.onFocus?.(event);
        ensureVisible();
      }}
      // RN sends value and selection together with the native event count.
      // A separate imperative caret update can race the next native edit.
      selection={Platform.OS !== 'web' && selectedText?.text === value ? selectedText.selection : inputProps.selection}
      onChange={(event) => {
        inputProps.onChange?.(event);
        if (Platform.OS === 'web') return;
        const data = event.nativeEvent as NativeInputEvent;
        nativeEventCount.current = data.eventCount ?? nativeEventCount.current;
        const result = editNoteInput(native.current, event.nativeEvent.text, data.selection, bulletDots);
        native.current = result.state;
        echoes.current.push(result.state.text);
        selectText(result.state.text, result.selection);
        inputProps.onChangeText?.(result.state.text);
      }}
      onSelectionChange={(event) => {
        if (Platform.OS === 'web') { inputProps.onSelectionChange?.(event); return; }
        const data = event.nativeEvent as NativeInputEvent;
        if (data.eventCount !== undefined && data.eventCount < nativeEventCount.current) return;
        let selection = event.nativeEvent.selection;
        if (data.text === native.current.raw) selection = noteInputSelection(native.current, selection);
        else if (data.text === native.current.text) native.current = noteInputState(data.text);
        else {
          // Untagged selection events still describe the user's current
          // caret, but must not acknowledge a pending native correction.
          caret.current = { text: data.text ?? native.current.text, selection };
          inputProps.onSelectionChange?.(event);
          ensureVisible();
          return;
        }
        selectText(native.current.text, selection);
        inputProps.onSelectionChange?.({ ...event, nativeEvent: { ...event.nativeEvent, selection } });
        ensureVisible();
      }}
      onChangeText={Platform.OS === 'web' ? (next) => {
        const edit = noteListEdit(priorText.current, next);
        const corrected = edit?.text ?? next;
        const text = bulletDots ? noteBulletDots(corrected) : corrected;
        priorText.current = text;
        if (edit || text !== next) {
          const field = input.current as unknown as HTMLTextAreaElement | null;
          if (field?.value === next) {
            const start = edit?.caret ?? field.selectionStart;
            const end = edit?.caret ?? field.selectionEnd;
            const direction = edit ? 'none' : field.selectionDirection;
            field.value = text;
            field.setSelectionRange(start, end, direction);
          }
        }
        inputProps.onChangeText?.(text);
      } : undefined}
    />
  );
});
