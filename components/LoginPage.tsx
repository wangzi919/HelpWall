import React, { useState, useEffect } from 'react';
import { APP_NAME, LOGIN_SCREEN_NOTES } from '../constants';
import StickyNote from './StickyNote';
import { MessageCircle, Check, ArrowRight } from 'lucide-react';
import { supabase, loginWithLine } from '../services/supabaseClient';

interface LoginPageProps {
  onLoginSuccess: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  // Auth State
  const [isEmailMode, setIsEmailMode] = useState(false);
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authMessage, setAuthMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // We keep the tear state to trigger re-renders if needed, 
  // though individual notes handle their own state.
  const [tornCount, setTornCount] = useState(0);

  const handleNoteTear = () => {
    setTornCount((prev) => prev + 1);
  };
  
  const allTorn = tornCount >= LOGIN_SCREEN_NOTES.length;

  const LINE_CHANNEL_ID = import.meta.env.VITE_LINE_CHANNEL_ID;
  // Use window.location.origin to redirect back to the current page (e.g. localhost:3000 or production domain)
  // Ensure this exact URL is added to your LINE Developers Console Callback URL list
  const REDIRECT_URI = window.location.origin;

  // --- 0. Handle LINE Login Callback (Authorization Code Flow) ---
  useEffect(() => {
    const handleLineCallback = async () => {
        // LINE returns 'code' in the query parameters (e.g., ?code=...&state=...)
        const searchParams = new URLSearchParams(window.location.search);
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        // Only process if we have a code or error
        if (!code && !error) return;

        // Check Auth Mode (Login vs Bind)
        const authMode = localStorage.getItem('auth_mode');

        if (error) {
            setAuthMessage(`LINE Login Error: ${errorDescription || error}`);
            // Clean URL
            window.history.replaceState(null, '', window.location.pathname);
            localStorage.removeItem('auth_mode'); // Cleanup
            return;
        }

        if (code) {
            setLoading(true);
            setAuthMessage(authMode === 'bind' ? 'Binding LINE account...' : 'Verifying LINE Login...');
            
            try {
                if (authMode === 'bind') {
                    // --- BINDING FLOW ---
                    await loginWithLine({ code: code, isBinding: true });
                    alert("綁定成功！");
                    localStorage.removeItem('auth_mode');
                    // Clean URL
                    window.history.replaceState(null, '', window.location.pathname);
                    // Return to App (Dashboard/Profile)
                    onLoginSuccess();
                } else {
                    // --- LOGIN FLOW (WEB) ---
                    // Pass the code to our helper function
                    await loginWithLine({ code: code, isBinding: false });
                    // Note: loginWithLine might redirect the page if it gets an action_link,
                    // so this success message might be transient.
                    setAuthMessage('Success! Redirecting...');
                    onLoginSuccess();
                }
            } catch (err: any) {
                setAuthMessage(`Operation Failed: ${err.message}`);
                localStorage.removeItem('auth_mode');
                window.history.replaceState(null, '', window.location.pathname);
                setLoading(false);
            }
        }
    };

    handleLineCallback();
  }, [onLoginSuccess]);

