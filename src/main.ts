import './style.css';
import { APP_VERSION, PHASE } from './version';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <h1>Η Αρπαγή του Ξόανου</h1>
    <p>Σε κατασκευή · φάση ${PHASE}</p>
    <p><small>v${APP_VERSION}</small></p>
  `;
}
