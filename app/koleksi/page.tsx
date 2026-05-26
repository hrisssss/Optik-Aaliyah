"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { db, auth } from "../../lib/firebase"; 
import { collection, addDoc, deleteDoc, doc, updateDoc, setDoc, onSnapshot, query, orderBy, arrayUnion } from "firebase/firestore";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, User } from "firebase/auth";

const ADMIN_EMAIL = "admin@optikaaliyah.com"; 

export default function KoleksiPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [isLoginMode, setIsLoginMode] = useState(true);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [imageBase64, setImageBase64] = useState("");
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingId, setEditingId] = useState("");
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editImageBase64, setEditImageBase64] = useState("");
  const [heroFileBase64, setHeroFileBase64] = useState("");
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  
  const [searchQuery, setSearchQuery] = useState("");
  const [toastMsg, setToastMsg] = useState("");
  
  // NOMOR WHATSAPP UPDATE DARI KARTU NAMA
  const waNumber = "6282264774367"; 

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(""), 3000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAdmin(currentUser?.email === ADMIN_EMAIL);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const q = query(collection(db, "kacamata"), orderBy("nama", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProducts(data);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("login") === "true") setShowAuthModal(true);
    }
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

  const handleFileToBase64 = (e: React.ChangeEvent<HTMLInputElement>, setBase64State: React.Dispatch<React.SetStateAction<string>>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 800 * 1024) {
        showToast("GAGAL: Ukuran foto maksimal 800 KB!");
        e.target.value = ""; 
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => setBase64State(reader.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleUpdateHeroImage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!heroFileBase64) return;
    try {
      await setDoc(doc(db, "pengaturan", "beranda"), { url_foto_utama: heroFileBase64 }, { merge: true });
      showToast("FOTO BERANDA BERHASIL DIPERBARUI");
      setHeroFileBase64(""); 
      const heroInput = document.getElementById('hero-upload') as HTMLInputElement;
      if (heroInput) heroInput.value = '';
    } catch (error) {
      showToast("GAGAL MENGUBAH FOTO");
    }
  };

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newPrice || !newDesc || !imageBase64) return;
    try {
      await addDoc(collection(db, "kacamata"), { nama: newName, harga: Number(newPrice), deskripsi: newDesc, gambar: imageBase64 });
      showToast("PRODUK BERHASIL DITAMBAHKAN");
      setNewName(""); setNewPrice(""); setNewDesc(""); setImageBase64("");
      const productInput = document.getElementById('product-upload') as HTMLInputElement;
      if (productInput) productInput.value = '';
    } catch (error) {
      showToast("GAGAL MENAMBAHKAN PRODUK");
    }
  };

  const openEditModal = (item: any) => {
    setEditingId(item.id);
    setEditName(item.nama);
    setEditPrice(item.harga.toString());
    setEditDesc(item.deskripsi);
    setEditImageBase64(item.gambar);
    setIsEditModalOpen(true);
  };

  const handleUpdateProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateDoc(doc(db, "kacamata", editingId), { nama: editName, harga: Number(editPrice), deskripsi: editDesc, gambar: editImageBase64 });
      setIsEditModalOpen(false);
      showToast("REVISI BERHASIL DISIMPAN");
    } catch (error) {
      showToast("GAGAL MENYIMPAN REVISI");
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm("Hapus item ini secara permanen?")) {
      await deleteDoc(doc(db, "kacamata", id));
      showToast("PRODUK BERHASIL DIHAPUS");
    }
  };

