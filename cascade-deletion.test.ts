import { readFileSync } from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { deleteTopic } from './src/application/use-cases/topics';
import { deleteSubject } from './src/application/use-cases/subjects';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-cascade-test',
    firestore: {
      rules: readFileSync('firestore.rules', 'utf8'),
      host: '127.0.0.1',
      port: 8080,
    },
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

async function recursiveClearStorage() {
  async function deleteFolder(folderRef: any) {
    try {
      const res = await folderRef.listAll();
      for (const item of res.items) {
        await item.delete();
      }
      for (const prefix of res.prefixes) {
        await deleteFolder(prefix);
      }
    } catch (e) {
      // Ignore if root or folder is empty
    }
  }
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await deleteFolder(context.storage().ref());
  });
}

beforeEach(async () => {
  await testEnv.clearFirestore();
  await recursiveClearStorage();
});

afterAll(async () => {
  await testEnv.cleanup();
});

function authedDb(uid: string) {
  return testEnv.authenticatedContext(uid).firestore();
}

function authedStorage(uid: string) {
  return testEnv.authenticatedContext(uid).storage();
}

const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]); // %PDF-1.4

async function putStorageFile(storageInstance: any, path: string) {
  const fileRef = ref(storageInstance, path);
  await uploadBytes(fileRef, pdfBytes, { contentType: 'application/pdf' });
}

async function fileExistsInStorage(storageInstance: any, path: string): Promise<boolean> {
  try {
    const fileRef = ref(storageInstance, path);
    await getDownloadURL(fileRef);
    return true;
  } catch (err: any) {
    if (err?.code === 'storage/object-not-found') {
      return false;
    }
    throw err;
  }
}