  // 1. LINE Login Action
  const handleLineLogin = () => {
    setLoading(true);
    setAuthMessage('Redirecting to LINE...');

    // Default to 'login' mode if not specified elsewhere
    localStorage.removeItem('auth_mode');

    // LIFF Environment Check
    if (window.liff && window.liff.isInClient()) {
        // If in LIFF browser, use LIFF login directly
        if (!window.liff.isLoggedIn()) {
            window.liff.login();
        } else {
            // Already logged in (should be caught by App.tsx auto-login, but just in case)
            const idToken = window.liff.getIDToken();
            if (idToken) {
                loginWithLine({ idToken: idToken, isBinding: false })
                    .catch(err => {
                        setAuthMessage(`LIFF Login Failed: ${err.message}`);
                        setLoading(false);
                    });
            }
        }
        return;
    }

    if (!LINE_CHANNEL_ID) {
        setAuthMessage('Configuration Error: LINE Channel ID missing.');
        setLoading(false);
        return;
    }

    // Web Browser Flow (Standard OAuth)
    const state = btoa(String(Math.random()));
    const nonce = btoa(String(Math.random()));
    
    // Save state to sessionStorage
    sessionStorage.setItem('line_auth_state', state);

    const lineAuthUrl =
        `https://access.line.me/oauth2/v2.1/authorize` +
        `?response_type=code` + // Changed to 'code' for Authorization Code Flow
        `&client_id=${LINE_CHANNEL_ID}` +
        `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
        `&scope=openid%20profile%20email` +
        `&state=${state}` + 
        `&nonce=${nonce}`;

    window.location.href = lineAuthUrl;
  };

  // 2. Handle Email Submit
  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setAuthMessage(isRegisterMode ? 'Creating account...' : 'Signing in...');

    try {
        let response;
        if (isRegisterMode) {
            response = await supabase.auth.signUp({ email, password });
        } else {
            response = await supabase.auth.signInWithPassword({ email, password });
        }

        const { data, error } = response;

        if (error) {
            setAuthMessage(error.message);
        } else if (data && data.user) {
            setAuthMessage('Success! Redirecting...');
            onLoginSuccess(); 
        } else {
            if (!error) {
                setAuthMessage(isRegisterMode
                    ? 'Account created. Please verify your email.'
                    : 'Please check your credentials.');
            }
        }
    } catch (err: any) {
        setAuthMessage('An unexpected error occurred.');
        console.error(err);
    } finally {
        setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-background-light text-slate-800 font-sans flex flex-col">
      
      {/* Header - Logo only */}
      <div className="w-full px-6 py-6 md:px-12 flex items-center z-20">
        {/* Using direct path relative to index.html */}
        <img src="../img/logo.png" alt={APP_NAME} className="h-24 w-auto object-contain" />
      </div>

      <main className="flex-1 w-full max-w-[1440px] mx-auto px-6 md:px-12 grid lg:grid-cols-2 gap-12 lg:gap-24 items-center pb-12">
        
        {/* LEFT COLUMN: Content & Form */}
        <div className="flex flex-col justify-center max-w-xl mx-auto lg:mx-0 order-2 lg:order-1 animate-in fade-in slide-in-from-bottom-8 duration-700">
            
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight mb-6 text-slate-900">
                Help is just <br/>
                <span className="text-brand-green relative inline-block">
                    around the corner.
                    <svg className="absolute w-full h-3 -bottom-1 left-0 text-yellow-300 -z-10 opacity-60" viewBox="0 0 100 10" preserveAspectRatio="none">
                        <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" />
                    </svg>
                </span>
            </h1>

            <p className="text-lg md:text-xl text-slate-500 mb-8 leading-relaxed font-jakarta">
                Join {APP_NAME}, the community marketplace for kindness. 
                Post a request, offer a hand, and earn time credits.
            </p>

            {/* Feature Pills */}
            <div className="flex flex-wrap gap-3 mb-10">
                {['Trusted Community', 'Time Credits', 'Instant Help'].map((tag) => (
                    <div key={tag} className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 text-slate-600 text-sm font-semibold">
                        <Check className="w-4 h-4 text-brand-green" />
                        {tag}
                    </div>
                ))}
            </div>

            {/* Auth Section */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 md:p-8 shadow-soft relative overflow-hidden">
                {/* Decorative blob */}
                <div className="absolute -top-10 -right-10 w-32 h-32 bg-yellow-100 rounded-full blur-3xl opacity-50 pointer-events-none"></div>

                {!isEmailMode ? (
                    <div className="flex flex-col gap-4">
                        <button
                            onClick={handleLineLogin}
                            disabled={loading}
                            className="w-full bg-[#06C755] hover:bg-[#05b54c] disabled:opacity-70 text-white text-lg font-bold py-3.5 rounded-xl shadow-sm transition-all flex items-center justify-center gap-3"
                        >
                            {loading && authMessage.includes('LINE') ? (
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                            ) : (
                                <img 
                                    src="https://upload.wikimedia.org/wikipedia/commons/2/2e/LINE_New_App_Icon_%282020-12%29.png" 
                                    alt="LINE Icon" 
                                    className="w-9 h-9"
                                />
                            )}
                            Continue with LINE
                        </button>
                        
                        <div className="relative flex py-2 items-center">
                            <div className="flex-grow border-t border-slate-200"></div>
                            <span className="flex-shrink-0 mx-4 text-slate-400 text-sm">Or</span>
                            <div className="flex-grow border-t border-slate-200"></div>
                        </div>

                        <button
                            onClick={() => setIsEmailMode(true)}
                            className="w-full bg-white hover:bg-slate-50 text-slate-700 font-bold py-3.5 rounded-xl border border-slate-200 transition-all flex items-center justify-center gap-2"
                        >
                            Continue with Email
                        </button>
                    </div>
                ) : (
                    <form onSubmit={handleEmailAuth} className="flex flex-col gap-4">
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Email</label>
                                <input 
                                    type="email" 
                                    required 
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-slate-800 focus:bg-white focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all outline-none"
                                    placeholder="name@example.com"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">Password</label>
                                <input 
                                    type="password" 
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="w-full rounded-xl bg-slate-50 border border-slate-200 px-4 py-3 text-slate-800 focus:bg-white focus:ring-2 focus:ring-brand-green/20 focus:border-brand-green transition-all outline-none"
                                    placeholder="••••••••"
                                />
                            </div>
                        </div>

                        {authMessage && (
                             <p className={`text-sm font-medium ${authMessage.includes('Success') || authMessage.includes('created') ? 'text-green-600' : 'text-red-500'}`}>
                                {authMessage}
                             </p>
                        )}
                        
                        <button 
                            type="submit" 
                            disabled={loading}
                            className="w-full bg-slate-900 hover:bg-slate-800 text-white text-lg font-bold py-3.5 rounded-xl shadow-lg shadow-slate-200 transition-all flex items-center justify-center gap-2 mt-2"
                        >
                            {loading ? 'Processing...' : (isRegisterMode ? 'Create Account' : 'Sign In')}
                            {!loading && <ArrowRight className="w-5 h-5" />}
                        </button>

                        <div className="flex justify-between items-center mt-2 text-sm">
                            <button type="button" onClick={() => setIsEmailMode(false)} className="text-slate-400 hover:text-slate-600">
                                Back
                            </button>
                            <button type="button" onClick={() => { setIsRegisterMode(!isRegisterMode); setAuthMessage(''); }} className="text-brand-green font-bold hover:underline">
                                {isRegisterMode ? 'Already have an account?' : 'Need an account?'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
            
            <p className="mt-6 text-xs text-slate-400 text-center lg:text-left max-w-sm">
                By continuing, you agree to our Terms of Service and Privacy Policy. We are a community-first platform.
            </p>
        </div>

        {/* RIGHT COLUMN: Interactive Wall */}
        <div className="relative order-1 lg:order-2 h-[500px] lg:h-[700px] w-full">
            {/* The Wall Container - Wood/Cork Design */}
            <div className="absolute inset-0 bg-[#dcb386] rounded-[2rem] border-[12px] border-[#8B5A2B] shadow-2xl overflow-hidden box-border">
                
                {/* Cork Texture using CSS pattern */}
                <div className="absolute inset-0 opacity-40 pointer-events-none" 
                     style={{ 
                        backgroundImage: `radial-gradient(#8B4513 1px, transparent 1px), radial-gradient(#8B4513 1px, transparent 1px)`,
                        backgroundSize: '20px 20px',
                        backgroundPosition: '0 0, 10px 10px',
                        backgroundColor: '#d2a679'
                     }}>
                </div>

