import { Redirect } from 'expo-router';

// The app opens at "/", but all content lives inside the (tabs) group.
// Without this redirect expo-router lands on its Unmatched Route screen.
export default function Index() {
  return <Redirect href="/rifles" />;
}
