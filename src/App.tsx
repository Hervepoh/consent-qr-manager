import { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Admin from './pages/Admin';
import ConsentFlow from './pages/ConsentFlow';
import './index.css';

// Translations
const t = {
  FR: {
    adminTitle: 'Générateur QR',
    adminDesc: 'Scannez pour configurer la réception de vos factures.',
    adminBtn: 'Démarrer le Test',
    heroTitle: 'ENEO E-FACTURE',
    heroSubtitle: 'Le service gratuit de réception des factures électroniques via Whatsapp, Email et SMS. Simplifiez votre vie.',
    consentTitle: 'Votre Consentement',
    consentDesc: 'Choisissez le canal de communication.',
    emailLabel: 'Adresse Email',
    phoneLabel: 'Numéro de téléphone',
    emailPlaceholder: 'exemple@mail.com',
    phonePlaceholder: '+237 6XX XXX XXX',
    continue: 'Continuer',
    processing: 'Traitement...',
    otpTitle: 'Validation OTP',
    otpDesc: 'Code envoyé à',
    otpBtn: 'Valider',
    otpError: 'Code invalide !',
    profileTitle: 'Profil & Contrat',
    profileDesc: 'Vérifions vos informations de facturation.',
    contractLabel: 'Numéro de Contrat',
    contractPlaceholder: 'Entrez votre N° de contrat',
    clientLabel: 'Client',
    langLabel: 'Langue de préférence',
    statusLabel: 'Votre Statut',
    finalize: 'Confirmer mes informations',
    finalizing: 'Finalisation...',
    termsLabel: "J'accepte les conditions d'utilisation de ce service",
    notOwnerLabel: "Cochez si ce N° contrat n'est pas en votre nom",
    successTitle: 'Félicitations !',
    successDesc: 'Votre consentement a été validé avec succès pour le contrat',
    serviceActive: 'Service activé immédiatement',
    canal: 'Canal',
    lang: 'Langue',
    status: 'Statut',
    finish: 'Terminer',
    otpExpires: "L'OTP expire dans",
    resendAfter: 'Renvoyer après',
    resendBtn: "Renvoyer l'OTP",
    blockedMsg: 'Service suspendu pour {min} min',
    edit: 'Modifier mes informations',
    // Nouveaux messages d'erreur
    errTooManyAttempts: 'Trop de tentatives ! Votre compte est suspendu pour {min} minutes par sécurité.',
    errInvalidOtp: 'Le code saisi est incorrect ou a expiré. Veuillez réessayer.',
    errNetwork: 'Une erreur réseau est survenue. Vérifiez votre connexion.',
    errContractNotFound: 'Numéro de contrat introuvable. Veuillez vérifier votre facture.',
    errSaveFailed: "Échec de l'enregistrement. Veuillez réessayer plus tard.",
  },
  EN: {
    // ... existing ...
    adminTitle: 'QR Generator',
    adminDesc: 'Scan to configure your invoice reception.',
    adminBtn: 'Start Test Flow',
    heroTitle: 'ENEO E-FACTURE',
    heroSubtitle: 'The free electronic invoice reception service via Whatsapp, Email and SMS. Simplify your life.',
    consentTitle: 'Your Consent',
    consentDesc: 'Choose your communication channel.',
    emailLabel: 'Email Address',
    phoneLabel: 'Phone Number',
    emailPlaceholder: 'example@mail.com',
    phonePlaceholder: '+237 6XX XXX XXX',
    continue: 'Continue',
    processing: 'Processing...',
    otpTitle: 'OTP Validation',
    otpDesc: 'Code sent to',
    otpBtn: 'Validate',
    otpError: 'Invalid code! Tip: use 1234',
    profileTitle: 'Profile & Contract',
    profileDesc: 'Let\'s verify your billing information.',
    contractLabel: 'Contract Number',
    contractPlaceholder: 'Enter your contract number',
    clientLabel: 'Client',
    langLabel: 'Preferred Language',
    statusLabel: 'Your Status',
    finalize: 'Confirm my information',
    finalizing: 'Finalizing...',
    termsLabel: 'I accept the terms of use of this service',
    notOwnerLabel: 'Check if this contract number is not in your name',
    successTitle: 'Congratulations!',
    successDesc: 'Your consent has been successfully validated for contract',
    serviceActive: 'Service activated immediately',
    canal: 'Channel',
    lang: 'Language',
    status: 'Status',
    finish: 'Finish',
    otpExpires: 'OTP expires in',
    resendAfter: 'Resend after',
    resendBtn: 'Resend OTP',
    blockedMsg: 'Service suspended for {min} min',
    edit: 'Edit information',
    // New error messages
    errTooManyAttempts: 'Too many attempts! Your account is suspended for {min} minutes for security.',
    errInvalidOtp: 'The code entered is incorrect or has expired. Please try again.',
    errNetwork: 'A network error occurred. Please check your connection.',
    errContractNotFound: 'Contract number not found. Please check your invoice.',
    errSaveFailed: 'Saving failed. Please try again later.',
  }
};

import { Toaster } from 'sonner';

function App() {
  const [language, setLanguage] = useState<'FR' | 'EN'>('FR');
  const strings = t[language];

  return (
    <Router>
      <div className="app-main">
        <Routes>
          <Route path="/" element={<ConsentFlow strings={strings} language={language} setLanguage={setLanguage} />} />
          <Route path="/admin" element={<Admin strings={strings} />} />
        </Routes>
        <Toaster position="bottom-right" richColors />
      </div>
    </Router>
  );
}

export default App;
