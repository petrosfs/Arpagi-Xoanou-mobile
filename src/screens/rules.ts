import { getLang, t } from '../i18n';
import type { Card } from '../engine';
import { cardHtml } from '../ui/cards';

// Οι κανόνες όπως είναι υλοποιημένοι στη μηχανή (src/engine). Αν αλλάξει κανόνας, αλλάζει κι εδώ.

const ex = (cards: Card[]) => `<div class="rules-cards">${cards.map((c) => cardHtml(c, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], false)).join('')}</div>`;
const sym = (symbol: number, color: 0 | 1 | 2 | 3): Card => ({ id: -1, kind: 'symbol', symbol, color });

function body(): string {
  const pair = ex([sym(9, 0), sym(9, 3)]);
  const inward = ex([{ id: -1, kind: 'inward' }]);
  const outward = ex([{ id: -1, kind: 'outward' }]);
  const colors = ex([{ id: -1, kind: 'colors' }]);
  if (getLang() === 'en')
    return `
    <h3>Goal</h3>
    <p>Be the first to get rid of all your cards, both your face-down pile and your face-up cards.</p>
    <h3>Taking turns</h3>
    <p>All cards are dealt out; any left over go under the xoanon. In turn, each player flips the top card of their pile
      face up in front of them (swipe up and down, or tap, depending on your settings). If you wait too long, your card flips by itself.</p>
    <h3>Duel</h3>
    ${pair}
    <p>When two visible cards show the <strong>same symbol</strong> (colour does not matter), their owners race to grab the xoanon.
      The fastest wins. The loser takes both face-up piles plus any cards under the xoanon, and the winner starts the next round.</p>
    <p>If there are several losers, the cards are split between them as set before the game.</p>
    <h3>Grabbing the xoanon</h3>
    <ul>
      <li>Tap the xoanon. Your reaction is timed from the moment the card appeared on <em>your</em> screen, so a slow connection does not count against you.</li>
      <li>On a tie (within 30 ms), more fingers on the xoanon win; then whoever held it closer to the base.</li>
      <li>Tapping right next to the xoanon knocks it over.</li>
      <li>While someone holds the xoanon, nobody else can grab or knock it over.</li>
    </ul>
    <h3>Wrong grab or knocking it over</h3>
    <p>You take all face-up cards of all players plus any cards under the xoanon. Play then continues from where it was.</p>
    <h3>Special cards</h3>
    ${inward}
    <p><strong>Arrows in:</strong> everyone grabs the xoanon. The first puts their face-up cards under it and starts the next round.
      It stays active until someone grabs or the card is covered. If it coincides with a duel, the winner chooses which applies.</p>
    ${outward}
    <p><strong>Arrows out:</strong> after a short countdown, everyone flips a card at the same time.</p>
    ${colors}
    <p><strong>Coloured arrows:</strong> duels are decided by <strong>colour</strong> instead of symbol, until another special card,
      a duel or the xoanon falling over.</p>
    <h3>Last card</h3>
    <ul>
      <li>Arrows out as your last card: you win straight away.</li>
      <li>Coloured arrows as your last card: you take all face-up cards.</li>
      <li>Arrows in as your last card and someone else grabs first: you take all face-up cards.</li>
    </ul>
    <h3>3 players</h3>
    <p>If the 3-player rule is on, the coloured arrows are removed and three visible cards of the same colour count as arrows in.</p>
    <h3>Online</h3>
    <p>If you lose connection, you have 3 minutes to come back; meanwhile your turns are skipped.
      If the host leaves, another player takes over and the game continues.</p>`;
  return `
    <h3>Στόχος</h3>
    <p>Να ξεφορτωθείς πρώτος όλες τις κάρτες σου, και τις κλειστές και τις ανοιχτές.</p>
    <h3>Η σειρά</h3>
    <p>Μοιράζονται όλες οι κάρτες· όσες περισσεύουν πάνε κάτω από το ξόανο. Με τη σειρά, κάθε παίκτης γυρίζει την πάνω κάρτα
      της στοίβας του ανοιχτή μπροστά του (σύρσιμο πάνω-κάτω ή πάτημα, ανάλογα με τις ρυθμίσεις). Αν αργήσεις, γυρίζει μόνη της.</p>
    <h3>Μονομαχία</h3>
    ${pair}
    <p>Όταν δύο ορατές κάρτες έχουν το <strong>ίδιο σύμβολο</strong> (το χρώμα δεν μετράει), οι κάτοχοί τους αρπάζουν το ξόανο.
      Κερδίζει ο ταχύτερος. Ο χαμένος παίρνει τις ανοιχτές κάρτες και των δύο και ό,τι είναι κάτω από το ξόανο,
      και ο νικητής ξεκινά τον επόμενο γύρο.</p>
    <p>Αν οι χαμένοι είναι πολλοί, οι κάρτες μοιράζονται όπως ορίστηκε πριν την παρτίδα.</p>
    <h3>Πώς αρπάζεις το ξόανο</h3>
    <ul>
      <li>Πάτα το ξόανο. Ο χρόνος σου μετράει από τη στιγμή που φάνηκε η κάρτα στη <em>δική σου</em> οθόνη, οπότε μια αργή σύνδεση δεν σε αδικεί.</li>
      <li>Σε ισοπαλία (ως 30 ms) κερδίζουν τα περισσότερα δάχτυλα πάνω στο ξόανο, και μετά όποιος το έπιασε πιο κοντά στη βάση.</li>
      <li>Αν πατήσεις ακριβώς δίπλα στο ξόανο, το ρίχνεις.</li>
      <li>Όσο κάποιος κρατάει το ξόανο, κανείς άλλος δεν μπορεί να το πιάσει ή να το ρίξει.</li>
    </ul>
    <h3>Λάθος άρπαγμα ή ρίψη</h3>
    <p>Παίρνεις όλες τις ανοιχτές κάρτες όλων και ό,τι είναι κάτω από το ξόανο. Μετά η σειρά συνεχίζει από εκεί που ήταν.</p>
    <h3>Ειδικές κάρτες</h3>
    ${inward}
    <p><strong>Βέλη μέσα:</strong> όλοι αρπάζουν το ξόανο. Ο πρώτος βάζει τις ανοιχτές κάρτες του κάτω από αυτό και ξεκινά τον
      επόμενο γύρο. Ισχύει ώσπου να αρπάξει κάποιος ή να καλυφθεί η κάρτα. Αν συμπέσει με μονομαχία, ο νικητής διαλέγει τι ισχύει.</p>
    ${outward}
    <p><strong>Βέλη έξω:</strong> μετά από μια σύντομη αντίστροφη μέτρηση, όλοι γυρίζουν κάρτα ταυτόχρονα.</p>
    ${colors}
    <p><strong>Χρωματιστά βέλη:</strong> οι μονομαχίες κρίνονται με το <strong>χρώμα</strong> αντί για το σύμβολο, ως την επόμενη
      ειδική κάρτα, μονομαχία ή ρίψη του ξόανου.</p>
    <h3>Τελευταία κάρτα</h3>
    <ul>
      <li>Βέλη έξω ως τελευταία κάρτα: κερδίζεις αμέσως.</li>
      <li>Χρωματιστά βέλη ως τελευταία κάρτα: μαζεύεις όλες τις ανοιχτές κάρτες.</li>
      <li>Βέλη μέσα ως τελευταία κάρτα και αρπάζει πρώτος άλλος: μαζεύεις όλες τις ανοιχτές κάρτες.</li>
    </ul>
    <h3>3 παίκτες</h3>
    <p>Με τον κανόνα 3 παικτών, τα χρωματιστά βέλη βγαίνουν από την τράπουλα και τρεις ορατές κάρτες ίδιου χρώματος μετράνε ως βέλη μέσα.</p>
    <h3>Online</h3>
    <p>Αν χαθεί η σύνδεσή σου, έχεις 3 λεπτά να επιστρέψεις· στο μεταξύ η σειρά σου παραλείπεται.
      Αν φύγει ο host, αναλαμβάνει άλλος παίκτης και η παρτίδα συνεχίζει.</p>`;
}

/** Οι κανόνες ως παράθυρο πάνω από την τρέχουσα οθόνη (η παρτίδα συνεχίζει από πίσω). */
export function openRules() {
  document.querySelector('.rules-overlay')?.remove();
  const prevFocus = document.activeElement as HTMLElement | null;
  const el = document.createElement('div');
  el.className = 'rules-overlay';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-modal', 'true');
  el.setAttribute('aria-label', t('home.rules'));
  el.innerHTML = `<div class="rules-sheet">
      <header><h2>${t('home.rules')}</h2><button class="rules-close" aria-label="${t('close')}">✕</button></header>
      <div class="rules-body">${body()}</div>
    </div>`;
  const close = () => {
    el.remove();
    document.removeEventListener('keydown', onKey);
    prevFocus?.focus?.();
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  el.addEventListener('click', (e) => e.target === el && close());
  el.querySelector('.rules-close')!.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  document.body.appendChild(el);
  el.querySelector<HTMLButtonElement>('.rules-close')!.focus();
}
