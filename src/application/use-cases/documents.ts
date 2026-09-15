import { collection, doc, getDocs, setDoc, updateDoc, deleteDoc, query, where, serverTimestamp, getDoc, Timestamp } from 'firebase/firestore';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject, UploadTaskSnapshot } from 'firebase/storage';
import { db, storage } from '../../infrastructure/firebase/config';

export interface Document {
  id: string;
  ownerId: string;
  topicId: string;
  originalName: string;
  storagePath: string;
  mimeType: string;
  size: number;
  createdAt: Timestamp | Date;
  updatedAt: Timestamp | Date;
}

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

export function getMillis(val: Timestamp | Date | null | undefined): number {
  if (!val) return 0;
  if ('toMillis' in val && typeof (val as Timestamp).toMillis === 'function') {
    return (val as Timestamp).toMillis();
  }
  if (val instanceof Date) {
    return val.getTime();
  }
  return 0;
}

export async function getAllDocuments(
  userId: string,
  firestoreInstance: any = db
): Promise<Document[]> {
  if (!userId) throw new Error('User must be authenticated');

  const docsRef = collection(firestoreInstance, 'documents');
  const q = query(
    docsRef,
    where('ownerId', '==', userId)
  );

  const snapshot = await getDocs(q);
  const docs = snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  } as Document));

  return docs.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
}

export async function getDocumentsForTopic(
  userId: string, 
  topicId: string,
  firestoreInstance: any = db
): Promise<Document[]> {
  if (!userId) throw new Error('User must be authenticated');
  
  const docsRef = collection(firestoreInstance, 'documents');
  const q = query(
    docsRef, 
    where('ownerId', '==', userId),
    where('topicId', '==', topicId)
  );
  
  const snapshot = await getDocs(q);
  const docs = snapshot.docs.map(docSnap => ({
    id: docSnap.id,
    ...docSnap.data()
  } as Document));
  
  // Sort descending by creation time (newest first)
  return docs.sort((a, b) => getMillis(b.createdAt) - getMillis(a.createdAt));
}

export async function uploadDocument(
  userId: string, 
  topicId: string, 
  file: File,
  onProgress?: (progress: number) => void,
  firestoreInstance = db,
  storageInstance = storage
): Promise<Document> {
  if (!userId) throw new Error('User must be authenticated');
  
  // 1. Validate file
  if (!file) throw new Error('No file provided');
  if (file.type !== 'application/pdf') throw new Error('Only PDF files are supported');
  if (file.size > MAX_FILE_SIZE_BYTES) throw new Error('File exceeds the 10MB limit');
  if (!file.name.trim()) throw new Error('File name cannot be empty');

  // 2. Verify topic ownership
  const topicRef = doc(firestoreInstance, 'topics', topicId);
  const topicSnap = await getDoc(topicRef);
  if (!topicSnap.exists() || topicSnap.data().ownerId !== userId) {
    throw new Error('Unauthorized: Topic does not exist or belong to user');
  }

  // 3. Prepare metadata and paths
  const docRef = doc(collection(firestoreInstance, 'documents'));
  const documentId = docRef.id;
  const storagePath = `users/${userId}/documents/${documentId}.pdf`;
  
  const originalName = file.name.trim();

  // 4. Upload bytes to Firebase Storage
  const storageRef = ref(storageInstance, storagePath);
  const uploadTask = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
  });

  await new Promise<void>((resolve, reject) => {
    uploadTask.on(
      'state_changed',
      (snapshot: UploadTaskSnapshot) => {
        const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
        if (onProgress) onProgress(progress);
      },
      (error) => {
        reject(new Error(`Storage upload failed: ${error.message}`));
      },
      () => {
        resolve();
      }
    );
  });

  // 5. Create Firestore metadata
  const docData = {
    ownerId: userId,
    topicId,
    originalName,
    storagePath,
    mimeType: file.type,
    size: file.size,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  try {
    await setDoc(docRef, docData);
  } catch (error) {
    // Attempt rollback of storage file if metadata creation fails
    try {
      await deleteObject(storageRef);
    } catch (cleanupError) {
      console.error('Failed to cleanup storage after metadata creation failed', cleanupError);
    }
    throw new Error('Failed to save document metadata');
  }

  return {
    id: documentId,
    ...docData,
    createdAt: new Date(),
    updatedAt: new Date()
  };
}

