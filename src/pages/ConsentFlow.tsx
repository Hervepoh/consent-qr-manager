import { useState, useEffect } from 'react';
import { z } from 'zod';
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Mail,
  Phone,
  CheckCircle2,
  Search,
  UserCircle,
  Sun,
  Moon,
  ArrowLeft,
  Zap,
  AlertCircle,
  Timer,
  RefreshCw
} from 'lucide-react';

import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Label } from '../components/ui/Label';
import { Badge } from '../components/ui/Badge';
import { Checkbox } from '../components/ui/Checkbox';
import { cn } from '../lib/utils';

interface ConsentFlowProps {
  strings: any;
  language: 'FR' | 'EN';
  setLanguage: (lang: 'FR' | 'EN') => void;
}

type View = 'consent' | 'otp' | 'profile' | 'success';
type Channel = 'SMS' | 'WHATSAPP' | 'EMAIL';
type Status = 'Bailleur' | 'Locataire' | 'Autre';

const API_BASE = '/api';

const StepIndicator = ({ current, total }: { current: number, total: number }) => (
  <div className="flex gap-1 justify-center mb-4">
    {Array.from({ length: total }).map((_, i) => (
      <div
        key={i}
        className={cn(
          "step-indicator-item",
          i + 1 === current ? "step-indicator-active" : "step-indicator-inactive"
        )}
      />
    ))}
  </div>
);

