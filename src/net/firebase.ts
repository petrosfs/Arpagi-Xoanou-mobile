import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getDatabase, type Database } from 'firebase/database';
import { FIREBASE_CONFIG } from './config';

export interface Net {
  db: Database;
  uid: string;
}

let ready: Promise<Net> | null = null;

export const isConfigured = () => FIREBASE_CONFIG !== null;

/** Σύνδεση στο Firebase με ανώνυμο λογαριασμό (ο παίκτης δεν φτιάχνει λογαριασμό). */
export function connect(): Promise<Net> {
  if (!FIREBASE_CONFIG) return Promise.reject(new Error('not-configured'));
  if (!ready) {
    ready = (async () => {
      const app = initializeApp(FIREBASE_CONFIG!);
      const cred = await signInAnonymously(getAuth(app));
      return { db: getDatabase(app), uid: cred.user.uid };
    })();
    ready.catch(() => (ready = null));
  }
  return ready;
}
