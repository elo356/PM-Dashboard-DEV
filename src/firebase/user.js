import { db } from "./firebase";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";

export async function createUserProfile({
  uid,
  email,
  firstName,
  lastName,
  phone = null,
  legalAcceptance = null,
}) {
  const ref = doc(db, "users", uid);

  await setDoc(ref, {
    id: uid,
    email,
    first_name: firstName,
    last_name: lastName,
    phone: phone ?? null,
    access_level: "user", 
    created_at: serverTimestamp(),
    updated_at: serverTimestamp(),
    stripe_customer_id: null,
    subscription_status: "inactive",
    subscription_end: null,
    account_verified: false,
    stripe_subscription_id: null,
    Legal: legalAcceptance
      ? {
          termsAccepted: !!legalAcceptance.termsAccepted,
          termsVersion: legalAcceptance.termsVersion ?? null,
          privacyVersion: legalAcceptance.privacyVersion ?? null,
          acceptedAt: legalAcceptance.acceptedAt ?? null,
          acceptedIP: legalAcceptance.acceptedIP ?? null,
        }
      : null,
    terms_accepted_at: legalAcceptance?.acceptedAt ?? null,
    privacy_accepted_at: legalAcceptance?.acceptedAt ?? null,
    terms_version: legalAcceptance?.termsVersion ?? null,
    privacy_version: legalAcceptance?.privacyVersion ?? null,
  });
}