export default function ConsentFlow({ strings, language, setLanguage }: ConsentFlowProps) {
  const [view, setView] = useState<View>('consent');
  const [channel, setChannel] = useState<Channel | null>(null);
  const [contact, setContact] = useState('');
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [contract, setContract] = useState('');
  const [clientName, setClientName] = useState('');
  const [status, setStatus] = useState<Status>('Locataire');
  const [prefLang, setPrefLang] = useState<'FR' | 'EN'>(language);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [isNotOwner, setIsNotOwner] = useState(false);
  const [loading, setLoading] = useState(false);
  const [verifyingContract, setVerifyingContract] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  // OTP Lifecycle & Rate Limiting States
  const [expiresAt, setExpiresAt] = useState<Date | null>(null);
  const [blockedUntil, setBlockedUntil] = useState<Date | null>(null);
  const [timeLeft, setTimeLeft] = useState<number>(0); // in seconds
  const [reBlockTime, setReBlockTime] = useState<number>(0);
  const [sessionToken, setSessionToken] = useState<string | null>(null);

  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      return (saved as 'light' | 'dark') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
    }
    return 'dark';
  });

  // Zod Schemas
  const Schemas = {
    email: z.string().email(language === 'FR' ? 'Format email invalide' : 'Invalid email format'),
    phone: z.string().regex(/^(\+237|237)?\s?(6|2)\d{8}$/, language === 'FR' ? 'Numéro de téléphone invalide' : 'Invalid phone number'),
    contract: z.string().length(9, language === 'FR' ? 'Le contrat doit comporter 9 chiffres' : 'Contract must be 9 digits').regex(/^\d+$/, language === 'FR' ? 'Chiffres uniquement' : 'Digits only')
  };

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Sync preferred language with app language by default
  useEffect(() => {
    setPrefLang(language);
  }, [language]);

  // Countdown logic
  useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();

      // Handle OTP Expiration
      if (expiresAt) {
        const diff = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
        setTimeLeft(diff);
      }

      // Handle Rate Limit Blocking
      if (blockedUntil) {
        const diff = Math.max(0, Math.floor((blockedUntil.getTime() - now.getTime()) / 1000));
        setReBlockTime(diff);
        if (diff === 0) setBlockedUntil(null);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [expiresAt, blockedUntil]);

  const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');

  const slogan = language === 'FR' ? "L'énergie du Cameroun" : "The energy of Cameroon";

  const handleSendOtp = async (isResend = false) => {
    if (!channel || !contact) return;

    // Final Validation check before sending
    const schema = channel === 'EMAIL' ? Schemas.email : Schemas.phone;
    const result = schema.safeParse(contact);
    if (!result.success) {
      setSearchError(result.error.issues[0].message);
      return;
    }

    setLoading(true);
    setSearchError(null);
    try {
      const response = await fetch(`${API_BASE}/otp/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, channel }),
      });

      const data = await response.json();

      if (response.status === 429) {
        const blockEnds = new Date(data.blockedUntil);
        setBlockedUntil(blockEnds);
        setSearchError(strings.blockedMsg.replace('{min}', data.waitMinutes));
        return;
      }

      if (response.ok) {
        setExpiresAt(new Date(data.expiresAt));
        if (data.blockedUntil) setBlockedUntil(new Date(data.blockedUntil));
        if (!isResend) setView('otp');
      } else {
        alert(data.error || 'Failed to send OTP. Please try again.');
      }
    } catch (error) {
      console.error('Error sending OTP:', error);
      alert('Network error. Is the server running?');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    const code = otp.join('');
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/otp/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contact, code }),
      });
      const data = await response.json();
      if (data.success) {
        setSessionToken(data.token);
        setView('profile');
      } else {
        alert(data.error || strings.otpError);
      }
    } catch (error) {
      console.error('Error verifying OTP:', error);
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyContract = async () => {
    if (!contract) return;

    const result = Schemas.contract.safeParse(contract);
    if (!result.success) {
      setSearchError(result.error.issues[0].message);
      return;
    }

    setVerifyingContract(true);
    setSearchError(null);
    try {
      const response = await fetch(`${API_BASE}/contract/search/${contract}`);
      const data = await response.json();

      if (data.success) {
        setClientName(data.fullname || data.branch || `Client - ${contract}`);
      } else {
        setSearchError(language === 'FR' ? 'Contrat introuvable. Vérifiez le numéro.' : 'Contract not found. Please check the number.');
        setClientName('');
      }
    } catch (error) {
      console.error('Error verifying contract:', error);
      setSearchError('Network error. Please try again.');
      setClientName('');
    } finally {
      setVerifyingContract(false);
    }
  };

  const handleFinalSubmit = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/consent/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${sessionToken}`
        },
        body: JSON.stringify({
          contractNumber: contract,
          clientName,
          channel,
          contactValue: contact,
          language: prefLang,
          status,
          isNotOwner,
        }),
      });
      if (response.ok) {
        setView('success');
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#14689e', '#8bc53f', '#ffffff']
        });
      } else {
        alert('Failed to save consent. Please try again.');
      }
    } catch (error) {
      console.error('Error submitting consent:', error);
      alert('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleOtpChange = (index: number, value: string) => {
    const val = value.slice(-1);
    if (!/^\d*$/.test(val)) return;
    const newOtp = [...otp];
    newOtp[index] = val;
    setOtp(newOtp);
    if (val && index < 5) {
      document.getElementById(`otp-${index + 1}`)?.focus();
    }
  };

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      document.getElementById(`otp-${index - 1}`)?.focus();
    }
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const pastedData = e.clipboardData.getData('text').slice(0, 6);
    if (!/^\d*$/.test(pastedData)) return;

    const newOtp = [...otp];
    pastedData.split('').forEach((char, i) => {
      if (i < 6) newOtp[i] = char;
    });
    setOtp(newOtp);

    // Focus last filled or next input
    const nextIndex = Math.min(pastedData.length, 5);
    document.getElementById(`otp-${nextIndex}`)?.focus();
  };

  // Real-time validation wrappers
  const validateContact = (val: string) => {
    setContact(val);
    if (!channel || !val) {
      setSearchError(null);
      return;
    }
    const schema = channel === 'EMAIL' ? Schemas.email : Schemas.phone;
    const result = schema.safeParse(val);
    if (!result.success && val.length > 3) {
      setSearchError(result.error.issues[0].message);
    } else {
      setSearchError(null);
    }
  };

  const validateContract = (val: string) => {
    setContract(val);
    if (!val) {
      setSearchError(null);
      return;
    }
    const result = Schemas.contract.safeParse(val);
    if (!result.success && val.length >= 9) {
      setSearchError(result.error.issues[0].message);
    } else {
      setSearchError(null);
    }
  };

  const formatTime = (seconds: number) => {
    const min = Math.floor(seconds / 60);
    const sec = seconds % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  return (
    <div className="w-full h-full flex flex-col justify-center items-center py-4 px-4 overflow-hidden">
      {/* Top Navigation / Controls Container */}
      <div className="w-full max-w-lg mb-6 flex justify-between items-center bg-card/40 backdrop-blur-xl p-3 rounded-2xl border border-border/40 shadow-lg shrink-0">
        <div className="flex items-center gap-3">
          <img src="/eneo-logo.png" alt="Eneo Cameroon" className="h-8 w-auto object-contain" />
          <div className="hidden sm:block h-6 w-[1px] bg-border/40" />
          <span className="hidden sm:block text-[9px] uppercase tracking-widest font-bold text-muted-foreground leading-none">
            {slogan}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={toggleTheme} className="rounded-xl h-8 w-8 bg-background/50 hover:bg-background shadow-inner border border-border/20">
            {theme === 'light' ? <Moon className="h-3.5 w-3.5" /> : <Sun className="h-3.5 w-3.5" />}
          </Button>
          <div className="flex bg-muted/40 p-0.5 rounded-xl border border-border/20">
            {['FR', 'EN'].map((lang) => (
              <button
                key={lang}
                onClick={() => setLanguage(lang as 'FR' | 'EN')}
                className={cn(
                  "px-2.5 py-1 rounded-lg text-[9px] font-black transition-all",
                  language === lang
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-muted-foreground hover:text-foreground opacity-60"
                )}
              >
                {lang}
              </button>
            ))}
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg mb-4 text-center px-4 shrink-0"
      >
        <h1 className="text-2xl sm:text-3xl font-black tracking-tighter">
          <span className="bg-clip-text text-transparent bg-linear-to-r from-primary via-secondary to-secondary/80">
            {strings.heroTitle}
          </span>
        </h1>
        <p className="text-[9px] sm:text-[10px] font-bold text-muted-foreground/60 uppercase tracking-widest mt-2 leading-relaxed max-w-[90%] mx-auto">
          {strings.heroSubtitle}
        </p>
      </motion.div>

      <div className="w-full max-w-lg flex-1 flex flex-col justify-center overflow-hidden">
        <AnimatePresence mode="wait">
          {view === 'consent' && (
            <motion.div
              key="consent"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="w-full max-h-full flex flex-col overflow-hidden"
            >
              <StepIndicator current={1} total={3} />
              <Card className="card-blur border-primary/10 shadow-2xl overflow-hidden relative flex flex-col max-h-[85dvh]">
                <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12 -z-10">
                  <Zap size={140} className="text-primary fill-primary" />
                </div>
                <CardHeader className="space-y-1 pb-4 shrink-0">
                  <Badge variant="outline" className="w-fit border-primary/30 text-primary bg-primary/5 uppercase tracking-tighter text-[9px] font-bold">
                    {language === 'FR' ? 'Étape 1: Canal de Diffusion' : 'Step 1: Broadcast Channel'}
                  </Badge>
                  <CardTitle className="text-2xl font-black tracking-tight leading-none">{strings.consentTitle}</CardTitle>
                  <CardDescription className="text-sm text-muted-foreground/80 font-medium">{strings.consentDesc}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 overflow-y-auto custom-scrollbar flex-1 pb-6 px-6">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['SMS', 'WHATSAPP', 'EMAIL'] as Channel[]).map((c) => (
                      <button
                        key={c}
                        onClick={() => {
                          setChannel(c);
                          setSearchError(null);
                        }}
                        className={cn(
                          "flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all gap-2 group/opt",
                          channel === c
                            ? "border-primary bg-primary/10 text-primary shadow-lg shadow-primary/10 scale-[1.02]"
                            : "border-border/40 bg-background/50 hover:border-primary/40 text-muted-foreground"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-lg transition-colors",
                          channel === c ? "bg-primary text-primary-foreground" : "bg-muted/60"
                        )}>
                          {c === 'SMS' && <Phone className="h-5 w-5" />}
                          {c === 'WHATSAPP' && <MessageSquare className="h-5 w-5" />}
                          {c === 'EMAIL' && <Mail className="h-5 w-5" />}
                        </div>
                        <div className="text-center">
                          <span className="text-[10px] font-black uppercase tracking-widest leading-none block mb-0.5">{c}</span>
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="space-y-2 bg-muted/20 p-4 rounded-xl border border-border/10 shadow-inner">
                    <Label htmlFor="contact" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                      {channel === 'EMAIL' ? strings.emailLabel : strings.phoneLabel}
                    </Label>
                    <Input
                      id="contact"
                      type={channel === 'EMAIL' ? 'email' : 'tel'}
                      placeholder={channel === 'EMAIL' ? strings.emailPlaceholder : strings.phonePlaceholder}
                      value={contact}
                      onChange={(e) => validateContact(e.target.value)}
                      className="h-12 text-lg font-bold bg-background/80 border-border/40 rounded-xl"
                    />
                    <AnimatePresence>
                      {searchError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: 'auto' }}
                          exit={{ opacity: 0, height: 0 }}
                          className="flex items-center gap-2 mt-2 text-destructive"
                        >
                          <AlertCircle size={12} />
                          <span className="text-[10px] font-bold">{searchError}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </CardContent>
                <CardFooter className="pb-6 pt-2 shrink-0">
                  <Button
                    className="w-full h-14 text-lg font-black uppercase tracking-widest shimmer-btn rounded-xl"
                    onClick={() => handleSendOtp(false)}
                    disabled={!channel || !contact || loading || !!searchError}
                  >
                    {loading ? strings.processing : strings.continue}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {view === 'otp' && (
            <motion.div
              key="otp"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-h-full flex flex-col overflow-hidden"
            >
              <StepIndicator current={2} total={3} />
              <Card className="card-blur border-primary/10 shadow-2xl relative overflow-hidden max-h-[85dvh] flex flex-col">
                <CardHeader className="text-center pt-8 pb-4 shrink-0">
                  <Badge variant="outline" className="mx-auto mb-2 border-primary/30 text-primary bg-primary/5 uppercase tracking-tighter text-[9px] font-bold">
                    {language === 'FR' ? 'Étape 2: Sécurisation' : 'Step 2: Security'}
                  </Badge>
                  <CardTitle className="text-2xl font-black tracking-tight">{strings.otpTitle}</CardTitle>
                  <CardDescription className="text-sm">
                    {strings.otpDesc} <strong className="text-primary font-black">{contact}</strong>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6 overflow-y-auto flex-1 pb-6 px-6">
                  <div className="flex justify-center gap-2">
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        id={`otp-${i}`}
                        type="text"
                        maxLength={1}
                        value={digit}
                        onChange={(e) => handleOtpChange(i, e.target.value)}
                        onKeyDown={(e) => handleOtpKeyDown(i, e)}
                        onPaste={handleOtpPaste}
                        autoFocus={i === 0}
                        className="w-11 h-14 text-center text-2xl font-black rounded-xl border-2 border-border/40 bg-background/50 focus:border-primary outline-none transition-all"
                      />
                    ))}
                  </div>

                  {/* OTP Lifecycle / Resend Section */}
                  <div className="space-y-4 px-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Timer size={14} className={cn(timeLeft < 60 ? "text-destructive animate-pulse" : "text-primary")} />
                        <span className="text-[10px] font-black uppercase tracking-widest">
                          {strings.otpExpires}: <span className={cn("font-mono text-xs", timeLeft < 60 ? "text-destructive" : "text-foreground")}>{formatTime(timeLeft)}</span>
                        </span>
                      </div>

                      <Button
                        variant="link"
                        size="sm"
                        onClick={() => handleSendOtp(true)}
                        disabled={timeLeft > 0 || !!blockedUntil || loading}
                        className="text-[10px] font-black uppercase tracking-widest p-0 h-auto"
                      >
                        <RefreshCw size={12} className={cn("mr-1", loading && "animate-spin")} />
                        {strings.resendBtn}
                      </Button>
                    </div>

                    <AnimatePresence>
                      {blockedUntil && (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 text-destructive">
                            <AlertCircle size={14} />
                            <span className="text-[10px] font-black uppercase tracking-tighter">
                              {strings.blockedMsg.replace('{min}', Math.ceil(reBlockTime / 60))}
                            </span>
                          </div>
                          <span className="font-mono text-xs font-bold text-destructive">
                            {formatTime(reBlockTime)}
                          </span>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>

                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-[9px] font-bold uppercase tracking-widest text-muted-foreground/60"
                    onClick={() => setView('consent')}
                  >
                    <ArrowLeft className="mr-2 h-3 w-3" /> {strings.edit}
                  </Button>
                </CardContent>
                <CardFooter className="pb-8 shrink-0">
                  <Button
                    className="w-full h-14 text-lg font-black uppercase tracking-widest shimmer-btn rounded-xl"
                    onClick={handleVerifyOtp}
                    disabled={otp.some(d => !d) || loading}
                  >
                    {loading ? strings.processing : strings.otpBtn}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {view === 'profile' && (
            <motion.div
              key="profile"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="w-full max-h-full flex flex-col overflow-hidden"
            >
              <StepIndicator current={3} total={3} />
              <Card className="card-blur border-primary/10 shadow-2xl overflow-hidden flex flex-col max-h-[85dvh]">
                <CardHeader className="pb-4 shrink-0">
                  <Badge variant="outline" className="w-fit border-primary/30 text-primary bg-primary/5 uppercase tracking-tighter text-[9px] font-bold mb-1">
                    {language === 'FR' ? 'Étape 3: Identification' : 'Step 3: Identification'}
                  </Badge>
                  <CardTitle className="text-2xl font-black tracking-tight">{strings.profileTitle}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-5 overflow-y-auto flex-1 pb-6 px-6">
                  <div className="space-y-3 bg-muted/20 p-4 rounded-2xl border border-border/10 shadow-inner">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-primary/70">{strings.contractLabel}</Label>
                    <div className="flex gap-2">
                      <Input
                        placeholder={strings.contractPlaceholder}
                        value={contract}
                        onChange={(e) => validateContract(e.target.value)}
                        className="h-10 text-base font-bold rounded-xl"
                      />
                      <Button
                        size="icon"
                        onClick={handleVerifyContract}
                        disabled={!contract || verifyingContract || !!searchError}
                        className="h-10 w-10 rounded-xl"
                      >
                        {verifyingContract ? (
                          <div className="h-4 w-4 border-2 border-primary-foreground border-t-transparent animate-spin rounded-full" />
                        ) : (
                          <Search className="h-4 w-4" />
                        )}
                      </Button>
                    </div>

                    <AnimatePresence>
                      {searchError && (
                        <motion.div
                          initial={{ opacity: 0, height: 0, marginTop: 0 }}
                          animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                          exit={{ opacity: 0, height: 0, marginTop: 0 }}
                          className="flex items-center gap-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive overflow-hidden"
                        >
                          <AlertCircle size={14} className="shrink-0" />
                          <span className="text-[10px] font-bold tracking-tight">{searchError}</span>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {clientName && (
                      <div className="mt-1 p-2 rounded-xl bg-primary/10 border border-primary/20 flex items-center gap-2">
                        <UserCircle size={20} className="text-primary" />
                        <div className="text-[10px] font-black tracking-tight text-primary leading-none">{clientName}</div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{strings.langLabel}</Label>
                    <div className="flex bg-muted/40 p-1 rounded-xl border border-border/10">
                      {['FR', 'EN'].map((lang) => (
                        <button
                          key={lang}
                          onClick={() => setPrefLang(lang as 'FR' | 'EN')}
                          className={cn(
                            "flex-1 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all",
                            prefLang === lang
                              ? "bg-primary text-primary-foreground shadow-md"
                              : "text-muted-foreground opacity-60 hover:opacity-100"
                          )}
                        >
                          {lang === 'FR' ? 'Français' : 'English'}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2 pb-2">
                    <Label className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">{strings.statusLabel}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['Bailleur', 'Locataire', 'Autre'] as Status[]).map((s) => (
                        <button
                          key={s}
                          onClick={() => setStatus(s)}
                          className={cn(
                            "py-3 rounded-xl text-[10px] font-black uppercase tracking-widest border-2 transition-all",
                            status === s
                              ? "bg-primary border-primary text-primary-foreground shadow-md"
                              : "border-border/40 bg-background/50 text-muted-foreground"
                          )}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3 pt-2">
                    <Checkbox
                      checked={isNotOwner}
                      onCheckedChange={setIsNotOwner}
                    >
                      {strings.notOwnerLabel}
                    </Checkbox>
                    <Checkbox
                      checked={acceptedTerms}
                      onCheckedChange={setAcceptedTerms}
                    >
                      {strings.termsLabel}
                    </Checkbox>
                  </div>
                </CardContent>
                <CardFooter className="pb-8 shrink-0 pt-2">
                  <Button
                    className="w-full h-14 text-lg font-black uppercase tracking-widest shimmer-btn rounded-xl"
                    onClick={handleFinalSubmit}
                    disabled={!clientName || !acceptedTerms || loading}
                  >
                    {loading ? strings.processing : strings.finalize}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}

          {view === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              className="w-full max-h-full flex flex-col overflow-hidden"
            >
              <Card className="card-blur border-primary/20 shadow-2xl overflow-hidden text-center relative max-h-[85dvh] flex flex-col">
                <CardHeader className="pt-10 space-y-4 shrink-0">
                  <div className="mx-auto bg-primary/10 rounded-full p-6 w-24 h-24 flex items-center justify-center relative shadow-inner">
                    <CheckCircle2 className="h-12 w-12 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-3xl font-black tracking-tighter leading-none">{strings.successTitle}</CardTitle>
                    <CardDescription className="text-sm font-medium mt-2">
                      {strings.successDesc} <span className="font-black text-primary">#{contract}</span>
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="px-6 flex-1 overflow-y-auto">
                  <div className="bg-background/40 rounded-2xl p-6 space-y-3 text-left border border-border/10 shadow-inner">
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <span>{strings.canal}</span>
                      <Badge variant="outline" className="text-primary border-primary/20">{channel}</Badge>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <span>{strings.lang}</span>
                      <span className="text-foreground">{prefLang === 'FR' ? 'Français' : 'English'}</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                      <span>{strings.status}</span>
                      <span className="text-foreground">{status}</span>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="pb-10 pt-6 shrink-0">
                  <Button className="w-full h-14 text-lg font-black uppercase tracking-widest rounded-xl shimmer-btn" onClick={() => (window.location.href = '/')}>
                    {strings.finish}
                  </Button>
                </CardFooter>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="shrink-0 pt-4 flex flex-col items-center gap-1 opacity-40">
        <Zap size={16} className="text-primary" />
        <div className="text-[8px] font-black uppercase tracking-[0.4em] text-muted-foreground">{slogan}</div>
      </div>
    </div>
  );
}
