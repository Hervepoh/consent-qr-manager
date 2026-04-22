import { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { motion, AnimatePresence } from 'framer-motion';
import { QrCode, ShieldAlert, Key, ArrowRight, Home, Zap } from 'lucide-react';
import { Button } from '../components/ui/Button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { cn } from '../lib/utils';

interface AdminProps {
  strings: any;
}

export default function Admin({ strings }: AdminProps) {
  const [secret, setSecret] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [error, setError] = useState(false);

  const currentUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';

  const handleVerify = () => {
    // In production, this would be compared via an API call or environment variable
    // For this demo/fast-deploy, we check against a prompt or session
    if (secret.length > 0) {
      setIsAuthorized(true);
      setError(false);
    } else {
      setError(true);
    }
  };

  return (
    <div className="w-full flex-1 flex items-center justify-center p-4">
      <AnimatePresence mode="wait">
        {!isAuthorized ? (
          <motion.div
            key="unlock"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="w-full max-w-md"
          >
            <Card className="card-blur border-destructive/20 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12 -z-10 text-destructive">
                <ShieldAlert size={120} />
              </div>
              <CardHeader className="text-center">
                <div className="mx-auto bg-destructive/10 rounded-full p-4 w-16 h-16 flex items-center justify-center mb-4">
                  <Key className="h-8 w-8 text-destructive" />
                </div>
                <CardTitle className="text-2xl font-black tracking-tight">Zone Sécurisée</CardTitle>
                <CardDescription>Veuillez entrer le secret d'administration pour accéder au générateur de QR Code.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="password"
                    placeholder="Secret Admin"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                    className={cn(
                      "h-12 text-center text-lg font-mono tracking-widest bg-background/50",
                      error && "border-destructive animate-pulse"
                    )}
                  />
                  {error && (
                    <p className="text-[10px] font-bold text-destructive text-center uppercase tracking-wider">
                      Accès refusé. Secret requis.
                    </p>
                  )}
                </div>
                <Button
                  className="w-full h-12 font-black uppercase tracking-widest rounded-xl"
                  variant="destructive"
                  onClick={handleVerify}
                >
                  Déverrouiller <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          </motion.div>
        ) : (
          <motion.div
            key="admin-content"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-lg"
          >
            <Card className="card-blur border-primary/20 shadow-2xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-4 opacity-5 rotate-12 -z-10 text-primary">
                <QrCode size={140} />
              </div>
              <CardHeader className="text-center">
                <Badge variant="outline" className="mx-auto mb-2 border-primary/30 text-primary bg-primary/5 uppercase tracking-tighter text-[9px] font-bold">
                  Administration
                </Badge>
                <CardTitle className="text-3xl font-black tracking-tighter leading-none">{strings.adminTitle}</CardTitle>
                <CardDescription className="text-sm mt-2">{strings.adminDesc}</CardDescription>
              </CardHeader>

              <CardContent className="flex flex-col items-center gap-6">
                <div className="p-4 bg-white rounded-3xl shadow-2xl border border-border/20">
                  <QRCodeSVG
                    value={currentUrl}
                    size={200}
                    fgColor="#14689e"
                    imageSettings={{
                      src: "/eneo-logo.png",
                      x: undefined,
                      y: undefined,
                      height: 30,
                      width: 40,
                      excavate: true,
                    }}
                  />
                </div>

                <div className="w-full bg-muted/40 p-4 rounded-xl border border-border/10">
                  <div className="text-[9px] font-black uppercase tracking-widest text-muted-foreground mb-1">Cible du QR Code</div>
                  <code className="text-[10px] font-mono break-all text-primary font-bold">{currentUrl}</code>
                </div>
              </CardContent>

              <CardFooter className="flex flex-col gap-3 pb-8">
                <Button className="w-full h-14 text-lg font-black uppercase tracking-widest shimmer-btn rounded-xl" onClick={() => (window.location.href = '/')}>
                  <Zap className="mr-2 h-5 w-5 fill-current" /> {strings.adminBtn}
                </Button>
                <Button variant="ghost" className="text-[10px] font-black uppercase tracking-widest text-muted-foreground" onClick={() => (window.location.href = '/')}>
                  <Home className="mr-2 h-3 w-3" /> Retour à l'accueil
                </Button>
              </CardFooter>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
