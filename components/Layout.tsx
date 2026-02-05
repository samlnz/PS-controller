
import React from 'react';
import { NavLink } from 'react-router-dom';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen flex flex-col bg-black">
      <header className="bg-zinc-950 border-b border-amber-900/50 shadow-2xl sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-gradient-to-br from-amber-400 to-amber-600 text-black p-2 rounded-lg font-black text-xl shadow-lg shadow-amber-500/20">
              FP
            </div>
            <div>
              <h1 className="font-black text-amber-500 text-lg tracking-widest hidden sm:block uppercase">FIFA PRO</h1>
              <p className="text-[10px] text-amber-600 font-bold uppercase tracking-[0.2em] -mt-1 hidden sm:block">Management Suite</p>
            </div>
          </div>
          
          <nav className="flex gap-2">
            <NavLink 
              to="/" 
              className={({ isActive }) => 
                `px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                  isActive 
                  ? 'bg-amber-500 text-black border-amber-400' 
                  : 'text-amber-500 border-amber-900/50 hover:border-amber-500 hover:bg-amber-500/5'
                }`
              }
            >
              Counter
            </NavLink>
            <NavLink 
              to="/admin" 
              className={({ isActive }) => 
                `px-5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all border ${
                  isActive 
                  ? 'bg-amber-500 text-black border-amber-400' 
                  : 'text-amber-500 border-amber-900/50 hover:border-amber-500 hover:bg-amber-500/5'
                }`
              }
            >
              Owner
            </NavLink>
          </nav>
        </div>
      </header>
      
      <main className="flex-grow container mx-auto px-4 py-8">
        {children}
      </main>
      
      <footer className="bg-zinc-950 border-t border-amber-900/30 py-6 text-center text-amber-900 text-[10px] font-bold uppercase tracking-widest">
        &copy; {new Date().getFullYear()} FIFA Pro Premium Game Zone • Addis Ababa
      </footer>
    </div>
  );
};

export default Layout;
