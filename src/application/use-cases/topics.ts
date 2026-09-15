import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  serverTimestamp,
  writeBatch,
  Timestamp
} from 'firebase/firestore';
import { ref, deleteObject } from 'firebase/storage';
import { db, storage } from '../../infrastructure/firebase/config';

export interface Topic {
  id: string;
  ownerId: string;
  subjectId: string;
  name: string;
  position: number;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export async function getAllTopics(userId: string, firestoreInstance: any = db): Promise<Topic[]> {
  if (!userId) throw new Error('User must be authenticated');
  
  const topicsRef = collection(firestoreInstance, 'topics');
  const q = query(
    topicsRef, 
    where('ownerId', '==', userId)
  );
  
  const snapshot = await getDocs(q);
  const topics = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Topic));
  return topics.sort((a, b) => (a.position || 0) - (b.position || 0));
}

export async function getTopicsForSubject(userId: string, subjectId: string): Promise<Topic[]> {
  if (!userId) throw new Error('User must be authenticated');
  
  const topicsRef = collection(db, 'topics');
  const q = query(
    topicsRef, 
    where('ownerId', '==', userId),
    where('subjectId', '==', subjectId)
  );
  
  const snapshot = await getDocs(q);
  const topics = snapshot.docs.map(doc => ({
    id: doc.id,
    ...doc.data()
  } as Topic));
  return topics.sort((a, b) => (a.position || 0) - (b.position || 0));
}

export async function getTopic(userId: string, topicId: string): Promise<Topic> {
  if (!userId) throw new Error('User must be authenticated');
  
  const docRef = doc(db, 'topics', topicId);
  const snapshot = await getDoc(docRef);
  
  if (!snapshot.exists()) {
    throw new Error('Topic not found');
  }
  
  const data = snapshot.data();
  if (data.ownerId !== userId) {
    throw new Error('Unauthorized');
  }
  
  return {
    id: snapshot.id,
    ...data
  } as Topic;
}

export async function createTopic(userId: string, subjectId: string, name: string): Promise<Topic> {
  if (!userId) throw new Error('User must be authenticated');
  
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Topic name cannot be empty');
  if (trimmedName.length > 100) throw new Error('Topic name must be 100 characters or less');

  // Verify subject ownership before creating topic (app-level boundary check)
  const subjectRef = doc(db, 'subjects', subjectId);
  const subjectSnap = await getDoc(subjectRef);
  if (!subjectSnap.exists() || subjectSnap.data().ownerId !== userId) {
    throw new Error('Unauthorized: Subject does not exist or belong to user');
  }

  // Check for duplicate names in the same subject
  const existingTopics = await getTopicsForSubject(userId, subjectId);
  if (existingTopics.some(t => t.name.toLowerCase() === trimmedName.toLowerCase())) {
    throw new Error('A topic with this name already exists in this subject');
  }

  const position = existingTopics.length;
  const newTopicRef = doc(collection(db, 'topics'));
  
  const topicData = {
    ownerId: userId,
    subjectId,
    name: trimmedName,
    position,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  await setDoc(newTopicRef, topicData);
  
  return {
    id: newTopicRef.id,
    ...topicData,
    createdAt: new Date(), // Local approximation for immediate UI updates
    updatedAt: new Date()
  };
}

export async function updateTopic(userId: string, topicId: string, name: string): Promise<void> {
  if (!userId) throw new Error('User must be authenticated');
  
  const trimmedName = name.trim();
  if (!trimmedName) throw new Error('Topic name cannot be empty');
  if (trimmedName.length > 100) throw new Error('Topic name must be 100 characters or less');

  // We could check for duplicate name on rename too, but let's just do it
  const topic = await getTopic(userId, topicId);
  
  const existingTopics = await getTopicsForSubject(userId, topic.subjectId);
  if (existingTopics.some(t => t.id !== topicId && t.name.toLowerCase() === trimmedName.toLowerCase())) {
    throw new Error('A topic with this name already exists in this subject');
  }

  const topicRef = doc(db, 'topics', topicId);
  await updateDoc(topicRef, {
    name: trimmedName,
    updatedAt: serverTimestamp()
  });
}

export async function deleteTopic(
  userId: string, 
  topicId: string,
  firestoreInstance: any = db,
  storageInstance: any = storage
): Promise<void> {
  if (!userId) throw new Error('User must be authenticated');
  
  // 1. Verify authenticated ownership before deleting
  const topicRef = doc(firestoreInstance, 'topics', topicId);
  const topicSnap = await getDoc(topicRef);
  if (!topicSnap.exists()) {
    throw new Error('Topic not found');
  }
  if (topicSnap.data().ownerId !== userId) {
    throw new Error('Unauthorized');
  }

  // 2. Find all Documents belonging to the Topic
  const docsRef = collection(firestoreInstance, 'documents');
  const q = query(
    docsRef,
    where('ownerId', '==', userId),
    where('topicId', '==', topicId)
  );
  const docsSnapshot = await getDocs(q);

  // 3. Delete their Storage objects
  // If storage deletion fails, we abort before deleting metadata,
  // preventing orphaned storage files and preserving state for retry.
  for (const docSnap of docsSnapshot.docs) {
    const data = docSnap.data();
    if (data.storagePath) {
      const storageRef = ref(storageInstance, data.storagePath);
      try {
        await deleteObject(storageRef);
      } catch (error: any) {
        // If the object is already missing in storage, treat as idempotent cleanup
        if (error?.code !== 'storage/object-not-found') {
          throw new Error(`Failed to delete storage file: ${error?.message || 'Storage error'}`);
        }
      }
    }
  }

  // 4. Delete Document metadata in Firestore
  // 5. Delete the Topic in Firestore
  const batch = writeBatch(firestoreInstance);
  docsSnapshot.docs.forEach((docSnap) => {
    batch.delete(docSnap.ref);
  });
  batch.delete(topicRef);

  await batch.commit();
}
