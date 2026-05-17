"use client";

import Link from "next/link";
import { useState, useEffect, useRef } from "react";
import { db, auth } from "../lib/firebase"; 
// PERBAIKAN 1: Menambahkan addDoc ke dalam import
import { collection, query, limit, onSnapshot, doc, setDoc, addDoc, CollectionReference, DocumentData } from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from "firebase/auth";

const ADMIN_EMAIL = "admin@optikaaliyah.com"; 

// --- DUMMY DATA GAMBAR KACAMATA UNTUK PILIHAN AI ---
// --- DATA 10 TIPE KACAMATA UNTUK AI TRY-ON ---
// Menggunakan API Iconify agar gambar tidak diblokir/berubah jadi aneh
const GLASSES_MODELS = [
  { 
    index: 0, 
    name: "Classic Square", 
    image: "https://api.iconify.design/mdi:glasses.svg?color=%2318181b" 
  },
  { 
    index: 1, 
    name: "Round Vintage", 
    image: "https://api.iconify.design/ph:glasses.svg?color=%2318181b" 
  }, 
  { 
    index: 2, 
    name: "Aviator Pilot", 
    image: "https://api.iconify.design/ph:sunglasses.svg?color=%2318181b" 
  },
  { 
    index: 3, 
    name: "Cat Eye Elegant", 
    image: "https://api.iconify.design/icon-park-outline:glasses-one.svg?color=%2318181b" 
  },
  { 
    index: 4, 
    name: "Oval Minimalist", 
    image: "https://api.iconify.design/tabler:glasses.svg?color=%2318181b" 
  },
  { 
    index: 5, 
    name: "Wayfarer Bold", 
    image: "https://api.iconify.design/mdi:sunglasses.svg?color=%2318181b" 
  },
  { 
    index: 6, 
    name: "Rectangle Slim", 
    image: "https://api.iconify.design/lucide:glasses.svg?color=%2318181b" 
  },
  { 
    index: 7, 
    name: "Browline / Clubmaster", 
    image: "https://api.iconify.design/ri:glasses-line.svg?color=%2318181b" 
  },
  { 
    index: 8, 
    name: "Geometric Hexagon", 
    image: "https://api.iconify.design/mingcute:glasses-line.svg?color=%2318181b" 
  },
  { 
    index: 9, 
    name: "Oversized Butterfly", 
    image: "https://api.iconify.design/ep:glasses.svg?color=%2318181b" 
  }
];


export default function LandingPage() {
  const [featuredProducts, setFeaturedProducts] = useState<any[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [heroImage, setHeroImage] = useState("https://i.ibb.co/30Z3D2c/sunglasses-png-transparent-picture-11535787682sz9qngolow.png");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [toastMsg, setToastMsg] = useState("");
  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  // ==========================================
  // STATE & REF UNTUK VIRTUAL TRY-ON (KAMERA AI)
  // ==========================================
  const [isTryOnOpen, setIsTryOnOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [tryOnResult, setTryOnResult] = useState<string | null>(null);
  const [detectedShapes, setDetectedShapes] = useState<string[]>([]);
  const [glassesIndex, setGlassesIndex] = useState(0);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);

  // Fungsi Buka Kamera
  const openCamera = async () => {
    setIsTryOnOpen(true);
    setTryOnResult(null);
    setDetectedShapes([]);
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true });
      setStream(mediaStream);
      // Tunggu DOM render modal, lalu pasang stream ke video
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (err) {
      showToast("GAGAL MENGAKSES KAMERA");
      console.error(err);
    }
  };

  // Fungsi Tutup Kamera
  const closeCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setIsTryOnOpen(false);
  };

