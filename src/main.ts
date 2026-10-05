import './style.css';
import { go } from './app';
import { homeScreen } from './screens/home';

// Σύνδεσμος πρόσκλησης: ?room=K7XR ανοίγει κατευθείαν την είσοδο με τον κωδικό.
const code = new URLSearchParams(location.search).get('room');
if (code) {
  history.replaceState(null, '', location.pathname);
  import('./screens/online').then((m) => go((r) => m.onlineScreen(r, code)));
} else go(homeScreen);
