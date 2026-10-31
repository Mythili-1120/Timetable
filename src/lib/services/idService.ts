import { doc, runTransaction } from 'firebase/firestore';
import { db } from '../firebase/config';

/**
 * Concurrency-Safe Member ID Generator
 * Generates permanent, non-reusable IDs in format FAC-000001
 * Uses atomic Firestore transactions.
 */
export async function generateNextMemberId(): Promise<string> {
  // We use collegeSettings/staffSequence which is pre-seeded at 100
  const counterRef = doc(db, 'collegeSettings', 'staffSequence');

  const memberId = await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    let currentSeq = 100;

    if (counterSnap.exists()) {
      const data = counterSnap.data();
      currentSeq = typeof data.lastSequence === 'number' ? data.lastSequence : 100;
    }

    const nextSeq = currentSeq + 1;
    const formattedId = `FAC-${String(nextSeq).padStart(6, '0')}`;

    transaction.set(counterRef, {
      lastSequence: nextSeq,
      prefix: 'FAC-',
      updatedAt: new Date().toISOString()
    }, { merge: true });

    return formattedId;
  });

  return memberId;
}

