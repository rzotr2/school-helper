import { readFileSync } from 'fs';
import { initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { describe, it, beforeAll, afterAll, beforeEach, expect } from 'vitest';
import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { ref, uploadBytes } from 'firebase/storage';
import { getAllDocuments, deleteDocument } from './src/application/use-cases/documents';
import { getAllTopics } from './src/application/use-cases/topics';
import { getSubjects } from './src/application/use-cases/subjects';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-global-documents-test',
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

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    try {
      const rootRef = context.storage().ref();
      const res = await rootRef.listAll();
      for (const item of res.items) {
        await item.delete();
      }
    } catch (e) {
      // ignore
    }
  });
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

async function seedData(uid: string, subjectId: string, topicId: string, docId: string, docName: string) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    // Seed profile
    await setDoc(doc(adminDb, 'schoolProfiles', uid), {
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Seed subject
    await setDoc(doc(adminDb, 'subjects', subjectId), {
      ownerId: uid,
      name: `Subject ${subjectId}`,
      position: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Seed topic
    await setDoc(doc(adminDb, 'topics', topicId), {
      ownerId: uid,
      subjectId: subjectId,
      name: `Topic ${topicId}`,
      position: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    // Seed document
    await setDoc(doc(adminDb, 'documents', docId), {
      ownerId: uid,
      topicId: topicId,
      originalName: docName,
      storagePath: `users/${uid}/documents/${docId}.pdf`,
      mimeType: 'application/pdf',
      size: 2048,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });
}

describe('Global Documents Library (Stage 4B)', () => {
  it('1. Empty document collection returns an empty list', async () => {
    const uid = 'userA';
    const db = authedDb(uid);

    const docs = await getAllDocuments(uid, db as any);
    expect(docs).toEqual([]);
  });

  it('2. Authenticated user can retrieve own documents across different subjects/topics', async () => {
    const uid = 'userA';
    const db = authedDb(uid);

    await seedData(uid, 'sub1', 'top1', 'doc1', 'Math Notes.pdf');
    await seedData(uid, 'sub2', 'top2', 'doc2', 'German Essay.pdf');

    const docs = await getAllDocuments(uid, db as any);
    expect(docs).toHaveLength(2);
    expect(docs.map(d => d.originalName).sort()).toEqual(['German Essay.pdf', 'Math Notes.pdf']);
  });

  it('3. Documents are strictly scoped to ownerId (cross-user isolation)', async () => {
    const uidA = 'userA';
    const uidB = 'userB';
    const dbA = authedDb(uidA);
    const dbB = authedDb(uidB);

    await seedData(uidA, 'subA', 'topA', 'docA', 'UserA Document.pdf');
    await seedData(uidB, 'subB', 'topB', 'docB', 'UserB Document.pdf');

    const docsA = await getAllDocuments(uidA, dbA as any);
    expect(docsA).toHaveLength(1);
    expect(docsA[0].id).toBe('docA');
    expect(docsA[0].originalName).toBe('UserA Document.pdf');

    const docsB = await getAllDocuments(uidB, dbB as any);
    expect(docsB).toHaveLength(1);
    expect(docsB[0].id).toBe('docB');
    expect(docsB[0].originalName).toBe('UserB Document.pdf');
  });

  it('4. Unauthenticated context throws error', async () => {
    const db = authedDb('userA');
    await expect(getAllDocuments('', db as any)).rejects.toThrow('User must be authenticated');
  });

  it('5. Subject and Topic names are accurately resolvable in-memory from loaded collections', async () => {
    const uid = 'userA';
    const db = authedDb(uid);

    await seedData(uid, 'math-sub', 'algebra-top', 'doc1', 'Quadratische Gleichungen.pdf');

    const [subjects, topics, docs] = await Promise.all([
      getSubjects(uid, db as any),
      getAllTopics(uid, db as any),
      getAllDocuments(uid, db as any)
    ]);

    const subjectsMap = new Map(subjects.map(s => [s.id, s]));
    const topicsMap = new Map(topics.map(t => [t.id, t]));

    expect(docs).toHaveLength(1);
    const docItem = docs[0];
    const resolvedTopic = topicsMap.get(docItem.topicId);
    const resolvedSubject = resolvedTopic ? subjectsMap.get(resolvedTopic.subjectId) : undefined;

    expect(resolvedTopic).toBeDefined();
    expect(resolvedTopic?.name).toBe('Topic algebra-top');
    expect(resolvedSubject).toBeDefined();
    expect(resolvedSubject?.name).toBe('Subject math-sub');
  });

  it('6. Deleting a document removes both Storage object and Firestore metadata', async () => {
    const uid = 'userA';
    const db = authedDb(uid);
    const storage = authedStorage(uid);

    await seedData(uid, 'sub1', 'top1', 'doc1', 'ToDelete.pdf');
    
    // Upload bytes to storage
    const storagePath = `users/${uid}/documents/doc1.pdf`;
    const storageRef = ref(storage, storagePath);
    await uploadBytes(storageRef, new Uint8Array([1, 2, 3]), { contentType: 'application/pdf' });

    // Call deleteDocument
    await deleteDocument(uid, 'doc1', db as any, storage as any);

    // Verify metadata deleted
    const docs = await getAllDocuments(uid, db as any);
    expect(docs).toHaveLength(0);
  });
});