// Fungsi Ambil Foto & Kirim ke API AI Python
  const captureAndProcess = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setIsProcessing(true);
    const video = videoRef.current;
    const canvas = canvasRef.current;
    
    // Samakan ukuran canvas dengan video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      // Ubah gambar di canvas jadi file
      canvas.toBlob(async (blob) => {
        if (!blob) {
          setIsProcessing(false);
          return;
        }

        const formData = new FormData();
        formData.append("file", blob, "capture.jpg");

        try {
          // PERBAIKAN 2: Menggunakan Environment Variable untuk URL Hugging Face
          // Pastikan kamu tidak menaruh tanda slash (/) di akhir URL di Vercel env kamu
const response = await fetch(`${process.env.NEXT_PUBLIC_HF_API_URL}/predict?glasses_index=${glassesIndex}`, {
  method: 'POST',
  body: formData,
});

          if (!response.ok) {
            const errData = await response.json();
            throw new Error(errData.detail || "Gagal memproses gambar");
          }

          const data = await response.json();
          // Set hasil gambar base64 dari AI
          setTryOnResult(`data:image/png;base64,${data.image}`);
          // Set hasil deteksi bentuk wajah
          setDetectedShapes(data.faces.map((f: any) => f.shape));
          
          // ==========================================
          // BAGIAN YANG DIPERBAIKI: SIMPAN KE "analyses"
          // ==========================================
          if (user) {
            try {
              await addDoc(collection(db, "analyses"), {
                userEmail: user.email,
                faceShape: data.faces.map((f: any) => f.shape).join(", "),
                recommendedModel: GLASSES_MODELS[glassesIndex].name,
                createdAt: new Date().toISOString(),
                purchasedItem: "" // Kosong, nanti diisi kalau dia klik pesan WA
              });
              console.log("Mantap! Data berhasil masuk ke tabel Admin!");
            } catch (dbErr) {
              console.error("Gagal menyimpan data bentuk wajah:", dbErr);
            }
          } else {
            console.log("User belum login, data tidak masuk ke history.");
          }
          // ==========================================

        } catch (error: any) {
          showToast(error.message.toUpperCase());
        } finally {
          setIsProcessing(false);
        }
      }, 'image/jpeg');
    }
  };
  // ==========================================

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAdmin(currentUser?.email === ADMIN_EMAIL);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "kacamata"), limit(3));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setFeaturedProducts(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(doc(db, "pengaturan", "beranda"), (docSnap) => {
      if (docSnap.exists() && docSnap.data().url_foto_utama) {
        setHeroImage(docSnap.data().url_foto_utama);
      }
    });
    return () => unsubscribe();
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      if (isLoginMode) {
        await signInWithEmailAndPassword(auth, email, password);
        showToast("BERHASIL MASUK KE AKUN");
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        showToast("AKUN BERHASIL DIBUAT");
      }
      setShowAuthModal(false);
      setEmail(""); setPassword("");
      setIsMobileMenuOpen(false);
    } catch (error: any) {
      showToast("GAGAL: " + error.message);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    showToast("BERHASIL KELUAR");
    setIsMobileMenuOpen(false);
  };

  return (
    <main className="min-h-screen bg-[#FAFAFA] font-sans text-zinc-900 flex flex-col selection:bg-zinc-900 selection:text-white relative">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-up { animation: fadeUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
        .delay-300 { animation-delay: 300ms; }
      `}} />

      {toastMsg && (
        <div className="fixed bottom-8 right-8 z-[100] bg-zinc-900 text-white px-6 py-4 shadow-2xl flex items-center gap-4 animate-fade-up">
          <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse"></div>
          <p className="text-xs font-bold tracking-widest uppercase">{toastMsg}</p>
        </div>
      )}

{/* NAVBAR */}
      <nav className="w-full bg-white border-b border-zinc-200 sticky top-0 z-50 animate-fade-up">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <Link href="/" className="font-black text-2xl tracking-tighter text-zinc-900 uppercase">Optik Aaliyah.</Link>
          
          {/* MENU DESKTOP */}
          <div className="hidden md:flex items-center gap-10">
            <Link href="/" className="text-sm font-semibold tracking-wide text-zinc-500 hover:text-zinc-900 transition-colors uppercase">Beranda</Link>
            <Link href="/koleksi" className="text-sm font-semibold tracking-wide text-zinc-500 hover:text-zinc-900 transition-colors uppercase">Katalog</Link>
            
            {/* INI MENU KHUSUS ADMIN */}
            {isAdmin && (
              <Link href="/admin" className="text-sm font-black tracking-wide text-red-600 hover:text-red-800 transition-colors uppercase">Admin Panel</Link>
            )}

            {user ? (
              <div className="flex items-center gap-6">
                <span className="text-sm font-medium text-zinc-500">{isAdmin ? <span className="font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded-sm">ADMIN</span> : user.email}</span>
                <button onClick={handleLogout} className="text-sm font-bold text-zinc-500 hover:text-red-600 transition-colors uppercase">Keluar</button>
              </div>
            ) : (
              <button onClick={() => setShowAuthModal(true)} className="text-sm bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 rounded-none font-semibold uppercase tracking-wide transition-colors">Masuk / Daftar</button>
            )}
          </div>
          
          {/* TOMBOL HAMBURGER HP */}
          <button className="md:hidden text-zinc-900 p-2" onClick={() => setIsMobileMenuOpen(true)}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
      </nav>

      {/* SIDEBAR HP */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className="relative w-72 h-full bg-white shadow-2xl flex flex-col p-8">
            <button className="self-end text-zinc-400 hover:text-zinc-900 mb-8" onClick={() => setIsMobileMenuOpen(false)}>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex flex-col gap-8 text-xl font-bold tracking-tight">
              <Link href="/" className="text-zinc-900 hover:text-zinc-500" onClick={() => setIsMobileMenuOpen(false)}>BERANDA</Link>
              <Link href="/koleksi" className="text-zinc-900 hover:text-zinc-500" onClick={() => setIsMobileMenuOpen(false)}>KATALOG</Link>
              
              {/* INI MENU KHUSUS ADMIN DI HP */}
              {isAdmin && (
                <Link href="/admin" className="text-red-600 hover:text-red-800" onClick={() => setIsMobileMenuOpen(false)}>ADMIN PANEL</Link>
              )}

              <div className="border-t border-zinc-200 pt-8 mt-4">
                {user ? (
                  <div className="flex flex-col gap-6">
                    <span className="text-sm font-medium text-zinc-500 block break-words">Akun:<br/><span className="font-bold text-zinc-900 text-base">{isAdmin ? "Administrator" : user.email}</span></span>
                    <button onClick={handleLogout} className="border border-zinc-200 text-zinc-900 py-4 font-bold hover:bg-zinc-50 transition-colors uppercase text-sm">Keluar</button>
                  </div>
                ) : (
                  <button onClick={() => { setShowAuthModal(true); setIsMobileMenuOpen(false); }} className="bg-zinc-900 text-white py-4 font-bold hover:bg-zinc-800 transition-colors uppercase text-sm w-full">Masuk / Daftar</button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KONTEN UTAMA */}
      <div className="flex-grow">
        
        {/* HERO SECTION */}
        <div className="max-w-7xl mx-auto px-6 pt-24 pb-16 animate-fade-up delay-100">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 items-center">
            <div className="order-2 lg:order-1 flex justify-center lg:justify-start bg-zinc-100 p-10 lg:p-20 relative group">
              <img src={heroImage} alt="Koleksi Kacamata" className="w-full max-w-lg object-contain relative z-10 transition-transform duration-700 group-hover:scale-105" style={{ mixBlendMode: 'darken' }} />
            </div>
            <div className="order-1 lg:order-2 text-center lg:text-left">
              <h1 className="text-5xl lg:text-7xl font-black tracking-tighter text-zinc-900 mb-8 leading-[1.1]">
                VISI BARU.<br />GAYA ABADI.
              </h1>
              <p className="text-lg lg:text-xl text-zinc-1000 mb-10 leading-relaxed font-light max-w-xl mx-auto lg:mx-0 ">
                Koleksi eyewear premium yang dirancang untuk mendefinisikan ulang proporsi wajah dan menyempurnakan karakter personalmu.
              </p>
              <Link href="/koleksi" className="inline-block bg-zinc-900 text-white font-bold text-sm tracking-widest py-4 px-10 uppercase hover:bg-zinc-800 transition-colors">
                Lihat Koleksi
              </Link>
            </div>
          </div>
        </div>

        {/* KATALOG SECTION */}
        <div className="max-w-7xl mx-auto px-6 py-24 animate-fade-up delay-200">
          <div className="mb-12 flex flex-col md:flex-row md:items-end justify-between border-b border-zinc-200 pb-6 gap-4">
            <div>
              <h2 className="text-3xl font-black tracking-tight text-zinc-1000 uppercase">Koleksi Terkini</h2>
              <p className="text-zinc-1500 mt-2 font-medium">Kurasi bingkai pilihan bulan ini.</p>
            </div>
            <Link href="/koleksi" className="text-sm font-bold text-zinc-1000 hover:text-zinc-1000 uppercase tracking-wide border-b border-zinc-900 pb-1 inline-block w-max">
              Lihat Semua
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-12">
            {featuredProducts.map((item) => (
              <div key={item.id} className="group cursor-pointer">
                <div className="bg-zinc-100 aspect-[4/3] overflow-hidden mb-6 relative">
                  <img src={item.gambar} alt={item.nama} className="w-full h-full object-cover mix-blend-darken transition-transform duration-700 group-hover:scale-105" />
                </div>
                <div className="flex flex-col items-start mb-3">
                  <h3 className="text-lg font-bold text-zinc-900 tracking-tight uppercase leading-tight mb-1">{item.nama}</h3>
                  <p className="font-bold text-zinc-500 tracking-wider">Rp {item.harga.toLocaleString('id-ID')}</p>
                </div>
                <p className="text-zinc-500 text-sm line-clamp-2 leading-relaxed font-medium">{item.deskripsi}</p>
              </div>
            ))}
          </div>
        </div>

        {/* FITUR VIRTUAL TRY-ON & PANDUAN WAJAH */}
        <div className="bg-white py-32 border-t border-zinc-200 overflow-hidden animate-fade-up delay-300">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
              <div className="order-2 lg:order-1">
                <div className="flex items-center gap-3 mb-6">
                  <span className="h-[1px] w-12 bg-zinc-900"></span>
                  <span className="text-xs font-bold uppercase tracking-widest text-zinc-900">Inovasi Optik Aaliyah</span>
                </div>
                <h2 className="text-4xl lg:text-5xl font-black tracking-tight text-zinc-900 uppercase mb-8 leading-[1.1]">
                  Temukan Frame <br/> Sempurnamu.
                </h2>
                <p className="text-lg text-zinc-1000 mb-12 leading-relaxed font-medium max-w-md">
                  Setiap wajah adalah kanvas unik. Kenali struktur wajahmu dan biarkan teknologi AI kami mencocokkan bingkai yang paling presisi untukmu layaknya filter pintar.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8 mb-12">
                  <div className="border-l-2 border-zinc-900 pl-4 hover:border-zinc-500 transition-colors">
                    <h4 className="font-bold text-zinc-900 uppercase tracking-widest text-xs mb-2">Wajah Bulat</h4>
                    <p className="text-sm text-zinc-500 font-medium">Pilih frame bersudut tegas (Square) untuk ilusi tirus.</p>
                  </div>
                  <div className="border-l-2 border-zinc-200 pl-4 hover:border-zinc-900 transition-colors">
                    <h4 className="font-bold text-zinc-900 uppercase tracking-widest text-xs mb-2">Wajah Persegi</h4>
                    <p className="text-sm text-zinc-500 font-medium">Gunakan frame membulat (Round/Oval) untuk melembutkan rahang.</p>
                  </div>
                  <div className="border-l-2 border-zinc-200 pl-4 hover:border-zinc-900 transition-colors">
                    <h4 className="font-bold text-zinc-900 uppercase tracking-widest text-xs mb-2">Wajah Oval</h4>
                    <p className="text-sm text-zinc-500 font-medium">Bebas bereksplorasi. Hampir semua siluet cocok untukmu.</p>
                  </div>
                  <div className="border-l-2 border-zinc-200 pl-4 hover:border-zinc-900 transition-colors">
                    <h4 className="font-bold text-zinc-900 uppercase tracking-widest text-xs mb-2">Wajah Hati</h4>
                    <p className="text-sm text-zinc-500 font-medium">Pilih frame melebar di bawah (Aviator/Wayfarer).</p>
                  </div>
                </div>

                <button onClick={openCamera} className="group flex items-center justify-center sm:justify-start gap-4 bg-zinc-900 text-white font-bold py-4 px-8 uppercase tracking-widest text-xs hover:bg-zinc-800 transition-all w-full sm:w-auto shadow-lg shadow-zinc-900/20 hover:shadow-zinc-900/40">
                  <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.8)]"></span>
                  Coba Filter Kamera AI
                  <svg className="w-4 h-4 group-hover:translate-x-2 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" /></svg>
                </button>
              </div>
              
              <div className="order-1 lg:order-2 bg-zinc-100 p-8 flex items-center justify-center aspect-square relative overflow-hidden group">
                <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1577803645773-f96470509666?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center mix-blend-luminosity opacity-40 grayscale transition-all duration-1000 group-hover:opacity-80 group-hover:grayscale-0 group-hover:scale-105"></div>
                <div className="relative z-10 border border-zinc-900/10 bg-white/90 backdrop-blur-md p-8 text-center max-w-xs shadow-2xl transform transition-transform duration-500 group-hover:-translate-y-2">
                  <svg className="w-10 h-10 mx-auto text-zinc-900 mb-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                  <h3 className="font-bold text-zinc-900 uppercase tracking-widest text-sm mb-3">Pemindai Wajah AR</h3>
                  <p className="text-xs text-zinc-500 font-medium leading-relaxed">
                    Terintegrasi langsung dengan Engine <span className="text-zinc-900 font-bold">TensorFlow AI</span> untuk deteksi 5 bentuk wajah secara akurat.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* MANIFESTO */}
        <div className="bg-white text-zinc-900 py-32 border-t border-zinc-200 overflow-hidden">
          <div className="max-w-7xl mx-auto px-6">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16 lg:gap-24 items-start">
              <div className="lg:col-span-5">
                <h2 className="text-5xl lg:text-7xl font-black tracking-tighter uppercase leading-[0.9]">
                  Optik <br /> Aaliyah <br /> <span className="text-zinc-400">Manifesto.</span>
                </h2>
              </div>
              <div className="lg:col-span-7">
                <p className="text-xl lg:text-2xl font-light leading-relaxed mb-12 text-zinc-1000">
                  Lahir di Sidoarjo dengan semangat untuk mengubah cara dunia melihat Anda. Kami percaya bahwa kacamata bukan sekadar alat bantu penglihatan, melainkan pernyataan gaya yang mendalam.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                  <div className="border-t border-zinc-200 pt-8">
                    <h4 className="text-xs font-bold uppercase tracking-[0.3em] mb-4 text-zinc-900">Visi Kami</h4>
                    <p className="text-sm text-zinc-1000 leading-relaxed">Menjadi standar baru dalam kurasi eyewear yang menggabungkan kualitas material superior dengan desain yang tak lekang oleh waktu.</p>
                  </div>
                  <div className="border-t border-zinc-200 pt-8">
                    <h4 className="text-xs font-bold uppercase tracking-[0.3em] mb-4 text-zinc-900">Filosofi</h4>
                    <p className="text-sm text-zinc-1000 leading-relaxed">Setiap frame yang kami hadirkan dipilih dengan presisi tinggi, memastikan keseimbangan antara kenyamanan maksimal dan estetika.</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* FOOTER MAPS */}
      <footer className="bg-zinc-900 border-t border-zinc-900 pt-20 pb-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-12 gap-12 lg:gap-16 mb-16">
            <div className="md:col-span-7 flex flex-col justify-between">
              <div>
                <h3 className="font-black text-2xl tracking-tighter text-white uppercase mb-6">Optik Aaliyah.</h3>
                <p className="text-zinc-400 leading-relaxed text-sm font-medium pr-8 mb-8 max-w-md">
                  Mendefinisikan ulang gaya kacamata dengan kurasi frame premium berkualitas tinggi.
                </p>
              </div>
              <div className="flex gap-16">
                <div>
                  <h4 className="font-bold text-white uppercase tracking-widest text-xs mb-6">Tautan</h4>
                  <ul className="space-y-4 text-sm font-medium">
                    <li><Link href="/" className="text-zinc-400 hover:text-white transition-colors">Beranda</Link></li>
                    <li><Link href="/koleksi" className="text-zinc-400 hover:text-white transition-colors">Katalog Koleksi</Link></li>
                  </ul>
                </div>
                <div>
                  <h4 className="font-bold text-white uppercase tracking-widest text-xs mb-6">Kontak</h4>
                  <ul className="space-y-4 text-sm font-medium text-zinc-400">
                    <li>Puri Indah Df 19, Sidoarjo</li>
                    <li>+62 822-6477-4367</li>
                    <li className="lowercase">yuniartiunimawarni@gmail.com</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="md:col-span-5 w-full h-64 md:h-72 bg-zinc-800 border border-zinc-700 p-2">
              <iframe 
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3956.102594091213!2d112.6823516760512!3d-7.453901273464231!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x2dd7e591ba40e1f9%3A0x1ee871e6ac517c61!2sOptik%20Aaliyah!5e0!3m2!1sid!2sid!4v1776056666993!5m2!1sid!2sid" 
                width="100%" 
                height="100%" 
                style={{ border: 0 }} 
                allowFullScreen={true} 
                loading="lazy" 
                referrerPolicy="no-referrer-when-downgrade"
                className="filter grayscale opacity-80 hover:opacity-100 hover:grayscale-0 transition-all duration-500"
              ></iframe>
            </div>
          </div>
          <div className="border-t border-zinc-800 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4 text-zinc-500 text-xs font-bold uppercase tracking-widest">
            <p>© 2026 OPTIK AALIYAH.</p>
            <p>SIDOARJO, ID</p>
          </div>
        </div>
      </footer>

      {/* ============================================================ */}
      {/* MODAL VIRTUAL TRY-ON AI */}
      {/* ============================================================ */}
      {isTryOnOpen && (
        <div className="fixed inset-0 z-[60] flex justify-center items-center p-4">
          <div className="absolute inset-0 bg-zinc-900/90 backdrop-blur-md" onClick={closeCamera}></div>
          <div className="bg-white w-full max-w-4xl relative shadow-2xl animate-fade-up overflow-hidden flex flex-col md:flex-row">
            <button onClick={closeCamera} className="absolute top-4 right-4 text-zinc-400 hover:text-zinc-900 z-50 bg-white p-1 rounded-full shadow-sm">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            
            {/* Bagian Kiri: Kamera / Hasil */}
            <div className="w-full md:w-3/5 bg-zinc-100 relative aspect-[4/3] flex items-center justify-center overflow-hidden">
              {isProcessing && (
                <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center">
                  <svg className="animate-spin h-8 w-8 text-zinc-900 mb-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-xs font-bold tracking-widest text-zinc-900 uppercase animate-pulse">Memindai Wajah & Mencocokkan Kacamata...</p>
                </div>
              )}
              
              {/* BUG FIX: Video tidak di unmount, hanya disembunyikan dengan CSS kalo ada tryOnResult */}
              <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className={`w-full h-full object-cover transform scale-x-[-1] ${tryOnResult ? 'hidden' : 'block'}`}
              ></video>

              {/* Tampilkan foto hasil tumpang tindih di atas container jika ada */}
              {tryOnResult && (
                <img src={tryOnResult} alt="Hasil Try On" className="absolute inset-0 z-20 w-full h-full object-contain bg-white" />
              )}
              
              {/* Canvas tersembunyi buat ngambil foto */}
              <canvas ref={canvasRef} className="hidden"></canvas>
            </div>

            {/* Bagian Kanan: Kontrol AI */}
            <div className="w-full md:w-2/5 p-8 flex flex-col justify-center bg-white z-10">
              <h2 className="text-2xl font-black mb-2 text-zinc-900 tracking-tight uppercase">AI Face Scanner</h2>
              <p className="text-sm text-zinc-500 mb-8 leading-relaxed font-medium">
                Posisikan wajahmu di tengah layar. Engine TensorFlow kami akan memindai struktur rahang dan memberikan overlay kacamata.
              </p>

              {/* Hasil Deteksi Wajah */}
              {tryOnResult && detectedShapes.length > 0 && (
                <div className="mb-6 border border-green-200 bg-green-50 p-4">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-widest mb-1">Hasil Deteksi:</p>
                  <h3 className="text-xl font-black text-green-900 uppercase">{detectedShapes.join(", ")} Face</h3>
                </div>
              )}

              {/* UI BARU: PILIH KACAMATA DENGAN GAMBAR */}
              {!tryOnResult && (
                <div className="mb-8">
                  <p className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-3">Pilih Model Kacamata</p>
                  <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide">
                    {GLASSES_MODELS.map((model) => (
                      <button
                        key={model.index}
                        onClick={() => setGlassesIndex(model.index)}
                        className={`flex-shrink-0 w-20 h-20 border-2 flex items-center justify-center p-2 transition-all duration-300 ${
                          glassesIndex === model.index 
                            ? 'border-zinc-900 bg-zinc-50 scale-105 shadow-md' 
                            : 'border-zinc-200 hover:border-zinc-400 bg-white'
                        }`}
                        title={model.name}
                      >
                        <img src={model.image} alt={model.name} className="w-full h-full object-contain drop-shadow-sm opacity-80" />
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* ACTION BUTTONS */}
              {tryOnResult ? (
                <button onClick={() => setTryOnResult(null)} className="bg-white border-2 border-zinc-900 text-zinc-900 font-bold py-4 uppercase tracking-widest text-sm hover:bg-zinc-50 transition-colors w-full">
                  Ulangi Pindai
                </button>
              ) : (
                <button onClick={captureAndProcess} disabled={isProcessing} className="bg-zinc-900 text-white font-bold py-4 uppercase tracking-widest text-sm hover:bg-zinc-800 transition-colors w-full disabled:bg-zinc-400">
                  Ambil Foto & Analisis
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MODAL LOGIN */}
      {showAuthModal && (
        <div className="fixed inset-0 z-[70] flex justify-center items-center p-4">
          <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setShowAuthModal(false)}></div>
          <div className="bg-white p-10 w-full max-w-md relative shadow-2xl animate-fade-up">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-900">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <h2 className="text-2xl font-black mb-8 text-zinc-900 tracking-tight uppercase">{isLoginMode ? "Masuk" : "Daftar Akun"}</h2>
            <form onSubmit={handleAuth} className="flex flex-col gap-5">
              <div>
                <label className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2 block">Email</label>
                <input type="email" value={email} onChange={(e)=>setEmail(e.target.value)} className="w-full p-4 bg-zinc-50 border border-zinc-200 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all rounded-none" required />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2 block">Password</label>
                <input type="password" value={password} onChange={(e)=>setPassword(e.target.value)} className="w-full p-4 bg-zinc-50 border border-zinc-200 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all rounded-none" required minLength={6} />
              </div>
              <button type="submit" className="bg-zinc-900 text-white font-bold py-4 mt-4 uppercase tracking-widest text-sm hover:bg-zinc-800 transition-colors">{isLoginMode ? "Masuk Sekarang" : "Daftar Sekarang"}</button>
            </form>
            <div className="mt-8 pt-6 border-t border-zinc-100 text-center">
              <button onClick={() => setIsLoginMode(!isLoginMode)} className="text-xs font-bold text-zinc-500 hover:text-zinc-900 uppercase tracking-widest transition-colors">
                {isLoginMode ? "Belum Punya Akun? Daftar" : "Sudah Punya Akun? Masuk"}
              </button>
            </div>
          </div>
        </div>
      )}

    </main>
  );
}