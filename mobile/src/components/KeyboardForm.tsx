import type { ComponentProps, PropsWithChildren } from 'react';
import { ScrollView, TextInput } from 'react-native';

export const FormTextInput = TextInput;

export function FormKeyboardProvider({ children }: PropsWithChildren) {
  return <>{children}</>;
}

export function FormScrollView(props: ComponentProps<typeof ScrollView>) {
  return <ScrollView keyboardShouldPersistTaps="handled" {...props} />;
}