                {/* Inner Shadow for depth */}
                <div className="absolute inset-0 shadow-[inset_0_0_80px_rgba(0,0,0,0.3)] pointer-events-none rounded-[1.5rem] z-10"></div>
                
                {/* The Sticky Notes */}
                <div className="relative w-full h-full z-20">
                     {/* Hidden Reward Message */}
                     <div className={`absolute inset-0 flex flex-col items-center justify-center pointer-events-none transition-all duration-1000 ${allTorn ? 'opacity-100 z-10' : 'opacity-0 -z-10'}`}>
                        <div className="text-center transform -rotate-2 select-none drop-shadow-md">
                            <span className="material-symbols-outlined text-6xl text-red-500 mb-4 animate-bounce">favorite</span>
                            <h2 className="text-4xl md:text-5xl font-black text-[#5D4037] font-handwritten mb-2 whitespace-pre-line">
                                助人為快樂之本
                            </h2>
                            <p className="text-2xl md:text-3xl font-bold text-[#8B5A2B] font-handwritten whitespace-pre-line">
                                Helping others brings joy
                            </p>
                        </div>
                     </div>

                     {LOGIN_SCREEN_NOTES.map((note) => (
                        <StickyNote 
                            key={note.id} 
                            data={note} 
                            onTear={handleNoteTear}
                        />
                    ))}
                </div>

                {/* Overlay Hint */}
                <div className={`absolute bottom-6 left-0 right-0 text-center pointer-events-none transition-opacity duration-500 z-30 ${allTorn ? 'opacity-0' : 'opacity-100'}`}>
                    <p className="inline-block bg-black/60 backdrop-blur-md px-4 py-2 rounded-full text-white/90 text-sm font-medium shadow-lg animate-pulse border border-white/20">
                        👆 Tip: Click the notes to complete them!
                    </p>
                </div>
            </div>

            {/* Decor behind the wall (Shadow) */}
            <div className="absolute -z-10 bottom-[-20px] left-[5%] w-[90%] h-[40px] bg-black/20 blur-xl rounded-full"></div>
        </div>

      </main>
    </div>
  );
};

export default LoginPage;