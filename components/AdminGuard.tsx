
import React, { useState, useEffect } from 'react';

interface AdminGuardProps {
  children: React.ReactNode;
}

const AdminGuard: React.FC<AdminGuardProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [password, setPassword] = useState('');
  const [error, setError] = useState(false);

  // Read password from environment variable. 
  // Note: For Vite/Static sites, this is usually baked in at build time.
  const MASTER_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';

  useEffect(() => {
    const authStatus = sessionStorage.getItem('fifa_admin_auth');
    if (authStatus === 'true') {
      setIsAuthenticated(true);
    }
  }, []);

  const handleUnlock = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (password === MASTER_PASSWORD) {
      setIsAuthenticated(true);
      sessionStorage.setItem('fifa_admin_auth', 'true');
      setError(false);
    } else {
      setError(true);
      setPassword('');
    }
  };

  if (isAuthenticated) {
    return <>{children}</>;
  }

  return (
    <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center p-4 animate-in fade-in zoom-in duration-300">
      <div className="w-full max-w-md bg-zinc-950 border border-amber-900/40 rounded-[2.5rem] p-10 shadow-2xl shadow-amber-500/5 relative overflow-hidden">
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 blur-[100px] rounded-full"></div>
        
        <div className="relative z-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 bg-gradient-to-br from-amber-400 to-amber-600 rounded-3xl flex items-center justify-center shadow-lg shadow-amber-500/20 mb-8 transform rotate-3">
            <svg className="w-10 h-10 text-black" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>

          <h2 className="text-3xl font-black text-amber-500 uppercase tracking-tighter mb-2">Owner Access</h2>
          <p className="text-amber-700 text-[10px] font-bold uppercase tracking-[0.3em] mb-10">Verification Required</p>

          <form onSubmit={handleUnlock} className="w-full space-y-4">
            <div className="relative group">
              <input
                type="password"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setError(false);
                }}
                placeholder="Enter Passcode"
                autoFocus
                className={`w-full bg-zinc-900 border ${error ? 'border-red-500 animate-pulse' : 'border-amber-900/30 group-hover:border-amber-500/50'} rounded-2xl px-6 py-4 text-center text-amber-500 font-black tracking-[0.5em] placeholder:tracking-normal placeholder:text-amber-900/30 focus:outline-none focus:border-amber-500 focus:ring-4 focus:ring-amber-500/10 transition-all`}
              />
              {error && (
                <p className="absolute -bottom-6 left-0 right-0 text-red-500 text-[9px] font-black uppercase tracking-widest">Invalid credentials. Access Denied.</p>
              )}
            </div>

            <button
              type="submit"
              className="w-full mt-4 bg-amber-500 hover:bg-amber-400 text-black font-black py-4 rounded-2xl uppercase tracking-widest shadow-lg shadow-amber-500/20 active:scale-[0.98] transition-all"
            >
              Authorize Entry
            </button>
          </form>

          <p className="mt-8 text-amber-900 text-[8px] font-black uppercase tracking-[0.2em]">
            FIFA PRO MANAGEMENT SUITE • CLOUD SECURE
          </p>
        </div>
      </div>
    </div>
  );
};

export default AdminGuard;
