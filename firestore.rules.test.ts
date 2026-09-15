import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, collection, getDocs, query, where, serverTimestamp } from 'firebase/firestore';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  // Read rules
  const rules = readFileSync('firestore.rules', 'utf8');

  // Initialize test environment
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-school-app',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

afterAll(async () => {
  await testEnv.cleanup();
});

describe('Firestore Security Rules', () => {
  
  // Helpers
  const unauthedDb = () => testEnv.unauthenticatedContext().firestore();
  const authedDb = (uid: string) => testEnv.authenticatedContext(uid).firestore();

  describe('School Profiles', () => {
    it('1. Unauthenticated user cannot read a school profile', async () => {
      const db = unauthedDb();
      await assertFails(getDoc(doc(db, 'schoolProfiles', 'user1')));
    });

    it('2. Unauthenticated user cannot create a school profile', async () => {
      const db = unauthedDb();
      await assertFails(setDoc(doc(db, 'schoolProfiles', 'user1'), {
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    });

    it('4. User A can read their own school profile', async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'schoolProfiles', 'userA'), {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertSucceeds(getDoc(doc(db, 'schoolProfiles', 'userA')));
    });

    it("5. User A cannot read User B's school profile", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'schoolProfiles', 'userB'), {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertFails(getDoc(doc(db, 'schoolProfiles', 'userB')));
    });
  });

  describe('Subjects', () => {
    it('3. Unauthenticated user cannot read subjects', async () => {
      const db = unauthedDb();
      await assertFails(getDocs(collection(db, 'subjects')));
    });

    it('6. User A can create a subject belonging to their own profile', async () => {
      const db = authedDb('userA');
      // Needs a school profile first
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'schoolProfiles', 'userA'), {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await assertSucceeds(setDoc(doc(db, 'subjects', 'subject1'), {
        ownerId: 'userA',
        name: 'Math',
        position: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    });

    it("7. User A cannot create a subject with another user's ownerId/profile ownership", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'schoolProfiles', 'userA'), {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        await setDoc(doc(context.firestore(), 'schoolProfiles', 'userB'), {
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await assertFails(setDoc(doc(db, 'subjects', 'subject1'), {
        ownerId: 'userB',
        name: 'Math',
        position: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    });

    it('8. User A can read their own subjects', async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subj1'), {
          ownerId: 'userA',
          name: 'Math',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      const q = query(collection(db, 'subjects'), where('ownerId', '==', 'userA'));
      await assertSucceeds(getDocs(q));
    });

    it("9. User A cannot read User B's subjects", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subjB'), {
          ownerId: 'userB',
          name: 'Math',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      const q = query(collection(db, 'subjects'), where('ownerId', '==', 'userB'));
      await assertFails(getDocs(q));
      
      // Attempting to read specific document should also fail
      await assertFails(getDoc(doc(db, 'subjects', 'subjB')));
    });

    it('10. User A can update their own subject', async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subjA'), {
          ownerId: 'userA',
          name: 'Math',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await assertSucceeds(updateDoc(doc(db, 'subjects', 'subjA'), {
        name: 'Advanced Math',
        updatedAt: serverTimestamp()
      }));
    });

    it("11. User A cannot update User B's subject", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subjB'), {
          ownerId: 'userB',
          name: 'Math',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await assertFails(updateDoc(doc(db, 'subjects', 'subjB'), {
        name: 'Advanced Math',
        updatedAt: serverTimestamp()
      }));
    });

    it('12. User A can delete their own subject', async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subjA'), {
          ownerId: 'userA',
          name: 'Math',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await assertSucceeds(deleteDoc(doc(db, 'subjects', 'subjA')));
    });

    it("13. User A cannot delete User B's subject", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subjB'), {
          ownerId: 'userB',
          name: 'Math',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });

      await assertFails(deleteDoc(doc(db, 'subjects', 'subjB')));
    });
  });

  describe('Topics', () => {
    it('1. Unauthenticated user cannot read topics', async () => {
      const db = unauthedDb();
      await assertFails(getDocs(collection(db, 'topics')));
    });

    it('2. Unauthenticated user cannot create topics', async () => {
      const db = unauthedDb();
      await assertFails(setDoc(doc(db, 'topics', 'topic1'), {
        ownerId: 'userA',
        subjectId: 'subjA',
        name: 'Math Topic',
        position: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    });

    it('3. User A can read their own topic', async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'topics', 'topicA'), {
          ownerId: 'userA',
          subjectId: 'subjA',
          name: 'Math Topic',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      const q = query(collection(db, 'topics'), where('ownerId', '==', 'userA'));
      await assertSucceeds(getDocs(q));
      await assertSucceeds(getDoc(doc(db, 'topics', 'topicA')));
    });

    it("4. User A cannot read User B's topic", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'topics', 'topicB'), {
          ownerId: 'userB',
          subjectId: 'subjB',
          name: 'Math Topic',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      const q = query(collection(db, 'topics'), where('ownerId', '==', 'userB'));
      await assertFails(getDocs(q));
      await assertFails(getDoc(doc(db, 'topics', 'topicB')));
    });

    it('5. User A can create a topic in their own subject', async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subjA'), {
          ownerId: 'userA',
          name: 'Math',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertSucceeds(setDoc(doc(db, 'topics', 'topicA'), {
        ownerId: 'userA',
        subjectId: 'subjA',
        name: 'Math Topic',
        position: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    });

    it("6. User A cannot create a topic referencing User B's subject", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subjB'), {
          ownerId: 'userB',
          name: 'Math',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertFails(setDoc(doc(db, 'topics', 'topicA'), {
        ownerId: 'userA',
        subjectId: 'subjB',
        name: 'Math Topic',
        position: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    });

    it("7. User A cannot create a topic using User B's ownerId", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subjA'), {
          ownerId: 'userA',
          name: 'Math',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertFails(setDoc(doc(db, 'topics', 'topicA'), {
        ownerId: 'userB',
        subjectId: 'subjA',
        name: 'Math Topic',
        position: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    });

    it('8. User A can update their own topic', async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'topics', 'topicA'), {
          ownerId: 'userA',
          subjectId: 'subjA',
          name: 'Math Topic',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertSucceeds(updateDoc(doc(db, 'topics', 'topicA'), {
        name: 'Advanced Topic',
        updatedAt: serverTimestamp()
      }));
    });

    it("9. User A cannot update User B's topic", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'topics', 'topicB'), {
          ownerId: 'userB',
          subjectId: 'subjB',
          name: 'Math Topic',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertFails(updateDoc(doc(db, 'topics', 'topicB'), {
        name: 'Advanced Topic',
        updatedAt: serverTimestamp()
      }));
    });

    it("10. User A cannot move/change a topic to User B's subject", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'subjects', 'subjB'), {
          ownerId: 'userB',
          name: 'Science',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        await setDoc(doc(context.firestore(), 'topics', 'topicA'), {
          ownerId: 'userA',
          subjectId: 'subjA',
          name: 'Math Topic',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertFails(updateDoc(doc(db, 'topics', 'topicA'), {
        subjectId: 'subjB',
        updatedAt: serverTimestamp()
      }));
    });

    it('11. User A can delete their own topic', async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'topics', 'topicA'), {
          ownerId: 'userA',
          subjectId: 'subjA',
          name: 'Math Topic',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertSucceeds(deleteDoc(doc(db, 'topics', 'topicA')));
    });

    it("12. User A cannot delete User B's topic", async () => {
      const db = authedDb('userA');
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'topics', 'topicB'), {
          ownerId: 'userB',
          subjectId: 'subjB',
          name: 'Math Topic',
          position: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });
      });
      await assertFails(deleteDoc(doc(db, 'topics', 'topicB')));
    });

    it('13. Invalid subject/topic relationships are rejected (non-existent subject)', async () => {
      const db = authedDb('userA');
      await assertFails(setDoc(doc(db, 'topics', 'topicA'), {
        ownerId: 'userA',
        subjectId: 'nonExistentSubjectId',
        name: 'Math Topic',
        position: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      }));
    });
  });
});
