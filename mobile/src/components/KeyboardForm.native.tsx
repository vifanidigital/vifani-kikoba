import type { ComponentProps, ComponentRef, PropsWithChildren } from 'react';
import { useImperativeHandle, useRef } from 'react';
import { ScrollView, TextInput } from 'react-native';
import { cssInterop } from 'nativewind';
import { KeyboardAwareScrollView, KeyboardProvider } from 'react-native-keyboard-controller';

cssInterop(KeyboardAwareScrollView, { className: 'style', contentContainerClassName: 'contentContainerStyle' });

export const FormTextInput = TextInput;

export function FormKeyboardProvider({ children }: PropsWithChildren) {
  return <KeyboardProvider>{children}</KeyboardProvider>;
}

export function FormScrollView({ ref, ...props }: ComponentProps<typeof ScrollView>) {
  const scroll = useRef<ComponentRef<typeof KeyboardAwareScrollView>>(null);
  useImperativeHandle(ref, () => scroll.current!, []);
  return (
    <KeyboardAwareScrollView
      {...props}
      ref={scroll}
      bottomOffset={32}
      keyboardShouldPersistTaps={props.keyboardShouldPersistTaps ?? 'handled'}
    />
  );
}