const buyViaWhatsApp = async (namaBarang: string) => {
    if (!user) {
      showToast("SILAKAN MASUK TERLEBIH DAHULU");
      setShowAuthModal(true);
      return; 
    }

    // ==========================================
    // TAMBAHAN: SIMPAN RIWAYAT PESANAN KE FIRESTORE
    // ==========================================
    try {
      const userRef = doc(db, "users", user.uid);
      await setDoc(userRef, {
        email: user.email,
        riwayat_pembelian: arrayUnion({
          nama_barang: namaBarang,
          tanggal_pesan: new Date().toISOString()
        })
      }, { merge: true });
    } catch (err) {
      console.error("Gagal mencatat riwayat pembelian:", err);
    }
    // ==========================================

    const text = `Halo Optik Aaliyah, saya tertarik dengan koleksi: *${namaBarang}*.`;
    window.open(`https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`, "_blank");
  };

  const filteredProducts = products.filter(product => 
    product.nama.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <main className="min-h-screen bg-[#FAFAFA] font-sans text-zinc-900 flex flex-col selection:bg-zinc-900 selection:text-white">
      
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes fadeUp { from { opacity: 0; transform: translateY(40px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-up { animation: fadeUp 1s cubic-bezier(0.16, 1, 0.3, 1) forwards; opacity: 0; }
        .delay-100 { animation-delay: 100ms; }
        .delay-200 { animation-delay: 200ms; }
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
          <div className="hidden md:flex items-center gap-10">
            <Link href="/" className="text-sm font-semibold tracking-wide text-zinc-500 hover:text-zinc-900 transition-colors uppercase">Beranda</Link>
            <Link href="/koleksi" className="text-sm font-semibold tracking-wide text-zinc-500 hover:text-zinc-900 transition-colors uppercase">Katalog</Link>
            

            {user ? (
              <div className="flex items-center gap-6">
                <span className="text-sm font-medium text-zinc-500">{isAdmin ? <span className="font-bold text-zinc-900 bg-zinc-100 px-2 py-1 rounded-sm">ADMIN</span> : user.email}</span>
                <button onClick={handleLogout} className="text-sm font-bold text-zinc-500 hover:text-red-600 transition-colors uppercase">Keluar</button>
              </div>
            ) : (
              <button onClick={() => setShowAuthModal(true)} className="text-sm bg-zinc-900 hover:bg-zinc-800 text-white px-6 py-3 rounded-none font-semibold uppercase tracking-wide transition-colors">Masuk / Daftar</button>
            )}
          </div>
          <button className="md:hidden text-zinc-900 p-2" onClick={() => setIsMobileMenuOpen(true)}>
            <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
        </div>
      </nav>

      {/* SIDEBAR HP */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="fixed inset-0 bg-zinc-900/40 backdrop-blur-sm" onClick={() => setIsMobileMenuOpen(false)}></div>
          <div className="relative w-72 h-full bg-white shadow-2xl flex flex-col p-8">
            <button className="self-end text-zinc-400 hover:text-zinc-900 mb-8" onClick={() => setIsMobileMenuOpen(false)}>
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="flex flex-col gap-8 text-xl font-bold tracking-tight">
              <Link href="/" className="text-zinc-900 hover:text-zinc-500" onClick={() => setIsMobileMenuOpen(false)}>BERANDA</Link>
              <Link href="/koleksi" className="text-zinc-900 hover:text-zinc-500" onClick={() => setIsMobileMenuOpen(false)}>KATALOG</Link>
              
              {/* TAMBAHAN MENU ADMIN HP */}
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
      <div className="max-w-7xl mx-auto px-6 py-16 flex-grow w-full">
        
        {/* HEADER & SEARCH BAR */}
        <div className="mb-16 border-b border-zinc-200 pb-8 animate-fade-up delay-100 flex flex-col md:flex-row md:items-end justify-between gap-8">
          <div>
            <h1 className="text-4xl md:text-5xl font-black tracking-tight text-zinc-900 uppercase">
              {isAdmin ? "Dashboard Manajemen" : "Katalog Eksklusif"}
            </h1>
            <p className="text-zinc-1000 text-lg mt-4 font-medium max-w-xl">
              {isAdmin ? "Kelola inventaris dan tampilan website Optik Aaliyah." : "Eksplorasi koleksi frame yang menyempurnakan proporsi wajahmu."}
            </p>
          </div>
          
          <div className="w-full md:max-w-xs relative">
            <input 
              type="text" 
              placeholder="Cari Koleksi..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-transparent border-b-2 border-zinc-1000 focus:border-zinc-900 py-2 pl-8 pr-4 text-sm font-bold text-zinc-900 placeholder:text-zinc-400 focus:outline-none transition-colors uppercase tracking-widest"
            />
            <svg className="w-5 h-5 absolute left-0 bottom-2.5 text-zinc-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          </div>
        </div>

        {/* ADMIN PANELS */}
        {isAdmin && (
          <div className="mb-16 grid grid-cols-1 xl:grid-cols-3 gap-8 animate-fade-up delay-200">
            <div className="p-8 bg-white border border-zinc-200 shadow-sm xl:col-span-1">
              <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                <span className="w-2 h-2 bg-zinc-900 rounded-full"></span> Foto Utama Beranda
              </h2>
              <form onSubmit={handleUpdateHeroImage} className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wide mb-2">Upload PNG Transparan</label>
                  <input type="file" id="hero-upload" accept="image/*" onChange={(e) => handleFileToBase64(e, setHeroFileBase64)} className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-none file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-zinc-100 file:text-zinc-900 hover:file:bg-zinc-200 cursor-pointer" required />
                </div>
                <button type="submit" className="bg-zinc-900 text-white font-bold py-3 uppercase tracking-widest text-xs mt-2 hover:bg-zinc-800 transition-colors">Update Foto</button>
              </form>
            </div>

            <div className="p-8 bg-white border border-zinc-200 shadow-sm xl:col-span-2">
              <h2 className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                <span className="w-2 h-2 bg-zinc-900 rounded-full"></span> Tambah Data Katalog
              </h2>
              <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-5">
                <div>
                  <label className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2 block">Nama Frame</label>
                  <input type="text" placeholder="Moscot Lemtosh" value={newName} onChange={(e)=>setNewName(e.target.value)} className="w-full p-3 bg-zinc-50 border border-zinc-200 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all rounded-none text-sm" required />
                </div>
                <div>
                  <label className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2 block">Harga (IDR)</label>
                  <input type="number" placeholder="450000" value={newPrice} onChange={(e)=>setNewPrice(e.target.value)} className="w-full p-3 bg-zinc-50 border border-zinc-200 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all rounded-none text-sm" required />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-bold text-zinc-1000 uppercase tracking-widest mb-2 block">Deskripsi Detail</label>
                  <input type="text" placeholder="Material asetat premium dengan siluet klasik..." value={newDesc} onChange={(e)=>setNewDesc(e.target.value)} className="w-full p-3 bg-zinc-50 border border-zinc-200 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all rounded-none text-sm" required />
                </div>
                <div className="md:col-span-2 flex flex-col sm:flex-row gap-4 items-start sm:items-end mt-2">
                  <div className="flex-grow w-full">
                    <label className="text-xs font-bold text-zinc-1000 uppercase tracking-widest mb-2 block">Foto Produk (Maks 800KB)</label>
                    <input type="file" id="product-upload" accept="image/*" onChange={(e) => handleFileToBase64(e, setImageBase64)} className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-none file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-zinc-100 file:text-zinc-900 hover:file:bg-zinc-200 cursor-pointer" required />
                  </div>
                  <button type="submit" className="bg-zinc-900 text-white font-bold py-3 px-8 uppercase tracking-widest text-xs hover:bg-zinc-800 transition-colors w-full sm:w-auto h-[40px]">Simpan</button>
                </div>
              </form>
            </div>
          </div> 
        )}

        {/* GRID KATALOG */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-16 animate-fade-up delay-200">
          {filteredProducts.map((item) => (
            <div key={item.id} className="group flex flex-col">
              <div className="bg-zinc-100 aspect-[4/3] overflow-hidden mb-6 relative">
                <img src={item.gambar} alt={item.nama} className="w-full h-full object-cover mix-blend-darken transition-transform duration-700 group-hover:scale-105" />
              </div>
              <div className="flex flex-col flex-grow">
                <div className="flex flex-col items-start mb-3">
                  <h3 className="text-lg font-bold text-zinc-900 tracking-tight uppercase leading-tight mb-1">{item.nama}</h3>
                  <p className="font-bold text-zinc-500 tracking-wider">Rp {item.harga.toLocaleString('id-ID')}</p>
                </div>
                <p className="text-zinc-500 text-sm leading-relaxed font-medium mb-8 flex-grow">{item.deskripsi}</p>
                
                {isAdmin ? (
                  <div className="mt-auto border-t border-zinc-200 pt-4 flex gap-3">
                    <button onClick={() => openEditModal(item)} className="w-1/2 border border-zinc-200 text-zinc-900 font-bold py-3 hover:bg-zinc-50 transition-colors uppercase text-xs tracking-widest">Revisi</button>
                    <button onClick={() => handleDelete(item.id)} className="w-1/2 bg-red-50 text-red-600 font-bold py-3 hover:bg-red-100 transition-colors uppercase text-xs tracking-widest">Hapus</button>
                  </div>
                ) : (
                  <button onClick={() => buyViaWhatsApp(item.nama)} className="w-full border border-zinc-900 text-zinc-900 font-bold py-4 hover:bg-zinc-900 hover:text-white transition-colors uppercase tracking-widest text-xs mt-auto">
                    Pesan Sekarang
                  </button>
                )}
              </div>
            </div>
          ))}
          {filteredProducts.length === 0 && (
            <div className="col-span-full py-20 text-center border border-zinc-200 bg-white">
              <p className="text-zinc-900 font-bold tracking-widest uppercase mb-2">Pencarian Tidak Ditemukan</p>
              <p className="text-zinc-500 font-medium text-sm">Coba gunakan kata kunci kacamata yang lain.</p>
            </div>
          )}
        </div>
      </div>

      {/* FOOTER MAPS (INFO UPDATE DARI KARTU NAMA) */}
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

      {/* MODAL LOGIN */}
      {showAuthModal && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-4">
          <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setShowAuthModal(false)}></div>
          <div className="bg-white p-10 w-full max-w-md relative shadow-2xl animate-fade-up">
            <button onClick={() => setShowAuthModal(false)} className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-900"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
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

      {/* MODAL 2: EDIT PRODUK */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex justify-center items-center p-4">
          <div className="absolute inset-0 bg-zinc-900/60 backdrop-blur-sm" onClick={() => setIsEditModalOpen(false)}></div>
          <div className="bg-white p-10 w-full max-w-lg relative shadow-2xl animate-fade-up">
            <button onClick={() => setIsEditModalOpen(false)} className="absolute top-6 right-6 text-zinc-400 hover:text-zinc-900"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg></button>
            <h2 className="text-2xl font-black mb-8 text-zinc-900 tracking-tight uppercase">Revisi Data</h2>
            <form onSubmit={handleUpdateProduct} className="flex flex-col gap-5">
              <div>
                <label className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2 block">Nama Frame</label>
                <input type="text" value={editName} onChange={(e)=>setEditName(e.target.value)} className="w-full p-4 bg-zinc-50 border border-zinc-200 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all rounded-none text-sm" required />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2 block">Harga (IDR)</label>
                <input type="number" value={editPrice} onChange={(e)=>setEditPrice(e.target.value)} className="w-full p-4 bg-zinc-50 border border-zinc-200 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all rounded-none text-sm" required />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2 block">Deskripsi Detail</label>
                <textarea value={editDesc} onChange={(e)=>setEditDesc(e.target.value)} className="w-full p-4 bg-zinc-50 border border-zinc-200 focus:outline-none focus:border-zinc-900 focus:ring-1 focus:ring-zinc-900 transition-all rounded-none h-24 resize-none text-sm" required />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-900 uppercase tracking-widest mb-2 block">Ganti Foto (Opsi)</label>
                <input type="file" accept="image/*" onChange={(e) => handleFileToBase64(e, setEditImageBase64)} className="block w-full text-sm text-zinc-500 file:mr-4 file:py-2 file:px-4 file:rounded-none file:border-0 file:text-xs file:font-bold file:uppercase file:tracking-wider file:bg-zinc-100 file:text-zinc-900 hover:file:bg-zinc-200 cursor-pointer" />
              </div>
              <button type="submit" className="bg-zinc-900 text-white font-bold py-4 mt-4 uppercase tracking-widest text-sm hover:bg-zinc-800 transition-colors">Simpan Revisi</button>
            </form>
          </div>
        </div>
      )}

    </main>
  );
}