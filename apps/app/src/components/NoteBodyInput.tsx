import React, { useLayoutEffect, useRef, useState } from 'react';
import { Platform, TextInput, type TextInputProps } from 'react-native';
import { noteListEdit } from '@calmind/core';
import { editNoteInput, noteInputSelection, noteInputState, type InputSelection } from './noteInputState';

type NativeInputEvent = { text?: string; eventCount?: number; selection?: InputSelection };
type SelectedText = { text: string; selection: InputSelection };

// The page owns scrolling; there is no second scroll view inside the body.
export const NoteBodyInput = React.forwardRef<TextInput, TextInputProps>((props, forwardedRef) => {
  const input = useRef<TextInput | null>(null);
  const value = typeof props.value === 'string' ? props.value : '';
  const priorText = useRef(value);
  const native = useRef(noteInputState(value));
  const nativeEventCount = useRef(0);
  const echoes = useRef<string[]>([]);
  const lastProp = useRef(value);
  const [selectedText, setSelectedText] = useState<SelectedText | null>(null);
  const selectText = (text: string, selection: InputSelection) => setSelectedText((previous) =>
    previous?.text === text && previous.selection.start === selection.start && previous.selection.end === selection.end
      ? previous : { text, selection });

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
    else if (value !== lastProp.current && value !== native.current.text) native.current = noteInputState(value);
    lastProp.current = value;
  });
  useLayoutEffect(fitWeb, [fitWeb, value]);

  return (
    <TextInput
      {...props}
      ref={(field) => {
        input.current = field;
        if (typeof forwardedRef === 'function') forwardedRef(field);
        else if (forwardedRef) forwardedRef.current = field;
      }}
      scrollEnabled={false}
      style={[props.style, Platform.OS === 'web' && { overflow: 'hidden' }]}
      onLayout={(event) => { fitWeb(); props.onLayout?.(event); }}
      // RN sends value and selection together with the native event count.
      // A separate imperative caret update can race the next native edit.
      selection={Platform.OS !== 'web' && selectedText?.text === value ? selectedText.selection : props.selection}
      onChange={(event) => {
        props.onChange?.(event);
        if (Platform.OS === 'web') return;
        const data = event.nativeEvent as NativeInputEvent;
        nativeEventCount.current = data.eventCount ?? nativeEventCount.current;
        const result = editNoteInput(native.current, event.nativeEvent.text, data.selection);
        native.current = result.state;
        echoes.current.push(result.state.text);
        selectText(result.state.text, result.selection);
        props.onChangeText?.(result.state.text);
      }}
      onSelectionChange={(event) => {
        if (Platform.OS === 'web') { props.onSelectionChange?.(event); return; }
        const data = event.nativeEvent as NativeInputEvent;
        if (data.eventCount !== undefined && data.eventCount < nativeEventCount.current) return;
        let selection = event.nativeEvent.selection;
        if (data.text === native.current.raw) selection = noteInputSelection(native.current, selection);
        else if (data.text === native.current.text) native.current = noteInputState(data.text);
        else { props.onSelectionChange?.(event); return; }
        selectText(native.current.text, selection);
        props.onSelectionChange?.({ ...event, nativeEvent: { ...event.nativeEvent, selection } });
      }}
      onChangeText={Platform.OS === 'web' ? (next) => {
        const edit = noteListEdit(priorText.current, next);
        const text = edit?.text ?? next;
        priorText.current = text;
        if (edit) {
          const field = input.current as unknown as HTMLTextAreaElement | null;
          if (field?.value === next) {
            field.value = text;
            field.setSelectionRange(edit.caret, edit.caret);
          }
        }
        props.onChangeText?.(text);
      } : undefined}
    />
  );
});