export async function deleteDocument(
  userId: string, 
  documentId: string,
  firestoreInstance = db,
  storageInstance = storage
): Promise<void> {
  if (!userId) throw new Error('User must be authenticated');
  
  const docRef = doc(firestoreInstance, 'documents', documentId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists()) {
    throw new Error('Document not found');
  }
  
  const docData = docSnap.data() as Document;
  if (docData.ownerId !== userId) {
    throw new Error('Unauthorized');
  }

  // Delete physical storage object first.
  // If this fails due to a network/permission error, we abort before deleting metadata,
  // preserving metadata so the user can retry and the file is not orphaned.
  const storageRef = ref(storageInstance, docData.storagePath);
  
  try {
    await deleteObject(storageRef);
  } catch (error: any) {
    // If the object is already missing in storage, treat as idempotent cleanup condition
    if (error?.code !== 'storage/object-not-found') {
      throw new Error(`Failed to delete file from storage: ${error.message}`);
    }
  }

  await deleteDoc(docRef);
}

export async function getDocumentDownloadUrl(
  userId: string, 
  documentId: string,
  firestoreInstance = db,
  storageInstance = storage
): Promise<string> {
  if (!userId) throw new Error('User must be authenticated');
  
  const docRef = doc(firestoreInstance, 'documents', documentId);
  const docSnap = await getDoc(docRef);
  
  if (!docSnap.exists() || docSnap.data().ownerId !== userId) {
    throw new Error('Unauthorized');
  }
  
  const docData = docSnap.data() as Document;
  const storageRef = ref(storageInstance, docData.storagePath);
  
  return await getDownloadURL(storageRef);
}

export function normalizeDocumentName(name: string): string {
  const trimmed = name.trim();
  if (!trimmed || trimmed === '.pdf') {
    throw new Error('Dateiname darf nicht leer sein');
  }
  let normalized = trimmed;
  if (!normalized.toLowerCase().endsWith('.pdf')) {
    normalized = `${normalized}.pdf`;
  }
  if (normalized.length > 255) {
    throw new Error('Dateiname darf maximal 255 Zeichen lang sein');
  }
  return normalized;
}

export async function renameDocument(
  userId: string,
  documentId: string,
  newName: string,
  firestoreInstance: any = db
): Promise<Document> {
  if (!userId) throw new Error('User must be authenticated');
  if (!documentId) throw new Error('Document ID is required');

  const sanitizedName = normalizeDocumentName(newName);

  const docRef = doc(firestoreInstance, 'documents', documentId);
  let docSnap;
  try {
    docSnap = await getDoc(docRef);
  } catch {
    throw new Error('Unauthorized');
  }

  if (!docSnap.exists()) {
    throw new Error('Dokument nicht gefunden');
  }

  const existingData = docSnap.data() as Document;
  if (existingData.ownerId !== userId) {
    throw new Error('Unauthorized');
  }

  // Update only allowed metadata field and updatedAt
  await updateDoc(docRef, {
    originalName: sanitizedName,
    updatedAt: serverTimestamp()
  });

  return {
    ...existingData,
    id: documentId,
    originalName: sanitizedName,
    updatedAt: new Date()
  };
}

export async function moveDocument(
  userId: string,
  documentId: string,
  targetTopicId: string,
  firestoreInstance: any = db
): Promise<Document> {
  if (!userId) throw new Error('User must be authenticated');
  if (!documentId) throw new Error('Document ID is required');
  if (!targetTopicId || !targetTopicId.trim()) {
    throw new Error('Ziel-Thema ist ungültig');
  }

  // 1. Verify target topic exists and belongs to user
  const topicRef = doc(firestoreInstance, 'topics', targetTopicId);
  let topicSnap;
  try {
    topicSnap = await getDoc(topicRef);
  } catch {
    throw new Error('Unauthorized: Ziel-Thema existiert nicht oder gehört einem anderen Benutzer');
  }

  if (!topicSnap.exists() || topicSnap.data().ownerId !== userId) {
    throw new Error('Unauthorized: Ziel-Thema existiert nicht oder gehört einem anderen Benutzer');
  }

  // 2. Load existing document and verify ownership
  const docRef = doc(firestoreInstance, 'documents', documentId);
  let docSnap;
  try {
    docSnap = await getDoc(docRef);
  } catch {
    throw new Error('Unauthorized');
  }

  if (!docSnap.exists()) {
    throw new Error('Dokument nicht gefunden');
  }

  const existingData = docSnap.data() as Document;
  if (existingData.ownerId !== userId) {
    throw new Error('Unauthorized');
  }

  if (existingData.topicId === targetTopicId) {
    return {
      ...existingData,
      id: documentId
    };
  }

  // 3. Update only topicId and updatedAt
  await updateDoc(docRef, {
    topicId: targetTopicId,
    updatedAt: serverTimestamp()
  });

  return {
    ...existingData,
    id: documentId,
    topicId: targetTopicId,
    updatedAt: new Date()
  };
}
