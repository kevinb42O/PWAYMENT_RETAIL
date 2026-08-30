const required = {
  VITE_LEGAL_NAME: 'juridische naam',
  VITE_LEGAL_FORM: 'rechtsvorm',
  VITE_LEGAL_ADDRESS: 'maatschappelijke zetel',
  VITE_LEGAL_ENTERPRISE_NUMBER: 'ondernemingsnummer',
  VITE_LEGAL_VAT_NUMBER: 'btw-nummer',
  VITE_LEGAL_RPR: 'RPR en bevoegde rechtbank',
  VITE_LEGAL_EMAIL: 'juridisch e-mailadres',
  VITE_PRIVACY_EMAIL: 'privacycontact',
  VITE_SUPPORT_EMAIL: 'supportcontact',
  VITE_LEGAL_PHONE: 'telefoonnummer',
};

const missing = Object.entries(required)
  .filter(([name]) => !process.env[name]?.trim())
  .map(([name, label]) => `${name} (${label})`);

if (missing.length) {
  console.error(['Compliance-readiness mislukt: vul de productieomgeving aan met:', ...missing.map((item) => `- ${item}`)].join('\n'));
  process.exit(1);
}

console.log('Compliance-readiness geslaagd: de verplichte juridische identiteitsvelden zijn aanwezig.');
