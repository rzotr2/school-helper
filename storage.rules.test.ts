import { readFileSync, createReadStream } from 'fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { ref, uploadBytes, getDownloadURL, deleteObject, getBytes } from 'firebase/storage';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-school-app',
    storage: {
      rules: readFileSync('storage.rules', 'utf8'),
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

afterAll(async () => {
  await testEnv.cleanup();
});

function authedStorage(uid: string) {
  return testEnv.authenticatedContext(uid).storage();
}

function unauthedStorage() {
  return testEnv.unauthenticatedContext().storage();
}

describe('Firebase Storage Security Rules', () => {
  const fileBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // Minimal PDF header bytes

  it('1. User A can upload a PDF to their own path', async () => {
    const storage = authedStorage('userA');
    const storageRef = ref(storage, 'users/userA/documents/doc1.pdf');
    await assertSucceeds(uploadBytes(storageRef, fileBytes, { contentType: 'application/pdf' }));
  });

  it('2. User A cannot upload to User B namespace', async () => {
    const storage = authedStorage('userA');
    const storageRef = ref(storage, 'users/userB/documents/doc1.pdf');
    await assertFails(uploadBytes(storageRef, fileBytes, { contentType: 'application/pdf' }));
  });

  it('3. User A cannot upload non-PDF', async () => {
    const storage = authedStorage('userA');
    const storageRef = ref(storage, 'users/userA/documents/doc1.png');
    await assertFails(uploadBytes(storageRef, fileBytes, { contentType: 'image/png' }));
  });

  it('4. User A can read their own document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storageRef = ref(context.storage(), 'users/userA/documents/doc1.pdf');
      await uploadBytes(storageRef, fileBytes, { contentType: 'application/pdf' });
    });
    
    const storage = authedStorage('userA');
    const storageRef = ref(storage, 'users/userA/documents/doc1.pdf');
    await assertSucceeds(getDownloadURL(storageRef));
  });

  it('5. User A cannot read User B document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storageRef = ref(context.storage(), 'users/userB/documents/doc1.pdf');
      await uploadBytes(storageRef, fileBytes, { contentType: 'application/pdf' });
    });
    
    const storage = authedStorage('userA');
    const storageRef = ref(storage, 'users/userB/documents/doc1.pdf');
    await assertFails(getDownloadURL(storageRef));
  });

  it('6. Unauthenticated user cannot read document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storageRef = ref(context.storage(), 'users/userA/documents/doc1.pdf');
      await uploadBytes(storageRef, fileBytes, { contentType: 'application/pdf' });
    });
    
    const storage = unauthedStorage();
    const storageRef = ref(storage, 'users/userA/documents/doc1.pdf');
    await assertFails(getDownloadURL(storageRef));
  });

  it('7. User A can delete their own document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storageRef = ref(context.storage(), 'users/userA/documents/doc1.pdf');
      await uploadBytes(storageRef, fileBytes, { contentType: 'application/pdf' });
    });
    
    const storage = authedStorage('userA');
    const storageRef = ref(storage, 'users/userA/documents/doc1.pdf');
    await assertSucceeds(deleteObject(storageRef));
  });

  it('8. User A cannot delete User B document', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storageRef = ref(context.storage(), 'users/userB/documents/doc1.pdf');
      await uploadBytes(storageRef, fileBytes, { contentType: 'application/pdf' });
    });
    
    const storage = authedStorage('userA');
    const storageRef = ref(storage, 'users/userB/documents/doc1.pdf');
    await assertFails(deleteObject(storageRef));
  });
});
