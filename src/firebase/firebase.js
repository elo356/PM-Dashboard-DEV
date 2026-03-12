import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

console.log("ENV:", import.meta.env);
console.log("SENDER:", import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID);

const firebaseConfig = {
  //apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  //authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  //projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  //storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  //messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  //appId: import.meta.env.VITE_FIREBASE_APP_ID,
 apiKey: "AIzaSyAYfP221jxyZgZPXUx9__sFgVFZ5t-wz_8",

  authDomain: "dashboard-a231d.firebaseapp.com",

  databaseURL: "https://dashboard-a231d-default-rtdb.firebaseio.com",

  projectId: "dashboard-a231d",

  storageBucket: "dashboard-a231d.firebasestorage.app",

  messagingSenderId: "788267166529",

  appId: "1:788267166529:web:4530dc19d9a45c21580fc0",


};



const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);
