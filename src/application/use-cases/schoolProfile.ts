import { db } from '../../infrastructure/firebase/config';
import { handleFirestoreError, OperationType } from '../../infrastructure/firebase/errors';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';

export interface SchoolProfile {
  createdAt: Date;
  updatedAt: Date;
}

const PROFILE_COLLECTION = 'schoolProfiles';

export async function getSchoolProfile(userId: string): Promise<SchoolProfile | null> {
  try {
    const docRef = doc(db, PROFILE_COLLECTION, userId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const data = docSnap.data();
      return {
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `${PROFILE_COLLECTION}/${userId}`);
  }
}

export async function createSchoolProfile(userId: string): Promise<void> {
  try {
    const docRef = doc(db, PROFILE_COLLECTION, userId);
    await setDoc(docRef, {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${PROFILE_COLLECTION}/${userId}`);
  }
}

export async function updateSchoolProfile(userId: string): Promise<void> {
  try {
    const docRef = doc(db, PROFILE_COLLECTION, userId);
    await updateDoc(docRef, {
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${PROFILE_COLLECTION}/${userId}`);
  }
}
