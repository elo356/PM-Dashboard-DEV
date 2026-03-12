import {
  LEGAL_VERSIONS,
  PRIVACY_TEXT,
  PRIVACY_TITLE,
  TERMS_TEXT,
  TERMS_TITLE,
} from "../legal/legalContent";

export default function LegalModal({ kind, onClose }) {
  if (!kind) return null;

  const now = new Date();
  const todayVersion = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

  const isTerms = kind === "terms";
  const isPrivacy = kind === "privacy";
  const isDisclaimer = kind === "disclaimer";
  const title = isTerms ? TERMS_TITLE : (isPrivacy ? PRIVACY_TITLE : "Disclaimer");
  const text = isTerms
    ? TERMS_TEXT
    : (isPrivacy
      ? PRIVACY_TEXT
      : `
<section class="legal-container">
  <p>Nerion is a financial market analytics platform operated by Valarik LLC.</p>
  <p>Nerion provides financial market analytics tools for informational and educational purposes only.</p>
  <p>Nothing on this platform constitutes investment advice.</p>
  <p>Trading and investing involve significant risk of loss.</p>
</section>
`);
  const version = isTerms
    ? LEGAL_VERSIONS.terms
    : (isPrivacy ? LEGAL_VERSIONS.privacy : todayVersion);

  return (
    <div className="legalOverlay" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="legalModal" onClick={(e) => e.stopPropagation()}>
        <div className="legalHeader">
          <h3>{title}</h3>
          <button type="button" className="legalClose" onClick={onClose}>Close</button>
        </div>

        <div className="legalVersion">Version: {version}</div>

        <div className="legalBodyHtml" dangerouslySetInnerHTML={{ __html: text.trim() }} />
      </div>
    </div>
  );
}
