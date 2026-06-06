// react-native-url-polyfill provides a spec-compliant URL/URLSearchParams,
// which the NightscoutClient relies on to build query strings. React Native's
// built-in URL is incomplete, so we install the polyfill before anything else.
import 'react-native-url-polyfill/auto';
import { registerRootComponent } from 'expo';
import App from './App';

registerRootComponent(App);
