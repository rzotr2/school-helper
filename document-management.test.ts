import { readFileSync } from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { 
  renameDocument, 
  moveDocument, 
  normalizeDocumentName 
} from './src/application/use-cases/documents';
import { deleteTopic } from './src/application/use-cases/topics';
import { deleteSubject } from './src/application/use-cases/subjects';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-doc-mgmt-test',
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
    } catch {
      // Ignore if empty
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

const samplePdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);

async function putStorageFile(storageInstance: any, path: string) {
  const fileRef = ref(storageInstance, path);
  await uploadBytes(fileRef, samplePdf, { contentType: 'application/pdf' });
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

async function seedUserHierarchy(uid: string, subjectId: string, topicId: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'schoolProfiles', uid), {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(firestore, 'subjects', subjectId), {
      ownerId: uid,
      name: 'Fach ' + subjectId,
      position: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    await setDoc(doc(firestore, 'topics', topicId), {
      ownerId: uid,
      subjectId,
      name: 'Thema ' + topicId,
      position: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

async function seedDocument(uid: string, topicId: string, docId: string, originalName = 'Hausaufgabe.pdf') {
  const storagePath = `users/${uid}/documents/${docId}.pdf`;
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const firestore = context.firestore();
    await setDoc(doc(firestore, 'documents', docId), {
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

describe('Stage 5: Document Management Tests', () => {

  describe('1. Name Normalization & Validation', () => {
    it('trims whitespace and ensures .pdf extension', () => {
      expect(normalizeDocumentName('  Hausaufgabe  ')).toBe('Hausaufgabe.pdf');
      expect(normalizeDocumentName('Hausaufgabe.pdf')).toBe('Hausaufgabe.pdf');
      expect(normalizeDocumentName('HAUSAUFGABE.PDF')).toBe('HAUSAUFGABE.PDF');
    });

    it('rejects empty or whitespace-only names', () => {
      expect(() => normalizeDocumentName('')).toThrow('Dateiname darf nicht leer sein');
      expect(() => normalizeDocumentName('   ')).toThrow('Dateiname darf nicht leer sein');
      expect(() => normalizeDocumentName('.pdf')).toThrow('Dateiname darf nicht leer sein');
    });

    it('rejects names exceeding 255 characters', () => {
      const longName = 'a'.repeat(256);
      expect(() => normalizeDocumentName(longName)).toThrow('maximal 255');
    });
  });

  describe('2. Security Rules — Rename Document', () => {
    it('1. User A can rename own document', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'docA', 'alt.pdf');

      const dbA = authedDb('userA');
      await assertSucceeds(updateDoc(doc(dbA, 'documents', 'docA'), {
        originalName: 'neu.pdf',
        updatedAt: serverTimestamp(),
      }));
    });

    it("2. User B cannot rename User A's document", async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'docA', 'alt.pdf');

      const dbB = authedDb('userB');
      await assertFails(updateDoc(doc(dbB, 'documents', 'docA'), {
        originalName: 'hacked.pdf',
        updatedAt: serverTimestamp(),
      }));
    });

    it('3. User cannot change ownerId', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'docA');

      const dbA = authedDb('userA');
      await assertFails(updateDoc(doc(dbA, 'documents', 'docA'), {
        ownerId: 'userB',
        updatedAt: serverTimestamp(),
      }));
    });

    it('4. User cannot change storagePath', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'docA');

      const dbA = authedDb('userA');
      await assertFails(updateDoc(doc(dbA, 'documents', 'docA'), {
        storagePath: 'users/userA/documents/other.pdf',
        updatedAt: serverTimestamp(),
      }));
    });

    it('5. User cannot change mimeType', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'docA');

      const dbA = authedDb('userA');
      await assertFails(updateDoc(doc(dbA, 'documents', 'docA'), {
        mimeType: 'text/plain',
        updatedAt: serverTimestamp(),
      }));
    });

    it('6. User cannot change size', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'docA');

      const dbA = authedDb('userA');
      await assertFails(updateDoc(doc(dbA, 'documents', 'docA'), {
        size: 9999,
        updatedAt: serverTimestamp(),
      }));
    });

    it('7. User cannot change createdAt', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'docA');

      const dbA = authedDb('userA');
      await assertFails(updateDoc(doc(dbA, 'documents', 'docA'), {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }));
    });
  });

  describe('3. Security Rules — Move Document', () => {
    it('8. User A can move own document to own Topic', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA1');
      await seedUserHierarchy('userA', 'subA', 'topA2');
      await seedDocument('userA', 'topA1', 'docA');

      const dbA = authedDb('userA');
      await assertSucceeds(updateDoc(doc(dbA, 'documents', 'docA'), {
        topicId: 'topA2',
        updatedAt: serverTimestamp(),
      }));
    });

    it("9. User A cannot move document to User B's Topic", async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedUserHierarchy('userB', 'subB', 'topB');
      await seedDocument('userA', 'topA', 'docA');

      const dbA = authedDb('userA');
      await assertFails(updateDoc(doc(dbA, 'documents', 'docA'), {
        topicId: 'topB',
        updatedAt: serverTimestamp(),
      }));
    });

    it('10. User cannot move document to non-existent Topic', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'docA');

      const dbA = authedDb('userA');
      await assertFails(updateDoc(doc(dbA, 'documents', 'docA'), {
        topicId: 'non-existent-topic',
        updatedAt: serverTimestamp(),
      }));
    });

    it("11. User B cannot move User A's document", async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedUserHierarchy('userB', 'subB', 'topB');
      await seedDocument('userA', 'topA', 'docA');

      const dbB = authedDb('userB');
      await assertFails(updateDoc(doc(dbB, 'documents', 'docA'), {
        topicId: 'topB',
        updatedAt: serverTimestamp(),
      }));
    });

    it('12. User cannot change ownerId or storagePath while moving', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA1');
      await seedUserHierarchy('userA', 'subA', 'topA2');
      await seedDocument('userA', 'topA1', 'docA');

      const dbA = authedDb('userA');
      await assertFails(updateDoc(doc(dbA, 'documents', 'docA'), {
        topicId: 'topA2',
        ownerId: 'userB',
        updatedAt: serverTimestamp(),
      }));

      await assertFails(updateDoc(doc(dbA, 'documents', 'docA'), {
        topicId: 'topA2',
        storagePath: 'users/userA/documents/changed.pdf',
        updatedAt: serverTimestamp(),
      }));
    });
  });

  describe('4. Application Use Cases', () => {
    it('renameDocument successfully renames document and updates timestamp', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'doc1', 'alte_arbeit.pdf');

      const dbA = authedDb('userA');
      const updated = await renameDocument('userA', 'doc1', 'neue_arbeit', dbA);

      expect(updated.originalName).toBe('neue_arbeit.pdf');
      
      const docSnap = await getDoc(doc(dbA, 'documents', 'doc1'));
      expect(docSnap.data()?.originalName).toBe('neue_arbeit.pdf');
    });

    it('renameDocument rejects unauthorized user', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'doc1', 'arbeit.pdf');

      const dbB = authedDb('userB');
      await expect(renameDocument('userB', 'doc1', 'gehackt', dbB)).rejects.toThrow();
    });

    it('renameDocument rejects empty name', async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedDocument('userA', 'topA', 'doc1', 'arbeit.pdf');

      const dbA = authedDb('userA');
      await expect(renameDocument('userA', 'doc1', '   ', dbA)).rejects.toThrow('Dateiname darf nicht leer sein');
    });

    it('moveDocument successfully moves document to another own topic', async () => {
      await seedUserHierarchy('userA', 'subA', 'top1');
      await seedUserHierarchy('userA', 'subA', 'top2');
      await seedDocument('userA', 'top1', 'doc1');

      const dbA = authedDb('userA');
      const updated = await moveDocument('userA', 'doc1', 'top2', dbA);

      expect(updated.topicId).toBe('top2');

      const docSnap = await getDoc(doc(dbA, 'documents', 'doc1'));
      expect(docSnap.data()?.topicId).toBe('top2');
    });

    it("moveDocument rejects moving to another user's topic", async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedUserHierarchy('userB', 'subB', 'topB');
      await seedDocument('userA', 'topA', 'doc1');

      const dbA = authedDb('userA');
      await expect(moveDocument('userA', 'doc1', 'topB', dbA)).rejects.toThrow('Unauthorized');
    });

    it("moveDocument rejects moving another user's document", async () => {
      await seedUserHierarchy('userA', 'subA', 'topA');
      await seedUserHierarchy('userB', 'subB', 'topB');
      await seedDocument('userA', 'topA', 'doc1');

      const dbB = authedDb('userB');
      await expect(moveDocument('userB', 'doc1', 'topB', dbB)).rejects.toThrow('Unauthorized');
    });
  });

  describe('5. Cascade Deletion Compatibility with Renamed & Moved Documents', () => {
    it('Topic cascade deletion deletes renamed and moved document and storage file', async () => {
      await seedUserHierarchy('userA', 'subA', 'top1');
      await seedUserHierarchy('userA', 'subA', 'top2');
      const storagePath = await seedDocument('userA', 'top1', 'doc1', 'original.pdf');

      const dbA = authedDb('userA');
      const storageA = authedStorage('userA');
      await putStorageFile(storageA, storagePath);
      expect(await fileExistsInStorage(storageA, storagePath)).toBe(true);

      // 1. Move doc1 from top1 to top2
      await moveDocument('userA', 'doc1', 'top2', dbA);
      // 2. Rename doc1
      await renameDocument('userA', 'doc1', 'renamed_doc', dbA);

      // Verify doc1 is currently in top2
      const checkSnap = await getDoc(doc(dbA, 'documents', 'doc1'));
      expect(checkSnap.data()?.topicId).toBe('top2');
      expect(checkSnap.data()?.originalName).toBe('renamed_doc.pdf');
      expect(checkSnap.data()?.storagePath).toBe(storagePath);

      // 3. Delete top2
      await deleteTopic('userA', 'top2', dbA, storageA);

      // Verify doc1 document is deleted
      const postSnap = await getDoc(doc(dbA, 'documents', 'doc1'));
      expect(postSnap.exists()).toBe(false);

      // Verify physical storage file is deleted
      expect(await fileExistsInStorage(storageA, storagePath)).toBe(false);
    });

    it('Subject cascade deletion deletes documents moved into its topics', async () => {
      await seedUserHierarchy('userA', 'sub1', 'top1');
      await seedUserHierarchy('userA', 'sub2', 'top2');
      const storagePath = await seedDocument('userA', 'top1', 'doc1', 'doc1.pdf');

      const dbA = authedDb('userA');
      const storageA = authedStorage('userA');
      await putStorageFile(storageA, storagePath);

      // Move doc1 from sub1/top1 into sub2/top2
      await moveDocument('userA', 'doc1', 'top2', dbA);

      // Delete sub2
      await deleteSubject('userA', 'sub2', dbA, storageA);

      // Verify doc1 is deleted
      const postSnap = await getDoc(doc(dbA, 'documents', 'doc1'));
      expect(postSnap.exists()).toBe(false);

      // Verify storage file deleted
      expect(await fileExistsInStorage(storageA, storagePath)).toBe(false);
    });
  });
});
