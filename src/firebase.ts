import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signOut } from 'firebase/auth';
import {
  getFirestore,
  doc,
  getDocFromServer,
  setDoc,
  writeBatch,
  serverTimestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { MealLogRecord, StudentAccountData } from './utils/tokenRules';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
testConnection();

export async function signInStudentWithGoogle() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutStudent() {
  return signOut(auth);
}

export async function initializeFirestoreStudentAccount(account: StudentAccountData) {
  const path = `students/${account.uid}`;
  try {
    await setDoc(doc(db, 'students', account.uid), {
      uid: account.uid,
      studentId: account.studentId,
      fullName: account.fullName,
      hostelBlock: account.hostelBlock,
      roomNumber: account.roomNumber,
      currentMonth: account.currentMonth,
      monthlyAllowance: 60,
      rolloverTokens: 0,
      tokenBalance: 60,
      tokensUsed: 0,
      tokensRefunded: 0,
      mealsLoggedCount: 0,
      guestMealsCount: 0,
      skipsLoggedCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export async function resetFirestoreStudentCycle(account: StudentAccountData) {
  const path = `students/${account.uid}`;
  try {
    await setDoc(
      doc(db, 'students', account.uid),
      {
        uid: account.uid,
        studentId: account.studentId,
        fullName: account.fullName,
        hostelBlock: account.hostelBlock,
        roomNumber: account.roomNumber,
        currentMonth: account.currentMonth,
        monthlyAllowance: account.monthlyAllowance,
        rolloverTokens: account.rolloverTokens,
        tokenBalance: account.tokenBalance,
        tokensUsed: account.tokensUsed,
        tokensRefunded: account.tokensRefunded,
        mealsLoggedCount: account.mealsLoggedCount,
        guestMealsCount: account.guestMealsCount,
        skipsLoggedCount: account.skipsLoggedCount,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function commitFirestoreMealTransaction(
  updatedAccount: StudentAccountData,
  logEntry: MealLogRecord
) {
  const studentPath = `students/${updatedAccount.uid}`;
  const logPath = `students/${updatedAccount.uid}/mealLogs/${logEntry.id}`;
  try {
    const batch = writeBatch(db);
    const studentRef = doc(db, 'students', updatedAccount.uid);
    const logRef = doc(db, 'students', updatedAccount.uid, 'mealLogs', logEntry.id);

    if (logEntry.entryKind === 'skip') {
      batch.update(studentRef, {
        tokenBalance: updatedAccount.tokenBalance,
        tokensRefunded: updatedAccount.tokensRefunded,
        skipsLoggedCount: updatedAccount.skipsLoggedCount,
        updatedAt: serverTimestamp(),
      });
    } else {
      batch.update(studentRef, {
        tokenBalance: updatedAccount.tokenBalance,
        tokensUsed: updatedAccount.tokensUsed,
        mealsLoggedCount: updatedAccount.mealsLoggedCount,
        guestMealsCount: updatedAccount.guestMealsCount,
        updatedAt: serverTimestamp(),
      });
    }

    batch.set(logRef, {
      id: logEntry.id,
      studentUid: logEntry.studentUid,
      studentId: logEntry.studentId,
      entryKind: logEntry.entryKind,
      mealType: logEntry.mealType,
      isGuestMeal: logEntry.isGuestMeal,
      baseCost: logEntry.baseCost,
      tokenCost: logEntry.tokenCost,
      refundTokens: logEntry.refundTokens,
      targetMealDate: logEntry.targetMealDate,
      balanceBefore: logEntry.balanceBefore,
      balanceAfter: logEntry.balanceAfter,
      diningCounter: logEntry.diningCounter,
      notes: logEntry.notes,
      billingMonth: logEntry.billingMonth,
      loggedAtIso: logEntry.loggedAtIso,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `${studentPath} & ${logPath}`);
  }
}