async function seedSubject(db: any, uid: string, subjectId: string, name = 'Mathematik') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'schoolProfiles', uid), {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(context.firestore(), 'subjects', subjectId), {
      ownerId: uid,
      name,
      position: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

async function seedTopic(db: any, uid: string, subjectId: string, topicId: string, name = 'Analysis') {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'topics', topicId), {
      ownerId: uid,
      subjectId,
      name,
      position: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

async function seedDocument(db: any, uid: string, topicId: string, docId: string, originalName = 'skript.pdf') {
  const storagePath = `users/${uid}/documents/${docId}.pdf`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), 'documents', docId), {
      ownerId: uid,
      topicId,
      originalName,
      storagePath,
      mimeType: 'application/pdf',
      size: 1024,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
  return storagePath;
}

describe('Document Lifecycle & Cascade Deletion Tests', () => {
  it('1. Topic with zero documents can be deleted', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedSubject(db, uid, 'sub1');
    await seedTopic(db, uid, 'sub1', 'top1');

    await deleteTopic(uid, 'top1', db, storage);

    const topicSnap = await getDoc(doc(db, 'topics', 'top1'));
    expect(topicSnap.exists()).toBe(false);
  });

  it('2. Topic with one document deletes the document metadata', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedSubject(db, uid, 'sub1');
    await seedTopic(db, uid, 'sub1', 'top1');
    await seedDocument(db, uid, 'top1', 'doc1');

    await deleteTopic(uid, 'top1', db, storage);

    const docSnap = await getDoc(doc(db, 'documents', 'doc1'));
    expect(docSnap.exists()).toBe(false);
    const topicSnap = await getDoc(doc(db, 'topics', 'top1'));
    expect(topicSnap.exists()).toBe(false);
  });

  it('3. Topic with one document deletes the Storage object', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedSubject(db, uid, 'sub1');
    await seedTopic(db, uid, 'sub1', 'top1');
    const storagePath = await seedDocument(db, uid, 'top1', 'doc1');

    // Upload actual file into Storage emulator
    await putStorageFile(storage, storagePath);
    expect(await fileExistsInStorage(storage, storagePath)).toBe(true);

    // Delete topic
    await deleteTopic(uid, 'top1', db, storage);

    // Verify storage file is gone from storage emulator
    const existsAfter = await fileExistsInStorage(storage, storagePath);
    expect(existsAfter).toBe(false);
  });

  it('4. Topic with multiple documents deletes all associated metadata', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedSubject(db, uid, 'sub1');
    await seedTopic(db, uid, 'sub1', 'top1');
    await seedDocument(db, uid, 'top1', 'doc1');
    await seedDocument(db, uid, 'top1', 'doc2');
    await seedDocument(db, uid, 'top1', 'doc3');

    await deleteTopic(uid, 'top1', db, storage);

    expect((await getDoc(doc(db, 'documents', 'doc1'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'documents', 'doc2'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'documents', 'doc3'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'topics', 'top1'))).exists()).toBe(false);
  });

  it('5. Topic with multiple documents deletes all associated Storage objects', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedSubject(db, uid, 'sub1');
    await seedTopic(db, uid, 'sub1', 'top1');
    const p1 = await seedDocument(db, uid, 'top1', 'doc1');
    const p2 = await seedDocument(db, uid, 'top1', 'doc2');
    const p3 = await seedDocument(db, uid, 'top1', 'doc3');

    await putStorageFile(storage, p1);
    await putStorageFile(storage, p2);
    await putStorageFile(storage, p3);

    expect(await fileExistsInStorage(storage, p1)).toBe(true);
    expect(await fileExistsInStorage(storage, p2)).toBe(true);
    expect(await fileExistsInStorage(storage, p3)).toBe(true);

    await deleteTopic(uid, 'top1', db, storage);

    expect(await fileExistsInStorage(storage, p1)).toBe(false);
    expect(await fileExistsInStorage(storage, p2)).toBe(false);
    expect(await fileExistsInStorage(storage, p3)).toBe(false);
  });

  it('6. Subject with multiple Topics and Documents deletes the complete subtree', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedSubject(db, uid, 'sub1');
    await seedTopic(db, uid, 'sub1', 'top1');
    await seedTopic(db, uid, 'sub1', 'top2');
    const p1 = await seedDocument(db, uid, 'top1', 'doc1');
    const p2 = await seedDocument(db, uid, 'top1', 'doc2');
    const p3 = await seedDocument(db, uid, 'top2', 'doc3');

    await putStorageFile(storage, p1);
    await putStorageFile(storage, p2);
    await putStorageFile(storage, p3);

    await deleteSubject(uid, 'sub1', db, storage);

    // Verify Subject, Topics, Document metadata are all gone
    expect((await getDoc(doc(db, 'subjects', 'sub1'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'topics', 'top1'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'topics', 'top2'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'documents', 'doc1'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'documents', 'doc2'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'documents', 'doc3'))).exists()).toBe(false);

    // Verify Storage files are all deleted
    expect(await fileExistsInStorage(storage, p1)).toBe(false);
    expect(await fileExistsInStorage(storage, p2)).toBe(false);
    expect(await fileExistsInStorage(storage, p3)).toBe(false);
  });

  it('7. Deleting one Topic does not affect another Topic', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedSubject(db, uid, 'sub1');
    await seedTopic(db, uid, 'sub1', 'top1');
    await seedTopic(db, uid, 'sub1', 'top2');
    const p1 = await seedDocument(db, uid, 'top1', 'doc1');
    const p2 = await seedDocument(db, uid, 'top2', 'doc2');

    await putStorageFile(storage, p1);
    await putStorageFile(storage, p2);

    await deleteTopic(uid, 'top1', db, storage);

    // top1 and doc1 are deleted
    expect((await getDoc(doc(db, 'topics', 'top1'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'documents', 'doc1'))).exists()).toBe(false);
    expect(await fileExistsInStorage(storage, p1)).toBe(false);

    // top2 and doc2 remain intact
    expect((await getDoc(doc(db, 'topics', 'top2'))).exists()).toBe(true);
    expect((await getDoc(doc(db, 'documents', 'doc2'))).exists()).toBe(true);
    expect(await fileExistsInStorage(storage, p2)).toBe(true);
  });

  it('8. Deleting one Subject does not affect another Subject', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedSubject(db, uid, 'sub1', 'Mathematik');
    await seedSubject(db, uid, 'sub2', 'Physik');
    await seedTopic(db, uid, 'sub1', 'top1');
    await seedTopic(db, uid, 'sub2', 'top2');
    const p1 = await seedDocument(db, uid, 'top1', 'doc1');
    const p2 = await seedDocument(db, uid, 'top2', 'doc2');

    await putStorageFile(storage, p1);
    await putStorageFile(storage, p2);

    await deleteSubject(uid, 'sub1', db, storage);

    // sub1 deleted
    expect((await getDoc(doc(db, 'subjects', 'sub1'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'topics', 'top1'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'documents', 'doc1'))).exists()).toBe(false);
    expect(await fileExistsInStorage(storage, p1)).toBe(false);

    // sub2 remains intact
    expect((await getDoc(doc(db, 'subjects', 'sub2'))).exists()).toBe(true);
    expect((await getDoc(doc(db, 'topics', 'top2'))).exists()).toBe(true);
    expect((await getDoc(doc(db, 'documents', 'doc2'))).exists()).toBe(true);
    expect(await fileExistsInStorage(storage, p2)).toBe(true);
  });

  it('9. Cross-user deletion remains denied', async () => {
    const userA_uid = 'userA';
    const userB_uid = 'userB';

    const dbA = authedDb(userA_uid);
    const storageA = authedStorage(userA_uid);
    const dbB = authedDb(userB_uid);
    const storageB = authedStorage(userB_uid);

    await seedSubject(dbB, userB_uid, 'subB');
    await seedTopic(dbB, userB_uid, 'subB', 'topB');
    const pB = await seedDocument(dbB, userB_uid, 'topB', 'docB');
    await putStorageFile(storageB, pB);

    // User A attempts to delete User B's topic
    await expect(deleteTopic(userA_uid, 'topB', dbA, storageA)).rejects.toThrow();

    // User A attempts to delete User B's subject
    await expect(deleteSubject(userA_uid, 'subB', dbA, storageA)).rejects.toThrow();

    // Verify User B's subject, topic, document, and storage object remain intact
    expect((await getDoc(doc(dbB, 'subjects', 'subB'))).exists()).toBe(true);
    expect((await getDoc(doc(dbB, 'topics', 'topB'))).exists()).toBe(true);
    expect((await getDoc(doc(dbB, 'documents', 'docB'))).exists()).toBe(true);
    expect(await fileExistsInStorage(storageB, pB)).toBe(true);
  });

  it('10. Missing Storage objects do not cause the deletion workflow to crash unnecessarily', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedSubject(db, uid, 'sub1');
    await seedTopic(db, uid, 'sub1', 'top1');
    const storagePath = await seedDocument(db, uid, 'top1', 'doc1');

    // Deliberately do NOT upload file to storagePath (simulating missing/orphaned state)
    expect(await fileExistsInStorage(storage, storagePath)).toBe(false);

    // Deletion should complete without throwing
    await expect(deleteTopic(uid, 'top1', db, storage)).resolves.not.toThrow();

    // Topic and Document metadata should still be cleaned up cleanly
    expect((await getDoc(doc(db, 'topics', 'top1'))).exists()).toBe(false);
    expect((await getDoc(doc(db, 'documents', 'doc1'))).exists()).toBe(false);
  });
});
