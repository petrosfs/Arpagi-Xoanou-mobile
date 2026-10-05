import './style.css';
import { go } from './app';
import { homeScreen } from './screens/home';
import { resolveLang, setLang } from './i18n';
import { loadSettings } from './ui/settings';

setLang(resolveLang(loadSettings().lang));

// Σύνδεσμος πρόσκλησης: ?room=K7XR ανοίγει κατευθείαν την είσοδο με τον κωδικό.
const code = new URLSearchParams(location.search).get('room');
if (code) {
  history.replaceState(null, '', location.pathname);
  import('./screens/online').then((m) => go((r) => m.onlineScreen(r, code)));
} else go(homeScreen);
