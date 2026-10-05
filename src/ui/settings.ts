// Προσωπικές ρυθμίσεις, αποθηκευμένες στο κινητό.
export interface PersonalSettings {
  flipGesture: 'swipe' | 'tap';
  colorblind: boolean;
  lang: 'auto' | 'el' | 'en';
}

const KEY = 'arpagi.settings.v1';
const DEFAULTS: PersonalSettings = { flipGesture: 'swipe', colorblind: false, lang: 'auto' };

export function loadSettings(): PersonalSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: PersonalSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* ιδιωτική περιήγηση κ.λπ.: απλώς δεν αποθηκεύεται */
  }
}
