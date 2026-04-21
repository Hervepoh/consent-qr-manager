import { QRCodeSVG } from 'qrcode.react';
import { motion } from 'framer-motion';
import { QrCode } from 'lucide-react';

interface AdminProps {
  strings: any;
}

export default function Admin({ strings }: AdminProps) {
  const currentUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
  
  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="glass-card animate-in"
    >
      <div style={{ marginBottom: '2rem', display: 'inline-flex', padding: '1rem', background: 'rgba(100, 255, 218, 0.1)', borderRadius: '20px' }}>
        <QrCode size={48} color="#64ffda" />
      </div>
      <h1>{strings.adminTitle}</h1>
      <p>{strings.adminDesc}</p>
      
      <div className="qr-container">
        <QRCodeSVG 
          value={currentUrl} 
          size={240} 
          fgColor="#0c121c"
          imageSettings={{
            src: "https://vitejs.dev/logo.svg",
            x: undefined,
            y: undefined,
            height: 40,
            width: 40,
            excavate: true,
          }}
        />
      </div>
      
      <div style={{ marginTop: '1rem', fontSize: '0.8rem', opacity: 0.6 }}>
        URL: {currentUrl}
      </div>

      <button className="btn" onClick={() => (window.location.href = '/')}>
        {strings.adminBtn}
      </button>
    </motion.div>
  );
}
