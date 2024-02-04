import { initializeApp } from 'firebase/app';
import { collection, doc, getDoc, getFirestore, onSnapshot, query } from 'firebase/firestore';

const firebaseConfig = {
    apiKey: process.env.FIREBASE_API_KEY,
    authDomain: process.env.FIREBASE_AUTH_DOMAIN,
    projectId: process.env.FIREBASE_PROJECT_ID,
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.FIREBASE_APP_ID,
    measurementId: process.env.FIREBASE_MEASUREMENT_ID,
};

export const firebaseCollections = {
    assets: process.env.FIREBASE_DB_ASSETS || 'assets',
    maps: process.env.FIREBASE_DB_MAPS || 'maps'
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);


export const getCollection = (type: string): Promise<object[]> => {
    return new Promise((resolve) => {
        const q = query(collection(db, type));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const receivedData: object[] = [];
            querySnapshot.forEach((doc) => {
                receivedData.push({ ...doc.data(), id: doc.id });
            });
            resolve(receivedData);
            return () => unsubscribe()
        })
    });
};

export const getById = async (id: string, collection: string): Promise<object|null> => {
    const docRef = doc(db, collection, id);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
        return docSnap.data();
    }
    return null;
}

