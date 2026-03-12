import { auth } from "./firebase";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  sendEmailVerification,
} from "firebase/auth";

export function watchAuth(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signup(email, password) {
  const cred = await createUserWithEmailAndPassword(auth, email, password);

  await sendEmailVerification(cred.user, {
    url: "https://nerion.app/login", 
  });

  return cred.user;
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  const user = cred.user;

  if (!user.emailVerified) {
    await signOut(auth);
    const err = new Error("Debes verificar tu email antes de iniciar sesión.");
    err.code = "auth/email-not-verified";
    throw err;
  }

  return user;
}

export async function logout() {
  await signOut(auth);
}

export async function recoverPassword(email) {
  await sendPasswordResetEmail(auth, email);
}
