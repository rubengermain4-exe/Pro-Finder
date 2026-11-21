import { html, setHtml } from '../lib/html.js';
import { config } from '../config.js';

const DOCS = {
  mentions: ['Mentions légales', () => html`
    <h2>Éditeur du site</h2>
    <p>${config.companyName}<br />${config.companyLegalInfo}</p>
    ${config.contactEmail ? html`<p>Contact : ${config.contactEmail}</p>` : ''}
    <h2>Hébergement</h2>
    <p>Le site est hébergé par Cloudflare (Cloudflare, Inc.) et les données sont gérées par Supabase.</p>
    <h2>Rôle de Pro Finder</h2>
    <p>Pro Finder est un annuaire qui met en relation des particuliers et des professionnels. Pro Finder n'est pas partie aux contrats conclus entre eux et ne garantit pas la qualité des prestations.</p>`],
  cgu: ["Conditions d'utilisation", () => html`
    <h2>1. Objet</h2><p>Pro Finder permet de rechercher et de contacter des prestataires de services au Gabon. L'utilisation du site implique l'acceptation de ces conditions.</p>
    <h2>2. Comptes</h2><p>Vous êtes responsable de la confidentialité de vos identifiants et de l'exactitude des informations fournies. Un compte peut être suspendu en cas d'abus ou de fraude.</p>
    <h2>3. Professionnels et abonnement</h2><p>La fiche d'un professionnel est publiée après validation et reste visible tant que son abonnement est actif. Le tarif et la durée en vigueur sont affichés sur la page d'accueil et dans l'espace professionnel. Un abonnement expiré rend la fiche non publique jusqu'au renouvellement.</p>
    <h2>4. Contenus et avis</h2><p>Les avis ne peuvent être déposés qu'après un échange réel via la messagerie. Les contenus faux, injurieux ou illégaux sont supprimés. Chaque fiche peut être signalée.</p>
    <h2>5. Responsabilité</h2><p>Les professionnels sont seuls responsables de leurs prestations et de leurs informations. Pour les métiers sensibles (enfants, santé, juridique, sécurité), demandez toujours des justificatifs.</p>
    <h2>6. Contact</h2><p>Pour toute question, utilisez la page <a href="/contact">Contact</a>.</p>`],
  privacy: ['Politique de confidentialité', () => html`
    <h2>Données collectées</h2><p>Nom, e-mail, téléphone (facultatif), informations de fiche pour les professionnels, messages échangés, avis, favoris et statistiques de consultation.</p>
    <h2>Utilisation</h2><p>Ces données servent à faire fonctionner l'annuaire, la messagerie, les abonnements et la modération. Elles ne sont pas vendues.</p>
    <h2>Messagerie</h2><p>Les conversations ne sont visibles que par leurs deux participants.</p>
    <h2>Cookies et stockage local</h2><p>Le site utilise uniquement le stockage nécessaire à votre session de connexion. Aucun traceur publicitaire n'est installé. La liste des fiches récemment consultées est conservée uniquement sur votre appareil (stockage local) ; vous pouvez l'effacer à tout moment depuis la page d'accueil.</p>
    <h2>Vos droits</h2><p>Vous pouvez demander l'accès, la correction ou la suppression de vos données via la page <a href="/contact">Contact</a>.</p>
    <h2>Sous-traitants</h2><p>Supabase (base de données, authentification, stockage) et Cloudflare (hébergement).</p>`],
};

export async function render({ root, route }) {
  const [title, body] = DOCS[route.doc];
  setHtml(root, html`<section class="page-head"><div class="container"><h1>${title}</h1></div></section><div class="container section"><div class="legal">${body()}</div></div>`);
  return undefined;
}
