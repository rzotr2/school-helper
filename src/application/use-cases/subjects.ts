import { db, storage } from '../../infrastructure/firebase/config';
import { handleFirestoreError, OperationType } from '../../infrastructure/firebase/errors';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp } from 'firebase/firestore';
import { deleteTopic } from './topics';

export interface Subject {
  id: string;
  ownerId: string;
  name: string;
  position: number;
  createdAt: Date;
  updatedAt: Date;
}

const SUBJECT_COLLECTION = 'subjects';

export async function getSubjects(userId: string, firestoreInstance: any = db): Promise<Subject[]> {
  try {
    const q = query(
      collection(firestoreInstance, SUBJECT_COLLECTION),
      where('ownerId', '==', userId),
      /* orderBy removed for local sort */
    );
    const querySnapshot = await getDocs(q);
    const results = querySnapshot.docs.map(doc => {
      const data = doc.data();
      return {
        id: doc.id,
        ownerId: data.ownerId,
        name: data.name,
        position: data.position,
        createdAt: data.createdAt?.toDate(),
        updatedAt: data.updatedAt?.toDate(),
      };
    });
    return results.sort((a, b) => (a.position || 0) - (b.position || 0));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SUBJECT_COLLECTION);
  }
}

export async function createSubject(userId: string, name: string, position: number): Promise<string> {
  if (!name.trim()) throw new Error('Subject name cannot be empty');
  if (name.length > 100) throw new Error('Subject name is too long');

  try {
    const newDocRef = doc(collection(db, SUBJECT_COLLECTION));
    await setDoc(newDocRef, {
      ownerId: userId,
      name: name.trim(),
      position,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return newDocRef.id;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, SUBJECT_COLLECTION);
  }
}

export async function updateSubject(userId: string, subjectId: string, name: string): Promise<void> {
  if (!name.trim()) throw new Error('Subject name cannot be empty');
  if (name.length > 100) throw new Error('Subject name is too long');

  try {
    const docRef = doc(db, SUBJECT_COLLECTION, subjectId);
    await updateDoc(docRef, {
      name: name.trim(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SUBJECT_COLLECTION}/${subjectId}`);
  }
}

export async function deleteSubject(
  userId: string, 
  subjectId: string,
  firestoreInstance: any = db,
  storageInstance: any = storage
): Promise<void> {
  if (!userId) throw new Error('User must be authenticated');

  try {
    // 1. Verify authenticated ownership
    const docRef = doc(firestoreInstance, SUBJECT_COLLECTION, subjectId);
    const subjectSnap = await getDoc(docRef);
    if (!subjectSnap.exists()) {
      throw new Error('Subject not found');
    }
    if (subjectSnap.data()?.ownerId !== userId) {
      throw new Error('Unauthorized');
    }

    // 2. Find all Topics belonging to the Subject
    const topicsRef = collection(firestoreInstance, 'topics');
    const topicsQuery = query(
      topicsRef, 
      where('ownerId', '==', userId), 
      where('subjectId', '==', subjectId)
    );
    const topicsSnapshot = await getDocs(topicsQuery);

    // 3. For each Topic: delete Storage objects, Document metadata, and the Topic
    for (const topicDoc of topicsSnapshot.docs) {
      await deleteTopic(userId, topicDoc.id, firestoreInstance, storageInstance);
    }

    // 4. Delete the Subject doc
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `${SUBJECT_COLLECTION}/${subjectId}`);
  }
}
